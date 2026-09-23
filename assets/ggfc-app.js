
/* =====================================================================
   GGFC 기록 관리 시스템 — 단일 HTML 앱
   데이터: matches / attendance / goals / saves / fouls / moms / specials
   ===================================================================== */
const KEY = "ggfc-v318-admin-draft:" + ((window.GGFC_CONFIG||{}).databaseURL||"unconfigured");
/* 대표승점 설정은 전체 경기 DB와 별도로 한 번 더 저장한다.
   로고/사진 데이터 등으로 전체 DB가 커져 localStorage 저장이 실패해도
   구간 설정만큼은 독립적으로 보존하고 다음 실행 때 자동 복구한다. */
const REP_SETTINGS_KEY = KEY + "-representative-settings-v2";
const REP_SETTINGS_YEAR_PREFIX = KEY + "-representative-season-";
const TEAM_COLORS = ["#5E9FE8","#EAC26B","#72BC8F","#BF8EDA","#DE9255","#DF84A8","#4FB9C9","#E97366"];

const DEF_DB = { matches:[], attendance:[], goals:[], saves:[], fouls:[], moms:[], soccerbee:[], specials:[], roster:[], settings:{seasons:{},teamLogos:{},teamNames:{},leagueLogos:{A:"",B:""},headerLogo:"",display:{brandTitle:"GGFC",leagueA:"슈퍼리그",leagueB:"챌린지리그"},ability:{enabled:true}} };
const blankDB = () => JSON.parse(JSON.stringify(DEF_DB));
let DB = blankDB();
let admin = false, comp = "ALL", calRef = new Date(), selDay = null, chemSel = "", chemYear = "ALL";
let seasonYear = "ALL", half = "ALL", dashDate = "", chemOther = "", monthlyMetric = "g";
let repAdminYear = "";
let abilityYear = "", abilityHalf = "H1", abilityAsOfDate = "";
// 화면 정렬 상태만 보관한다. 원본 DB 및 공유 설정에는 저장하지 않는다.
let abilitySort = {key:"player", direction:"asc"};
const ABILITY_SORT_FIELDS = [["player","선수명"],["ovr","OVR"],["pac","PAC"],["sho","SHO"],["pas","PAS"],["dri","DRI"],["def","DEF"],["phy","PHY"]];
const NAME_COLLATOR_KO = new Intl.Collator("ko", {numeric:true, sensitivity:"variant"});
let recordMode = "LATEST", recordYear = "", recordDate = "", recordStart = "", recordEnd = "", recordSegment = "ALL";
/* 대시보드 랭킹 5종과 상대전적은 종합 누적기록과 독립된 조회기간을 사용합니다. */
let rankingRangeMode = "", rankingRangeYear = "", rankingRangeStart = "", rankingRangeEnd = "", rankingRangeSegment = "ALL";
let h2hRangeMode = "", h2hRangeYear = "", h2hRangeStart = "", h2hRangeEnd = "", h2hRangeSegment = "ALL";
let latestDbPeriodSignature = "";
/* 대표승점 관리자 화면의 미저장 입력을 반기별로 보존한다. 저장 직후 재렌더링이나 조회기간 자동동기화가 실행되어도 입력한 하반기 날짜가 기본값으로 되돌아가지 않도록 한다. */
let repAdminDrafts = {};

/* ---------- utils ---------- */
const $ = s => document.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const esc = s => String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const num = v => { const n = parseFloat(String(v??"").replace(/[^0-9.\-]/g,"")); return isNaN(n)?0:n; };
const pct = (a,b) => b? Math.round(a/b*1000)/10 : 0;
function compareNamesKo(a,b){
  const left=String(a??"").normalize("NFKC").trim(), right=String(b??"").normalize("NFKC").trim();
  return NAME_COLLATOR_KO.compare(left,right) || (left<right?-1:left>right?1:0);
}
function toast(m){ const t=$("#toast"); t.textContent=m+(GGFC.pending?' · 공유 저장 대기':''); t.classList.add("on"); clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove("on"),2200); }
function teamColor(name){ const ts=teamList(); const i=ts.indexOf(name); return TEAM_COLORS[(i<0?0:i)%TEAM_COLORS.length]; }
function ymd(d){ return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
function serialToDate(n){
  // Excel serial (1900 system, with the 1900 leap-year bug baked in)
  const ms = Math.round((n - 25569) * 86400000);
  const d = new Date(ms);
  if(isNaN(d.getTime())) return "";
  return d.toISOString().slice(0,10);
}
function normDate(s){
  if(s instanceof Date && !isNaN(s.getTime())){
    return s.getFullYear()+"-"+String(s.getMonth()+1).padStart(2,"0")+"-"+String(s.getDate()).padStart(2,"0");
  }
  s = String(s??"").trim();
  if(!s) return "";
  // Excel date-formatted cell exported as a serial number
  if(/^\d{4,5}(\.\d+)?$/.test(s)){
    const n=parseFloat(s);
    if(n>=20000 && n<=80000) return serialToDate(n);
  }
  // 2026-03-07T00:00:00 / 2026-03-07 00:00
  let m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:[T\s]|$)/);
  if(m) return m[1]+"-"+m[2].padStart(2,"0")+"-"+m[3].padStart(2,"0");
  // 2026년3월7일 / 2026. 3. 7
  m = s.match(/(\d{4})[-./년\s]*(\d{1,2})[-./월\s]*(\d{1,2})/);
  if(m) return m[1]+"-"+m[2].padStart(2,"0")+"-"+m[3].padStart(2,"0");
  // 3/7/2026 또는 7-3-2026 (월/일/연)
  m = s.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{4})$/);
  if(m) return m[3]+"-"+m[1].padStart(2,"0")+"-"+m[2].padStart(2,"0");
  // 그 외: Date 파서에 맡김 (예: "Mar 7, 2026")
  const d=new Date(s);
  if(!isNaN(d.getTime()) && /\d{4}/.test(s)){
    return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
  }
  return s;
}

/* ---------- storage ---------- */
function representativeSeasonPayload(y,source){
  const raw=source||((DB.settings&&DB.settings.seasons&&DB.settings.seasons[y])||{});
  /* 저장 시에는 현재 DB에 들어 있는 시즌 설정을 우선 사용한다.
     seasonCfg()는 읽기/표시용 정규화에만 사용하고, 저장 직후 사용자가 지정한 날짜·완료 상태가
     자동분할 값으로 다시 바뀌지 않도록 원본 설정을 보존한다. */
  const c=seasonCfg(y);
  const counts=raw.repCounts||c.repCounts||{};
  const segs=raw.repSegments||{};
  const h1Source=Array.isArray(segs.H1)?segs.H1:c.repSegments.H1;
  const h2Source=Array.isArray(segs.H2)?segs.H2:c.repSegments.H2;
  const normalizeSegs=(arr,count,fallback)=>Array.from({length:Math.max(1,Math.min(4,count))},(_,i)=>{
    /* 한쪽 반기 DOM/저장 배열이 일시적으로 짧아도 다른 반기 저장값을 기본분할로 리셋하지 않는다. */
    const x=(Array.isArray(arr)?arr[i]:null)||(Array.isArray(fallback)?fallback[i]:null)||{};
    return {
      s:normDate(x.s||''),
      e:normDate(x.e||''),
      complete:x.complete===true,
      mode:String(x.mode||'REP').toUpperCase()==='IND'?'IND':'REP',
      finalPoints:(x.finalPoints&&typeof x.finalPoints==='object')?Object.assign({},x.finalPoints):null,
      finalStandings:(x.finalStandings&&typeof x.finalStandings==='object')?JSON.parse(JSON.stringify(x.finalStandings)):null,
      finalGames:Number(x.finalGames||0),
      finalizedAt:String(x.finalizedAt||'')
    };
  });
  const h1Count=Math.max(1,Math.min(4,parseInt(counts.H1,10)||(h1Source||[]).length||c.repCounts.H1||3));
  const h2Count=Math.max(1,Math.min(4,parseInt(counts.H2,10)||(h2Source||[]).length||c.repCounts.H2||3));
  return {
    h1s:normDate(raw.h1s||c.h1s||y+'-01-01'),
    h1e:normDate(raw.h1e||c.h1e||y+'-06-30'),
    h2s:normDate(raw.h2s||c.h2s||y+'-07-01'),
    h2e:normDate(raw.h2e||c.h2e||y+'-12-31'),
    repEnabled:raw.repEnabled===true || c.repEnabled===true,
    repCounts:{H1:h1Count,H2:h2Count},
    repSegments:{H1:normalizeSegs(h1Source,h1Count,c.repSegments.H1),H2:normalizeSegs(h2Source,h2Count,c.repSegments.H2)},
    repSavedAt:raw.repSavedAt||new Date().toISOString()
  };
}
function representativeSettingsSnapshot(){
  const seasons=((DB.settings||{}).seasons)||{};
  const out={};
  Object.keys(seasons).forEach(y=>{
    if(parseInt(y,10)<2026) return;
    out[y]=representativeSeasonPayload(y,seasons[y]);
  });
  return {version:4,seasons:out,savedAt:new Date().toISOString()};
}
function applyRepresentativeSeasonPayload(y,r){
  if(!r||typeof r!=='object') return false;
  DB.settings=DB.settings||{}; DB.settings.seasons=DB.settings.seasons||{};
  const d=Object.assign({},DB.settings.seasons[y]||{});
  if(r.h1s) d.h1s=normDate(r.h1s);
  if(r.h1e) d.h1e=normDate(r.h1e);
  if(r.h2s) d.h2s=normDate(r.h2s);
  if(r.h2e) d.h2e=normDate(r.h2e);
  if(Object.prototype.hasOwnProperty.call(r,'repEnabled')) d.repEnabled=r.repEnabled===true;
  const rc=r.repCounts||{};
  const rs=r.repSegments||{};
  d.repCounts={
    H1:Math.max(1,Math.min(4,parseInt(rc.H1,10)||((Array.isArray(rs.H1)&&rs.H1.length)||3))),
    H2:Math.max(1,Math.min(4,parseInt(rc.H2,10)||((Array.isArray(rs.H2)&&rs.H2.length)||3)))
  };
  const normalize=(arr,count)=>Array.from({length:count},(_,i)=>{
    const x=(Array.isArray(arr)?arr[i]:null)||{};
    return {s:normDate(x.s||''),e:normDate(x.e||''),complete:x.complete===true,mode:String(x.mode||'REP').toUpperCase()==='IND'?'IND':'REP',finalPoints:(x.finalPoints&&typeof x.finalPoints==='object')?Object.assign({},x.finalPoints):null,finalStandings:(x.finalStandings&&typeof x.finalStandings==='object')?JSON.parse(JSON.stringify(x.finalStandings)):null,finalGames:Number(x.finalGames||0),finalizedAt:String(x.finalizedAt||'')};
  }).filter(x=>x.s&&x.e);
  d.repSegments={H1:normalize(rs.H1,d.repCounts.H1),H2:normalize(rs.H2,d.repCounts.H2)};
  d.repSavedAt=r.repSavedAt||d.repSavedAt||'';
  delete d.repCount; delete d.repList;
  DB.settings.seasons[y]=d;
  return true;
}
function saveRepresentativeSeasonBackup(y,source){
  try{
    if(!y || parseInt(y,10)<2026) return true;
    const payload=representativeSeasonPayload(y,source);
    payload.repSavedAt=new Date().toISOString();
    /* 시즌별 별도 키에 독립 저장한다. 시즌을 바꿔도 다른 시즌 설정을 덮어쓰지 않는다. */
    localStorage.setItem(REP_SETTINGS_YEAR_PREFIX+y,JSON.stringify({version:4,year:y,season:payload,savedAt:payload.repSavedAt}));
    return true;
  }catch(e){
    console.error(y+'년 대표승점 시즌 설정 저장 실패:',e);
    return false;
  }
}
function saveRepresentativeSettingsBackup(){
  let ok=true;
  try{
    const snap=representativeSettingsSnapshot();
    localStorage.setItem(REP_SETTINGS_KEY,JSON.stringify(snap));
    Object.keys(snap.seasons||{}).forEach(y=>{ if(!saveRepresentativeSeasonBackup(y)) ok=false; });
    return ok;
  }catch(e){
    console.error('대표승점 설정 별도 저장 실패:',e);
    return false;
  }
}
function loadRepresentativeSettingsBackup(){
  let loaded=false;
  try{
    const raw=localStorage.getItem(REP_SETTINGS_KEY);
    if(raw){
      const snap=JSON.parse(raw);
      if(snap&&snap.seasons&&typeof snap.seasons==='object'){
        Object.keys(snap.seasons).forEach(y=>{ if(applyRepresentativeSeasonPayload(y,snap.seasons[y])) loaded=true; });
      }
    }
    /* 시즌별 전용 저장값을 마지막에 덮어써서 가장 최근에 저장한 시즌 설정을 최우선한다. */
    const keys=[];
    for(let i=0;i<localStorage.length;i++){
      const k=localStorage.key(i);
      if(k&&k.startsWith(REP_SETTINGS_YEAR_PREFIX)) keys.push(k);
    }
    keys.forEach(k=>{
      try{
        const obj=JSON.parse(localStorage.getItem(k)||'null');
        const y=String((obj&&obj.year)||k.slice(REP_SETTINGS_YEAR_PREFIX.length));
        if(obj&&obj.season&&/^\d{4}$/.test(y) && applyRepresentativeSeasonPayload(y,obj.season)) loaded=true;
      }catch(e){ console.warn('시즌별 대표승점 설정 복원 실패:',k,e); }
    });
    return loaded;
  }catch(e){
    console.error('대표승점 설정 별도 불러오기 실패:',e);
    return loaded;
  }
}
function representativeSettingsPersistedForYear(y){
  try{
    const current=representativeSeasonPayload(y);
    const rawYear=localStorage.getItem(REP_SETTINGS_YEAR_PREFIX+y);
    let saved=null;
    if(rawYear){
      const obj=JSON.parse(rawYear); saved=obj&&obj.season;
    }
    if(!saved){
      const raw=localStorage.getItem(REP_SETTINGS_KEY);
      const snap=raw?JSON.parse(raw):null;
      saved=snap&&snap.seasons&&snap.seasons[y];
    }
    if(!saved) return false;
    const clean=x=>({
      h1s:normDate(x.h1s||y+'-01-01'),h1e:normDate(x.h1e||y+'-06-30'),
      h2s:normDate(x.h2s||y+'-07-01'),h2e:normDate(x.h2e||y+'-12-31'),
      repEnabled:x.repEnabled===true,
      repCounts:{H1:Math.max(1,Math.min(4,parseInt(x.repCounts&&x.repCounts.H1,10)||3)),H2:Math.max(1,Math.min(4,parseInt(x.repCounts&&x.repCounts.H2,10)||3))},
      repSegments:{
        H1:(x.repSegments&&Array.isArray(x.repSegments.H1)?x.repSegments.H1:[]).slice(0,4).map(v=>({s:normDate(v.s),e:normDate(v.e),complete:v.complete===true,mode:String(v.mode||'REP').toUpperCase()==='IND'?'IND':'REP'})),
        H2:(x.repSegments&&Array.isArray(x.repSegments.H2)?x.repSegments.H2:[]).slice(0,4).map(v=>({s:normDate(v.s),e:normDate(v.e),complete:v.complete===true,mode:String(v.mode||'REP').toUpperCase()==='IND'?'IND':'REP'}))
      }
    });
    return JSON.stringify(clean(saved))===JSON.stringify(clean(current));
  }catch(e){ return false; }
}
function save(){
  v319CareerCache={key:'',map:null};
  if(!GGFC.canEdit()){ toast('관리자 인증과 서버 연결을 확인해 주세요.'); return {databaseSaved:false,representativeSaved:false,error:new Error('권한 또는 연결 없음')}; }
  abilityPriorYearPoolCache=null;
  const representativeSaved=saveRepresentativeSettingsBackup();
  let databaseSaved=false,error=null;
  try {localStorage.setItem(KEY,JSON.stringify(DB));databaseSaved=true;} catch(e){error=e;}
  GGFC.markChanged();
  return {databaseSaved,representativeSaved,error,cloudPending:true};
}
function load(){ DB=blankDB(); v319CareerCache={key:'',map:null}; ensureAbilityData(); }

/* ---------- CSV ---------- */
function parseCSV(text){
  text = text.replace(/^\uFEFF/,"").replace(/\r\n?/g,"\n");
  const rows=[]; let row=[], cur="", q=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(q){ if(c==='"'){ if(text[i+1]==='"'){cur+='"';i++;} else q=false; } else cur+=c; }
    else if(c==='"') q=true;
    else if(c===","){ row.push(cur); cur=""; }
    else if(c==="\n"){ row.push(cur); rows.push(row); row=[]; cur=""; }
    else cur+=c;
  }
  if(cur!==""||row.length){ row.push(cur); rows.push(row); }
  const clean = rows.filter(r=>r.some(c=>String(c).trim()!==""));
  if(!clean.length) return [];
  const head = clean[0].map(h=>h.trim());
  return clean.slice(1).map(r=>{ const o={}; head.forEach((h,i)=>o[h]=(r[i]??"").trim()); return o; });
}
const pick = (o,...keys) => { for(const k of keys){ for(const kk of Object.keys(o)){ if(kk.replace(/\s/g,"")===k) return o[kk]; } } return ""; };

const SCHEMA = {
  matches:{ name:"경기 기록지", head:"경기ID,날짜,대회,홈팀,원정팀,홈득점,원정득점,홈파울,원정파울",
    sample:"M001,2026-03-07,정규리그,A특공대,풀파워,3,2,4,6\nM002,2026-03-07,정규리그,어우씨,D져스,1,1,3,3",
    map:o=>({ id:pick(o,"경기ID","ID","경기번호")||"", date:normDate(pick(o,"날짜","경기일","일자")),
      comp:pick(o,"대회","구분","리그")||"정규리그", home:pick(o,"홈팀","팀A","HOME"), away:pick(o,"원정팀","팀B","AWAY"),
      hs:num(pick(o,"홈득점","홈점수")), as:num(pick(o,"원정득점","원정점수")),
      hf:num(pick(o,"홈파울")), af:num(pick(o,"원정파울")) }) },
  attendance:{ name:"출석 기록", head:"경기ID,팀,선수,감독",
    sample:"M001,A특공대,김철수,박감독\nM001,풀파워,이영호,정감독",
    map:o=>({ id:pick(o,"경기ID","ID"), team:pick(o,"팀","소속팀"), player:pick(o,"선수","선수명","이름"), coach:pick(o,"감독","감독명") }) },
  goals:{ name:"득점 기록", head:"경기ID,팀,선수,득점,도움",
    sample:"M001,A특공대,김철수,2,1\nM001,풀파워,이영호,1,0",
    map:o=>({ id:pick(o,"경기ID","ID"), team:pick(o,"팀","소속팀"), player:pick(o,"선수","득점자","이름"),
      g:num(pick(o,"득점","골"))||1, a:num(pick(o,"도움","어시스트")) }) },
  roster:{ name:"선수명단", head:"연도,팀,등번호,선수,영문이름,포지션,비고,사진(URL),시즌,시작일자",
    sample:"2026,A특공대,7,김철수,KIM CHUL SOO,PV,주장,\n2026,A특공대,10,최민수,CHOI MIN SOO,AL,,\n2026,풀파워,9,이영호,LEE YOUNG HO,PV,주장,",
    map:o=>({ year:(String(pick(o,"연도","년도","Year","YEAR")||pick(o,"시즌")||"").match(/(?:19|20)\d{2}/)||[""])[0], season:String(pick(o,"시즌")||"").trim(), startDate:rosterStartDateCell(o), team:pick(o,"팀","소속팀"),
      no:String(pick(o,"등번호","번호","백넘버","Number")||"").trim(), player:pick(o,"선수","선수명","이름","성명"),
      engName:pick(o,"영문이름","영문명","English Name","ENG NAME","ENG"),
      pos:pick(o,"포지션","POS","Position"),
      memo:pick(o,"비고","메모"),
      photo:readPlayerPhotoCell(o) }) },
  specials:{ name:"스페셜 기록", head:"날짜,선수,구분,내용",
    sample:"2026-06-30,김철수,우승,2026 상반기 리그 우승\n2026-06-30,이영호,MVP,상반기 MVP",
    map:o=>({ date:normDate(pick(o,"날짜","일자")), player:pick(o,"선수","이름"), type:pick(o,"구분","종류")||"기록", memo:pick(o,"내용","비고","메모") }) }
};
const SHEET_OF = { matches:"경기기록지", attendance:"출석", goals:"득점", specials:"스페셜" };
const SHEET_DESC = { matches:"날짜·대회·그룹·양 팀 득점·파울·몰수패 — 모든 통계의 기준",
  attendance:"경기별 출전 선수와 감독 (출석·승점·선수 분석 산출용)",
  goals:"경기별 득점자와 도움", specials:"우승·MVP·연혁 등 누적 기록" };

/* 통합 경기기록 시트 — 날짜별로 경기·출석·득점자를 한 줄씩 기록 */
const MAXP = 15;
function uniRow(date,comp,half,round,no,team,coach,opp,gf,ga,teamFoul,players,scorers,forfeit,group,assists,personalFouls,saves,mom,scorerCheck){
  const ps=players.slice(0,MAXP);
  /* 첨부 GGFC 통합 DB 양식과 동일한 열 순서 */
  return [date,comp,half,round,no,group||"",team,coach,opp,gf,ga,teamFoul,forfeit||"",scorers,assists||"",personalFouls||"",saves||"",mom||"",scorerCheck||""]
    .concat(ps, Array(MAXP-ps.length).fill(""))
    .map(v=>v==null?"":String(v));
}
const UNI = {
  name:"경기기록",
  head:"날짜,대회,반기,라운드,경기번호,그룹,팀,감독,상대팀,득점,실점,파울수,몰수패,득점자,도움,개인파울,선방,MOM,득점자 열 검사,"+
    Array.from({length:MAXP},(_,i)=>"선수"+(i+1)).join(","),
  desc:"한 줄 = 한 경기의 한 팀. 첨부 GGFC DB 양식과 동일하게 파울수=팀파울, 도움·개인파울·선방·MOM=선수별 기록입니다. 득점자·도움·개인파울·선방·MOM은 '김철수 2, 최민수 1'처럼 이름과 횟수를 쉼표로 적습니다. 개인파울은 선수 능력치와 해당 경기·팀의 팀파울 합계에 반영합니다. 개인파울이 등록된 팀은 개인파울 합계를 사용하고, 없으면 파울수 열의 값을 사용합니다. 두 값을 더하지 않습니다. MOM은 선수 능력치에 반영합니다. MOM은 수상 선수명을 입력하며 같은 선수가 한 Round에 여러 경기 MOM이면 횟수만큼 누적됩니다. 그룹은 날짜별 팀 리그 소속이며 A/슈퍼리그는 슈퍼리그, B/챌린지리그는 챌린지리그로 반영됩니다. 몰수패한 팀의 몰수패 칸에 '몰수패'를 입력하면 점수와 관계없이 패배로 판정되고 상대팀은 승리로 판정됩니다. 출석 선수를 선수1~15에 적습니다. 반기는 상반기/하반기, 라운드는 R1·R2처럼 적고, 경기번호는 구장까지 포함해 1A·1B. 감독이 선수로 뛰었다면 선수 칸에도 이름을 적어야 출석으로 집계됩니다.",
  rows:[
    uniRow("2026-03-07","정규리그","상반기","R1","1A","A특공대","박감독","풀파워",3,2,4,["김철수","최민수","이준호","박도윤","장민석"],"김철수 2, 최민수 1","","A","최민수 1","김철수 1","박도윤 6","김철수",""),
    uniRow("2026-03-07","정규리그","상반기","R1","1A","풀파워","정감독","A특공대",2,3,6,["이영호","한지훈","권태현","오세훈"],"이영호 2","","A","한지훈 1","이영호 2","오세훈 5","",""),
    uniRow("2026-03-07","정규리그","상반기","R1","1B","어우씨","강감독","D져스",1,1,3,["정우성","배진우","신동혁","고상철"],"정우성 1","","B","배진우 1","","고상철 4","정우성",""),
    uniRow("2026-03-07","정규리그","상반기","R1","1B","D져스","윤감독","어우씨",1,1,3,["윤성민","임재훈","노경환","서지호","문태일"],"윤성민 1","","B","임재훈 1","서지호 1","문태일 3","","")
  ]
};
const TEMPLATE = [
  { name:UNI.name, head:UNI.head, rows:UNI.rows, desc:UNI.desc },
  { name:"선수명단", head:SCHEMA.roster.head, sample:SCHEMA.roster.sample, desc:"시즌(출전 등 상태)과 연도는 구분합니다. 시작일자 이전은 능력치 성장·결석 및 커플 분석에서 제외합니다. 빈 시작일은 기존 방식입니다. 사진·포지션은 이 명단으로 연결합니다." },
  { name:"팀스쿼드", head:"날짜,대회,반기,그룹,팀,감독,코치,"+Array.from({length:15},(_,i)=>'선수'+(i+1)).join(','), rows:[], desc:"날짜부터 다음 변경 전까지 적용할 팀별 전체 명단입니다. 감독·코치도 포함하며, 선수1~15를 지원합니다. 실제 출석은 경기기록의 선수 칸으로 판단합니다." },
  { name:"스페셜기록", head:SCHEMA.specials.head, sample:SCHEMA.specials.sample, desc:SHEET_DESC.specials }
];
const LABEL = Object.assign({ unified:"경기기록", roster:"선수명단", rosterDraft:"선수명단", squads:"팀스쿼드" }, SHEET_OF);

function isOwnGoalPlayer(name){
  const key=String(name??'').normalize('NFKC').toUpperCase().replace(/[\s._-]/g,'');
  return ['자책','자책골','OG','OWNGOAL'].includes(key);
}
function parseScorers(text){
  const parts=String(text||"")
    .replace(/\r?\n/g,",")
    .replace(/[\/;·|]+/g,",")
    .split(",")
    .map(s=>s.trim())
    .filter(Boolean);
  const out=[];
  parts.forEach(raw=>{
    const token=raw.replace(/\s*(골|득점)\s*$/,"").trim();
    const counted=token.match(/^(.*?)\s*[\(\[]?\s*(\d+)\s*[\)\]]?$/);
    const rawName=String(counted?counted[1]:token).trim();
    const nm=isOwnGoalPlayer(rawName)?'자책골':rawName;
    if(!nm || /^\d+$/.test(nm)) return;
    const n=counted?parseInt(counted[2],10):1;
    const ex=out.find(x=>x.player===nm);
    if(ex) ex.g+=n; else out.push({player:nm,g:n});
  });
  return out;
}

function downloadBlob(name, blob){
  const a = document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=name; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
}
function download(name, text, mime){
  downloadBlob(name, new Blob(["\uFEFF"+text], {type:(mime||"text/csv")+";charset=utf-8"}));
}

/* ---------- XLSX 쓰기 (zip store) ---------- */
const CRC_T=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1);t[n]=c>>>0;}return t;})();
function crc32(u8){ let c=0xFFFFFFFF; for(let i=0;i<u8.length;i++) c=CRC_T[(c^u8[i])&255]^(c>>>8); return (c^0xFFFFFFFF)>>>0; }
function zipStore(files){
  const enc=new TextEncoder(), parts=[], central=[]; let off=0, cLen=0;
  files.forEach(f=>{
    const nm=enc.encode(f.name), data=f.data, crc=crc32(data), sz=data.length;
    const lh=new DataView(new ArrayBuffer(30));
    lh.setUint32(0,0x04034b50,true); lh.setUint16(4,20,true);
    lh.setUint32(14,crc,true); lh.setUint32(18,sz,true); lh.setUint32(22,sz,true);
    lh.setUint16(26,nm.length,true);
    parts.push(new Uint8Array(lh.buffer),nm,data);
    const ch=new DataView(new ArrayBuffer(46));
    ch.setUint32(0,0x02014b50,true); ch.setUint16(4,20,true); ch.setUint16(6,20,true);
    ch.setUint32(16,crc,true); ch.setUint32(20,sz,true); ch.setUint32(24,sz,true);
    ch.setUint16(28,nm.length,true); ch.setUint32(42,off,true);
    central.push(new Uint8Array(ch.buffer),nm);
    off += 30+nm.length+sz; cLen += 46+nm.length;
  });
  const eo=new DataView(new ArrayBuffer(22));
  eo.setUint32(0,0x06054b50,true); eo.setUint16(8,files.length,true); eo.setUint16(10,files.length,true);
  eo.setUint32(12,cLen,true); eo.setUint32(16,off,true);
  return new Blob([...parts,...central,new Uint8Array(eo.buffer)],
    {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
}
const xe = s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
function colName(i){ let s=""; i++; while(i>0){ const m=(i-1)%26; s=String.fromCharCode(65+m)+s; i=Math.floor((i-1)/26);} return s; }
function sheetXml(rows){
  const body = rows.map((r,ri)=>'<row r="'+(ri+1)+'">'+r.map((v,ci)=>{
    const ref=colName(ci)+(ri+1), s=String(v??"");
    return (s!=="" && /^-?\d+(\.\d+)?$/.test(s))
      ? '<c r="'+ref+'"><v>'+s+'</v></c>'
      : '<c r="'+ref+'" t="inlineStr"><is><t xml:space="preserve">'+xe(s)+'</t></is></c>';
  }).join("")+'</row>').join("");
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+body+'</sheetData></worksheet>';
}
function buildXlsx(src){
  const enc=new TextEncoder();
  const sheets = (src||TEMPLATE).map(t=>({ name:t.name,
    rows:[ t.head.split(",") ].concat(t.rows || String(t.sample||"").split("\n").filter(Boolean).map(r=>r.split(","))) }));
  const files=[
    { name:"[Content_Types].xml", data:enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'+
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'+
      '<Default Extension="xml" ContentType="application/xml"/>'+
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'+
      sheets.map((s,i)=>'<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join("")+
      '</Types>') },
    { name:"_rels/.rels", data:enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>') },
    { name:"xl/workbook.xml", data:enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+
      sheets.map((s,i)=>'<sheet name="'+xe(s.name)+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join("")+'</sheets></workbook>') },
    { name:"xl/_rels/workbook.xml.rels", data:enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
      sheets.map((s,i)=>'<Relationship Id="rId'+(i+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>').join("")+'</Relationships>') }
  ];
  sheets.forEach((s,i)=> files.push({ name:"xl/worksheets/sheet"+(i+1)+".xml", data:enc.encode(sheetXml(s.rows)) }));
  return zipStore(files);
}

/* ---------- XLSX 읽기 ---------- */
async function inflateRaw(u8){
  if(typeof DecompressionStream==="undefined") throw new Error("이 브라우저는 xlsx 해석을 지원하지 않습니다. CSV로 올려주세요");
  const st = new Blob([u8]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(st).arrayBuffer());
}
async function unzip(buf){
  const dv=new DataView(buf), u8=new Uint8Array(buf), td=new TextDecoder();
  let eo=-1;
  for(let i=buf.byteLength-22;i>=0;i--){ if(dv.getUint32(i,true)===0x06054b50){ eo=i; break; } }
  if(eo<0) throw new Error("엑셀(.xlsx) 파일이 아닙니다");
  let p=dv.getUint32(eo+16,true); const n=dv.getUint16(eo+10,true), out={};
  for(let i=0;i<n;i++){
    const method=dv.getUint16(p+10,true), csize=dv.getUint32(p+20,true);
    const nl=dv.getUint16(p+28,true), el=dv.getUint16(p+30,true), cl=dv.getUint16(p+32,true);
    const lo=dv.getUint32(p+42,true), name=td.decode(u8.subarray(p+46,p+46+nl));
    const st=lo+30+dv.getUint16(lo+26,true)+dv.getUint16(lo+28,true);
    const raw=u8.subarray(st,st+csize);
    out[name]= method===0 ? raw : await inflateRaw(raw);
    p += 46+nl+el+cl;
  }
  return out;
}
function xml(u8){ return new DOMParser().parseFromString(new TextDecoder().decode(u8),"application/xml"); }
function colIdx(letters){ let n=0; for(const ch of letters) n=n*26+(ch.charCodeAt(0)-64); return n-1; }
function dateStyleSet(stylesDoc){
  const set=new Set();
  if(!stylesDoc) return set;
  const BUILTIN=new Set([14,15,16,17,22,27,28,29,30,31,32,33,34,35,36,45,46,47,50,51,52,53,54,55,56,57,58,59]);
  const custom={};
  [...stylesDoc.getElementsByTagName("numFmt")].forEach(f=>{
    const id=+f.getAttribute("numFmtId");
    const code=String(f.getAttribute("formatCode")||"").replace(/\[[^\]]*\]/g,"").replace(/"[^"]*"/g,"");
    custom[id]= /[ymdhs]/i.test(code) && /[ymd]/i.test(code);
  });
  const xfsBlocks=[...stylesDoc.getElementsByTagName("cellXfs")];
  const xfs = xfsBlocks.length? [...xfsBlocks[0].getElementsByTagName("xf")] : [];
  xfs.forEach((xf,i)=>{
    const id=+(xf.getAttribute("numFmtId")||0);
    if(BUILTIN.has(id) || custom[id]) set.add(i);
  });
  return set;
}
function isPlayerPhotoHeader(value){
  const key=String(value||'').normalize('NFKC').replace(/[\s()_\-]/g,'').toLowerCase();
  return /^(?:(?:선수)?사진|프로필(?:사진)?|이미지|photo|image|profilephoto)(?:url|링크|주소|link)?$/.test(key);
}
function photoFormulaArgument(value){
  // Read only a literal URL or a same-sheet cell reference. Never execute formulas.
  const match=String(value||'').trim().match(/^=?(?:_xlfn\.)?(?:HYPERLINK|IMAGE)\s*\(\s*(?:"((?:[^"]|"")*)"|(\$?[A-Z]+\$?\d+))\s*(?=[,;)])/i);
  return match?{url:match[1]===undefined?null:match[1].replace(/""/g,'"'),ref:(match[2]||'').replace(/\$/g,'').toUpperCase()}:null;
}
function readPlayerPhotoCell(row){
  for(const [key,value] of Object.entries(row)){
    if(!isPlayerPhotoHeader(key)||!String(value??'').trim())continue;
    const formula=photoFormulaArgument(value);
    return formula?.url??String(value).trim();
  }
  return '';
}
function workbookHeaderRowIndex(rows){
  // Draft workbooks sometimes have a title row above the column headings.
  const draft=rows.findIndex(row=>row.some(isPlayerPhotoHeader)&&row.some(value=>/^(선수|선수명|이름|성명)$/u.test(String(value).replace(/\s/g,''))));
  return draft>=0?draft:rows.findIndex(row=>row.some(value=>String(value).trim()));
}
function sheetRows(doc, shared, dateStyles, hyperlinks={}){
  const cells=new Map();
  const rows=[];
  [...doc.getElementsByTagName("row")].forEach(r=>{
    const arr=[];
    [...r.getElementsByTagName("c")].forEach((c,idx)=>{
      const ref=(c.getAttribute("r")||"").replace(/[0-9]/g,"");
      const ci = ref? colIdx(ref) : idx;
      const t=c.getAttribute("t"); let v="";
      if(t==="inlineStr"){ const is=c.getElementsByTagName("is")[0]; v=is?is.textContent:""; }
      else { const vv=c.getElementsByTagName("v")[0]; v=vv?vv.textContent:""; if(t==="s") v=shared[+v]??""; }
      // 셀 서식이 "날짜"면 엑셀은 숫자(일련번호)로 저장하므로 날짜로 복원한다
      const sIdx = c.getAttribute("s");
      if(dateStyles && sIdx!==null && dateStyles.has(+sIdx) && (!t || t==="n") && /^\d+(\.\d+)?$/.test(String(v))){
        const conv = serialToDate(parseFloat(v));
        if(conv) v = conv;
      }
      arr[ci]=v;
      const formula=c.getElementsByTagName("f")[0];
      const address=String(c.getAttribute('r')||'').replace(/\$/g,'').toUpperCase();
      cells.set(address,{row:rows.length,col:ci,value:v,formula:formula?.textContent||'',href:hyperlinks[address]||''});
    });
    for(let i=0;i<arr.length;i++) if(arr[i]===undefined) arr[i]="";
    rows.push(arr);
  });
  const headerIndex=workbookHeaderRowIndex(rows),header=rows[headerIndex]||[];
  const photoColumns=new Set(header.map((v,i)=>isPlayerPhotoHeader(v)?i:-1));
  const resolve=(cell,seen=new Set())=>{
    if(!cell||seen.has(cell)||seen.size>=8)return '';
    if(cell.href)return cell.href;
    const arg=photoFormulaArgument(cell.formula);
    if(arg){
      if(arg.url!==null)return arg.url;
      seen.add(cell);return resolve(cells.get(arg.ref),seen);
    }
    return String(cell.value??'').trim();
  };
  cells.forEach(cell=>{if(cell.row>headerIndex&&photoColumns.has(cell.col))rows[cell.row][cell.col]=resolve(cell);});
  return rows;
}
function rowsToObjects(rows){
  const clean=rows.slice(Math.max(0,workbookHeaderRowIndex(rows))).filter(r=>r.some(c=>String(c).trim()!==""));
  if(clean.length<2) return [];
  const head=clean[0].map(h=>String(h).trim());
  return clean.slice(1).map(r=>{ const o={}; head.forEach((h,i)=>{ if(h) o[h]=String(r[i]??"").trim(); }); return o; });
}
function detectKind(name, headers){
  const nm=String(name||""); const h=headers.join(",");
  /* 선수명단는 기존 선수명단과 별도 시트여도 선수 기본정보를 안전하게 병합한다. */
  if(/팀\s*스쿼드|team\s*squad/i.test(nm)||(/코치/.test(h)&&/날짜/.test(h)&&/선수\s*1/.test(h)&&!/상대팀/.test(h))) return "squads";
  if(/draft/i.test(nm) && /선수|이름|성명/.test(h)) return "rosterDraft";
  if(/명단|로스터|엔트리/.test(nm)) return "roster";
  if(/연도|시즌|년도/.test(h) && /선수|이름/.test(h) && !/상대팀|홈팀|원정팀|경기/.test(h)) return "roster";
  if(/상대팀/.test(h) && /선수1|선수 1|선수|득점자/.test(h)) return "unified";
  if(/홈팀|원정팀/.test(h) && /선수|출석|득점자/.test(h)) return "unified";
  if(/통합/.test(nm)) return "unified";
  for(const k of Object.keys(SHEET_OF)) if(nm.includes(SHEET_OF[k])) return k;
  if(/홈팀|원정팀/.test(h)) return "matches";
  if(/구분/.test(h) && /내용|비고/.test(h)) return "specials";
  if(/득점|골/.test(h) && /선수|득점자/.test(h)) return "goals";
  if(/선수|이름/.test(h)) return "attendance";
  return null;
}
function normalizeLeagueGroup(v){
  const raw=String(v||"").trim();
  if(!raw) return "";
  const n=raw.toLowerCase().replace(/[\s_.\-]/g,"");
  if(n==="a" || n==="1" || n.includes("a그룹") || n.includes("슈퍼리그") || n==="슈퍼" || n.includes("superleague") || n==="super") return "A";
  if(n==="b" || n==="2" || n.includes("b그룹") || n.includes("챌린지리그") || n==="챌린지" || n.includes("challengeleague") || n==="challenge") return "B";
  return "";
}
function leagueGroupLabel(code){
  const d=displaySettings();
  return code==="A"?d.leagueA:code==="B"?d.leagueB:"";
}
function matchTeamGroup(m,team){
  if(!m || !team) return "";
  if(team===m.home) return normalizeLeagueGroup(m.homeGroup || (m.groups&&m.groups[team]));
  if(team===m.away) return normalizeLeagueGroup(m.awayGroup || (m.groups&&m.groups[team]));
  return normalizeLeagueGroup(m.groups&&m.groups[team]);
}

function applyUnified(objs){
  const M=[], A=[], G=[], S=[], F=[], MM=[], idx={}, last={};
  objs.forEach(o=>{
    const g=(...k)=>pick(o,...k);
    const carry=(field,...keys)=>{ const v=String(g(...keys)||"").trim(); if(v){ last[field]=v; return v; } return last[field]||""; };
    const date = normDate(carry("date","\ub0a0\uc9dc","\uacbd\uae30\uc77c","\uc77c\uc790"));
    const comp = carry("comp","\ub300\ud68c","\ub9ac\uadf8","\uc774\ubca4\ud2b8") || "\uc815\uaddc\ub9ac\uadf8";
    const no   = carry("no","\uacbd\uae30\ubc88\ud638","\uacbd\uae30No","\uacbd\uae30\uc21c","\ubc88\ud638") || "1";
    const halfV = normHalf(carry("half","\ubc18\uae30","\uc2dc\uc98c\uad6c\ubd84","\uae30\uac04"));
    const roundV = carry("round","\ub77c\uc6b4\ub4dc","Round","round","R","\ud68c\ucc28");
    const groupV = normalizeLeagueGroup(g("그룹","리그그룹","그룹명","Group","group"));
    const team = String(g("\ud300","\uc18c\uc18d\ud300","\uc6b0\ub9ac\ud300")||"").trim();
    const opp  = String(g("\uc0c1\ub300\ud300","\uc0c1\ub300")||"").trim();
    if(!date || !team) return;
    const gf=num(g("\ub4dd\uc810","\uc810\uc218","\ub4dd\uc810\uc218")), ga=num(g("\uc2e4\uc810","\uc0c1\ub300\ub4dd\uc810"));
    const foul=num(g("파울수","파울","팀파울"));
    const forfeit=isForfeitValue(g("몰수패","몰수","기권패","Forfeit","forfeit"));
    const coach=String(g("\uac10\ub3c5","\uac10\ub3c5\uba85")||"").trim();

    /* 같은 날짜에 경기번호가 반복되어도 대회·라운드·대진 조합으로 정확히 묶는다. */
    const pair = opp ? [team,opp].sort((a,b)=>a.localeCompare(b)).join("|") : "";
    const key = [date,comp,roundV,no,pair].join("#");
    let m = idx[key];
    if(!m){
      m={ id:"M"+String(M.length+1).padStart(3,"0"), date, comp, no, half:halfV, round:roundV,
        home:team, away:opp, hs:gf, as:ga, hf:foul, af:0, homeGroup:groupV, awayGroup:"" };
      idx[key]=m; M.push(m);
    } else if(m.home===team){
      m.hs=gf; m.hf=foul; if(groupV) m.homeGroup=groupV; if(opp) m.away=opp;
    } else if(m.away===team || !m.away || m.away===opp){
      m.away=team; m.as=gf; m.af=foul; if(groupV) m.awayGroup=groupV;
      if(!m.hs && ga) m.hs=ga;
      if(!m.home && opp) m.home=opp;
    } else {
      /* 동일 키에 다른 대진이 들어오면 별도 경기로 보존한다. */
      const altKey=key+"#"+team;
      m={ id:"M"+String(M.length+1).padStart(3,"0"), date, comp, no, half:halfV, round:roundV,
        home:team, away:opp, hs:gf, as:ga, hf:foul, af:0, homeGroup:groupV, awayGroup:"" };
      idx[altKey]=m; M.push(m);
    }
    if(forfeit) markForfeitTeam(m,team);

    const names=[];
    for(let i=1;i<=MAXP;i++){ const v=String(g("\uc120\uc218"+i)||"").trim(); if(v) names.push(v); }
    if(!names.length){ const v=String(g("\uc120\uc218","\uc120\uc218\uba85","\uc774\ub984")||"").trim(); if(v) names.push(v); }
    [...new Set(names)].slice(0,MAXP).forEach(p=>{
      if(!A.some(x=>x.id===m.id && x.team===team && x.player===p)) A.push({ id:m.id, team, player:p, coach });
    });
    parseScorers(g("득점자","득점선수","골")).forEach(s=>{
      const ex=G.find(x=>x.id===m.id && x.team===team && x.player===s.player);
      if(ex) ex.g+=s.g; else G.push({ id:m.id, team, player:s.player, g:s.g, a:0 });
    });
    parseScorers(g("어시스트","도움","도움선수")).forEach(s=>{
      const ex=G.find(x=>x.id===m.id && x.team===team && x.player===s.player);
      if(ex) ex.a+=s.g; else G.push({ id:m.id, team, player:s.player, g:0, a:s.g });
    });
    parseScorers(g("개인파울","선수파울","파울선수")).forEach(s=>{
      const ex=F.find(x=>x.id===m.id && x.team===team && x.player===s.player);
      if(ex) ex.fouls+=s.g; else F.push({ id:m.id, team, player:s.player, fouls:s.g });
    });
    parseScorers(g("선방","세이브","선방선수")).forEach(s=>{
      const ex=S.find(x=>x.id===m.id && x.team===team && x.player===s.player);
      if(ex) ex.saves+=s.g; else S.push({ id:m.id, team, player:s.player, saves:s.g });
    });
    parseScorers(g("MOM","mom","M.O.M","맨오브더매치","경기MOM")).forEach(s=>{
      const ex=MM.find(x=>x.id===m.id && x.team===team && x.player===s.player);
      if(ex) ex.mom+=s.g; else MM.push({ id:m.id, team, player:s.player, mom:s.g });
    });
  });
  if(!M.length) throw new Error("\uc720\ud6a8\ud55c \uacbd\uae30 \ud589\uc774 \uc5c6\uc2b5\ub2c8\ub2e4 (\ub0a0\uc9dc\u00b7\ud300 \ud655\uc778)");
  DB.matches=M; DB.attendance=A; DB.goals=G; DB.saves=S; DB.fouls=F; DB.moms=MM;
  return M.length;
}
function applyRows(kind, objs){
  if(kind==="squads") return applySquadRows(objs);
  if(kind==="unified") return applyUnified(objs);
  if(kind==="rosterDraft"){
    const rows=objs.map(o=>({...SCHEMA.roster.map(o),source:'EXCEL_DRAFT'})).filter(r=>String(r.player||"").trim()&&!isOwnGoalPlayer(r.player));
    /* V3.17.3: Draft 업로드 시 기존 Firebase/local roster 초기화 */
    DB.roster=[];
    rows.forEach(r=>{
      const player=String(r.player||"").trim(), year=String(r.year||"").trim();
      const idx=DB.roster.findIndex(x=>String(x.player||"").trim()===player && String(x.year||"").trim()===year);
      if(idx>=0){
        const base=DB.roster[idx];
        Object.keys(r).forEach(k=>{ if(String(r[k]??"").trim()!=="") base[k]=r[k]; });
        // V3.17.3: Draft 사진(URL) 유지
        if(r.photo && String(r.photo).trim()) base.photo=String(r.photo).trim();
      }else DB.roster.push(r);
    });
    return rows.length;
  }
  const rows = objs.map(SCHEMA[kind].map).filter(r=>Object.values(r).some(v=>v!==""&&v!==0));
  if(kind==="matches") rows.forEach((r,i)=>{ if(!r.id) r.id="M"+String(i+1).padStart(3,"0"); });
  if(kind==='roster') rows.forEach(r=>{r.source='EXCEL_ROSTER';});
  DB[kind]=rows; return rows.length;
}
function rebuildRosterFromExcel(){
  const clean=[], seen=new Map(), matchMap=new Map((DB.matches||[]).map(m=>[String(m.id),m]));
  const keyOf=(name,year)=>String(name||'').normalize('NFKC').trim()+'|'+String(year||'').trim();
  (DB.roster||[]).forEach(r=>{
    const name=String(r.player||'').normalize('NFKC').trim();
    if(!name || isOwnGoalPlayer(name)) return;
    const key=keyOf(name,r.year), row={...r,player:name,source:r.source||'EXCEL_DRAFT'};
    if(!seen.has(key)){seen.set(key,row);clean.push(row);}
    else Object.keys(row).forEach(k=>{if(String(row[k]??'').trim()) seen.get(key)[k]=row[k];});
  });
  ['attendance','goals','saves','fouls','moms'].forEach(kind=>(DB[kind]||[]).forEach(x=>{
    const name=String(x.player||'').normalize('NFKC').trim(); x.player=name;
    if(!name || isOwnGoalPlayer(name))return;
    const m=matchMap.get(String(x.id));
    const year=String(m?.date||x.date||'').slice(0,4), key=keyOf(name,year);
    if(!seen.has(key) && !seen.has(keyOf(name,''))){
      const row={year,team:x.team||'미등록',player:name,engName:'',pos:'',source:'MATCH_ONLY'};
      seen.set(key,row);clean.push(row);
    }
  }));
  DB.roster=clean;
  return clean.length;
}
function applyWorkbookSheets(sheets){
  const previous=DB, groups=new Map();
  sheets.forEach(s=>{if(!groups.has(s.kind))groups.set(s.kind,[]);groups.get(s.kind).push(...s.objs);});
  if(!groups.size)throw new Error('인식할 수 있는 시트가 없습니다. 통합 양식을 사용해 주세요.');
  const full=groups.has('unified')||groups.has('matches');
  const draft=groups.get('rosterDraft'), roster=groups.get('roster');
  DB=JSON.parse(JSON.stringify(previous));
  try{
    if(full){
      DB.settings=DB.settings||{};DB.settings.teamSquads=[];
      for(const k of ['matches','attendance','goals','saves','fouls','moms','specials','roster']) DB[k]=[];
    }
    for(const [kind,objs] of groups) if(kind!=='roster' && kind!=='rosterDraft') applyRows(kind,objs);
    if(draft||roster){
      applyRows('rosterDraft',[...(roster||[]),...(draft||[])]);
      // Keep the exact Draft membership when a workbook also has a general roster.
      const key=r=>normalizePlayerMatchKey(r.player)+'|'+String(r.year||'').trim();
      const draftKeys=new Set((draft||[]).map(SCHEMA.roster.map).map(key));
      DB.roster.forEach(r=>{r.source=(!draft||draftKeys.has(key(r)))?'EXCEL_DRAFT':'EXCEL_ROSTER';});
    }
    if(full||draft||roster){
      rebuildRosterFromExcel();
      const names=new Set(DB.roster.map(r=>r.player));
      DB.soccerbee=(DB.soccerbee||[]).filter(r=>names.has(r.player));
      DB.settings=DB.settings||{};
      DB.settings.rosterSource='EXCEL';DB.settings.rosterUpdatedAt=new Date().toISOString();
    }
    DB=GGFC.normalizeDB(DB);
    return [...groups.keys()].map(k=>LABEL[k]||k);
  } catch(e){DB=previous;throw e;}
}
async function importXlsx(buf){
  const zip=await unzip(buf), get=n=>zip[n]||zip[n.replace(/^\//,'')];
  const wb=xml(get('xl/workbook.xml')), rels=xml(get('xl/_rels/workbook.xml.rels'));
  const relMap={}; [...rels.getElementsByTagName('Relationship')].forEach(r=>relMap[r.getAttribute('Id')]=r.getAttribute('Target'));
  const ss=get('xl/sharedStrings.xml'), shared=ss?[...xml(ss).getElementsByTagName('si')].map(x=>x.textContent):[];
  const st=get('xl/styles.xml'), styles=dateStyleSet(st?xml(st):null), sheets=[];
  for(const sh of [...wb.getElementsByTagName('sheet')]){
    const rid=sh.getAttribute('r:id')||sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id');
    let target=(relMap[rid]||'').replace(/^\//,''); if(!target.startsWith('xl/'))target='xl/'+target;
    const f=get(target);if(!f)continue;
    const dir=target.slice(0,target.lastIndexOf('/')+1), file=target.slice(target.lastIndexOf('/')+1);
    const rf=get(dir+'_rels/'+file+'.rels'), links={}, linkRels={};
    if(rf)[...xml(rf).getElementsByTagName('Relationship')].forEach(r=>{if(r.getAttribute('TargetMode')==='External')linkRels[r.getAttribute('Id')]=r.getAttribute('Target');});
    const doc=xml(f);
    [...doc.getElementsByTagName('hyperlink')].forEach(h=>{const id=h.getAttribute('r:id')||h.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id');if(linkRels[id])links[h.getAttribute('ref')]=linkRels[id];});
    const objs=rowsToObjects(sheetRows(doc,shared,styles,links));
    if(!objs.length)continue;
    const kind=detectKind(sh.getAttribute('name'),Object.keys(objs[0]));
    if(kind)sheets.push({kind,objs});
  }
  return applyWorkbookSheets(sheets);
}

function importCsvFile(text){
  const objs = parseCSV(text);
  if(!objs.length) throw new Error("데이터가 비어 있습니다");
  const kind = detectKind("", Object.keys(objs[0]));
  if(!kind) throw new Error("헤더를 인식하지 못했습니다. 통합 양식의 헤더를 사용해 주세요");
  const n = applyRows(kind, objs);
  return LABEL[kind]+" "+n+(kind==="unified"?"경기":"행")+"을 반영했습니다.";
}

/* ---------- derived ---------- */
function normHalf(v){
  const t=String(v||"").trim().toLowerCase();
  if(!t) return "";
  if(/^(h1|1|1h)$/.test(t) || /\uc0c1\ubc18|\uc804\ubc18/.test(t)) return "H1";
  if(/^(h2|2|2h)$/.test(t) || /\ud558\ubc18|\ud6c4\ubc18/.test(t)) return "H2";
  return "";
}
function halfLabel(h){ return h==="H1"?"\uc0c1\ubc18\uae30":h==="H2"?"\ud558\ubc18\uae30":""; }
function dateAddDays(dateStr,days){
  const d=new Date(String(dateStr||"")+"T00:00:00Z");
  if(isNaN(d.getTime())) return dateStr||"";
  d.setUTCDate(d.getUTCDate()+days);
  return d.toISOString().slice(0,10);
}
function splitRangeIntoThree(start,end){
  const a=new Date(String(start||"")+"T00:00:00Z"), b=new Date(String(end||"")+"T00:00:00Z");
  if(isNaN(a.getTime())||isNaN(b.getTime())||b<a) return [{s:start,e:end},{s:start,e:end},{s:start,e:end}];
  const total=Math.floor((b-a)/86400000)+1;
  return [0,1,2].map(i=>{
    const so=Math.floor(total*i/3), next=Math.floor(total*(i+1)/3);
    return {s:dateAddDays(start,so),e:dateAddDays(start,Math.max(so,next-1))};
  });
}
function splitRangeIntoCount(start,end,count){
  count=Math.max(1,Math.min(4,parseInt(count,10)||1));
  const a=new Date(String(start||"")+"T00:00:00Z"), b=new Date(String(end||"")+"T00:00:00Z");
  if(isNaN(a.getTime())||isNaN(b.getTime())||b<a) return Array.from({length:count},()=>({s:start,e:end,complete:false,mode:'REP'}));
  const total=Math.floor((b-a)/86400000)+1;
  return Array.from({length:count},(_,i)=>{
    const so=Math.floor(total*i/count), next=Math.floor(total*(i+1)/count);
    return {s:dateAddDays(start,so),e:dateAddDays(start,Math.max(so,next-1)),complete:false,mode:'REP'};
  });
}
function seasonCfg(y){
  DB.settings = DB.settings || {seasons:{}};
  DB.settings.seasons = DB.settings.seasons || {};
  const d=DB.settings.seasons[y]||{};
  const h1s=d.h1s||y+"-01-01", h1e=d.h1e||y+"-06-30", h2s=d.h2s||y+"-07-01", h2e=d.h2e||y+"-12-31";

  /* 대표승점은 시즌을 상반기/하반기로 분리하고 각 반기마다 구간 수와 날짜를 따로 관리한다. */
  const stored=d.repSegments||{};
  const oldWhole=Array.isArray(d.repList)?d.repList.slice():[];
  const normalizeList=(arr)=>Array.isArray(arr)?arr.map(x=>({s:normDate(x&&x.s),e:normDate(x&&x.e),complete:x&&x.complete===true,mode:String(x&&x.mode||'REP').toUpperCase()==='IND'?'IND':'REP',finalPoints:(x&&x.finalPoints&&typeof x.finalPoints==='object')?Object.assign({},x.finalPoints):null,finalStandings:(x&&x.finalStandings&&typeof x.finalStandings==='object')?JSON.parse(JSON.stringify(x.finalStandings)):null,finalGames:Number(x&&x.finalGames||0),finalizedAt:String(x&&x.finalizedAt||'')})).filter(x=>x.s&&x.e):[];
  let rawH1=normalizeList(stored.H1), rawH2=normalizeList(stored.H2);

  /* 직전 버전의 연간 repList가 있으면 날짜 위치를 기준으로 상·하반기에 안전하게 이관한다. */
  if(!rawH1.length && !rawH2.length && oldWhole.length){
    normalizeList(oldWhole).forEach(x=>{
      if(x.e<=h1e) rawH1.push(x);
      else if(x.s>=h2s) rawH2.push(x);
      else {
        if(x.s<=h1e) rawH1.push({s:x.s,e:h1e,complete:false,mode:x.mode||'REP'});
        if(x.e>=h2s) rawH2.push({s:h2s,e:x.e,complete:false,mode:x.mode||'REP'});
      }
    });
  }

  const storedCounts=d.repCounts||{};
  const makeHalf=(half,raw,start,end)=>{
    const explicit=parseInt(storedCounts[half],10);
    const count=Math.max(1,Math.min(4,explicit||raw.length||3));
    const defaults=splitRangeIntoCount(start,end,count);

    /* 읽기 단계에서는 한 구간의 오류 때문에 다른 정상 구간을 자동분할로 덮어쓰지 않는다.
       사용자가 저장한 각 구간의 날짜/방식/완료 상태를 가능한 그대로 유지하고,
       누락되었거나 반기 범위를 완전히 벗어난 구간만 기본값으로 보완한다. */
    const list=Array.from({length:count},(_,i)=>{
      const x=(raw.slice(0,4)[i]||{}), xs=normDate(x.s), xe=normDate(x.e);
      const valid=!!xs&&!!xe&&xs<=xe&&xs>=start&&xe<=end;
      const base=valid?x:defaults[i];
      return {
        s:normDate(base.s)||defaults[i].s,
        e:normDate(base.e)||defaults[i].e,
        complete:valid && x.complete===true,
        mode:String(x.mode||base.mode||'REP').toUpperCase()==='IND'?'IND':'REP',
        finalPoints:valid && x.finalPoints&&typeof x.finalPoints==='object'?Object.assign({},x.finalPoints):null,
        finalStandings:valid && x.finalStandings&&typeof x.finalStandings==='object'?JSON.parse(JSON.stringify(x.finalStandings)):null,
        finalGames:valid?Number(x.finalGames||0):0,
        finalizedAt:valid?String(x.finalizedAt||''):''
      };
    });
    return {count,list};
  };
  const H1=makeHalf("H1",rawH1,h1s,h1e), H2=makeHalf("H2",rawH2,h2s,h2e);
  /* 구간완료/개별승점 설정 자체를 운영 확정 신호로 취급한다.
     과거 버전에서 repEnabled=false가 남아 있어도 관리자가 이미 구간완료를 했는데
     팀순위가 0점으로 보이는 문제를 방지한다. 현재 저장 화면도 활성 구간이 있으면
     repEnabled를 자동으로 켜므로 이 값은 다음 저장 때 정상 상태로 영구 저장된다. */
  const allConfigured=H1.list.concat(H2.list);
  const hasActiveConfiguredSegment=allConfigured.some(x=>x && (x.complete===true || String(x.mode||'REP').toUpperCase()==='IND'));
  const repEnabled=d.repEnabled===true || hasActiveConfiguredSegment;
  return {h1s,h1e,h2s,h2e,repEnabled,repCounts:{H1:H1.count,H2:H2.count},repSegments:{H1:H1.list,H2:H2.list},repCount:H1.count+H2.count,repList:H1.list.concat(H2.list)};
}
function inSeason(m){
  if(seasonYear==="ALL") return true;
  const d=String(m.date||"");
  if(d.slice(0,4)!==seasonYear) return false;
  if(half==="ALL") return true;
  const hv=normHalf(m.half);
  if(hv) return hv===half;
  const c=seasonCfg(seasonYear);
  if(half==="H1") return d>=c.h1s && d<=c.h1e;
  return d>=c.h2s && d<=c.h2e;
}
function seasonLabel(){
  if(seasonYear==="ALL") return "전체 기간";
  return seasonYear+"년 "+(half==="H1"?"상반기":half==="H2"?"하반기":"연간");
}
function matches(){ return DB.matches.filter(m=> (comp==="ALL" || m.comp===comp) && inSeason(m) ); }
function matchIds(){ return new Set(matches().map(m=>m.id)); }
function latestMatchDate(){
  return DB.matches.map(m=>normDate(m.date)).filter(Boolean).sort().pop()||"";
}
/* DB 최종 경기일을 기준으로 시즌 → 반기 → 대표승점 구간까지 하나의 기본 조회 컨텍스트로 맞춘다. */
function latestDbPeriodContext(date){
  const d=normDate(date||latestMatchDate());
  if(!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const year=d.slice(0,4), c=seasonCfg(year);
  const half=(d>=c.h2s)?"H2":"H1";
  const segs=(c.repSegments&&Array.isArray(c.repSegments[half]))?c.repSegments[half]:[];
  let idx=segs.findIndex(seg=>{const s=normDate(seg&&seg.s),e=normDate(seg&&seg.e);return s&&e&&d>=s&&d<=e;});
  if(idx<0){
    /* 구간 사이에 빈 날짜가 있어도 최종일 직전의 가장 가까운 구간을 선택한다. */
    for(let i=0;i<segs.length;i++){const ss=normDate(segs[i]&&segs[i].s);if(ss&&ss<=d) idx=i;}
    if(idx<0 && segs.length) idx=0;
  }
  const seg=idx>=0?segs[idx]:null;
  return {date:d,year,half,segment:idx>=0?String(idx+1):"ALL",segmentIndex:idx,
    segmentStart:seg?normDate(seg.s):"",segmentEnd:seg?normDate(seg.e):"",
    halfStart:half==="H2"?c.h2s:c.h1s,halfEnd:half==="H2"?c.h2e:c.h1e};
}
function applyLatestDbPeriodDefaults(force=false){
  const ctx=latestDbPeriodContext(); if(!ctx) return null;
  const sig=[ctx.date,ctx.year,ctx.half,ctx.segment].join("|");
  if(!force && latestDbPeriodSignature===sig) return ctx;
  latestDbPeriodSignature=sig;
  /* 경기기록 / 팀기록 / 선수기록은 공통 record 상태를 사용한다. */
  recordYear=ctx.year; recordMode=ctx.half; recordSegment=ctx.segment; recordDate=ctx.date;
  recordStart=ctx.segmentStart||ctx.halfStart; recordEnd=ctx.date;
  /* 대시보드 팀순위·랭킹과 상대전적도 같은 반기/구간을 기본 조회한다. */
  rankingRangeYear=ctx.year; rankingRangeMode=ctx.half; rankingRangeSegment=ctx.segment; rankingRangeStart=ctx.segmentStart||ctx.halfStart; rankingRangeEnd=ctx.date;
  h2hRangeYear=ctx.year; h2hRangeMode=ctx.half; h2hRangeSegment=ctx.segment; h2hRangeStart=ctx.segmentStart||ctx.halfStart; h2hRangeEnd=ctx.date;
  /* 선수 능력치는 최종 경기일 현재, 해당 반기로 맞춘다. */
  abilityYear=ctx.year; abilityHalf=ctx.half; abilityAsOfDate=ctx.date;
  dashDate=ctx.date; selDay=ctx.date;
  const p=ctx.date.split("-"); if(p.length===3) calRef=new Date(+p[0],+p[1]-1,1);
  return ctx;
}
function focusDashboardDate(date){
  const d=normDate(date);
  if(!d) return;
  comp="ALL"; seasonYear="ALL"; half="ALL"; dashDate=d; selDay=d;
  applyLatestDbPeriodDefaults(true);
  goTab("dash");
  if(location.hash!=="#dash") history.replaceState(null,"","#dash");
}
function teamList(){
  const s=new Set(); DB.matches.forEach(m=>{ if(m.home)s.add(m.home); if(m.away)s.add(m.away); });
  DB.attendance.forEach(a=>{ if(a.team)s.add(a.team); });
  return [...s].sort();
}
function compList(){ const s=new Set(DB.matches.map(m=>m.comp||"정규리그")); return [...s]; }
function result(hs,as_){ return hs>as_?"W":hs<as_?"L":"D"; }
function isForfeitValue(v){
  const t=String(v??"").trim().toLowerCase().replace(/\s+/g,"");
  return !!t && (/몰수패|기권패|forfeit/.test(t) || /^(o|y|yes|예|1|true)$/.test(t));
}
function forfeitTeamNames(m){
  const a=[];
  if(Array.isArray(m&&m.forfeitTeams)) m.forfeitTeams.forEach(t=>{ if(t&&!a.includes(t)) a.push(t); });
  if(m&&m.forfeitTeam&&!a.includes(m.forfeitTeam)) a.push(m.forfeitTeam);
  return a;
}
function markForfeitTeam(m,team){
  if(!m||!team) return;
  const a=forfeitTeamNames(m); if(!a.includes(team)) a.push(team); m.forfeitTeams=a;
}
function isForfeitTeam(m,team){ return forfeitTeamNames(m).includes(team); }
function matchResult(m,team){
  if(!m || (team!==m.home && team!==m.away)) return null;
  const ff=forfeitTeamNames(m).filter(t=>t===m.home||t===m.away);
  if(ff.length===1) return ff[0]===team?"L":"W";
  return team===m.home?result(num(m.hs),num(m.as)):result(num(m.as),num(m.hs));
}
function forfeitText(m){ const a=forfeitTeamNames(m); return a.length?"몰수패: "+a.join(", "):""; }

/* 개인파울이 등록된 경기·팀은 선수별 합계를 팀파울로 사용한다.
   개인 기록이 없을 때만 기존 파울수(hf/af)를 사용해 이중 집계를 방지한다.
   원본 필드는 유지하므로 조회·내보내기·재업로드를 반복해도 파울이 늘지 않는다. */
function personalTeamFoulIndex(list){
  const matchesById=new Map((list||[]).map(m=>[String(m.id??"").trim(),m]));
  const totals=new Map();
  (DB.fouls||[]).forEach(r=>{
    const id=String(r.id??"").trim(), m=matchesById.get(id);
    const team=String(r.team||"").trim(), player=String(r.player||"").trim(), count=num(r.fouls);
    if(!id||!m||!player||isOwnGoalPlayer(player)||!Number.isFinite(count)||count<=0) return;
    if(team!==String(m.home||"").trim() && team!==String(m.away||"").trim()) return;
    if(!totals.has(id)) totals.set(id,new Map());
    const byTeam=totals.get(id); byTeam.set(team,(byTeam.get(team)||0)+count);
  });
  return totals;
}
function matchTeamFouls(m,index){
  const byTeam=(index||personalTeamFoulIndex([m])).get(String(m.id??"").trim());
  const value=(team,raw)=>{
    const key=String(team||"").trim();
    if(byTeam&&byTeam.has(key)) return byTeam.get(key);
    const n=num(raw); return Number.isFinite(n)?Math.max(0,n):0;
  };
  return {home:value(m.home,m.hf),away:value(m.away,m.af)};
}
function totalTeamFouls(list){
  const index=personalTeamFoulIndex(list);
  return list.reduce((sum,m)=>{const f=matchTeamFouls(m,index);return sum+f.home+f.away;},0);
}
function teamStats(){
  const t={}, list=matches(), foulIndex=personalTeamFoulIndex(list);
  const g=n=>t[n]||(t[n]={team:n,p:0,w:0,d:0,l:0,gf:0,ga:0,f:0,pts:0});
  list.forEach(m=>{
    if(!m.home||!m.away) return;
    const H=g(m.home), A=g(m.away);
    H.p++;A.p++; H.gf+=m.hs;H.ga+=m.as; A.gf+=m.as;A.ga+=m.hs; const fouls=matchTeamFouls(m,foulIndex); H.f+=fouls.home;A.f+=fouls.away;
    const hr=matchResult(m,m.home), ar=matchResult(m,m.away);
    if(hr==="W"){H.w++;H.pts+=3;} else if(hr==="D"){H.d++;H.pts++;} else H.l++;
    if(ar==="W"){A.w++;A.pts+=3;} else if(ar==="D"){A.d++;A.pts++;} else A.l++;
  });
  return Object.values(t).sort((a,b)=> b.pts-a.pts || (b.gf-b.ga)-(a.gf-a.ga) || b.gf-a.gf);
}
function matchById(){ const m={}; DB.matches.forEach(x=>m[x.id]=x); return m; }

function playerStats(){
  const M=matchById(), ids=matchIds(), p={};
  const g=n=>p[n]||(p[n]={player:n,teams:{},att:0,w:0,d:0,l:0,g:0,a:0,sv:0,f:0,mom:0,pts:0});
  DB.attendance.forEach(r=>{
    if(!r.player||isOwnGoalPlayer(r.player)||!ids.has(r.id)) return;
    const m=M[r.id]; if(!m) return;
    const P=g(r.player); P.att++; P.teams[r.team]=(P.teams[r.team]||0)+1;
    const mine = matchResult(m,r.team);
    if(mine==="W"){P.w++;P.pts+=3;} else if(mine==="D"){P.d++;P.pts++;} else if(mine==="L"){P.l++;}
  });
  DB.goals.forEach(r=>{ if(!r.player||isOwnGoalPlayer(r.player)||!ids.has(r.id)) return; const P=g(r.player); P.g+=r.g; P.a+=r.a||0; });
  (DB.saves||[]).forEach(r=>{ if(!r.player||isOwnGoalPlayer(r.player)||!ids.has(r.id)) return; const P=g(r.player); P.sv+=num(r.saves); });
  (DB.fouls||[]).forEach(r=>{ if(!r.player||isOwnGoalPlayer(r.player)||!ids.has(r.id)) return; const P=g(r.player); P.f+=num(r.fouls); });
  (DB.moms||[]).forEach(r=>{ if(!r.player||isOwnGoalPlayer(r.player)||!ids.has(r.id)) return; const P=g(r.player); P.mom+=num(r.mom); });
  const year = String(new Date().getFullYear());
  const roster = DB.roster.filter(r=>r.player && !isOwnGoalPlayer(r.player) && (!r.year || r.year===year || DB.roster.every(x=>x.year!==year)));
  roster.forEach(r=>{ const P=g(r.player); if(!P.teams[r.team] && r.team) P.teams[r.team]=0; P.rosterTeam=r.team; P.no=r.no; });
  const teamGames={};
  matches().forEach(m=>{ [m.home,m.away].forEach(t=>{ if(t) teamGames[t]=(teamGames[t]||0)+1; }); });
  return Object.values(p).map(x=>{
    const main=Object.entries(x.teams).sort((a,b)=>b[1]-a[1])[0];
    const mt = (main && main[1]>0) ? main[0] : (x.rosterTeam || (main?main[0]:"-"));
    const tg=teamGames[mt]||0;
    return Object.assign(x,{ mainTeam: mt, teamGames: tg, attendanceRate: pct(x.att,tg), winRate: pct(x.w, x.w+x.d+x.l) });
  }).sort((a,b)=> b.pts-a.pts || b.g-a.g || b.att-a.att);
}
function attendanceRate(){
  const total = matches().length;
  return total;
}
function yearList(){
  const s=new Set();
  DB.matches.forEach(m=>{ const y=String(m.date||"").slice(0,4); if(/^\d{4}$/.test(y)) s.add(y); });
  return [...s].sort().reverse();
}

/* 날짜별 스쿼드와 선수 참가 시작일. 출석 원본은 스쿼드로 덮어쓰지 않는다. */
function rosterStartDateCell(o){
  const raw=String(pick(o,'시작일자','시작일','출전시작일','참가시작일')||'').trim();
  if(!raw)return '';
  const value=normDate(raw);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)
    throw new Error((pick(o,'선수','선수명','이름')||'선수')+' 시작일자를 확인하세요: '+raw);
  return value;
}
function applySquadRows(objs){
  const rows=[],seen=new Set();
  objs.forEach(o=>{
    const team=String(pick(o,'팀','소속팀')||'').trim();if(!team)return;
    const date=rosterStartDateCell({'시작일자':pick(o,'날짜','일자','시작일자'),'선수명':team});
    if(!date)throw new Error(team+' 팀스쿼드 적용 날짜가 없습니다.');
    const comp=String(pick(o,'대회','리그')||'정규리그').trim(),key=JSON.stringify([date,comp,team]);
    if(seen.has(key))throw new Error(date+' '+team+' 팀스쿼드가 중복되었습니다.');seen.add(key);
    const members=[],names=new Set();
    const add=(name,role)=>{name=String(name||'').normalize('NFKC').trim();const k=normalizePlayerMatchKey(name);if(!k||names.has(k)||isOwnGoalPlayer(name))return;names.add(k);members.push({player:name,role});};
    add(pick(o,'감독','감독명'),'감독');add(pick(o,'코치','코치명'),'코치');
    for(let i=1;i<=15;i++)add(pick(o,'선수'+i),'선수');
    rows.push({date,comp,half:normHalf(pick(o,'반기')),group:normalizeLeagueGroup(pick(o,'그룹')),team,members});
  });
  DB.settings=DB.settings||{};DB.settings.teamSquads=rows.sort((a,b)=>a.date.localeCompare(b.date));return rows.length;
}
function squadRows(){return Array.isArray(DB.settings?.teamSquads)?DB.settings.teamSquads:[];}
let squadLookupCache={source:null,length:0,scopes:new Map(),teams:new Map(),players:new Map()};
function squadCache(){
  const source=DB.settings?.teamSquads;
  if(squadLookupCache.source!==source||squadLookupCache.length!==(source?.length||0))squadLookupCache={source,length:source?.length||0,scopes:new Map(),teams:new Map(),players:new Map()};
  return squadLookupCache;
}
function squadScope(m){
  const cache=squadCache(),key=JSON.stringify([m.date,m.comp]);
  if(cache.scopes.has(key))return cache.scopes.get(key);
  const date=normDate(m.date),year=date.slice(0,4),all=squadRows().filter(r=>r.date<=date&&r.date.slice(0,4)===year);
  const exact=all.filter(r=>r.comp===m.comp);
  const scope=exact.length?exact:all.filter(r=>r.comp==='정규리그');cache.scopes.set(key,scope);return scope;
}
function squadAtMatch(m,team){
  const cache=squadCache(),key=JSON.stringify([m.date,m.comp,team]);
  if(!cache.teams.has(key))cache.teams.set(key,squadScope(m).filter(r=>r.team===team).sort((a,b)=>b.date.localeCompare(a.date))[0]||null);
  return cache.teams.get(key);
}
function squadPlayerTeams(m,player){
  const cache=squadCache(),id=JSON.stringify([m.date,m.comp,player]);if(cache.players.has(id))return cache.players.get(id);
  const key=normalizePlayerMatchKey(player),scope=squadScope(m),teams=[...new Set(scope.map(r=>r.team))];
  const result=teams.filter(t=>(squadAtMatch(m,t)?.members||[]).some(r=>normalizePlayerMatchKey(r.player)===key));cache.players.set(id,result);return result;
}
let participationStartCache={source:null,length:0,dates:new Map()};
function playerParticipationStart(player){
  const rows=DB.roster||[];
  if(participationStartCache.source!==rows||participationStartCache.length!==rows.length){
    const dates=new Map();rows.forEach(r=>{const key=normalizePlayerMatchKey(r.player),date=normDate(r.startDate);if(r.source!=='MATCH_ONLY'&&date&&(!dates.has(key)||date<dates.get(key)))dates.set(key,date);});
    participationStartCache={source:rows,length:rows.length,dates};
  }
  return participationStartCache.dates.get(normalizePlayerMatchKey(player))||'';
}
function playerEligibleOn(player,date){const start=playerParticipationStart(player);return !start||normDate(date)>=start;}
function analysisAttendance(list){
  const map=new Map(list.map(m=>[detailMatchKey(m.id),m]));
  return DB.attendance.filter(r=>{
    const m=map.get(detailMatchKey(r.id));if(!m||!playerEligibleOn(r.player,m.date))return false;
    const squad=squadAtMatch(m,String(r.team||'').trim());
    return !squad||squad.members.some(x=>normalizePlayerMatchKey(x.player)===normalizePlayerMatchKey(r.player));
  });
}
function squadRecordIssues(list=DB.matches,players=null){
  const map=new Map(list.map(m=>[detailMatchKey(m.id),m])),issues=new Map();
  DB.attendance.forEach(r=>{
    const m=map.get(detailMatchKey(r.id));if(!m||(players&&!players.includes(r.player)))return;
    const squad=squadAtMatch(m,r.team),assigned=squadPlayerTeams(m,r.player);
    let reason=!playerEligibleOn(r.player,m.date)?'시작일 이전 출석':squad&&!squad.members.some(x=>normalizePlayerMatchKey(x.player)===normalizePlayerMatchKey(r.player))?'스쿼드와 출석팀 불일치':'';
    if(!reason&&assigned.length>1)reason='여러 팀 스쿼드에 중복 등록';
    if(reason){const key=JSON.stringify([m.date,r.team,r.player,reason]);issues.set(key,{date:m.date,player:r.player,team:r.team,assigned:assigned.join(', ')||'명단 없음',reason});}
  });
  return [...issues.values()];
}
function squadAttendanceMembers(list,team){
  const members=new Map(),key=normalizePlayerMatchKey;
  list.forEach(m=>{(squadAtMatch(m,team)?.members||[]).forEach(r=>members.set(key(r.player),{...r,att:false}));});
  const ids=new Set(list.map(m=>detailMatchKey(m.id)));
  DB.attendance.filter(r=>ids.has(detailMatchKey(r.id))&&r.team===team).forEach(r=>{
    const k=key(r.player);if(!k)return;
    const existing=members.get(k);members.set(k,{player:r.player,role:existing?.role||'명단 외',att:true});
  });
  return [...members.values()];
}
function squadAttendanceHtml(list,team){
  return squadAttendanceMembers(list,team).map(r=>{
    const label=esc(r.player)+(r.role==='감독'||r.role==='코치'?' <small>('+r.role+')</small>':'');
    return r.att?'<strong class="squad-present">'+label+'</strong>':'<span class="squad-absent">'+label+'</span>';
  }).join(', ');
}

function chemMatches(){
  return matches().filter(m=> chemYear==="ALL" || String(m.date||"").slice(0,4)===chemYear );
}
function chemPlayers(){
  const ids=new Set(chemMatches().map(m=>detailMatchKey(m.id))), s=new Set();
  analysisAttendance(chemMatches()).forEach(r=>{ if(ids.has(detailMatchKey(r.id)) && r.player && !isOwnGoalPlayer(r.player)) s.add(r.player); });
  return [...s].sort(compareNamesKo);
}
function analysisGoalLookup(list){
  const matchesById=new Map(list.map(m=>[detailMatchKey(m.id),m])),teamsByPlayer=new Map(),goals=new Map();
  const playerKey=(id,name)=>JSON.stringify([id,normalizePlayerMatchKey(name)]);
  const goalKey=(id,team,name)=>JSON.stringify([id,String(team||'').trim(),normalizePlayerMatchKey(name)]);
  analysisAttendance(list).forEach(r=>{
    const id=detailMatchKey(r.id),m=matchesById.get(id),team=String(r.team||'').trim();
    if(!m||!r.player||![m.home,m.away].includes(team))return;
    const key=playerKey(id,r.player);if(!teamsByPlayer.has(key))teamsByPlayer.set(key,new Set());teamsByPlayer.get(key).add(team);
  });
  DB.goals.forEach(r=>{
    const id=detailMatchKey(r.id),m=matchesById.get(id),name=String(r.player||'').trim();
    if(!m||!name||isOwnGoalPlayer(name))return;
    let team=String(r.team||'').trim();
    if(!team){const candidates=teamsByPlayer.get(playerKey(id,name));if(candidates?.size!==1)return;team=[...candidates][0];}
    if(![m.home,m.away].includes(team))return;
    const key=goalKey(id,team,name);goals.set(key,(goals.get(key)||0)+num(r.g));
  });
  return (id,team,name)=>goals.get(goalKey(detailMatchKey(id),team,name))||0;
}
function chemistry(target,list){
  const ms=uniqueRecordMatches(list||chemMatches()), M=new Map(ms.map(m=>[detailMatchKey(m.id),m]));
  const goal=analysisGoalLookup(ms);
  const attendance=analysisAttendance(ms).map(r=>({...r,id:detailMatchKey(r.id),player:String(r.player||'').trim(),team:String(r.team||'').trim()})).filter(r=>{
    const m=M.get(r.id);return m&&r.player&&!isOwnGoalPlayer(r.player)&&[m.home,m.away].includes(r.team);
  });
  const playerTeams=new Map();
  attendance.forEach(r=>{const key=JSON.stringify([r.id,r.player]);if(!playerTeams.has(key))playerTeams.set(key,new Set());playerTeams.get(key).add(r.team);});
  const groups=new Map();
  attendance.forEach(r=>{
    // 같은 경기의 중복 출석을 한 번만 세고, 양 팀으로 중복 등록된 모호한 선수는 제외한다.
    if(playerTeams.get(JSON.stringify([r.id,r.player])).size!==1)return;
    const key=JSON.stringify([r.id,r.team]);
    if(!groups.has(key))groups.set(key,{id:r.id,team:r.team,players:new Set(),coaches:new Set()});
    const group=groups.get(key);group.players.add(r.player);
    const squad=squadAtMatch(M.get(r.id),r.team),coach=squad?squad.members.find(x=>x.role==='감독')?.player:r.coach;
    if(String(coach||'').trim())group.coaches.add(String(coach).trim());
  });
  const mates=new Map(),coaches=new Map();let base=0,baseGoals=0,bw=0,bd=0,bl=0;
  groups.forEach(group=>{
    if(!group.players.has(target))return;
    const m=M.get(group.id),res=matchResult(m,group.team);if(!res)return;
    const tg=goal(group.id,group.team,target);base++;baseGoals+=tg;
    if(res==='W')bw++;else if(res==='D')bd++;else bl++;
    const add=(map,name,mg)=>{
      if(!name||name===target)return;
      if(!map.has(name))map.set(name,{name,p:0,w:0,d:0,l:0,tg:0,mg:0});
      const row=map.get(name);row.p++;row[res.toLowerCase()]++;row.tg+=tg;row.mg+=mg;
    };
    group.players.forEach(name=>add(mates,name,goal(group.id,group.team,name)));
    group.coaches.forEach(name=>add(coaches,name,0));
  });
  const baseGpg=base?Math.round(baseGoals/base*100)/100:0;
  const finish=map=>[...map.values()].map(row=>{
    const rate=pct(row.w,row.p),att=pct(row.p,base),gpg=row.p?Math.round(row.tg/row.p*100)/100:0;
    const mgpg=row.p?Math.round(row.mg/row.p*100)/100:0,diff=Math.round((gpg-baseGpg)*100)/100;
    const score=coupleScoreBreakdown(rate,att,gpg).score;
    return Object.assign(row,{rate,att,gpg,mgpg,diff,score});
  }).sort((a,b)=>b.score-a.score||b.p-a.p);
  return {mates:finish(mates),coaches:finish(coaches),base,baseGoals,baseGpg,bw,bd,bl,baseRate:pct(bw,base)};
}

/* ---------- renderers ---------- */
function tbl(cols, rows){
  if(!rows.length) return '<div class="empty">데이터가 없습니다. <b>데이터 관리</b> 탭에서 기록을 업로드하세요.</div>';
  return '<table><thead><tr>'+cols.map(c=>'<th class="'+(c.n?"num":"")+'">'+esc(c.t)+'</th>').join("")+'</tr></thead><tbody>'+
    rows.map(r=>'<tr>'+r.map((c,i)=>'<td class="'+(cols[i].n?"num":"")+'">'+c+'</td>').join("")+'</tr>').join("")+'</tbody></table>';
}
function ensureLogoSettings(){
  DB.settings=DB.settings||{};
  DB.settings.seasons=DB.settings.seasons||{};
  DB.settings.teamLogos=DB.settings.teamLogos||{};
  DB.settings.teamNames=DB.settings.teamNames||{};
  DB.settings.headerLogo=DB.settings.headerLogo||"";
  DB.settings.leagueLogos=DB.settings.leagueLogos||{A:"",B:""};
  if(!("A" in DB.settings.leagueLogos)) DB.settings.leagueLogos.A="";
  if(!("B" in DB.settings.leagueLogos)) DB.settings.leagueLogos.B="";
  DB.settings.display=DB.settings.display||{};
  if(!String(DB.settings.display.brandTitle||"").trim()) DB.settings.display.brandTitle="GGFC";
  if(!String(DB.settings.display.leagueA||"").trim()) DB.settings.display.leagueA="슈퍼리그";
  if(!String(DB.settings.display.leagueB||"").trim()) DB.settings.display.leagueB="챌린지리그";
}
function displaySettings(){
  ensureLogoSettings();
  return DB.settings.display;
}
function teamDisplayName(name){
  ensureLogoSettings();
  const key=String(name||"").trim();
  return String(DB.settings.teamNames[key]||key).trim() || key;
}
function headerLogo(){ ensureLogoSettings(); return safeLogoSrc(DB.settings.headerLogo); }
function defaultHeaderLogoHtml(){
  return '<svg class="logo header-logo-fallback" viewBox="0 0 48 48" aria-hidden="true">'+
    '<path d="M7 8h24L18 21H5z" fill="#37003c"/>'+
    '<path d="M18 21 34 5h9L27 25l15 15H29z" fill="#37003c"/>'+
    '<path d="M6 39 19 25l8 8-6 6z" fill="#37003c"/>'+
    '<circle cx="34" cy="13" r="4" fill="#00ff85"/></svg>';
}
function renderHeaderLogo(){
  const box=$("#headerBrandLogo"); if(!box) return;
  const src=headerLogo();
  box.innerHTML=src?'<img src="'+src+'" alt="헤더 로고">':defaultHeaderLogoHtml();
}
function renderDisplaySettings(){
  const d=displaySettings();
  const brand=$("#menuBrandTitle"); if(brand) brand.textContent=d.brandTitle;
  renderHeaderLogo();
  document.title=d.brandTitle+" | MATCH CENTRE";
  const bi=$("#brandTitleInput"), ai=$("#leagueANameInput"), ci=$("#leagueBNameInput");
  if(bi) bi.value=d.brandTitle;
  if(ai) ai.value=d.leagueA;
  if(ci) ci.value=d.leagueB;
  [bi,ai,ci,$("#displayNameSave"),$("#displayNameReset")].filter(Boolean).forEach(el=>el.disabled=!admin);
}
function safeLogoSrc(src){
  const v=String(src||"");
  return /^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(v)?v:"";
}
function teamLogo(name){ ensureLogoSettings(); return safeLogoSrc(DB.settings.teamLogos[String(name||"").trim()]); }
function leagueLogo(code){ ensureLogoSettings(); return safeLogoSrc(DB.settings.leagueLogos[String(code||"").toUpperCase()]); }
function teamChip(n){
  const name=String(n||""), logo=teamLogo(name);
  return '<span class="team-chip">'+(logo?'<img class="team-logo-sm" src="'+logo+'" alt="">':'<span class="dot" style="background:'+teamColor(name)+';margin-right:0"></span>')+'<span>'+esc(teamDisplayName(name))+'</span></span>';
}

function playerCardQueryAttrs(info){
  if(!info) return '';
  const query={start:info.start||'',end:info.end||'',year:info.year||'',half:info.half||(/^(H1|H2)$/.test(info.mode)?info.mode:''),asOf:info.asOf||'',allCompetitions:info.allCompetitions===true};
  return ' data-card-query="'+esc(JSON.stringify(query))+'"';
}
function resolvePlayerCardQuery(query){
  let info=query;
  if(!info && abilityAsOfDate && $('#v-ability') && $('#v-ability').classList.contains('on')){
    const date=normDate(abilityAsOfDate), year=date.slice(0,4), half=abilityHalfForDate(year,date);
    info=Object.assign({},abilityHalfInfo(year,half),{asOf:date,allCompetitions:true});
  }
  info=info||recordQueryInfo();
  const start=normDate(info.start), end=normDate(info.end), asOf=normDate(info.asOf)||end;
  const list=uniqueRecordMatches((info.list||(info.allCompetitions?DB.matches:recordBaseMatches())).filter(m=>{
    const d=normDate(m.date);return d&&(!start||d>=start)&&(!end||d<=end)&&(!asOf||d<=asOf);
  }));
  const cutoff=asOf||list.map(m=>normDate(m.date)).sort().pop()||start;
  const year=String((cutoff||start).slice(0,4)||info.year||recordYear||new Date().getFullYear());
  const half=info.half||(/^(H1|H2)$/.test(info.mode)?info.mode:abilityHalfForDate(year,cutoff));
  return Object.assign({},info,{start,end,list,asOf:cutoff,year,half});
}
function playerCardLink(name, extraHtml, query){
  const n=String(name||'').trim();
  if(!n) return extraHtml||'';
  if(isOwnGoalPlayer(n)) return esc('자책골');
  return '<button type="button" class="player-card-link" data-player="'+esc(n)+'"'+playerCardQueryAttrs(query)+' title="선수 카드 보기">'+(extraHtml||esc(n))+'</button>';
}
function draftRosterRows(year){
  const target=String(year||'').match(/20\d{2}/)?.[0]||'';
  return (DB.roster||[]).filter(r=>{
    const source=String(r.source||'').toUpperCase(), name=String(r.player||'').trim();
    const rowYear=String(r.year||'').match(/20\d{2}/)?.[0]||'';
    // Untagged rosters from older JSON exports remain compatible; match-only rows never qualify.
    return name && !isOwnGoalPlayer(name) && (!source || source==='EXCEL_DRAFT') && (!target || !rowYear || rowYear===target);
  });
}
function draftPlayerNameSet(year){return new Set(draftRosterRows(year).map(r=>normalizePlayerMatchKey(r.player)));}
function draftPlayerVisible(name,names){return names.has(normalizePlayerMatchKey(name));}
function selectPlayerRoster(player,year){
  const name=String(player||'').trim(),y=String(year||'').trim();
  const rows=DB.roster.filter(r=>String(r.player||'').trim()===name);
  if(!rows.length)return null;
  const richness=r=>[r.engName,r.photo,r.pos,r.memo,r.team,r.no].filter(v=>String(v??'').trim()).length;
  const exact=rows.filter(r=>y&&String(r.year||'').trim()===y).sort((a,b)=>richness(b)-richness(a));
  const draft=rows.find(r=>!String(r.year||'').trim()&&r.source!=='MATCH_ONLY');
  const latest=rows.slice().sort((a,b)=>String(b.year||'').localeCompare(String(a.year||''),undefined,{numeric:true})||richness(b)-richness(a))[0];
  const selected=(exact[0]?.source!=='MATCH_ONLY'&&exact[0])||draft||exact[0]||latest;
  const photo=selected.photo||rows.find(r=>String(r.photo||'').trim())?.photo||'';
  return {...selected,photo};
}
function playerCardRoster(player,query){
  const info=query||resolvePlayerCardQuery();
  return selectPlayerRoster(player,info.year||(info.asOf||info.end||info.start||'').slice(0,4));
}

function normalizeAbilityPosition(value){
  const raw=String(value||'').normalize('NFKC').trim().toUpperCase();
  if(!raw)return '';
  const aliases={PV:['PV','PIVO','피보'],AL:['AL','ALA','아라'],FS:['FS','FIXO','FIX','픽소'],GR:['GR','GK','GOLEIRO','골레이로']};
  const tokens=raw.split(/[\/,·|\s]+/).filter(Boolean);
  for(const [code,list] of Object.entries(aliases)){
    if(list.some(x=>raw===String(x).toUpperCase() || tokens.includes(String(x).toUpperCase())))return code;
  }
  return '';
}
function playerAbilityRoster(player,year){return selectPlayerRoster(player,year);}
function playerOvrProfile(player,year,cfg){
  cfg=cfg||abilityConfig();
  const roster=playerAbilityRoster(player,year), rawPos=roster?String(roster.pos||'').trim():'', pos=normalizeAbilityPosition(rawPos);
  const map=cfg.positionOvrWeights||{}, weights=(pos&&map[pos])?map[pos]:(cfg.ovrWeights||{});
  return {position:pos,rawPosition:rawPos,weights,source:pos?'POSITION':'FALLBACK'};
}

function playerCardCurrentStats(player,query){
  const info=query||resolvePlayerCardQuery();
  const p=queryPlayerStats(info.list||[]).find(x=>x.player===player);
  return p||{player,mainTeam:'',att:0,w:0,d:0,l:0,g:0,a:0,sv:0,f:0,mom:0,pts:0,winRate:0,attendanceRate:0};
}
function playerCardQueryMatches(query){
  const info=query||resolvePlayerCardQuery();
  return uniqueRecordMatches(info.list||[]);
}
function playerCardPersonalFoulTotal(player,query){
  const ids=new Set(playerCardQueryMatches(query).map(m=>m.id));
  return (DB.fouls||[]).reduce((sum,r)=>String(r.player||'').trim()===String(player||'').trim()&&ids.has(r.id)?sum+num(r.fouls):sum,0);
}
function playerCardMetricHtml(items){
  return items.map(x=>'<div class="player-card-metric"><span class="player-card-metric-label">'+esc(x.label)+'</span><span class="player-card-metric-value">'+esc(x.value)+'<span class="player-card-metric-unit">'+esc(x.unit||'')+'</span></span></div>').join('');
}
function playerCardBarChartHtml(items){
  return items.map(x=>{const p=Math.max(0,Math.min(100,num(x.pct)));return '<div class="player-card-chart-row"><span class="player-card-chart-label">'+esc(x.label)+'</span><span class="player-card-chart-track"><span class="player-card-chart-fill" style="width:'+p.toFixed(1)+'%"></span></span><span class="player-card-chart-value">'+esc(x.value)+'</span></div>';}).join('');
}
function playerCardLatestSoccerBee(player,cutoff){
  const map=soccerBeeLatestMap(cutoff||''); return map[player]||null;
}
function playerCardSoccerBeeMax(metric,cutoff){
  const rows=Object.values(soccerBeeLatestMap(cutoff||''));
  return rows.reduce((m,r)=>Math.max(m,Math.max(0,num(r[metric]))),0);
}
function playerCardQueryPlayerMax(key,query){
  const list=queryPlayerStats(playerCardQueryMatches(query));
  if(key==='foul') return Math.max(0,...list.map(p=>Math.max(0,num(p.f))));
  return Math.max(0,...list.map(p=>Math.max(0,num(p[key]))));
}
function renderPlayerCardPerformance(player,stat,cutoff,query){
  const sb=playerCardLatestSoccerBee(player,cutoff), raw=sb||{};
  const sbDate=sb?normDate(sb.date):'';
  const rangeStart=normDate(query&&query.start), rangeEnd=normDate(query&&query.end), shownEnd=rangeEnd&&cutoff?([rangeEnd,cutoff].sort()[0]):(cutoff||rangeEnd);
  const dataDate='기록 '+(rangeStart||shownEnd||'—')+(rangeStart&&shownEnd&&rangeStart!==shownEnd?' ~ '+shownEnd:'')+' · '+(sbDate?'SoccerBee '+sbDate:'SoccerBee 미측정');
  const dateEl=$("#playerCardDataDate"); if(dateEl) dateEl.textContent=dataDate;
  const sbItems=[
    {label:'에너지',value:sb?num(raw.energy).toFixed(1):'—',unit:'pt'},
    {label:'DPM',value:sb?num(raw.dpm).toFixed(1):'—',unit:'m/min'},
    {label:'최고속도',value:sb?num(raw.maxSpeed).toFixed(1):'—',unit:'km/h'},
    {label:'HSR 비율',value:sb?num(raw.hsrRatio).toFixed(1):'—',unit:'%'},
    {label:'SPM',value:sb?num(raw.spm).toFixed(1):'—',unit:'c/min'},
    {label:'APM',value:sb?num(raw.apm).toFixed(1):'—',unit:'c/min'}
  ];
  const foul=playerCardPersonalFoulTotal(player,query);
  const matchItems=[
    {label:'득점',value:String(Math.round(num(stat.g))),unit:''},
    {label:'도움',value:String(Math.round(num(stat.a))),unit:''},
    {label:'출석률',value:num(stat.attendanceRate).toFixed(1),unit:'%'},
    {label:'개인파울',value:String(Math.round(foul)),unit:''},
    {label:'선방',value:String(Math.round(num(stat.sv))),unit:''},
    {label:'승점',value:String(Math.round(num(stat.pts))),unit:'pts'},
    {label:'MOM',value:String(Math.round(num(stat.mom))),unit:''}
  ];
  const sbMetrics=$("#playerCardSoccerBeeMetrics"), matchMetrics=$("#playerCardMatchMetrics");
  if(sbMetrics) sbMetrics.innerHTML=playerCardMetricHtml(sbItems);
  if(matchMetrics) matchMetrics.innerHTML=playerCardMetricHtml(matchItems);

  const sbScore=(metric)=>{const v=sb?soccerBeeMetricAbsoluteScore(raw[metric],metric):null;return v===null?0:v;};
  const spmMax=playerCardSoccerBeeMax('spm',cutoff);
  const sbBars=[
    {label:'에너지',pct:sbScore('energy'),value:sb?num(raw.energy).toFixed(1):'—'},
    {label:'DPM',pct:sbScore('dpm'),value:sb?num(raw.dpm).toFixed(1):'—'},
    {label:'최고속도',pct:sbScore('maxSpeed'),value:sb?num(raw.maxSpeed).toFixed(1):'—'},
    {label:'HSR 비율',pct:sbScore('hsrRatio'),value:sb?num(raw.hsrRatio).toFixed(1)+'%':'—'},
    {label:'SPM',pct:sb&&spmMax>0?num(raw.spm)/spmMax*100:0,value:sb?num(raw.spm).toFixed(1):'—'},
    {label:'APM',pct:sbScore('apm'),value:sb?num(raw.apm).toFixed(1):'—'}
  ];
  const sbChart=$("#playerCardSoccerBeeChart"); if(sbChart) sbChart.innerHTML=playerCardBarChartHtml(sbBars);
}
function playerInitials(name){
  const t=String(name||"").trim();
  if(!t) return "?";
  return t.length<=3?t:t.slice(0,2);
}
function playerCardQueryYear(roster){
  const info=recordQueryInfo();
  const raw=String((roster&&roster.year)||recordYear||(info.start||info.end||dashDate||"").slice(0,4)||"").trim();
  let m=raw.match(/(20\d{2})/);
  if(m) return m[1];
  const latest=(recordBaseMatches()||[]).map(m=>normDate(m.date)).filter(Boolean).sort().pop()||"";
  m=latest.match(/^(20\d{2})/);
  if(m) return m[1];
  return String(new Date().getFullYear());
}
function playerCardYearShort(year){
  const y=String(year||"").replace(/\D/g,"");
  return y.length>=4?y.slice(-2):(y||"--");
}
function playerCardAbilityNumber(v){
  const n=parseInt(String(v??"").trim(),10);
  return Number.isFinite(n)?Math.max(0,Math.min(100,n)):null;
}

/* ---------- Player Ability System V3.17 — Round one-time cumulative growth + absence penalties + floor display + MOM + personal fouls + HTML/Excel synchronized ---------- */
const ABILITY_DEFAULTS={
  version:132,
  unassessed:{pac:50,dri:50,def:50,phy:50},
  /* V3.17 초기 능력치: PAC/DRI/DEF/PHY는 SoccerBee, SHO/PAS는 능력치 적용 시작연도의 전년도 실적을 사용 */
  initialSkills:{careerStartYear:2026,reliabilityRounds:5,scoreMin:60,scoreMid:70,scoreMax:86,fallbackSho:70,fallbackPas:70},
  /* 구버전 설정 호환용. 실제 SHO/PAS 시작값은 initialSkills에서 계산한다. */
  skillBase:{sho:70,pas:70},
  maxRounds:0,
  scoreMin:0,
  scoreMax:99,
  /* V3.17: 경기 DB의 각 Round 이벤트는 전체 기간에 걸쳐 정확히 1회 누적한다. 시즌 경계에서 리셋하지 않는다. */
  attendance:{pac:0,sho:0,pas:.04,dri:.05,def:.02,phy:.06},
  /* V3.17: SHO 득점 성장에는 상한 구간을 두지 않고 골 수 × 골당 가산값을 적용한다. */
  goalPerGoal:.06,
  /* 구버전 저장 설정 호환용이며 V3.17 SHO 계산에는 사용하지 않는다. */
  goalSteps:[{min:1,value:.08},{min:2,value:.14},{min:3,value:.20},{min:4,value:.26},{min:5,value:.32}],
  assistSteps:[{min:1,value:.08},{min:2,value:.14},{min:3,value:.20},{min:4,value:.26},{min:5,value:.32}],
  saveSteps:[{min:5,value:.05},{min:10,value:.10},{min:15,value:.15},{min:20,value:.20},{min:25,value:.25}],
  foulPenaltySteps:[{min:1,value:-.02},{min:2,value:-.05},{min:3,value:-.08},{min:4,value:-.10}],
  mom:{firstSeasonBonus:{pac:0,sho:.03,pas:.03,dri:.03,def:.03,phy:.03}},
  pointMultipliers:[{min:0,value:1},{min:4,value:1.03},{min:7,value:1.06},{min:10,value:1.08},{min:12,value:1.10}],
  /* 능력치가 높을수록 같은 Round 이벤트의 영구 성장량이 작아진다. */
  growthRates:[{min:90,value:.20},{min:85,value:.50},{min:80,value:.75},{min:70,value:1.00},{min:60,value:1.20}],
  /* 구버전 호환용. V3.17 장기 누적성장에는 시즌별 caps를 적용하지 않고 scoreMax + growthRates로 완만하게 제한한다. */
  caps:{pac:5,sho:8,pas:8,dri:6,def:6,phy:6},
  ovrWeights:{pac:1,sho:1,pas:1,dri:1,def:1,phy:1},
  positionOvrWeights:{
    PV:{pac:.10,sho:.25,pas:.10,dri:.20,def:.10,phy:.25},
    AL:{pac:.25,sho:.20,pas:.15,dri:.25,def:.10,phy:.05},
    FS:{pac:.10,sho:.05,pas:.15,dri:.10,def:.35,phy:.25},
    GR:{pac:.05,sho:.05,pas:.25,dri:.05,def:.45,phy:.15}
  },
  /* V3.17: FORM 대신 결석 자체를 Career 감점 이벤트로 사용한다. Career 시작일 이후 소속팀 첫 경기 Round부터 미출전 시 1회 적용한다. */
  absence:{pac:0,sho:-.02,pas:-.03,dri:-.04,def:-.03,phy:-.05},
  soccerbee:{
    /* 절대평가 V1: 첨부 SoccerBee Test 6명의 분포를 이용한 초기 기준값. 관리자에서 수정 가능 */
    scorePoints:[0,25,50,75,100],
    abilityMin:65,
    abilityMax:75,
    retestMultiplier:.50,
    criteria:{
      maxSpeed:[16.1,18.125,22.2,22.6,24.7],
      hpm:[0,.025,.15,.275,.30],
      hsrRatio:[0,.30,1.95,3.075,3.60],
      hapm:[.20,.325,.50,.75,.80],
      apm:[1.10,1.225,1.60,1.975,2.50],
      accel:[7,8.25,10,12.5,15],
      activityRange:[31.9,44.55,50.95,64.25,69.4],
      /* V3.4 추가 절대평가 지표: 기존 SoccerBee Test 6명 분포의 Min/Q1/Median/Q3/Max */
      avgSpeed:[2.9,4.125,4.4,4.675,4.8],
      action:[16,17.5,19,25.75,37],
      highAccel:[1,3,3.5,4,6],
      decel:[8,9,9.5,13.75,22],
      highDecel:[0,2.25,3.5,4.75,5],
      dpm:[49.1,68.925,73.25,78.475,80.9],
      energy:[6.0,6.1,6.15,6.275,6.6]
    },
    weights:{
      /* 추가지표 반영 후 각 능력치 합계 100% */
      pac:{maxSpeed:.30,hpm:.20,hsrRatio:.15,hapm:.25,highAccel:.10},
      dri:{apm:.35,hapm:.25,accel:.20,activityRange:.10,action:.10},
      def:{decel:.30,highDecel:.30,hapm:.20,dpm:.20},
      phy:{dpm:.35,energy:.20,hapm:.20,activityRange:.15,avgSpeed:.10}
    }
  }
};
function deepClone(v){return JSON.parse(JSON.stringify(v));}
function deepMergeAbility(base,custom){
  if(Array.isArray(base)) return Array.isArray(custom)?custom.map(x=>typeof x==='object'?Object.assign({},x):x):deepClone(base);
  if(base&&typeof base==='object'){
    const out={}; Object.keys(base).forEach(k=>out[k]=deepMergeAbility(base[k],custom&&custom[k]));
    if(custom&&typeof custom==='object') Object.keys(custom).forEach(k=>{if(!(k in out))out[k]=deepClone(custom[k]);});
    return out;
  }
  return custom===undefined?base:custom;
}
function abilityConfig(){
  const a=ensureAbilityData();
  return deepMergeAbility(ABILITY_DEFAULTS,a.config||{});
}
function abilityConfigSet(cfg){ensureAbilityData().config=deepMergeAbility(ABILITY_DEFAULTS,cfg||{});abilityPriorYearPoolCache=null;}

function ensureAbilityData(){
  DB.saves=Array.isArray(DB.saves)?DB.saves:[];
  DB.fouls=Array.isArray(DB.fouls)?DB.fouls:[];
  DB.moms=Array.isArray(DB.moms)?DB.moms:[];
  DB.soccerbee=Array.isArray(DB.soccerbee)?DB.soccerbee:[];
  DB.settings=DB.settings||{}; DB.settings.ability=DB.settings.ability||{};
  if(typeof DB.settings.ability.enabled!=="boolean") DB.settings.ability.enabled=true;
  if(!DB.settings.ability.config || typeof DB.settings.ability.config!=="object") DB.settings.ability.config=deepClone(ABILITY_DEFAULTS);
  /* 구버전 설정을 V3.17 초기능력치 + Round 1회 누적성장 + 결석 Career 감점 구조로 마이그레이션한다. */
  else if(num(DB.settings.ability.config.version)!==132){
    const old=DB.settings.ability.config||{}, oldVersion=num(old.version);
    const migrated=deepMergeAbility(ABILITY_DEFAULTS,old);
    migrated.version=132;
    migrated.initialSkills=deepMergeAbility(ABILITY_DEFAULTS.initialSkills,old.initialSkills||{});
    migrated.goalPerGoal=Number.isFinite(Number(old.goalPerGoal))?Math.max(0,num(old.goalPerGoal)):ABILITY_DEFAULTS.goalPerGoal;
    /* V3.13.1 사용자 설정은 보존하고, 더 오래된 버전만 현재 성장률 기본값으로 마이그레이션한다. */
    if(oldVersion<131) migrated.growthRates=deepClone(ABILITY_DEFAULTS.growthRates);
    migrated.absence=deepMergeAbility(ABILITY_DEFAULTS.absence,old.absence||{});
    delete migrated.form;
    if(!old.initialSkills && old.skillBase){
      if(Number.isFinite(Number(old.skillBase.sho))) migrated.initialSkills.fallbackSho=num(old.skillBase.sho);
      if(Number.isFinite(Number(old.skillBase.pas))) migrated.initialSkills.fallbackPas=num(old.skillBase.pas);
    }
    DB.settings.ability.config=migrated;
    /* V3.17: Draft 수동 능력치가 제거되었으므로 구버전에서 비활성 상태였더라도 새 능력치 시스템을 활성화한다. */
    DB.settings.ability.enabled=true;
  }
  return DB.settings.ability;
}
function abilitySystemEnabled(){ return ensureAbilityData().enabled!==false; }
function abilityYearList(){
  ensureAbilityData(); const ys=new Set(), startYear=abilityCareerStartYear();
  DB.matches.forEach(m=>{const y=normDate(m.date).slice(0,4);if(/^\d{4}$/.test(y)&&num(y)>=startYear)ys.add(y);});
  DB.roster.forEach(r=>{const y=String(r.year||"").match(/20\d{2}/);if(y&&num(y[0])>=startYear)ys.add(y[0]);});
  DB.soccerbee.forEach(r=>{const y=normDate(r.date).slice(0,4);if(/^\d{4}$/.test(y)&&num(y)>=startYear)ys.add(y);});
  if(!ys.size) ys.add(String(startYear));
  return [...ys].sort().reverse();
}
function abilityHalfInfo(year,half){
  const c=seasonCfg(String(year));
  return half==="H2"?{year:String(year),half:"H2",label:"하반기",start:c.h2s,end:c.h2e}:{year:String(year),half:"H1",label:"상반기",start:c.h1s,end:c.h1e};
}
function abilityLatestContext(){
  const ds=(DB.matches||[]).map(m=>normDate(m.date)).filter(Boolean).sort();
  const d=ds[ds.length-1]||""; const y=d.slice(0,4)||abilityYearList()[0]; const c=seasonCfg(y);
  const h=d && d>=c.h2s && d<=c.h2e?"H2":"H1";
  return abilityHalfInfo(y,h);
}
function abilitySelectedInfo(){
  const ys=abilityYearList(); if(!abilityYear||!ys.includes(abilityYear)) abilityYear=ys[0];
  if(!/^(H1|H2)$/.test(abilityHalf)) abilityHalf="H1";
  return abilityHalfInfo(abilityYear,abilityHalf);
}
function previousAbilityHalf(year,half){ return half==="H2"?{year:String(year),half:"H1"}:{year:String(Number(year)-1),half:"H2"}; }
function abilityMatches(info){
  return (DB.matches||[]).filter(m=>{const d=normDate(m.date);return d && d>=info.start && d<=info.end;});
}
/* V3.17: 선수별 소속팀 추적 여부와 무관하게 선택 기간의 '최종 Round 번호'를 기준R로 사용한다.
   예: 2026 상반기 DB의 최종 Round가 13R이면 모든 선수의 기준R은 13이며, 출석R + 결석R = 13이 된다. */
function abilityMatchRoundNumber(m){
  const clean=v=>String(v??'').normalize('NFKC').trim();
  const explicit=v=>{
    const raw=clean(v);
    const hit=raw.match(/^(?:ROUND|라운드|R|회차)\s*[-._:]?\s*(\d+)/i)
      ||raw.match(/^(\d+)\s*(?:ROUND|라운드|R|회차)(?:$|[^0-9])/i);
    return hit?Math.max(0,parseInt(hit[1],10)):0;
  };
  /* 기존 양식: 라운드=R13, 경기번호=1A.
     운영 DB 양식: 라운드=1경기, 경기번호=13R-A. 경기 순서를 Round로 읽지 않는다. */
  return explicit(m&&m.round)||explicit(m&&m.no)
    ||(/^\d+$/.test(clean(m&&m.round))?parseInt(clean(m.round),10):0);
}
function abilityPeriodRoundBasis(info,cutoffDate){
  const cutoff=normDate(cutoffDate||((info&&info.end)||''));
  const ms=abilityMatches(info).filter(m=>!cutoff||normDate(m.date)<=cutoff);
  const nums=ms.map(abilityMatchRoundNumber).filter(n=>n>0);
  if(nums.length) return Math.max(...nums);
  /* Round 번호가 없는 구버전 DB는 실제 등록 경기일 수를 fallback으로 사용한다. */
  return [...new Set(ms.map(m=>normDate(m.date)).filter(Boolean))].length;
}
/* SoccerBee 선수명은 통합 선수 DB(선수명단)를 기준으로 연결한다.
   - 유니코드/공백/영문 대소문자 차이는 동일 선수로 처리
   - SoccerBee 측정 이력은 모두 보존
   - 능력치에는 선수별 가장 최근 측정일 1건만 사용 */
function normalizePlayerMatchKey(v){
  return String(v??"").normalize("NFKC").trim().toLowerCase().replace(/\s+/g,"");
}
function soccerBeeCanonicalPlayerMap(){
  const out={}, duplicated=new Set();
  const add=name=>{
    name=String(name||"").trim(); const k=normalizePlayerMatchKey(name); if(!name||!k)return;
    if(out[k] && out[k]!==name) duplicated.add(k);
    else if(!out[k]) out[k]=name;
  };
  /* 선수명단가 기준 DB. 구버전/누락 보완을 위해 출석 DB 이름도 보조 키로만 사용한다. */
  (DB.roster||[]).forEach(r=>add(r.player));
  (DB.attendance||[]).forEach(r=>add(r.player));
  duplicated.forEach(k=>delete out[k]);
  return out;
}
function soccerBeeResolvePlayerName(name){
  const raw=String(name||"").trim(), k=normalizePlayerMatchKey(raw);
  if(!k)return "";
  const canonical=soccerBeeCanonicalPlayerMap();
  return canonical[k]||"";
}
function soccerBeeLatestMap(cutoff){
  ensureAbilityData(); const out={}, limit=cutoff?normDate(cutoff):"";
  const canonical=soccerBeeCanonicalPlayerMap();
  DB.soccerbee.forEach(r=>{
    const raw=String(r.player||"").trim(), k=normalizePlayerMatchKey(raw), d=normDate(r.date);
    if(!k||!d || (limit&&d>limit))return;
    /* 현재 선수 DB와 매칭되는 이름만 적용한다. 같은 선수는 지정 시점까지의 최신 1건만 적용 */
    const name=canonical[k]||""; if(!name)return;
    const prev=out[name];
    if(!prev || d>normDate(prev.date)) out[name]=Object.assign({},r,{player:name});
  });
  return out;
}
function metricPercentiles(records,key){
  const vals=records.map(r=>({player:r.player,v:num(r[key])})).filter(x=>Number.isFinite(x.v));
  const sorted=vals.map(x=>x.v).sort((a,b)=>a-b), out={};
  vals.forEach(x=>{
    if(sorted.length<=1){out[x.player]=50;return;}
    const less=sorted.filter(v=>v<x.v).length, equal=sorted.filter(v=>v===x.v).length;
    const rank=less+(equal-1)/2; out[x.player]=rank/(sorted.length-1)*100;
  });
  return out;
}
function soccerBeeMetricAbsoluteScore(value,metric){
  const c=abilityConfig().soccerbee||{}, xs=(c.criteria&&c.criteria[metric])||[], ys=(c.scorePoints||[0,25,50,75,100]).map(num);
  const raw=(value===null||value===undefined||String(value).trim()==='')?NaN:Number(value);
  if(!Number.isFinite(raw)||xs.length<2||ys.length!==xs.length) return null;
  const xv=xs.map(num);
  if(raw<=xv[0]) return ys[0];
  if(raw>=xv[xv.length-1]) return ys[ys.length-1];
  for(let i=1;i<xv.length;i++){
    if(raw<=xv[i]){
      const x0=xv[i-1],x1=xv[i],y0=ys[i-1],y1=ys[i];
      if(Math.abs(x1-x0)<1e-12) return y1;
      const t=(raw-x0)/(x1-x0); return y0+(y1-y0)*t;
    }
  }
  return ys[ys.length-1];
}
function soccerBeeIndexToAbility(index){
  const c=abilityConfig().soccerbee||{}, lo=num(c.abilityMin), hi=num(c.abilityMax), p=Math.max(0,Math.min(100,num(index)));
  return lo+(hi-lo)*(p/100);
}
function soccerBeeRelativePercentiles(out,key){
  const rows=Object.values(out).map(r=>({player:r.player,v:num(r.index&&r.index[key])})).filter(x=>Number.isFinite(x.v));
  const sorted=rows.map(x=>x.v).sort((a,b)=>a-b), pct={};
  rows.forEach(x=>{
    if(sorted.length<=1){pct[x.player]=50;return;}
    const less=sorted.filter(v=>v<x.v).length, equal=sorted.filter(v=>Math.abs(v-x.v)<1e-9).length;
    pct[x.player]=(less+(equal-1)/2)/(sorted.length-1)*100;
  });
  return pct;
}
function soccerBeeAbilityBaseMap(cutoff){
  const latest=soccerBeeLatestMap(cutoff), records=Object.values(latest); if(!records.length) return {};
  const cfg=abilityConfig().soccerbee||{}, weightCfg=cfg.weights||{};
  const calc=(r,parts)=>{
    let sum=0,den=0; const detail={};
    Object.entries(parts||{}).forEach(([metric,w0])=>{
      const w=Math.max(0,num(w0)); if(!w)return;
      const sc=soccerBeeMetricAbsoluteScore(r[metric],metric); if(sc===null)return;
      detail[metric]=sc; sum+=sc*w; den+=w;
    });
    const index=den?sum/den:50; return {index,detail,weightSum:den};
  };
  const out={};
  records.forEach(r=>{
    const n=r.player;
    const pac=calc(r,weightCfg.pac),dri=calc(r,weightCfg.dri),def=calc(r,weightCfg.def),phy=calc(r,weightCfg.phy);
    const index={pac:pac.index,dri:dri.index,def:def.index,phy:phy.index};
    out[n]={player:n,date:normDate(r.date),measured:true,index,
      metricScores:{pac:pac.detail,dri:dri.detail,def:def.detail,phy:phy.detail},
      pac:soccerBeeIndexToAbility(index.pac),dri:soccerBeeIndexToAbility(index.dri),def:soccerBeeIndexToAbility(index.def),phy:soccerBeeIndexToAbility(index.phy),raw:r,relativePercentile:{}};
  });
  /* 상대평가는 능력치 결정에 사용하지 않고 참고 백분위로만 보관한다. */
  ['pac','dri','def','phy'].forEach(k=>{const p=soccerBeeRelativePercentiles(out,k);Object.keys(out).forEach(n=>out[n].relativePercentile[k]=p[n]??50);});
  return out;
}
let abilityPriorYearPoolCache=null;
function abilityCareerStartYear(){
  const init=(abilityConfig().initialSkills||{}), y=Math.floor(num(init.careerStartYear)||2026);
  return Math.max(2000,Math.min(2100,y));
}
function abilityCareerStartDate(){return abilityCareerStartYear()+'-01-01';}
function abilityReferenceYear(){return abilityCareerStartYear()-1;}
function abilityCalendarYearInfo(year){year=String(year);return {start:year+'-01-01',end:year+'-12-31'};}
function abilityYearPlayerNames(year){
  const info=abilityCalendarYearInfo(year), list=abilityMatches(info), ids=new Set(list.map(m=>m.id)), names=new Set();
  (DB.attendance||[]).forEach(r=>{if(ids.has(r.id)&&String(r.player||'').trim())names.add(String(r.player).trim());});
  (DB.goals||[]).forEach(r=>{if(ids.has(r.id)&&String(r.player||'').trim())names.add(String(r.player).trim());});
  (DB.saves||[]).forEach(r=>{if(ids.has(r.id)&&String(r.player||'').trim())names.add(String(r.player).trim());});
  (DB.fouls||[]).forEach(r=>{if(ids.has(r.id)&&String(r.player||'').trim())names.add(String(r.player).trim());});
  (DB.moms||[]).forEach(r=>{if(ids.has(r.id)&&String(r.player||'').trim())names.add(String(r.player).trim());});
  return [...names].filter(p=>p&&!isOwnGoalPlayer(p));
}
function abilityPercentileRank(entries,key,value){
  const vals=(entries||[]).map(x=>num(x[key])).filter(Number.isFinite).sort((a,b)=>a-b);
  if(!vals.length)return 50;
  if(vals.length===1)return 50;
  const v=num(value), less=vals.filter(x=>x<v).length, equal=vals.filter(x=>x===v).length;
  return Math.max(0,Math.min(100,(less+(equal-1)/2)/(vals.length-1)*100));
}
function abilityPercentileToSkill(percentile){
  const init=abilityConfig().initialSkills||{}, p=Math.max(0,Math.min(100,num(percentile)));
  const lo=num(init.scoreMin), mid=num(init.scoreMid), hi=num(init.scoreMax);
  return p<=50?lo+(mid-lo)*(p/50):mid+(hi-mid)*((p-50)/50);
}
function abilityPriorYearSkillPool(){
  const year=abilityReferenceYear(), info=abilityCalendarYearInfo(year), init=abilityConfig().initialSkills||{}, reliabilityRounds=Math.max(1,num(init.reliabilityRounds)||5);
  if(abilityPriorYearPoolCache && abilityPriorYearPoolCache.year===year && abilityPriorYearPoolCache.reliabilityRounds===reliabilityRounds) return abilityPriorYearPoolCache;
  const entries=abilityYearPlayerNames(year).map(player=>({player,stats:abilitySeasonStats(playerAbilityRoundRows(player,info))})).filter(x=>x.stats.att>0);
  const total=entries.reduce((a,x)=>({att:a.att+x.stats.att,g:a.g+x.stats.g,a:a.a+x.stats.a}),{att:0,g:0,a:0});
  const leagueGpr=total.att?total.g/total.att:0, leagueApr=total.att?total.a/total.att:0;
  entries.forEach(x=>{
    x.reliability=Math.min(1,x.stats.att/reliabilityRounds);
    x.adjustedGpr=x.stats.gpr*x.reliability+leagueGpr*(1-x.reliability);
    x.adjustedApr=x.stats.apr*x.reliability+leagueApr*(1-x.reliability);
  });
  abilityPriorYearPoolCache={year,info,reliabilityRounds,leagueGpr,leagueApr,entries};
  return abilityPriorYearPoolCache;
}
function abilityInitialSkillProfile(player){
  player=String(player||'').trim(); const init=abilityConfig().initialSkills||{}, pool=abilityPriorYearSkillPool();
  const row=pool.entries.find(x=>x.player===player);
  if(!row){
    return {source:'NO_HISTORY',year:pool.year,att:0,g:0,a:0,gpr:0,apr:0,reliability:0,leagueGpr:pool.leagueGpr,leagueApr:pool.leagueApr,adjustedGpr:pool.leagueGpr,adjustedApr:pool.leagueApr,shoPercentile:null,pasPercentile:null,sho:num(init.fallbackSho),pas:num(init.fallbackPas)};
  }
  const shoPct=abilityPercentileRank(pool.entries,'adjustedGpr',row.adjustedGpr), pasPct=abilityPercentileRank(pool.entries,'adjustedApr',row.adjustedApr);
  return {source:'PREVIOUS_YEAR',year:pool.year,att:row.stats.att,g:row.stats.g,a:row.stats.a,gpr:row.stats.gpr,apr:row.stats.apr,reliability:row.reliability,leagueGpr:pool.leagueGpr,leagueApr:pool.leagueApr,adjustedGpr:row.adjustedGpr,adjustedApr:row.adjustedApr,shoPercentile:shoPct,pasPercentile:pasPct,sho:abilityPercentileToSkill(shoPct),pas:abilityPercentileToSkill(pasPct)};
}
function soccerBeeInitialProfile(player,cutoff){
  const rows=soccerBeePlayerRows(player,cutoff), start=[abilityCareerStartDate(),playerParticipationStart(player)].sort().pop();
  if(!rows.length)return {row:null,evaluation:null,retests:[]};
  /* V3.17 수정:
     - Career 시작일 이전/당일의 최신 SoccerBee 측정이 있으면 시작 능력치로 사용
     - 첫 측정이 Career 시작 이후라면 그 측정값을 과거에 소급 적용하지 않고 실제 측정일 이벤트로 처리 */
  const baselineRows=rows.filter(r=>normDate(r.date)<=start);
  const row=baselineRows.length?baselineRows[baselineRows.length-1]:null;
  const evaluation=row?((soccerBeeAbilityBaseMap(normDate(row.date))||{})[player]||null):null;
  const retests=row
    ? rows.filter(r=>normDate(r.date)>normDate(row.date))
    : rows.filter(r=>normDate(r.date)>=start);
  return {row,evaluation,retests};
}
function abilityBaseForPlayer(player,info,sbMap){
  const c=abilityConfig(), skills=abilityInitialSkillProfile(player), sb=soccerBeeInitialProfile(player,(info&&info.end)||'').evaluation;
  return {pac:sb?sb.pac:c.unassessed.pac,sho:skills.sho,pas:skills.pas,
    dri:sb?sb.dri:c.unassessed.dri,def:sb?sb.def:c.unassessed.def,phy:sb?sb.phy:c.unassessed.phy,
    measured:!!sb,sbDate:sb?sb.date:'',sb,initialSkills:skills};
}
function stepValue(n,steps,mode){n=num(n);const arr=(steps||[]).slice().sort((a,b)=>num(b.min)-num(a.min));for(const x of arr)if(n>=num(x.min))return num(x.value);return mode==='multiplier'?1:0;}
function goalGrowth(n){return Math.max(0,num(n))*Math.max(0,num(abilityConfig().goalPerGoal));}
function assistGrowth(n){return stepValue(n,abilityConfig().assistSteps);}
function saveGrowth(n){return stepValue(n,abilityConfig().saveSteps);}
function foulPenalty(n){return stepValue(n,abilityConfig().foulPenaltySteps);}
function pointMultiplier(pts){return stepValue(pts,abilityConfig().pointMultipliers,'multiplier');}
function abilityGrowthRate(v){
  v=num(v);
  const arr=(abilityConfig().growthRates||[]).slice().sort((a,b)=>num(b.min)-num(a.min));
  for(const x of arr) if(v>=num(x.min)) return num(x.value);
  /* 60 미만은 저능력 구간으로 120%를 적용한다. */
  return 1.20;
}
function playerAbilityRoundRows(player,info){
  const list=abilityMatches(info).filter(m=>normDate(m.date)<abilityCareerStartDate()||playerEligibleOn(player,m.date)), ids=new Set(list.map(m=>m.id)), M={}; list.forEach(m=>M[m.id]=m); const rounds={};
  const get=(d)=>rounds[d]||(rounds[d]={date:d,att:false,g:0,a:0,sv:0,f:0,mom:0,w:0,d:0,l:0,pts:0,games:new Set(),expectedTeam:''});
  const pName=String(player||'').trim();

  /* V3.17 수정: 결석은 '리그에 경기가 있었는가'가 아니라 '그 선수의 소속팀이 실제로 경기한 날인가'를 기준으로 한다.
     이전 출전의 팀을 우선 사용하고, 출전 이력이 없을 때만 해당 연도 선수명단 팀을 fallback으로 사용한다. */
  const attEvents=(DB.attendance||[]).filter(r=>String(r.player||'').trim()===pName&&ids.has(r.id)).map(r=>{
    const m=M[r.id]; return m?{date:normDate(m.date),team:String(r.team||'').trim(),id:r.id}:null;
  }).filter(Boolean).sort((a,b)=>a.date.localeCompare(b.date));
  const rosterTeamForYear=y=>{
    const rr=(DB.roster||[]).filter(r=>String(r.player||'').trim()===pName&&String(r.year||'').trim()===String(y)&&String(r.team||'').trim());
    return rr.length?String(rr[rr.length-1].team||'').trim():'';
  };
  const dates=[...new Set(list.map(m=>normDate(m.date)).filter(Boolean))].sort();
  /* V3.17: 소속팀을 아직 추적하지 못한 선수도 R1부터 결석 판정이 가능하도록
     선택 기간의 모든 실제 Round 날짜를 먼저 생성한다. 강동훈처럼 첫 출전이 R5인 선수도 R1~R4가 누락되지 않는다. */
  dates.forEach(d=>{if(!squadScope(list.find(m=>normDate(m.date)===d)).length)get(d);});
  dates.forEach(d=>{
    const day=list.filter(m=>normDate(m.date)===d);
    const same=attEvents.find(x=>x.date===d&&x.team);
    const assigned=[...new Set(day.flatMap(m=>squadPlayerTeams(m,pName)))];
    let expected=same?same.team:assigned[0]||'';
    if(!expected&&!squadScope(day[0]).length){
      const prior=attEvents.filter(x=>x.date<d&&x.team).slice(-1)[0];
      if(prior) expected=prior.team;
    }
    if(!expected&&!squadScope(day[0]).length) expected=rosterTeamForYear(d.slice(0,4));
    if(expected && day.some(m=>m.home===expected||m.away===expected)){
      const R=get(d); R.expectedTeam=expected;
    }
  });

  (DB.attendance||[]).forEach(r=>{
    if(String(r.player||'').trim()!==pName||!ids.has(r.id)) return; const m=M[r.id]; if(!m)return; const d=normDate(m.date),R=get(d); R.att=true; R.expectedTeam=String(r.team||R.expectedTeam||'').trim();
    if(R.games.has(r.id)) return; R.games.add(r.id); const res=matchResult(m,r.team); if(res==='W'){R.w++;R.pts+=3;}else if(res==='D'){R.d++;R.pts++;}else if(res==='L')R.l++;
  });
  (DB.goals||[]).forEach(r=>{if(String(r.player||'').trim()!==pName||!ids.has(r.id))return;const m=M[r.id];if(!m)return;const R=get(normDate(m.date));R.g+=num(r.g);R.a+=num(r.a);if(!R.expectedTeam)R.expectedTeam=String(r.team||'').trim();});
  (DB.saves||[]).forEach(r=>{if(String(r.player||'').trim()!==pName||!ids.has(r.id))return;const m=M[r.id];if(!m)return;get(normDate(m.date)).sv+=num(r.saves);});
  (DB.fouls||[]).forEach(r=>{if(String(r.player||'').trim()!==pName||!ids.has(r.id))return;const m=M[r.id];if(!m)return;get(normDate(m.date)).f+=num(r.fouls);});
  (DB.moms||[]).forEach(r=>{if(String(r.player||'').trim()!==pName||!ids.has(r.id))return;const m=M[r.id];if(!m)return;get(normDate(m.date)).mom+=num(r.mom);});
  return Object.values(rounds).sort((a,b)=>a.date.localeCompare(b.date));
}
function playerAbilityAllRoundRows(player,cutoff){
  const end=normDate(cutoff)||'9999-12-31';
  /* V3.17: Career 시작일 이후 선수 소속팀이 실제 경기한 모든 Round를 사용한다.
     따라서 선수의 첫 실제 출전 여부와 관계없이 소속팀 첫 경기 Round부터 미출전 시 결석으로 카운트한다. */
  return playerAbilityRoundRows(player,{start:abilityCareerStartDate(),end});
}
function abilityRoundParticipated(r){return !!(r&&r.att);}
function abilityRoundPlayed(r){return !!(r&&(r.att||r.g||r.a||r.sv||r.f||r.mom));}
function abilitySeasonStats(rounds,basisRound){
  /* V3.17: 선수 능력치의 출석R은 명단 출석 플래그만 보지 않고 해당 Round에서 실제 활동(출석/득점/도움/선방/개인파울/MOM)이 있으면 출석으로 본다.
     따라서 해당 반기/기준일까지 모든 소속팀 Round는 반드시 출석 또는 결석 중 하나로 분류되어 출석R + 누적결석R = 진행 Round가 된다. */
  const r=(rounds||[]), total=r.reduce((a,x)=>({att:a.att+(abilityRoundPlayed(x)?1:0),rawAtt:a.rawAtt+(x.att?1:0),g:a.g+x.g,a:a.a+x.a,sv:a.sv+x.sv,f:a.f+x.f,mom:a.mom+x.mom,w:a.w+x.w,d:a.d+x.d,l:a.l+x.l,pts:a.pts+x.pts}),{att:0,rawAtt:0,g:0,a:0,sv:0,f:0,mom:0,w:0,d:0,l:0,pts:0});
  /* V3.17: progress는 선수별 생성 Round 수가 아니라 선택 기간의 최종 Round 번호를 사용한다. */
  const games=total.w+total.d+total.l, fallbackProgress=r.length, requested=Math.max(0,Math.floor(num(basisRound))), progress=Math.max(total.att,requested||fallbackProgress), absence=Math.max(0,progress-total.att);
  return Object.assign(total,{games,progress,absence,gpr:total.att?total.g/total.att:0,apr:total.att?total.a/total.att:0,svpr:total.att?total.sv/total.att:0,fpr:total.att?total.f/total.att:0,mompr:total.att?total.mom/total.att:0,attRate:progress?total.att/progress:0,ppg:games?total.pts/games:0});
}
function soccerBeeDeltaValue(diff){
  const mult=Math.max(0,num((abilityConfig().soccerbee||{}).retestMultiplier));
  return num(diff)*mult;
}
function soccerBeePlayerRows(player,cutoff){
  const key=normalizePlayerMatchKey(player), limit=cutoff?normDate(cutoff):'';
  return (DB.soccerbee||[]).filter(r=>normalizePlayerMatchKey(r.player)===key&&(!limit||normDate(r.date)<=limit)).slice().sort((a,b)=>normDate(a.date).localeCompare(normDate(b.date)));
}
function playerAbilityRecordAtDate(player,year,half,cutoffDate,includeCarry=true){
  player=String(player||'').trim();
  const info=abilityHalfInfo(year,half), cfg=abilityConfig(), halfDates=playerAbilityRoundRows(player,info).map(r=>r.date), effectiveCutoff=normDate(cutoffDate||halfDates[halfDates.length-1]||info.end);
  const keys=['pac','sho','pas','dri','def','phy'], ovrProfile=playerOvrProfile(player,year,cfg), ow=ovrProfile.weights||{};
  const initialSkills=abilityInitialSkillProfile(player), sbInitial=soccerBeeInitialProfile(player,effectiveCutoff), sbBase=sbInitial.evaluation;
  const start={pac:sbBase?num(sbBase.pac):num(cfg.unassessed.pac),sho:num(initialSkills.sho),pas:num(initialSkills.pas),dri:sbBase?num(sbBase.dri):num(cfg.unassessed.dri),def:sbBase?num(sbBase.def):num(cfg.unassessed.def),phy:sbBase?num(sbBase.phy):num(cfg.unassessed.phy)};
  const career=Object.assign({},start), careerGrowth={pac:0,sho:0,pas:0,dri:0,def:0,phy:0};
  const allRounds=playerAbilityAllRoundRows(player,effectiveCutoff), sbRows=sbInitial.retests||[];
  const events=[];
  allRounds.forEach(R=>events.push({date:R.date,type:'round',R}));
  sbRows.forEach((r,i)=>events.push({date:normDate(r.date),type:'sb',row:r,index:i}));
  events.sort((a,b)=>a.date.localeCompare(b.date)||(a.type==='sb'?-1:1));
  let measured=!!sbBase,sbDate=sbBase?normDate(sbBase.date):'',prevSbEval=sbBase||null;
  events.forEach(ev=>{
    if(ev.type==='sb'){
      const cur=(soccerBeeAbilityBaseMap(ev.date)||{})[player]; if(!cur)return;
      if(prevSbEval){
        ['pac','dri','def','phy'].forEach(k=>{const d=soccerBeeDeltaValue(num(cur[k])-num(prevSbEval[k]));career[k]+=d;careerGrowth[k]+=d;});
      }else{
        /* Career 시작 이후 첫 SoccerBee 측정은 측정일에 실제 절대평가값으로 교체한다. */
        ['pac','dri','def','phy'].forEach(k=>{const before=num(career[k]), after=num(cur[k]); career[k]=after; careerGrowth[k]+=after-before;});
      }
      keys.forEach(k=>career[k]=Math.max(num(cfg.scoreMin),Math.min(num(cfg.scoreMax),career[k])));
      measured=true; sbDate=ev.date; prevSbEval=cur; return;
    }
    const R=ev.R, att=cfg.attendance||{}, add={
      pac:R.att?num(att.pac):0,
      sho:goalGrowth(R.g)+(R.att?num(att.sho):0),
      pas:assistGrowth(R.a)+(R.att?num(att.pas):0),
      dri:R.att?num(att.dri):0,
      def:saveGrowth(R.sv)+(R.att?num(att.def):0),
      phy:R.att?num(att.phy):0
    }, pm=pointMultiplier(R.pts);
    keys.forEach(k=>{const inc=add[k]*pm*abilityGrowthRate(career[k]);career[k]+=inc;careerGrowth[k]+=inc;});
    /* MOM은 해당 Round에서 1회만 영구 성장 이벤트로 반영한다. */
    const mb=(cfg.mom&&cfg.mom.firstSeasonBonus)||{};
    ['sho','pas','dri','def','phy'].forEach(k=>{const inc=Math.max(0,num(R.mom))*Math.max(0,num(mb[k]));career[k]+=inc;careerGrowth[k]+=inc;});
    /* 개인파울 역시 해당 Round에서 1회만 DEF 감점 이벤트로 반영한다. */
    const fp=foulPenalty(R.f); if(fp){career.def+=fp;careerGrowth.def+=fp;}
    /* V3.17 결석 감점: Career 시작일 이후 소속팀이 실제 경기한 Round에서 미출전한 경우 첫 Round부터 Career에 직접 1회 감점. */
    if(!abilityRoundPlayed(R)){
      const ap=cfg.absence||{};
      keys.forEach(k=>{const dec=Math.min(0,num(ap[k])); if(dec){career[k]+=dec;careerGrowth[k]+=dec;}});
    }
    keys.forEach(k=>career[k]=Math.max(num(cfg.scoreMin),Math.min(num(cfg.scoreMax),career[k])));
  });

  /* V3.17는 FORM을 사용하지 않는다. 현재 능력치는 Career 자체이며 결석 감점도 Career 이벤트로 누적된다. */
  const vals=Object.assign({},career), displayVals={}; keys.forEach(k=>displayVals[k]=Math.floor(num(vals[k])));
  /* V3.17: OVR도 화면에 표시되는 내림 정수 능력치를 기준으로 계산한다. */
  const weightSum=keys.reduce((t,k)=>t+Math.max(0,num(ow[k])),0), ovrRaw=weightSum>0?keys.reduce((t,k)=>t+displayVals[k]*Math.max(0,num(ow[k])),0)/weightSum:keys.reduce((t,k)=>t+displayVals[k],0)/6, ovr=Math.floor(ovrRaw);
  const rounds=playerAbilityRoundRows(player,info).filter(r=>r.date<=effectiveCutoff), periodBasis=(playerParticipationStart(player)||squadRows().length)?rounds.length:abilityPeriodRoundBasis(info,effectiveCutoff), summary=abilitySeasonStats(rounds,periodBasis), stat=queryPlayerStats(abilityMatches(info).filter(m=>normDate(m.date)<=effectiveCutoff)).find(p=>p.player===player)||{}, team=stat.mainTeam&&stat.mainTeam!=='-'?stat.mainTeam:((playerAbilityRoster(player,year)||{}).team||'');
  /* 화면의 누적 결석R은 선택 반기/기준일까지의 Round 안에서 계산한다. Career 결석감점은 Career 시작일부터 누적된 전체 결석을 그대로 사용한다. */
  const periodAbsenceRounds=Math.max(0,num(summary.progress)-num(summary.att));
  const careerAbsenceRounds=allRounds.filter(r=>!abilityRoundPlayed(r)).length, absenceCfg=cfg.absence||{}, absencePenalty={};
  keys.forEach(k=>absencePenalty[k]=careerAbsenceRounds*Math.min(0,num(absenceCfg[k])));
  const growth={}; keys.forEach(k=>growth[k]=num(careerGrowth[k]));
  return {player,team,info,base:start,start,initialSkills,soccerBeeInitial:sbInitial,growth,careerGrowth,career,absence:{rounds:periodAbsenceRounds,careerRounds:careerAbsenceRounds,penalty:absencePenalty},rounds,careerRounds:allRounds,summary,measured,sbDate,cutoffDate:effectiveCutoff,mode:'ROUND+ABSENCE',benchmark:null,benchmarkEligible:false,benchmarkStats:null,benchmarkRecord:null,position:ovrProfile.position||ovrProfile.rawPosition||'',ovrWeightSource:ovrProfile.source,display:displayVals,pac:vals.pac,sho:vals.sho,pas:vals.pas,dri:vals.dri,def:vals.def,phy:vals.phy,ovr};
}
function playerAbilityRecord(player,year,half,includeCarry=true){return playerAbilityRecordAtDate(player,year,half,'',includeCarry);}
function abilityHalfGameDates(info){
  return [...new Set(abilityMatches(info).map(m=>normDate(m.date)).filter(Boolean))].sort();
}
function abilityHalfComparison(year,half){
  const info=abilityHalfInfo(year,half), dates=abilityHalfGameDates(info);
  return {info,dates,latest:dates.length?dates[dates.length-1]:"",previous:dates.length>1?dates[dates.length-2]:""};
}
function abilityHalfForDate(year,date){
  const d=normDate(date), c=seasonCfg(String(year));
  if(!d) return "H1";
  return d>=c.h2s?"H2":"H1";
}
function abilityHalfComparisonAtDate(year,half,cutoffDate){
  const info=abilityHalfInfo(year,half), cutoff=normDate(cutoffDate), dates=abilityHalfGameDates(info).filter(d=>!cutoff||d<=cutoff);
  return {info,dates,latest:dates.length?dates[dates.length-1]:"",previous:dates.length>1?dates[dates.length-2]:"",cutoff};
}
function abilityRecordsAtDate(year,half,cutoffDate){
  const info=abilityHalfInfo(year,half);
  return abilityPlayers(info).filter(p=>playerEligibleOn(p,cutoffDate||info.end)).map(p=>playerAbilityRecordAtDate(p,year,half,cutoffDate,true));
}
function abilityDelta(current,previous){
  if(!previous) return 0;
  return Math.floor(num(current))-Math.floor(num(previous));
}
function abilityScoreWithDelta(value,prevValue){
  const n=Math.floor(num(value)), delta=abilityDelta(value,prevValue);
  const cls=n<60?' unassessed':'';
  let d='';
  if(delta>=1) d='<span class="ability-delta up" title="직전 경기일 대비 +'+delta+'"><span class="tri">▲</span>'+delta+'</span>';
  else if(delta<=-1) d='<span class="ability-delta down" title="직전 경기일 대비 '+delta+'"><span class="tri">▼</span>'+Math.abs(delta)+'</span>';
  return '<span class="ability-score-wrap"><span class="ability-score'+cls+'">'+n+'</span>'+d+'</span>';
}
function abilityPlayers(info){
  const names=new Map();
  draftRosterRows(info&&info.year).filter(r=>!info?.end||playerEligibleOn(r.player,info.end)).forEach(r=>{const name=String(r.player).normalize('NFKC').trim();names.set(normalizePlayerMatchKey(name),name);});
  return [...names.values()].sort((a,b)=>a.localeCompare(b,'ko'));
}
function abilityRecords(year,half){const info=abilityHalfInfo(year,half);return abilityPlayers(info).map(p=>playerAbilityRecord(p,year,half,true));}
function currentPlayerAbility(player){const c=abilityLatestContext();return playerAbilityRecord(String(player||"").trim(),c.year,c.half,true);}
function fmtAbility(v){return (Math.round(num(v)*100)/100).toFixed(2);}
function fmtGrowth(v){const n=Math.round(num(v)*100)/100;return (n>0?"+":"")+n.toFixed(2);}

function normalizeSoccerBeeHeader(v){
  return String(v??"")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g,"")
    /* SoccerBee 원본 헤더의 단위 표기: (km/h), (c/min), (m), (%) 등을 제거 */
    .replace(/[\(（][^\)）]*[\)）]/g,"")
    .replace(/[％%]/g,"")
    .replace(/[·_\-]/g,"");
}
function findSoccerBeeCol(headerRows,labels){
  const labs=labels.map(normalizeSoccerBeeHeader);
  for(let r=0;r<headerRows.length;r++) for(let c=0;c<headerRows[r].length;c++){
    const v=normalizeSoccerBeeHeader(headerRows[r][c]);
    if(labs.includes(v)) return c;
  }
  return -1;
}
function parseSoccerBeeRows(rows){
  const hdr=rows.slice(0,6), col={
    player:findSoccerBeeCol(hdr,["이름","선수","선수명"]),date:findSoccerBeeCol(hdr,["날짜","일자"]),energy:findSoccerBeeCol(hdr,["에너지점수"]),
    dpm:findSoccerBeeCol(hdr,["DPM"]),activityRange:findSoccerBeeCol(hdr,["활동범위","활동범위(%)"]),avgSpeed:findSoccerBeeCol(hdr,["평균속도","평균속도(km/h)"]),maxSpeed:findSoccerBeeCol(hdr,["최고속도","최고속도(km/h)"]),
    hsr:findSoccerBeeCol(hdr,["HSR"]),hpm:findSoccerBeeCol(hdr,["HPM","HPM(c/min)"]),hsrDistance:findSoccerBeeCol(hdr,["HSR거리","HSR거리(m)"]),hsrRatio:findSoccerBeeCol(hdr,["HSR비율","HSR비율(%)"]),
    sprint:findSoccerBeeCol(hdr,["스프린트"]),spm:findSoccerBeeCol(hdr,["SPM","SPM(c/min)"]),sprintDistance:findSoccerBeeCol(hdr,["스프린트거리","스프린트 거리(m)"]),sprintRatio:findSoccerBeeCol(hdr,["스프린트비율","스프린트 비율(%)"]),
    action:findSoccerBeeCol(hdr,["가속감속액션","가속감속 액션"]),accel:findSoccerBeeCol(hdr,["가속"]),decel:findSoccerBeeCol(hdr,["감속"]),apm:findSoccerBeeCol(hdr,["APM","APM(c/min)"]),
    highAction:findSoccerBeeCol(hdr,["고강도가속감속액션","고강도 가속감속 액션"]),highAccel:findSoccerBeeCol(hdr,["고강도가속","고강도 가속"]),highDecel:findSoccerBeeCol(hdr,["고강도감속","고강도 감속"]),hapm:findSoccerBeeCol(hdr,["HAPM","HAPM(c/min)"])
  };
  const missing=Object.entries(col).filter(([,idx])=>idx<0).map(([k])=>k);
  if(missing.length) throw new Error("SoccerBee DB 1행 헤더 중 인식되지 않은 항목이 있습니다: "+missing.join(", "));
  const out=[];
  rows.forEach(r=>{
    const player=String(r[col.player]||"").trim(); const date=normDate(r[col.date]); if(!player||player==="이름"||!date||!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    const o={player,date}; Object.entries(col).forEach(([k,c])=>{if(k!=="player"&&k!=="date"&&c>=0)o[k]=num(r[c]);}); out.push(o);
  });
  return out;
}
async function importSoccerBeeXlsx(buf){
  const zip=await unzip(buf), get=n=>zip[n]||zip[n.replace(/^\//,"")]; const wb=xml(get("xl/workbook.xml")), rels=xml(get("xl/_rels/workbook.xml.rels"));
  const relMap={}; [...rels.getElementsByTagName("Relationship")].forEach(r=>relMap[r.getAttribute("Id")]=r.getAttribute("Target"));
  const ssFile=get("xl/sharedStrings.xml"), shared=ssFile?[...xml(ssFile).getElementsByTagName("si")].map(si=>si.textContent):[]; const stFile=get("xl/styles.xml"), dateStyles=dateStyleSet(stFile?xml(stFile):null);
  let parsed=[];
  for(const sh of [...wb.getElementsByTagName("sheet")]){
    const rid=sh.getAttribute("r:id")||sh.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships","id"); let tgt=relMap[rid]||"";tgt=tgt.replace(/^\//,"");if(!tgt.startsWith("xl/"))tgt="xl/"+tgt;const f=get(tgt);if(!f)continue;
    try{parsed=parseSoccerBeeRows(sheetRows(xml(f),shared,dateStyles));}catch(e){parsed=[];} if(parsed.length)break;
  }
  if(!parsed.length) throw new Error("유효한 SoccerBee 측정 행을 찾지 못했습니다.");
  ensureAbilityData();
  const canonical=soccerBeeCanonicalPlayerMap();
  if(!Object.keys(canonical).length) throw new Error("선수명단 DB가 없습니다. 통합 기록지를 먼저 업로드한 뒤 SoccerBee DB를 업로드하세요.");
  const matched=[], unmatched=[];
  parsed.forEach(r=>{
    const key=normalizePlayerMatchKey(r.player), player=canonical[key]||"";
    if(!player){unmatched.push(String(r.player||"").trim());return;}
    const row=Object.assign({},r,{player,sourcePlayer:String(r.player||"").trim()});
    const i=DB.soccerbee.findIndex(x=>normalizePlayerMatchKey(x.player)===normalizePlayerMatchKey(player)&&normDate(x.date)===row.date);
    if(i>=0)DB.soccerbee[i]=row;else DB.soccerbee.push(row);
    matched.push(row);
  });
  DB.soccerbee.sort((a,b)=>String(a.player).localeCompare(String(b.player),"ko")||normDate(a.date).localeCompare(normDate(b.date)));
  /* 업로드 결과를 후속 토스트/상태 표시에서 사용할 수 있도록 저장 */
  importSoccerBeeXlsx.lastResult={parsed:parsed.length,matched:matched.length,unmatched:[...new Set(unmatched.filter(Boolean))],latest:Object.keys(soccerBeeLatestMap()).length};
  if(!matched.length) throw new Error("선수명단 DB의 이름과 일치하는 SoccerBee 선수가 없습니다."+(unmatched.length?" 미매칭: "+[...new Set(unmatched)].slice(0,8).join(", "):""));
  return matched.length;
}

function renderAbilityRules(){
  const c=abilityConfig(), g=$("#abilityGrowthRules"), ss=$("#abilitySoccerbeeRules"), ap=c.absence||{};
  const stepTxt=a=>(a||[]).map(x=>num(x.min)+"+ = "+(num(x.value)>=1?"×":"+")+num(x.value)).join(" · ");
  const growthTxt=(c.growthRates||[]).slice().sort((a,b)=>num(a.min)-num(b.min)).map(x=>num(x.min)+'+ = '+Math.round(num(x.value)*100)+'%').join(' · ');
  if(g)g.innerHTML='<div class="ability-rule-list">'+
    '<div class="ability-rule-row"><b>장기 성장</b><span>시즌 구분 없이 DB에 새로 등록된 각 Round 이벤트를 정확히 1회만 누적합니다.</span></div>'+
    '<div class="ability-rule-row"><b>표시 기준</b><span>Career 내부값은 소수점으로 계속 누적하고, 선수 능력치 표/선수카드/OVR은 반올림하지 않고 정수 내림으로 표시합니다.</span></div>'+
    '<div class="ability-rule-row"><b>출석 1Round</b><span>'+["PAC","SHO","PAS","DRI","DEF","PHY"].map(k=>k+' '+(num(c.attendance[k.toLowerCase()])>=0?'+':'')+num(c.attendance[k.toLowerCase()])).join(' · ')+'</span></div>'+
    '<div class="ability-rule-row"><b>결석 1Round</b><span>'+["PAC","SHO","PAS","DRI","DEF","PHY"].map(k=>k+' '+num(ap[k.toLowerCase()]||0).toFixed(2)).join(' · ')+' · 선수 시작일 이후 소속팀 경기일부터 적용 · 시작일 이전 제외</span></div>'+
    '<div class="ability-rule-row"><b>득점 → SHO</b><span>골당 +'+num(c.goalPerGoal).toFixed(2)+' · 득점 수 상한 없음</span></div>'+
    '<div class="ability-rule-row"><b>도움 → PAS</b><span>'+stepTxt(c.assistSteps)+'</span></div>'+
    '<div class="ability-rule-row"><b>선방 → DEF</b><span>'+stepTxt(c.saveSteps)+'</span></div>'+
    '<div class="ability-rule-row"><b>개인파울 → DEF</b><span>'+(c.foulPenaltySteps||[]).map(x=>num(x.min)+'+ = '+num(x.value)).join(' · ')+'</span></div>'+
    '<div class="ability-rule-row"><b>MOM</b><span>1회당 '+['sho','pas','dri','def','phy'].map(k=>k.toUpperCase()+' +'+num((((c.mom||{}).firstSeasonBonus||{})[k])).toFixed(2)).join(' · ')+' · 해당 Round에서 한 번만 반영</span></div>'+
    '<div class="ability-rule-row"><b>성장률</b><span>'+growthTxt+' · 60 미만도 120% 적용</span></div>'+
    '<div class="ability-rule-row"><b>FORM</b><span>사용하지 않음 · 최근 경기력 임시 가감 없이 Career + 결석 감점만 사용</span></div>'+
    '<div class="ability-rule-row"><b>OVR</b><span>선수명단의 시즌별 포지션(PV·AL·FS·GR)에 따라 포지션 가중치를 적용하고 최종 OVR도 정수 내림 표시합니다.</span></div></div>';
  if(ss)ss.innerHTML='<div class="ability-rule-list">'+
    '<div class="ability-rule-row"><b>미평가</b><span>PAC '+num(c.unassessed.pac)+' · DRI '+num(c.unassessed.dri)+' · DEF '+num(c.unassessed.def)+' · PHY '+num(c.unassessed.phy)+'</span></div>'+
    '<div class="ability-rule-row"><b>능력치 시작연도</b><span>'+num((c.initialSkills||{}).careerStartYear)+'년 · 이전 연도는 SHO/PAS 초기 산정용 기준기록으로만 사용하고 Career 성장에는 중복 반영하지 않음</span></div>'+
    '<div class="ability-rule-row"><b>SHO 시작</b><span>전년도 득점/출석R → '+num((c.initialSkills||{}).reliabilityRounds)+'R 신뢰도 보정 → 리그 백분위 → '+num((c.initialSkills||{}).scoreMin)+'~'+num((c.initialSkills||{}).scoreMax)+'점</span></div>'+
    '<div class="ability-rule-row"><b>PAS 시작</b><span>전년도 도움/출석R을 동일 방식으로 산정 · 전년도 기록이 없으면 SHO '+num((c.initialSkills||{}).fallbackSho)+' / PAS '+num((c.initialSkills||{}).fallbackPas)+'</span></div>'+
    '<div class="ability-rule-row"><b>평가 방식</b><span>고정 절대평가 기준표 → 지표별 0~100점 → 가중지수 → '+num(c.soccerbee.abilityMin)+'~'+num(c.soccerbee.abilityMax)+' 연속 능력치</span></div>'+
    '<div class="ability-rule-row"><b>최초 측정</b><span>PAC·DRI·DEF·PHY의 미평가 기본값을 실제 절대평가값으로 교체합니다.</span></div>'+
    '<div class="ability-rule-row"><b>재측정</b><span>직전 평가값과 최신 평가값 차이 × '+Math.round(num(c.soccerbee.retestMultiplier)*100)+'%를 장기 능력치에 1회 반영합니다.</span></div>'+
    '<div class="ability-rule-row"><b>PAC</b><span>'+abilityWeightText(c.soccerbee.weights.pac)+'</span></div>'+
    '<div class="ability-rule-row"><b>DRI</b><span>'+abilityWeightText(c.soccerbee.weights.dri)+'</span></div>'+
    '<div class="ability-rule-row"><b>DEF</b><span>'+abilityWeightText(c.soccerbee.weights.def)+'</span></div>'+
    '<div class="ability-rule-row"><b>PHY</b><span>'+abilityWeightText(c.soccerbee.weights.phy)+'</span></div></div>';
}
function abilityMetricLabel(k){return ({maxSpeed:'최고속도',hpm:'HPM',hsrRatio:'HSR비율',hapm:'HAPM',apm:'APM',accel:'가속',activityRange:'활동범위',avgSpeed:'평균속도',action:'가속감속액션',highAccel:'고강도가속',decel:'감속',highDecel:'고강도감속',dpm:'DPM',energy:'에너지점수'})[k]||k;}
function abilityWeightText(obj){return Object.entries(obj||{}).map(([k,v])=>abilityMetricLabel(k)+' '+Math.round(num(v)*100)+'%').join(' · ');}

function abilityCfgInput(path,value,step='0.01',min='0',max=''){
  return '<input type="number" data-ability-cfg="'+esc(path)+'" value="'+esc(value)+'" step="'+step+'" min="'+min+'"'+(max!==''?' max="'+max+'"':'')+' '+(!admin?'disabled':'')+'>';
}
function abilityCfgField(label,path,value,step='0.01',min='0',max=''){
  return '<div class="ability-config-field"><label>'+esc(label)+'</label>'+abilityCfgInput(path,value,step,min,max)+'</div>';
}
function renderAbilityConfig(){
  const root=$("#abilityConfigBody"); if(!root)return; const c=abilityConfig(), ap=c.absence||{};
  const statKeys=['pac','sho','pas','dri','def','phy'], statLbl={pac:'PAC',sho:'SHO',pas:'PAS',dri:'DRI',def:'DEF',phy:'PHY'};
  const steps=(title,key,rows,valueLabel)=>'<div class="ability-config-card"><div class="ability-config-title"><div><h3>'+title+'</h3><p>모든 시즌 공통 · 해당 Round 이벤트 1회 누적</p></div></div><div style="overflow-x:auto"><table class="ability-config-table"><thead><tr><th>구간</th>'+rows.map(x=>'<th>'+num(x.min)+'+</th>').join('')+'</tr></thead><tbody><tr><td>'+valueLabel+'</td>'+rows.map((x,i)=>'<td>'+abilityCfgInput(key+'.'+i+'.value',num(x.value),'0.01','0')+'</td>').join('')+'</tr><tr><td>최소 기록</td>'+rows.map((x,i)=>'<td>'+abilityCfgInput(key+'.'+i+'.min',num(x.min),'1','0')+'</td>').join('')+'</tr></tbody></table></div></div>';
  const penaltySteps=(title,key,rows)=>'<div class="ability-config-card"><div class="ability-config-title"><div><h3>'+title+'</h3><p>모든 시즌 공통 · 해당 Round 개인파울 DEF 직접 감점</p></div></div><div style="overflow-x:auto"><table class="ability-config-table"><thead><tr><th>구간</th>'+rows.map(x=>'<th>'+num(x.min)+'+</th>').join('')+'</tr></thead><tbody><tr><td>DEF 감점</td>'+rows.map((x,i)=>'<td>'+abilityCfgInput(key+'.'+i+'.value',num(x.value),'0.01','-2','0')+'</td>').join('')+'</tr><tr><td>최소 파울</td>'+rows.map((x,i)=>'<td>'+abilityCfgInput(key+'.'+i+'.min',num(x.min),'1','0')+'</td>').join('')+'</tr></tbody></table></div></div>';
  const weightCard=(ability,obj)=>'<div class="ability-config-card"><div class="ability-config-title"><div><h3>SoccerBee '+ability.toUpperCase()+' 반영률</h3><p>절대평가된 지표점수의 가중치 · 합계는 자동 정규화</p></div></div><div class="ability-config-fields">'+Object.entries(obj||{}).map(([k,v])=>abilityCfgField(abilityMetricLabel(k),'soccerbee.weights.'+ability+'.'+k,Math.round(num(v)*100),'1','0','100')).join('')+'</div></div>';
  const criteriaCard=(metric,vals)=>'<div class="ability-config-card full"><div class="ability-config-title"><div><h3>'+abilityMetricLabel(metric)+' 절대평가 기준</h3><p>원본값 기준점 · 공통 점수 '+(c.soccerbee.scorePoints||[]).map(x=>num(x)).join(' / ')+'</p></div></div><div style="overflow-x:auto"><table class="ability-config-table"><thead><tr>'+(c.soccerbee.scorePoints||[]).map(x=>'<th>'+num(x)+'점</th>').join('')+'</tr></thead><tbody><tr>'+(vals||[]).map((v,i)=>'<td>'+abilityCfgInput('soccerbee.criteria.'+metric+'.'+i,num(v),'0.001','0')+'</td>').join('')+'</tr></tbody></table></div></div>';
  const posNames={PV:'PV · 피보',AL:'AL · 아라',FS:'FS · 픽소',GR:'GR · 골레이로'};
  const positionOvrCard=(pos,obj)=>'<div class="ability-config-card"><div class="ability-config-title"><div><h3>'+posNames[pos]+' OVR 가중치</h3><p>선수명단 포지션 자동 적용 · 합계는 자동 정규화</p></div></div><div class="ability-config-fields">'+statKeys.map(k=>abilityCfgField(statLbl[k],'positionOvrWeights.'+pos+'.'+k,Math.round(num((obj||{})[k])*100),'1','0','100')).join('')+'</div></div>';
  root.innerHTML='<div class="ability-config-grid">'+
    '<div class="ability-config-card"><div class="ability-config-title"><div><h3>SoccerBee 미평가 · 표시범위</h3><p>초기 SoccerBee 측정 전 임시값과 최종 표시범위</p></div></div><div class="ability-config-fields">'+
      abilityCfgField('SoccerBee 미평가 PAC','unassessed.pac',c.unassessed.pac,'1','0','99')+abilityCfgField('SoccerBee 미평가 DRI','unassessed.dri',c.unassessed.dri,'1','0','99')+abilityCfgField('SoccerBee 미평가 DEF','unassessed.def',c.unassessed.def,'1','0','99')+abilityCfgField('SoccerBee 미평가 PHY','unassessed.phy',c.unassessed.phy,'1','0','99')+
      abilityCfgField('표시 최소점수','scoreMin',c.scoreMin,'1','0','99')+abilityCfgField('표시 최대점수','scoreMax',c.scoreMax,'1','1','100')+
    '</div></div>'+
    '<div class="ability-config-card full"><div class="ability-config-title"><div><h3>초기 능력치 산정</h3><p>PAC·DRI·DEF·PHY는 최초 SoccerBee 절대평가, SHO·PAS는 전년도 경기력 백분위를 사용합니다.</p></div></div><div class="ability-config-fields">'+
      abilityCfgField('능력치 적용 시작연도','initialSkills.careerStartYear',num((c.initialSkills||{}).careerStartYear),'1','2000','2100')+
      abilityCfgField('전년도 신뢰 기준 Round','initialSkills.reliabilityRounds',num((c.initialSkills||{}).reliabilityRounds),'1','1','30')+
      abilityCfgField('백분위 최저점','initialSkills.scoreMin',num((c.initialSkills||{}).scoreMin),'1','0','99')+
      abilityCfgField('백분위 중앙점','initialSkills.scoreMid',num((c.initialSkills||{}).scoreMid),'1','0','99')+
      abilityCfgField('백분위 최고점','initialSkills.scoreMax',num((c.initialSkills||{}).scoreMax),'1','0','99')+
      abilityCfgField('전년도 기록 없음 SHO','initialSkills.fallbackSho',num((c.initialSkills||{}).fallbackSho),'1','0','99')+
      abilityCfgField('전년도 기록 없음 PAS','initialSkills.fallbackPas',num((c.initialSkills||{}).fallbackPas),'1','0','99')+
    '</div></div>'+ 
    '<div class="ability-config-card"><div class="ability-config-title"><div><h3>Round 출석 1회 가산</h3><p>출석 이벤트는 해당 Round에서 한 번만 장기 성장에 반영</p></div></div><div class="ability-config-fields">'+statKeys.map(k=>abilityCfgField(statLbl[k],'attendance.'+k,num(c.attendance[k]),'0.005','0')).join('')+'</div></div>'+ 
    '<div class="ability-config-card"><div class="ability-config-title"><div><h3>Round 득점 → SHO</h3><p>득점 상한 없음 · 해당 Round 득점 수 × 골당 가산값</p></div></div><div class="ability-config-fields">'+abilityCfgField('골당 SHO 가산','goalPerGoal',num(c.goalPerGoal),'0.005','0','1')+'</div></div>'+steps('Round 어시스트 → PAS','assistSteps',c.assistSteps,'PAS 가산')+steps('Round 선방 → DEF','saveSteps',c.saveSteps,'DEF 가산')+penaltySteps('Round 개인파울 → DEF 감점','foulPenaltySteps',c.foulPenaltySteps||[])+
    '<div class="ability-config-card"><div class="ability-config-title"><div><h3>Round MOM 1회 직접 가산</h3><p>PAC 제외 · 해당 Round에서 정확히 1회 장기 성장 반영</p></div></div><div class="ability-config-fields">'+statKeys.map(k=>abilityCfgField(statLbl[k],'mom.firstSeasonBonus.'+k,num((((c.mom||{}).firstSeasonBonus||{})[k])),'0.01','0','1')).join('')+'</div></div>'+
    '<div class="ability-config-card"><div class="ability-config-title"><div><h3>Round 승점 성장 배율</h3><p>1Round 최대 4경기 기준</p></div></div><div style="overflow-x:auto"><table class="ability-config-table"><thead><tr><th>승점</th>'+c.pointMultipliers.map(x=>'<th>'+num(x.min)+'+</th>').join('')+'</tr></thead><tbody><tr><td>배율</td>'+c.pointMultipliers.map((x,i)=>'<td>'+abilityCfgInput('pointMultipliers.'+i+'.value',num(x.value),'0.01','0')+'</td>').join('')+'</tr><tr><td>최소 승점</td>'+c.pointMultipliers.map((x,i)=>'<td>'+abilityCfgInput('pointMultipliers.'+i+'.min',num(x.min),'1','0','12')+'</td>').join('')+'</tr></tbody></table></div></div>'+ 
    '<div class="ability-config-card full"><div class="ability-config-title"><div><h3>현재 장기 능력치별 성장률</h3><p>60~69 = 120% · 70~79 = 100% · 80~84 = 75% · 85~89 = 50% · 90+ = 20% · 60 미만은 120%</p></div></div><div style="overflow-x:auto"><table class="ability-config-table"><thead><tr>'+c.growthRates.slice().sort((a,b)=>num(a.min)-num(b.min)).map(x=>'<th>≥ '+num(x.min)+'</th>').join('')+'</tr></thead><tbody><tr>'+c.growthRates.slice().sort((a,b)=>num(a.min)-num(b.min)).map(x=>{const i=c.growthRates.indexOf(x);return '<td>'+abilityCfgInput('growthRates.'+i+'.value',Math.round(num(x.value)*100),'1','0','300')+'<small>%</small></td>';}).join('')+'</tr><tr>'+c.growthRates.slice().sort((a,b)=>num(a.min)-num(b.min)).map(x=>{const i=c.growthRates.indexOf(x);return '<td>'+abilityCfgInput('growthRates.'+i+'.min',num(x.min),'1','0','999')+'</td>';}).join('')+'</tr></tbody></table></div></div>'+
    '<div class="ability-config-card full"><div class="ability-config-title"><div><h3>결석 1Round Career 감점</h3><p>선수명단 시작일 이후 날짜별 소속팀이 실제 경기한 Round부터 미출전 시 1회 직접 감점합니다. 고능력 성장률과 무관한 고정 감점입니다.</p></div></div><div class="ability-config-fields">'+statKeys.map(k=>abilityCfgField(statLbl[k],'absence.'+k,num(ap[k]),'0.01','-2','0')).join('')+'</div></div>'+ 
    '<div class="ability-config-card full"><div class="ability-config-title"><div><h3>포지션별 OVR 가중치</h3><p>선수명단의 포지션을 해당 시즌 연도 기준으로 읽어 PV / AL / FS / GR 가중치를 자동 적용합니다. 포지션이 없거나 인식되지 않을 때만 아래 공통 fallback을 사용합니다.</p></div></div><div class="ability-config-fields">'+statKeys.map(k=>abilityCfgField('Fallback '+statLbl[k],'ovrWeights.'+k,num(c.ovrWeights[k]),'0.1','0')).join('')+'</div></div>'+ 
    ['PV','AL','FS','GR'].map(pos=>positionOvrCard(pos,(c.positionOvrWeights||{})[pos])).join('')+ 
    
    '<div class="ability-config-card full"><div class="ability-config-title"><div><h3>SoccerBee 절대평가 공통 설정</h3><p>상대평가가 아니라 개인 원본기록을 고정 기준표에 대입합니다. 초기 기준은 첨부 Test 6명 분포 기반 임시 V1입니다.</p></div></div><div class="ability-config-fields">'+
      abilityCfgField('평가 능력치 최소','soccerbee.abilityMin',c.soccerbee.abilityMin,'0.1','0','99')+abilityCfgField('평가 능력치 최대','soccerbee.abilityMax',c.soccerbee.abilityMax,'0.1','1','100')+abilityCfgField('재측정 반영배율(%)','soccerbee.retestMultiplier',Math.round(num(c.soccerbee.retestMultiplier)*100),'1','0','300')+
    '</div></div>'+
    '<div class="ability-config-card full"><div class="ability-config-title"><div><h3>SoccerBee 공통 지표 점수</h3><p>각 지표의 5개 원본 기준값에 대응하는 절대점수 · 기준 사이 값은 선형보간</p></div></div><div style="overflow-x:auto"><table class="ability-config-table"><thead><tr>'+(c.soccerbee.scorePoints||[]).map((x,i)=>'<th>단계 '+(i+1)+'</th>').join('')+'</tr></thead><tbody><tr>'+(c.soccerbee.scorePoints||[]).map((x,i)=>'<td>'+abilityCfgInput('soccerbee.scorePoints.'+i,num(x),'1','0','100')+'</td>').join('')+'</tr></tbody></table></div></div>'+
    Object.entries(c.soccerbee.criteria||{}).map(([k,v])=>criteriaCard(k,v)).join('')+
    weightCard('pac',c.soccerbee.weights.pac)+weightCard('dri',c.soccerbee.weights.dri)+weightCard('def',c.soccerbee.weights.def)+weightCard('phy',c.soccerbee.weights.phy)+
    '</div><div class="ability-config-actions"><div class="left"><span class="ability-config-badge" id="abilityCfgStatus">현재 설정값</span><br>입력 후 <b>설정 저장</b>을 눌러야 적용됩니다. 변경값은 JSON 백업에도 저장됩니다.</div><div class="right"><button class="btn" type="button" id="abilityCfgReload">저장값 다시 불러오기</button><button class="btn" type="button" id="abilityCfgReset">V3.17 기본값 복원</button><button class="btn primary" type="button" id="abilityCfgSave">능력치 설정 저장</button></div></div>';
  bindAbilityConfigEvents();
}
function setByPath(obj,path,value){
  const parts=String(path).split('.'); let cur=obj; for(let i=0;i<parts.length-1;i++){const k=parts[i];cur=cur[k]??(cur[k]={});}cur[parts[parts.length-1]]=value;
}
function readAbilityConfigForm(){
  const cfg=deepClone(abilityConfig());
  $$('[data-ability-cfg]').forEach(el=>{
    const path=el.dataset.abilityCfg; let v=num(el.value);
    if(/^growthRates\.\d+\.value$/.test(path) || /^soccerbee\.weights\./.test(path) || /^positionOvrWeights\./.test(path) || path==='soccerbee.retestMultiplier') v/=100;
    setByPath(cfg,path,v);
  });
  return cfg;
}
function validateAbilityConfig(cfg){
  if(cfg.scoreMax<=cfg.scoreMin) return '표시 최대점수는 최소점수보다 커야 합니다.';
  const init=cfg.initialSkills||{};
  if(num(init.scoreMin)>num(init.scoreMid) || num(init.scoreMid)>num(init.scoreMax)) return '초기 SHO/PAS 백분위 점수는 최저 ≤ 중앙 ≤ 최고 순서여야 합니다.';
  if(num(init.reliabilityRounds)<1) return '전년도 신뢰 기준 Round는 1 이상이어야 합니다.';
  const checkAscending=(arr,key,label)=>{for(let i=1;i<arr.length;i++)if(num(arr[i][key])<num(arr[i-1][key]))return label+' 구간값은 왼쪽부터 오름차순이어야 합니다.';return '';};
  if(num(cfg.goalPerGoal)<0)return '골당 SHO 가산값은 0 이상이어야 합니다.';
  let e=checkAscending(cfg.assistSteps,'min','어시스트')||checkAscending(cfg.saveSteps,'min','선방')||checkAscending(cfg.foulPenaltySteps,'min','개인파울')||checkAscending(cfg.pointMultipliers,'min','승점'); if(e)return e;
  if((cfg.foulPenaltySteps||[]).some(x=>num(x.value)>0)) return '개인파울 감점값은 0 이하로 입력해야 합니다.';
  if(Object.values(((cfg.mom||{}).firstSeasonBonus)||{}).some(x=>num(x)<0)) return 'Round MOM 가산값은 0 이상이어야 합니다.';
  if(Object.values(cfg.absence||{}).some(x=>num(x)>0)) return '결석 감점값은 0 이하로 입력해야 합니다.';
  const ovrSum=Object.values(cfg.ovrWeights||{}).reduce((a,b)=>a+Math.max(0,num(b)),0); if(ovrSum<=0)return '포지션 미지정용 OVR 가중치는 최소 한 항목 이상 0보다 커야 합니다.';
  for(const pos of ['PV','AL','FS','GR']){const sum=Object.values((cfg.positionOvrWeights||{})[pos]||{}).reduce((a,b)=>a+Math.max(0,num(b)),0);if(sum<=0)return pos+' OVR 가중치는 최소 한 항목 이상 0보다 커야 합니다.';}
  const sb=cfg.soccerbee||{}; if(num(sb.abilityMax)<=num(sb.abilityMin)) return 'SoccerBee 평가 최대값은 최소값보다 커야 합니다.';
  const sp=sb.scorePoints||[]; for(let i=1;i<sp.length;i++)if(num(sp[i])<=num(sp[i-1]))return 'SoccerBee 공통 지표 점수는 왼쪽부터 오름차순이어야 합니다.';
  for(const [metric,arr] of Object.entries(sb.criteria||{})){for(let i=1;i<(arr||[]).length;i++)if(num(arr[i])<=num(arr[i-1]))return abilityMetricLabel(metric)+' 절대평가 기준값은 왼쪽부터 오름차순이어야 합니다.';}
  if(num(sb.retestMultiplier)<0)return 'SoccerBee 재측정 반영배율은 0 이상이어야 합니다.';
  for(const k of ['pac','dri','def','phy']){const sum=Object.values(sb.weights[k]||{}).reduce((a,b)=>a+num(b),0);if(sum<=0)return 'SoccerBee '+k.toUpperCase()+' 반영률 합계는 0보다 커야 합니다.';}
  return '';
}
function bindAbilityConfigEvents(){
  const saveBtn=$("#abilityCfgSave"), resetBtn=$("#abilityCfgReset"), reloadBtn=$("#abilityCfgReload");
  $$('[data-ability-cfg]').forEach(el=>el.oninput=()=>{const st=$("#abilityCfgStatus");if(st){st.textContent='저장 전 변경';st.classList.add('changed');}});
  if(saveBtn)saveBtn.onclick=()=>{if(!admin)return;const cfg=readAbilityConfigForm(),err=validateAbilityConfig(cfg);if(err){toast(err);return;}abilityConfigSet(cfg);save();renderAll();renderAbilityConfig();toast('능력치 설정을 저장하고 전체 능력치를 재계산했습니다.');};
  if(resetBtn)resetBtn.onclick=()=>{if(!admin)return;if(confirm('능력치 계산 설정을 현재 V3.17 골당 SHO 누적 + 결석 Career 감점 + 내림 표시 + MOM + 개인파울 + 포지션별 OVR + SoccerBee 기본값으로 복원할까요?')){abilityConfigSet(deepClone(ABILITY_DEFAULTS));save();renderAll();renderAbilityConfig();toast('V3.17 골당 SHO 누적 + 결석 Career 감점 + 내림 표시 + MOM + 개인파울 + 포지션별 OVR + SoccerBee 기본값으로 복원했습니다.');}};
  if(reloadBtn)reloadBtn.onclick=()=>{renderAbilityConfig();toast('저장된 능력치 설정을 다시 불러왔습니다.');};
}

function abilityYearGameDates(year){
  const y=String(year||"");
  return [...new Set((DB.matches||[]).map(m=>normDate(m.date)).filter(d=>d&&d.slice(0,4)===y))].sort().reverse();
}
function sortAbilityRecords(records){
  const {key,direction}=abilitySort, sign=direction==="desc"?-1:1;
  return records.slice().sort((a,b)=>{
    if(key==="player") return sign*compareNamesKo(a.player,b.player);
    // 표·모바일 카드에 표시되는 정수와 같은 기준으로 비교한다.
    return sign*(Math.floor(num(a[key]))-Math.floor(num(b[key]))) || compareNamesKo(a.player,b.player);
  });
}
function abilitySortButtons(key,kind){
  const label=ABILITY_SORT_FIELDS.find(f=>f[0]===key)[1];
  return ["asc","desc"].map(direction=>{
    const active=abilitySort.key===key&&abilitySort.direction===direction;
    const name=direction==="asc"?"오름차순":"내림차순", arrow=direction==="asc"?"↑":"↓";
    return '<button type="button" class="ability-sort-button" data-ability-sort-key="'+key+'" data-ability-sort-direction="'+direction+'" data-ability-sort-control="'+kind+'" aria-label="'+label+' '+name+'" title="'+label+' '+name+'" aria-pressed="'+active+'"><span aria-hidden="true">'+arrow+'</span>'+(kind==="toolbar"?' '+name:'')+'</button>';
  }).join('');
}
function abilitySortHeader(key,label){
  const state=abilitySort.key===key?(abilitySort.direction==="asc"?"ascending":"descending"):"none";
  return '<th scope="col" aria-sort="'+state+'"><div class="ability-sort-heading"><span>'+label+'</span><span class="ability-sort-arrows">'+abilitySortButtons(key,"header")+'</span></div></th>';
}
function abilitySortToolbar(half){
  const label=ABILITY_SORT_FIELDS.find(f=>f[0]===abilitySort.key)[1];
  const direction=abilitySort.direction==="asc"?"오름차순":"내림차순";
  return '<div class="ability-sort-toolbar"><label for="abilitySortField'+half+'">정렬 기준</label><select id="abilitySortField'+half+'" data-ability-sort-field>'+ABILITY_SORT_FIELDS.map(([key,name])=>'<option value="'+key+'"'+(key===abilitySort.key?' selected':'')+'>'+name+'</option>').join('')+'</select><div class="ability-sort-actions">'+abilitySortButtons(abilitySort.key,"toolbar")+'</div><span class="ability-sort-status" role="status">'+label+' '+direction+(abilitySort.key!=="player"?' · 동점은 이름순':'')+'</span></div>';
}
function updateAbilitySort(key,direction,origin){
  if(!ABILITY_SORT_FIELDS.some(f=>f[0]===key)||!["asc","desc"].includes(direction)) return;
  const sections=$("#abilityHalfSections"), half=origin.closest('[data-ability-half]')?.dataset.abilityHalf;
  const scrolls=$$('[data-ability-half]',sections).map(section=>({half:section.dataset.abilityHalf,left:section.querySelector('.ability-table-wrap')?.scrollLeft||0}));
  const kind=origin.dataset.abilitySortControl||"select";
  abilitySort={key,direction}; renderAbility();
  const section=sections.querySelector('[data-ability-half="'+half+'"]');
  const focus=section?.querySelector(kind==="select"?'[data-ability-sort-field]':'[data-ability-sort-control="'+kind+'"][data-ability-sort-key="'+key+'"][data-ability-sort-direction="'+direction+'"]');
  if(focus) focus.focus({preventScroll:true});
  scrolls.forEach(item=>{const wrap=sections.querySelector('[data-ability-half="'+item.half+'"] .ability-table-wrap');if(wrap)wrap.scrollLeft=item.left;});
}
function handleAbilitySortClick(e){
  const button=e.target.closest('[data-ability-sort-key]');
  if(!button) return;
  updateAbilitySort(button.dataset.abilitySortKey,button.dataset.abilitySortDirection,button);
}
function handleAbilitySortChange(e){
  if(e.target.matches('[data-ability-sort-field]')) updateAbilitySort(e.target.value,abilitySort.direction,e.target);
}
function syncAbilityAdminControls(){
  const box=$('#abilityAdminControls');if(box)box.hidden=!admin;
  ['abilityYear','abilityAsOfDate','abilityHalf','abilityDateLatest','abilityRefresh','abilitySystemEnabled','soccerbeeUpload','soccerbeeClear'].forEach(id=>{const el=$('#'+id);if(el)el.disabled=!admin;});
}
function applyAbilityNameSearch(){
  const input=$('#abilityPlayerSearch'),root=$('#abilityHalfSections');if(!root)return;
  const query=normalizePlayerMatchKey(input?.value||''),all=new Set(),found=new Set();
  root.querySelectorAll('[data-ability-half]').forEach(section=>{
    let matches=0,total=0;
    section.querySelectorAll('.ability-table tbody tr, .member-cards .member-card').forEach(row=>{
      const name=row.querySelector('[data-player]')?.dataset.player||'',key=normalizePlayerMatchKey(name);
      const visible=!query||key.includes(query);row.hidden=!visible;
      if(key){all.add(key);total++;if(visible){found.add(key);matches++;}}
    });
    const table=section.querySelector('.ability-table-wrap');if(table)table.hidden=!!query&&!matches;
    const empty=section.querySelector('[data-ability-search-empty]');if(empty)empty.hidden=!query||!!matches||!total;
  });
  const status=$('#abilityPlayerSearchStatus');if(status)status.textContent=(query?'검색 결과 ':'전체 ')+found.size+'명 / '+all.size+'명 · 상·하반기 중복 선수는 1명으로 집계';
  const clear=$('#abilityPlayerSearchClear');if(clear)clear.disabled=!String(input?.value||'');
}
function bindAbilityNameSearch(){
  const input=$('#abilityPlayerSearch'),clear=$('#abilityPlayerSearchClear');
  if(input)input.oninput=applyAbilityNameSearch;
  if(clear)clear.onclick=()=>{if(input){input.value='';applyAbilityNameSearch();input.focus();}};
}
function renderAbility(){
  syncAbilityAdminControls();bindAbilityNameSearch();
  const original=playerAbilityRecordAtDate,memo=new Map();
  playerAbilityRecordAtDate=function(...args){const key=JSON.stringify(args);if(!memo.has(key))memo.set(key,original(...args));return memo.get(key);};
  try {
  ensureAbilityData(); const ys=abilityYearList();
  if(!abilityYear||!ys.includes(abilityYear)){const c=abilityLatestContext();abilityYear=c.year;abilityHalf=c.half;}
  let selectedDate=normDate(abilityAsOfDate);
  if(selectedDate && /^\d{4}/.test(selectedDate) && selectedDate.slice(0,4)!==abilityYear){
    abilityYear=selectedDate.slice(0,4);
    if(!ys.includes(abilityYear)) ys.unshift(abilityYear);
  }
  const ysel=$("#abilityYear");
  if(ysel)ysel.innerHTML=ys.map(y=>'<option value="'+esc(y)+'"'+(y===abilityYear?' selected':'')+'>'+esc(y)+'</option>').join('');
  const gameDates=abilityYearGameDates(abilityYear);
  if(selectedDate && !gameDates.includes(selectedDate)){ abilityAsOfDate=""; }
  const effectiveSelectedDate=normDate(abilityAsOfDate);
  const dateEl=$("#abilityAsOfDate");
  if(dateEl){
    dateEl.innerHTML='<option value="">상·하반기 최신</option>'+gameDates.map(d=>{
      const h=abilityHalfForDate(abilityYear,d)==='H2'?'하반기':'상반기';
      return '<option value="'+esc(d)+'"'+(d===effectiveSelectedDate?' selected':'')+'>'+esc(d)+' · '+h+'</option>';
    }).join('');
    if(!gameDates.length) dateEl.innerHTML='<option value="">경기 기록 없음</option>';
  }
  selectedDate=effectiveSelectedDate;
  const toggle=$("#abilitySystemEnabled"); if(toggle){toggle.checked=abilitySystemEnabled();toggle.disabled=!admin;}
  [$("#soccerbeeUpload"),$("#soccerbeeClear")].filter(Boolean).forEach(x=>x.disabled=!admin);

  const targetHalf=selectedDate?abilityHalfForDate(abilityYear,selectedDate):'';
  const h1=selectedDate&&targetHalf==='H1'?abilityHalfComparisonAtDate(abilityYear,"H1",selectedDate):abilityHalfComparison(abilityYear,"H1");
  const h2=selectedDate&&targetHalf==='H2'?abilityHalfComparisonAtDate(abilityYear,"H2",selectedDate):abilityHalfComparison(abilityYear,"H2");
  const activeCmps=selectedDate?[targetHalf==='H2'?h2:h1]:[h1,h2];
  const allNames=new Set();activeCmps.forEach(cmp=>abilityPlayers(cmp.info).forEach(p=>allNames.add(p)));
  const draftNames=draftPlayerNameSet(abilityYear);
  const latestSb=Object.fromEntries(Object.entries(soccerBeeLatestMap(selectedDate||'')).filter(([name])=>draftPlayerVisible(name,draftNames)));
  const measured=[...allNames].filter(p=>!!latestSb[p]).length, unassessed=allNames.size-measured;
  if($("#abilityKpis")){
    const cards=selectedDate?[
      ['경기 날짜',selectedDate,'해당 경기 종료 시점 기준'],
      ['적용 반기',targetHalf==='H2'?'하반기':'상반기',(targetHalf==='H2'?h2.info:h1.info).start+' ~ '+(targetHalf==='H2'?h2.info:h1.info).end],
      ['기준 Round',abilityPeriodRoundBasis((targetHalf==='H2'?h2:h1).info,selectedDate)+'R','선택 경기일까지 최종 Round 번호'],
      ['SoccerBee 평가',measured+'명','선택 경기일까지 평가 · 미평가 '+unassessed+'명']
    ]:[
      ['선택 시즌',abilityYear,'상반기 · 하반기 분리 조회'],
      ['상반기',abilityPeriodRoundBasis(h1.info)+'R',h1.info.start+' ~ '+h1.info.end+' · 최종 Round 기준'],
      ['하반기',abilityPeriodRoundBasis(h2.info)+'R',h2.info.start+' ~ '+h2.info.end+' · 최종 Round 기준'],
      ['SoccerBee 평가',measured+'명','미평가 '+unassessed+'명 · 측정이력 '+(DB.soccerbee||[]).filter(r=>draftPlayerVisible(r.player,draftNames)).length+'건']
    ];
    $("#abilityKpis").innerHTML=cards.map(x=>'<div class="ability-kpi"><div class="k">'+x[0]+'</div><div class="v">'+x[1]+'</div><div class="s">'+x[2]+'</div></div>').join('');
  }
  if($("#abilityPeriodNote"))$("#abilityPeriodNote").textContent=selectedDate
    ? abilityYear+' '+(targetHalf==='H2'?'하반기':'상반기')+' · '+selectedDate+' 경기 종료 기준 능력치 · 이후 경기/SoccerBee 기록 제외'
    : abilityYear+' 시즌 · Round 이벤트 1회 장기 누적 + 결석 Career 감점 · 정수 내림 표시 · 시즌/반기 Round 수 고정 없음 · Career 리셋 없음';

  if($("#abilityPeriodNote")) $("#abilityPeriodNote").textContent+=' · 선수명단 등록 선수만 표시';
  const collectRisers=(half,label,cmp,cutoff)=>{
    if(!cmp.previous) return [];
    const rows=(cutoff?abilityRecordsAtDate(abilityYear,half,cutoff):abilityRecords(abilityYear,half));
    const stats=[['OVR','ovr'],['PAC','pac'],['SHO','sho'],['PAS','pas'],['DRI','dri'],['DEF','def'],['PHY','phy']];
    return rows.map(r=>{
      const p=playerAbilityRecordAtDate(r.player,abilityYear,half,cmp.previous,true);
      const ups=stats.map(([name,key])=>({name,delta:abilityDelta(r[key],p&&p[key])})).filter(x=>x.delta>=1);
      return {r,ups,label,date:cmp.latest||cutoff||''};
    }).filter(x=>x.ups.length).sort((a,b)=>String(a.r.player||'').localeCompare(String(b.r.player||''),'ko'));
  };
  const risers=[];
  if(selectedDate){
    const c=targetHalf==='H2'?h2:h1;
    risers.push(...collectRisers(targetHalf,targetHalf==='H2'?'하반기':'상반기',c,selectedDate));
  }else{
    risers.push(...collectRisers('H1','상반기',h1,''),...collectRisers('H2','하반기',h2,''));
  }
  if($('#abilityRiserNote')) $('#abilityRiserNote').textContent=selectedDate
    ? selectedDate+' 경기 종료 기준 · 직전 경기일 대비 내림 정수 능력치 +1 이상 상승 선수'
    : abilityYear+' 시즌 · 각 반기의 최신 경기일을 직전 경기일과 비교한 상승 선수';
  if($('#abilityRisers')) $('#abilityRisers').innerHTML=risers.length
    ? '<div class="ability-riser-list">'+risers.map(x=>'<div class="ability-riser-item"><div class="ability-riser-main"><div><div class="ability-riser-name">'+playerCardLink(x.r.player,'<b>'+esc(x.r.player)+'</b>',Object.assign({},x.r.info,{asOf:x.r.cutoffDate,allCompetitions:true}))+'</div><div class="ability-riser-sub">'+(x.r.team?esc(x.r.team)+' · ':'')+x.label+(x.date?' · '+esc(x.date):'')+'</div></div></div><div class="ability-riser-deltas">'+x.ups.map(u=>'<span class="ability-riser-delta">'+u.name+' ▲'+u.delta+'</span>').join('')+'</div></div>').join('')+'</div>'
    : '<div class="ability-riser-empty">'+(selectedDate?'선택 경기일 기준으로 직전 경기일 대비 1점 이상 상승한 선수가 없습니다.':'최근 비교 가능한 경기에서 1점 이상 상승한 선수가 없습니다.')+'</div>';

  const renderHalf=(half,label,cmp,cutoff)=>{
    const rows=sortAbilityRecords(cutoff?abilityRecordsAtDate(abilityYear,half,cutoff):abilityRecords(abilityYear,half));
    const prevMap={};
    if(cmp.previous) rows.forEach(r=>prevMap[r.player]=playerAbilityRecordAtDate(r.player,abilityYear,half,cmp.previous,true));
    const compareText=cutoff
      ? ('기준 '+cutoff+(cmp.latest?' · 최근 경기 '+cmp.latest:' · 선택 경기일까지 경기 없음')+(cmp.previous?' / 비교 '+cmp.previous:''))
      : (cmp.latest?(cmp.previous?'최근 '+cmp.latest+' / 비교 '+cmp.previous:'최근 '+cmp.latest+' / 비교일 없음'):'기록 없음');
    const table=rows.length?'<div class="tablewrap ability-table-wrap"><table class="ability-table"><thead><tr>'+abilitySortHeader('player','선수')+'<th>팀</th><th>평가</th><th>시스템</th>'+ABILITY_SORT_FIELDS.slice(1).map(([key,label])=>abilitySortHeader(key,label)).join('')+'<th>출석R</th><th>누적 결석R</th><th>기준R</th><th>골</th><th>도움</th><th>개인파울</th><th>선방</th><th>MOM</th><th>승점</th><th>Career 누적 결석감점</th></tr></thead><tbody>'+rows.map(r=>{
      const p=prevMap[r.player]||null, abs=r.absence||{rounds:0,penalty:{}}, ap=abs.penalty||{};
      return '<tr><td>'+playerCardLink(r.player,playerFaceChip(r.player,false,r.info?.year||abilityYear),Object.assign({},r.info,{asOf:r.cutoffDate,allCompetitions:true}))+'</td><td>'+(r.team?teamChip(r.team):'<span class="muted">—</span>')+'</td><td><span class="ability-status '+(r.measured?'':'unassessed')+'">'+(r.measured?'SB '+esc(r.sbDate):'SB 미평가')+'</span></td>'+ 
        '<td><span class="ability-mode compare">Round+결석감점</span></td><td><b>'+abilityScoreWithDelta(r.ovr,p&&p.ovr)+'</b></td><td>'+abilityScoreWithDelta(r.pac,p&&p.pac)+'</td><td>'+abilityScoreWithDelta(r.sho,p&&p.sho)+'</td><td>'+abilityScoreWithDelta(r.pas,p&&p.pas)+'</td><td>'+abilityScoreWithDelta(r.dri,p&&p.dri)+'</td><td>'+abilityScoreWithDelta(r.def,p&&p.def)+'</td><td>'+abilityScoreWithDelta(r.phy,p&&p.phy)+'</td>'+ 
        '<td>'+r.summary.att+'</td><td>'+num(abs.rounds)+'</td><td><b>'+num(r.summary.att+num(abs.rounds))+' / '+num(r.summary.progress)+'R</b></td><td>'+r.summary.g+'</td><td>'+r.summary.a+'</td><td>'+r.summary.f+'</td><td>'+r.summary.sv+'</td><td>'+r.summary.mom+'</td><td>'+r.summary.pts+'</td><td><span class="ability-growth negative">SHO '+fmtGrowth(num(ap.sho))+' · PAS '+fmtGrowth(num(ap.pas))+' · DRI '+fmtGrowth(num(ap.dri))+' · DEF '+fmtGrowth(num(ap.def))+' · PHY '+fmtGrowth(num(ap.phy))+'</span></td></tr>';
    }).join('')+'</tbody></table></div>':'<div class="empty">'+label+' 선수 데이터가 없습니다.</div>';
    return '<div class="ability-half-section" data-ability-half="'+half+'"><div class="ability-half-head"><div><div class="ability-half-title">'+label+(cutoff?' · '+cutoff+' 기준':'')+'</div><div class="ability-half-meta">'+cmp.info.start+' ~ '+cmp.info.end+' · 선택 경기일까지 최종 기준 '+abilityPeriodRoundBasis(cmp.info,cutoff||cmp.latest||cmp.info.end)+'R · 개인 기준R=시작일 이후 소속팀 경기일 수 · 출석R+결석R=개인 기준R · 능력치 성장은 이전 시즌부터 연속 누적</div></div><div class="ability-half-compare">'+compareText+'</div></div>'+abilitySortToolbar(half)+table+mobileAbilityCards(rows,prevMap)+'<div class="empty" data-ability-search-empty hidden>'+label+'에서 검색한 이름과 일치하는 선수가 없습니다.</div></div>';
  };
  if($("#abilityHalfSections")){
    $("#abilityHalfSections").innerHTML=selectedDate
      ? (targetHalf==='H2'?renderHalf("H2","하반기",h2,selectedDate):renderHalf("H1","상반기",h1,selectedDate))
      : renderHalf("H1","상반기",h1,'')+renderHalf("H2","하반기",h2,'');
  }

  /* SoccerBee 현황도 경기 날짜가 선택되면 그 경기일까지의 최신 측정값만 표시 */
  if($("#soccerbeeStatusTitle")) $("#soccerbeeStatusTitle").textContent=selectedDate?"SoccerBee 경기일 기준 측정 현황":"SoccerBee 최신 측정 현황";
  if($("#soccerbeeStatusDesc")) $("#soccerbeeStatusDesc").textContent=selectedDate
    ? selectedDate+"까지 업로드된 측정 이력 중 선수별 가장 최근 1건을 표시하며, 이후 측정값은 해당 기준일 능력치 계산에서 제외합니다."
    : "업로드한 측정 이력은 삭제하지 않고 보존하며, 선수별 최신 1건을 고정 절대평가 기준표에 대입해 PAC·DRI·DEF·PHY를 계산합니다. 상대평가는 참고 백분위로만 사용합니다.";
  if($("#soccerbeeStatusNote")) $("#soccerbeeStatusNote").innerHTML=selectedDate
    ? '적용 원칙: <b>선수명단 DB 이름 매칭 → '+esc(selectedDate)+' 이하의 측정값 중 선수별 최신 1건 적용</b>. 선택 날짜 이후 측정값은 조회 능력치에 반영하지 않습니다.'
    : '적용 원칙: <b>선수명단 DB 이름 매칭 → 선수별 최신 측정 1건 → 절대평가</b>. 이전 기록은 History로 보존하며 상대평가는 능력치 결정에 사용하지 않습니다.';
  const sbRows=Object.values(latestSb).sort((a,b)=>String(a.player).localeCompare(String(b.player),"ko"));
  const sbEval=soccerBeeAbilityBaseMap(selectedDate||'');
  if($("#soccerbeeStatusTable"))$("#soccerbeeStatusTable").innerHTML=sbRows.length?tbl([
    {t:"선수"},{t:"측정일"},{t:"SB PAC",n:1},{t:"SB DRI",n:1},{t:"SB DEF",n:1},{t:"SB PHY",n:1},{t:"참고 백분위",n:1},{t:"에너지점수",n:1},{t:"DPM",n:1},{t:"활동범위(%)",n:1},{t:"평균속도(km/h)",n:1},{t:"최고속도(km/h)",n:1},
    {t:"HSR",n:1},{t:"HPM(c/min)",n:1},{t:"HSR거리(m)",n:1},{t:"HSR비율(%)",n:1},{t:"스프린트",n:1},{t:"SPM(c/min)",n:1},{t:"스프린트 거리(m)",n:1},{t:"스프린트 비율(%)",n:1},
    {t:"가속감속액션",n:1},{t:"가속",n:1},{t:"감속",n:1},{t:"APM(c/min)",n:1},{t:"고강도 가속감속 액션",n:1},{t:"고강도 가속",n:1},{t:"고강도 감속",n:1},{t:"HAPM(c/min)",n:1}
  ],sbRows.map(r=>{const e=sbEval[r.player]||{}, rp=e.relativePercentile||{}, ref=(num(rp.pac)+num(rp.dri)+num(rp.def)+num(rp.phy))/4;return [
    playerCardLink(r.player,'<b>'+esc(r.player)+'</b>',{start:abilityYear+'-01-01',end:selectedDate||abilityYear+'-12-31',asOf:selectedDate||normDate(r.date),allCompetitions:true}),esc(normDate(r.date)),e.pac!==undefined?num(e.pac).toFixed(1):'—',e.dri!==undefined?num(e.dri).toFixed(1):'—',e.def!==undefined?num(e.def).toFixed(1):'—',e.phy!==undefined?num(e.phy).toFixed(1):'—',Math.round(ref),num(r.energy).toFixed(1),num(r.dpm).toFixed(1),num(r.activityRange).toFixed(1),num(r.avgSpeed).toFixed(1),num(r.maxSpeed).toFixed(1),
    Math.round(num(r.hsr)),num(r.hpm).toFixed(1),num(r.hsrDistance).toFixed(1),num(r.hsrRatio).toFixed(1),Math.round(num(r.sprint)),num(r.spm).toFixed(1),num(r.sprintDistance).toFixed(1),num(r.sprintRatio).toFixed(1),
    Math.round(num(r.action)),Math.round(num(r.accel)),Math.round(num(r.decel)),num(r.apm).toFixed(1),Math.round(num(r.highAction)),Math.round(num(r.highAccel)),Math.round(num(r.highDecel)),num(r.hapm).toFixed(1)
  ]})):'<div class="empty">'+(selectedDate?selectedDate+'까지 적용 가능한 SoccerBee DB가 없습니다.':'SoccerBee DB를 업로드하면 최신 측정값이 표시됩니다.')+'</div>';
  renderAbilityRules();applyAbilityNameSearch();
  } finally {playerAbilityRecordAtDate=original;}
}

/* History graphs use raw date-specific values; integer card/OVR calculations are unchanged. */
const PLAYER_CARD_HISTORY_METRICS=[
  {key:'pac',label:'PAC',color:'#1763b1',dash:''},
  {key:'dri',label:'DRI',color:'#7050a1',dash:'7 4'},
  {key:'sho',label:'SHO',color:'#c52b46',dash:''},
  {key:'def',label:'DEF',color:'#157b68',dash:'3 4'},
  {key:'pas',label:'PAS',color:'#966400',dash:''},
  {key:'phy',label:'PHY',color:'#b04e20',dash:'10 4 2 4'}
];
// Decimal chart formatting changes presentation only; card/OVR calculations stay unchanged.
function playerChartNumber(value,digits=2){
  if(value===null||value===undefined||!Number.isFinite(Number(value)))return '—';
  const rounded=Number(Number(value).toFixed(digits));
  return (Object.is(rounded,-0)?0:rounded).toFixed(digits);
}
function playerChartAutoAxis(values,zeroFloor=true,ceiling=null){
  const clean=values.filter(Number.isFinite);
  if(!clean.length)return {min:0,max:1,step:.2};
  const lo=Math.min(...clean),hi=Math.max(...clean),span=Math.max(.1,hi-lo);
  const pad=Math.max((span-(hi-lo))/2,span*.12,.01),target=(hi-lo+2*pad)/5;
  const power=Math.pow(10,Math.floor(Math.log10(target)));
  const step=Math.max(.01,[1,2,5,10].find(n=>n*power>=target)*power);
  let min=Math.floor((lo-pad)/step)*step,max=Math.ceil((hi+pad)/step)*step;
  if(zeroFloor)min=Math.max(0,min);
  if(ceiling!==null)max=Math.min(ceiling,max);
  if(max<=min)max=min+step;
  return {min:Number(min.toFixed(8)),max:Number(max.toFixed(8)),step:Number(step.toFixed(8))};
}
function playerChartTicks(axis){
  const count=Math.min(20,Math.floor((axis.max-axis.min)/axis.step+1e-7));
  return Array.from({length:count+1},(_,i)=>Number((axis.min+i*axis.step).toFixed(8)));
}
const PLAYER_SB_METRICS=[
  {key:'maxSpeed',label:'최고속도',unit:'km/h'},
  {key:'energy',label:'에너지점수',unit:'점'},
  {key:'dpm',label:'DPM',unit:'m/min'},
  {key:'hsr',label:'HSR',unit:'회'},
  {key:'hpm',label:'HPM',unit:'회/min'},
  {key:'hsrDistance',label:'HSR 거리',unit:'m'},
  {key:'hsrRatio',label:'HSR 비율',unit:'%'},
  {key:'sprint',label:'스프린트',unit:'회'},
  {key:'spm',label:'SPM',unit:'회/min'},
  {key:'sprintDistance',label:'스프린트 거리',unit:'m'},
  {key:'sprintRatio',label:'스프린트 비율',unit:'%'},
  {key:'apm',label:'APM',unit:'회/min'},
  {key:'hapm',label:'HAPM',unit:'회/min'},
  {key:'activityRange',label:'활동범위',unit:'%'},
  {key:'avgSpeed',label:'평균속도',unit:'km/h'},
  {key:'action',label:'가속·감속 액션',unit:'회'},
  {key:'accel',label:'가속',unit:'회'},
  {key:'decel',label:'감속',unit:'회'},
  {key:'highAction',label:'고강도 가속·감속 액션',unit:'회'},
  {key:'highAccel',label:'고강도 가속',unit:'회'},
  {key:'highDecel',label:'고강도 감속',unit:'회'}
];
let playerCardSoccerBeeState=null;
function playerSoccerBeeHistory(player,query,mode,metric){
  const range=playerCardHistoryRange(query,playerCardHistoryState?.mode||'HALF');
  const byDate=new Map();
  soccerBeePlayerRows(player,range.end).forEach(row=>{
    const date=normDate(row.date);
    if(!date||!range.end||date>range.end||(mode==='MATCH'&&date<range.start))return;
    // Same-day reuploads replace that day's plotted value, just like the latest measurement.
    byDate.set(date,row);
  });
  const rows=[...byDate].sort(([a],[b])=>a.localeCompare(b)).map(([date,row])=>{
    const raw=row[metric],text=String(raw??'').trim();
    const number=text?parseFloat(text.replace(/[^0-9.\-]/g,'')):NaN;
    return {date,value:Number.isFinite(number)?number:null};
  });
  return {rows,end:range.end,start:mode==='MATCH'?range.start:(rows[0]?.date||''),mode};
}
function playerSoccerBeeSvg(history,metric,width){
  const rows=history.rows,valid=rows.filter(r=>r.value!==null);
  if(!valid.length)return {html:'<div class="player-card-history-empty">'+(rows.length?'선택한 측정 항목의 기록이 없습니다. 다른 항목을 선택해 주세요.':'선택 기준일까지의 사커비 측정 기록이 없습니다.')+'</div>',xs:[],width:0};
  const W=Math.max(240,Math.round(width||660)),H=340,L=64,R=20,T=36,B=54,pw=W-L-R,ph=H-T-B;
  const times=rows.map(r=>Date.parse(r.date+'T00:00:00Z')),t0=times[0],t1=times[times.length-1];
  const xs=times.map(t=>t1===t0?L+pw/2:L+(t-t0)/(t1-t0)*pw),axis=playerChartAutoAxis(valid.map(r=>r.value));
  const y=v=>T+(axis.max-v)/(axis.max-axis.min)*ph;
  let html='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+W+' '+H+'" role="img" aria-labelledby="pcSbTitle pcSbDesc"><title id="pcSbTitle">'+esc(metric.label)+' 측정 기록</title><desc id="pcSbDesc">X축은 측정일, Y축은 '+esc(metric.label+' ('+metric.unit+')')+'입니다. 기록이 한 건이면 측정점만 표시합니다.</desc><rect width="'+W+'" height="'+H+'" fill="#fff"/><g font-family="Arial,sans-serif" font-size="12" fill="#526a83">';
  playerChartTicks(axis).forEach(v=>{const yy=y(v);html+='<line x1="'+L+'" y1="'+yy+'" x2="'+(W-R)+'" y2="'+yy+'" stroke="#dbe4ee" stroke-dasharray="3 5"/><text x="'+(L-9)+'" y="'+(yy+4)+'" text-anchor="end">'+playerChartNumber(v)+'</text>';});
  html+='<text x="'+L+'" y="18" fill="#061f44">'+esc('SOCCERBEE · '+metric.unit)+'</text>';
  const indices=[0];for(let i=1;i<rows.length-1;i++)if(xs[i]-xs[indices[indices.length-1]]>=95&&xs[xs.length-1]-xs[i]>=95)indices.push(i);
  if(rows.length>1)indices.push(rows.length-1);
  indices.forEach(i=>{html+='<text x="'+xs[i]+'" y="'+(H-B+24)+'" text-anchor="'+(rows.length===1?'middle':i===0?'start':i===rows.length-1?'end':'middle')+'">'+esc(rows[i].date.slice(2).replaceAll('-','/'))+'</text>';});
  html+='<text x="'+(W-R)+'" y="'+(H-8)+'" text-anchor="end" fill="#061f44">DATE</text></g>';
  let path='',pen=false;
  rows.forEach((r,i)=>{if(r.value===null){pen=false;return;}path+=(pen?' L':' M')+xs[i].toFixed(2)+' '+y(r.value).toFixed(2);pen=true;});
  html+='<path class="player-card-sb-line" d="'+path.trim()+'" fill="none" stroke="#1763b1" stroke-width="2.08" stroke-linecap="round" stroke-linejoin="round"/>';
  rows.forEach((r,i)=>{if(r.value!==null)html+='<circle cx="'+xs[i].toFixed(2)+'" cy="'+y(r.value).toFixed(2)+'" r="4" fill="#1763b1" stroke="#fff" stroke-width="1.2"><title>'+esc(r.date+' · '+metric.label+' '+playerChartNumber(r.value)+' '+metric.unit)+'</title></circle>';});
  html+='<line id="playerCardSoccerBeeCursor" x1="'+xs[xs.length-1]+'" x2="'+xs[xs.length-1]+'" y1="'+T+'" y2="'+(H-B)+'" stroke="#061f44" stroke-dasharray="4 5" opacity=".65"/></svg>';
  return {html,xs,width:W,axis};
}
function selectPlayerSoccerBeePoint(index){
  const state=playerCardSoccerBeeState,rows=state?.history?.rows||[];
  if(!rows.length)return;
  const i=Math.max(0,Math.min(rows.length-1,Math.round(num(index)))),row=rows[i],metric=PLAYER_SB_METRICS.find(m=>m.key===state.metric);
  state.index=i;
  const slider=$('#playerCardSoccerBeeDate');if(slider){slider.value=i;slider.setAttribute('aria-valuetext',row.date+' · '+playerChartNumber(row.value)+' '+metric.unit);}
  const cursor=$('#playerCardSoccerBeeCursor'),x=state.plot?.xs[i];if(cursor&&Number.isFinite(x)){cursor.setAttribute('x1',x);cursor.setAttribute('x2',x);}
  const previous=rows[i-1],delta=row.value!==null&&previous&&previous.value!==null?row.value-previous.value:null;
  $('#playerCardSoccerBeeInspect').innerHTML='<div class="pc-history-date">'+esc(row.date)+'<small>실제 측정일</small></div><div class="pc-sb-reading"><span>'+esc(metric.label)+'</span><b>'+playerChartNumber(row.value)+'</b><small>'+esc(metric.unit)+'</small><span>'+ (delta===null?(row.value===null?'측정값 없음':i===0?'첫 측정':'직전 측정값 없음'):playerCardHistoryDelta(delta)+' · 직전 측정 대비')+'</span></div>';
}
function drawPlayerSoccerBeeHistory(){
  const state=playerCardSoccerBeeState,plot=$('#playerCardSoccerBeePlot');if(!state||!plot)return;
  const metric=PLAYER_SB_METRICS.find(m=>m.key===state.metric)||PLAYER_SB_METRICS[0];
  state.history=playerSoccerBeeHistory(state.player,state.query,state.mode,metric.key);
  state.plot=playerSoccerBeeSvg(state.history,metric,plot.clientWidth);plot.innerHTML=state.plot.html;
  const rows=state.history.rows,valid=rows.filter(r=>r.value!==null),latest=valid[valid.length-1],delta=valid.length>1?latest.value-valid[0].value:null;
  $('#playerCardSoccerBeeNote').textContent=(state.history.start?state.history.start+' ~ ':'')+(state.history.end||'기준일 없음')+' · '+rows.length+'회 측정'+(valid.length===1?' · 측정 1회: 추세 비교는 2회부터 가능':'');
  $('#playerCardSoccerBeeSummary').innerHTML=[['최근 측정값',latest?playerChartNumber(latest.value)+' '+metric.unit:'—',latest?.date||'등록 기록 없음'],['첫 측정 대비',delta===null?'—':playerCardHistoryDelta(delta),valid.length>1?valid[0].date+' 대비':'비교할 측정값 없음'],['유효 측정',valid.length+'회',metric.label]].map(([label,value,note])=>'<div><span>'+esc(label)+'</span><b>'+esc(value)+'</b><small>'+esc(note)+'</small></div>').join('');
  const slider=$('#playerCardSoccerBeeDate');slider.min=0;slider.max=Math.max(0,rows.length-1);slider.disabled=rows.length<2;
  if(rows.length)selectPlayerSoccerBeePoint(state.index===null?rows.length-1:state.index);else $('#playerCardSoccerBeeInspect').innerHTML='';
  const svg=plot.querySelector('svg');if(svg)svg.onpointermove=e=>{
    const rect=svg.getBoundingClientRect();if(!rect.width||!state.plot.xs.length)return;
    const x=(e.clientX-rect.left)/rect.width*state.plot.width;let nearest=0;
    state.plot.xs.forEach((v,i)=>{if(Math.abs(v-x)<Math.abs(state.plot.xs[nearest]-x))nearest=i;});
    if(nearest!==state.index)selectPlayerSoccerBeePoint(nearest);
  };
}
function openPlayerSoccerBeeHistory(player,query){
  playerCardSoccerBeeState={player,query,mode:'ALL',metric:'maxSpeed',index:null,history:null,plot:null};
  const metric=$('#playerCardSoccerBeeMetric'),range=$('#playerCardSoccerBeeRange');
  metric.innerHTML=PLAYER_SB_METRICS.map(m=>'<option value="'+m.key+'">'+esc(m.label+' ('+m.unit+')')+'</option>').join('');metric.value='maxSpeed';range.value='ALL';
  metric.onchange=e=>{if(playerCardSoccerBeeState){playerCardSoccerBeeState.metric=e.target.value;playerCardSoccerBeeState.index=null;drawPlayerSoccerBeeHistory();}};
  range.onchange=e=>{if(playerCardSoccerBeeState){playerCardSoccerBeeState.mode=e.target.value;playerCardSoccerBeeState.index=null;drawPlayerSoccerBeeHistory();}};
  $('#playerCardSoccerBeeDate').oninput=e=>selectPlayerSoccerBeePoint(e.target.value);
  drawPlayerSoccerBeeHistory();
}

let playerCardHistoryState=null, playerCardHistoryResize=null;
function playerCardHistoryRange(query,mode){
  const info=query||resolvePlayerCardQuery(), end=normDate(info.asOf||info.end), year=String(info.year||(end||'').slice(0,4));
  const half=abilityHalfInfo(year,info.half||abilityHalfForDate(year,end));
  let start=mode==='QUERY'?normDate(info.start):mode==='YEAR'?seasonCfg(year).h1s:mode==='ALL'?abilityCareerStartDate():half.start;
  start=normDate(start)||abilityCareerStartDate();
  if(start<abilityCareerStartDate())start=abilityCareerStartDate();
  return {start,end,mode};
}
function playerCardAbilityHistory(player,query,mode,cache){
  const range=playerCardHistoryRange(query,mode);range.start=[range.start,playerParticipationStart(player)].sort().pop();const {start,end}=range;
  if(!end||start>end)return Object.assign(range,{rows:[],eventCount:0});
  const matchDates=new Set((DB.matches||[]).map(m=>normDate(m.date)).filter(d=>d&&d>=start&&d<=end));
  const sbDates=new Set((DB.soccerbee||[]).filter(r=>normalizePlayerMatchKey(r.player)===normalizePlayerMatchKey(player)).map(r=>normDate(r.date)).filter(d=>d&&d>=start&&d<=end));
  const dates=[...new Set([start,end,...matchDates,...sbDates])].sort(), memo=cache||new Map();
  const rows=dates.map(date=>{
    let values=memo.get(date);
    if(!values){
      const year=date.slice(0,4), r=playerAbilityRecordAtDate(player,year,abilityHalfForDate(year,date),date,true);
      values={};PLAYER_CARD_HISTORY_METRICS.forEach(m=>values[m.key]=num(r[m.key]));memo.set(date,values);
    }
    const tags=[];
    if(date===start)tags.push('기간 시작');
    if(matchDates.has(date))tags.push('경기 종료');
    if(sbDates.has(date))tags.push('SoccerBee 측정');
    if(date===end)tags.push('선택 기준일');
    return {date,values,tag:tags.join(' · ')};
  });
  return Object.assign(range,{rows,eventCount:new Set([...matchDates,...sbDates]).size});
}
function playerCardHistoryAxis(rows,keys,scale){
  const values=rows.flatMap(r=>keys.map(k=>r.values[k]-(scale==='DELTA'?(rows[0]?.values[k]||0):0))).filter(Number.isFinite);
  if(scale==='FULL')return {min:Math.min(0,...values),max:Math.max(100,...values),step:20};
  return playerChartAutoAxis(values,scale!=='DELTA');
}

function playerCardHistoryDelta(value){
  const rounded=Number(num(value).toFixed(2));
  return rounded>0?'▲ +'+playerChartNumber(rounded):rounded<0?'▼ '+playerChartNumber(rounded):'변화 없음';
}

function playerCardHistoryLegend(history,enabled){
  const rows=history.rows,first=rows[0],last=rows[rows.length-1];
  return PLAYER_CARD_HISTORY_METRICS.map(m=>{
    const value=last?last.values[m.key]:null,delta=last?value-first.values[m.key]:0;
    return '<button type="button" class="player-card-history-series" style="--series-color:'+m.color+'" data-ability-series="'+m.key+'" aria-pressed="'+enabled.has(m.key)+'" aria-label="'+m.label+' 그래프 '+(enabled.has(m.key)?'숨기기':'표시')+'"><span class="pc-series-label">'+m.label+'</span><span class="pc-series-bottom"><b class="pc-series-value">'+playerChartNumber(value)+'</b><span class="pc-series-delta'+(delta>0?' up':delta<0?' down':'')+'">'+(value===null?'기록 없음':playerCardHistoryDelta(delta))+'</span></span></button>';
  }).join('');
}
function playerCardHistorySvg(history,enabled,scale,width){
  const rows=history.rows,metrics=PLAYER_CARD_HISTORY_METRICS.filter(m=>enabled.has(m.key));
  if(!rows.length)return {html:'<div class="player-card-history-empty">선택한 기간에 표시할 능력치 이력이 없습니다.</div>',xs:[],axis:{min:0,max:100},width:0};
  if(!metrics.length)return {html:'<div class="player-card-history-empty">위에서 표시할 능력치를 선택해 주세요.</div>',xs:[],axis:{min:0,max:100},width:0};
  const W=Math.max(240,Math.round(width||660)),H=340,L=64,R=20,T=36,B=54,pw=W-L-R,ph=H-T-B;
  const times=rows.map(r=>Date.parse(r.date+'T00:00:00Z')),t0=times[0],t1=times[times.length-1];
  const xs=times.map(t=>t1===t0?L+pw/2:L+(t-t0)/(t1-t0)*pw),axis=playerCardHistoryAxis(rows,metrics.map(m=>m.key),scale);
  const y=v=>T+(axis.max-v)/(axis.max-axis.min)*ph,chartValue=(r,key)=>r.values[key]-(scale==='DELTA'?rows[0].values[key]:0);
  let html='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+W+' '+H+'" role="img" aria-labelledby="pcHistorySvgTitle pcHistorySvgDesc"><title id="pcHistorySvgTitle">선수 능력치 기간별 변화</title><desc id="pcHistorySvgDesc">X축은 날짜, Y축은 '+(scale==='DELTA'?'기간 시작 대비 증감':'소수점 능력치 수치')+'입니다. '+esc(history.start)+'부터 '+esc(history.end)+'까지 '+metrics.map(m=>m.label).join(', ')+'를 표시합니다. 아래 날짜 선택으로 정확한 값을 확인할 수 있습니다.</desc><rect width="'+W+'" height="'+H+'" fill="#ffffff"/><g font-family="Arial,sans-serif" font-size="13" fill="#526a83">';
  for(const v of playerChartTicks(axis)){const yy=y(v);html+='<line x1="'+L+'" y1="'+yy+'" x2="'+(W-R)+'" y2="'+yy+'" stroke="#dbe4ee" stroke-width="1"'+(v===axis.min?'':' stroke-dasharray="3 5"')+'/><text x="'+(L-12)+'" y="'+(yy+4)+'" text-anchor="end">'+playerChartNumber(v)+'</text>';}
  html+='<text x="'+L+'" y="18" fill="#061f44">'+(scale==='DELTA'?'CHANGE FROM START':'ABILITY SCORE')+'</text>';
  const indices=[0];
  for(let i=1;i<rows.length-1;i++)if(xs[i]-xs[indices[indices.length-1]]>=92&&xs[xs.length-1]-xs[i]>=92)indices.push(i);
  if(rows.length>1)indices.push(rows.length-1);
  indices.forEach(i=>{const date=rows[i].date,short=history.start.slice(0,4)===history.end.slice(0,4)?date.slice(5).replace('-','/'):date.slice(2).replaceAll('-','/');html+='<line x1="'+xs[i]+'" y1="'+(H-B)+'" x2="'+xs[i]+'" y2="'+(H-B+6)+'" stroke="#8da0b7"/><text x="'+xs[i]+'" y="'+(H-B+24)+'" text-anchor="'+(i===0&&rows.length>1?'start':i===rows.length-1&&rows.length>1?'end':'middle')+'">'+short+'</text>';});
  html+='<text x="'+(W-R)+'" y="'+(H-8)+'" text-anchor="end" fill="#061f44">DATE</text></g>';
  metrics.forEach(m=>{
    const path=rows.map((r,i)=>(i?'L':'M')+xs[i].toFixed(2)+' '+y(chartValue(r,m.key)).toFixed(2)).join(' ');
    html+='<g data-history-series="'+m.key+'"><path class="player-card-history-line" d="'+path+'" stroke="'+m.color+'" fill="none" stroke-width="2.08" stroke-linejoin="round"'+(m.dash?' stroke-dasharray="'+m.dash+'"':'')+'/>';
    rows.forEach((r,i)=>{html+='<circle class="player-card-history-dot" cx="'+xs[i].toFixed(2)+'" cy="'+y(chartValue(r,m.key)).toFixed(2)+'" r="'+(rows.length>65?2:3.2)+'" fill="'+m.color+'"><title>'+esc(r.date+' · '+m.label+' '+playerChartNumber(r.values[m.key])+(scale==='DELTA'?' · '+playerCardHistoryDelta(chartValue(r,m.key)):''))+'</title></circle>';});html+='</g>';
  });
  html+='<line id="playerCardHistoryCursor" x1="'+xs[xs.length-1]+'" x2="'+xs[xs.length-1]+'" y1="'+T+'" y2="'+(H-B)+'" stroke="#061f44" stroke-width="1" stroke-dasharray="4 5" opacity=".7" pointer-events="none"/></svg>';
  return {html,xs,axis,width:W};
}
function selectPlayerCardHistoryPoint(index){
  const state=playerCardHistoryState;if(!state||!state.history||!state.history.rows.length)return;
  const rows=state.history.rows,i=Math.max(0,Math.min(rows.length-1,Math.round(num(index)))),row=rows[i],previous=rows[Math.max(0,i-1)];state.index=i;
  const slider=$('#playerCardHistoryDate');if(slider){slider.value=i;slider.setAttribute('aria-valuetext',row.date);}
  const cursor=$('#playerCardHistoryCursor'),x=state.plot&&state.plot.xs[i];if(cursor&&Number.isFinite(x)){cursor.setAttribute('x1',x);cursor.setAttribute('x2',x);}
  const box=$('#playerCardHistoryInspect');if(box)box.innerHTML='<div class="pc-history-date">'+esc(row.date)+'<small>'+esc(row.tag||'기준일 능력치')+'</small></div><div class="pc-history-values">'+PLAYER_CARD_HISTORY_METRICS.filter(m=>state.enabled.has(m.key)).map(m=>{
    const delta=row.values[m.key]-previous.values[m.key];return '<div class="pc-history-value" style="--series-color:'+m.color+'" title="직전 표시일 대비 '+esc(playerCardHistoryDelta(delta))+'"><span>'+m.label+'</span><b>'+playerChartNumber(row.values[m.key])+'</b><small class="pc-series-delta'+(delta>0?' up':delta<0?' down':'')+'">'+(delta?playerCardHistoryDelta(delta):'—')+'</small></div>';
  }).join('')+'</div>';
}
function drawPlayerCardHistory(){
  const state=playerCardHistoryState,plot=$('#playerCardHistoryPlot');if(!state||!plot)return;
  if(!abilitySystemEnabled()){
    plot.innerHTML='<div class="player-card-history-empty">선수 능력치 시스템이 꺼져 있습니다.</div>';
    $('#playerCardHistoryNote').textContent='능력치 시스템을 켜면 선택 기준일까지의 변화가 표시됩니다.';
    $('#playerCardHistoryLegend').innerHTML='';$('#playerCardHistoryInspect').innerHTML='';$('#playerCardHistoryDate').disabled=true;return;
  }
  const history=playerCardAbilityHistory(state.player,state.query,state.mode,state.cache);state.history=history;
  const legend=$('#playerCardHistoryLegend');if(legend)legend.innerHTML=playerCardHistoryLegend(history,state.enabled);
  state.plot=playerCardHistorySvg(history,state.enabled,state.scale,plot.clientWidth);plot.innerHTML=state.plot.html;
  const note=$('#playerCardHistoryNote');if(note)note.textContent=history.start+' ~ '+history.end+' · '+history.eventCount+'개 경기·측정일'+(history.eventCount?'':' · 기간 내 새 기록 없음')+' · Y축 '+playerChartNumber(state.plot.axis.min)+'–'+playerChartNumber(state.plot.axis.max)+(state.scale==='DELTA'?' · 기간 시작 대비 증감':'');
  const slider=$('#playerCardHistoryDate');if(slider){slider.min=0;slider.max=Math.max(0,history.rows.length-1);slider.disabled=history.rows.length<2;}
  if(history.rows.length)selectPlayerCardHistoryPoint(state.index===null?history.rows.length-1:state.index);
  else if($('#playerCardHistoryInspect'))$('#playerCardHistoryInspect').innerHTML='';
  const svg=plot.querySelector('svg');
  if(svg)svg.onpointermove=e=>{
    const rect=svg.getBoundingClientRect();if(!rect.width||!state.plot.xs.length)return;
    const x=(e.clientX-rect.left)/rect.width*state.plot.width;
    let closest=0;state.plot.xs.forEach((v,i)=>{if(Math.abs(v-x)<Math.abs(state.plot.xs[closest]-x))closest=i;});if(closest!==state.index)selectPlayerCardHistoryPoint(closest);
  };
}
function openPlayerCardHistory(player,query){
  playerCardHistoryState={player,query,mode:'HALF',scale:'AUTO',enabled:new Set(PLAYER_CARD_HISTORY_METRICS.map(m=>m.key)),cache:new Map(),index:null,history:null,plot:null};
  const range=$('#playerCardHistoryRange'),scale=$('#playerCardHistoryScale');if(range)range.value='HALF';if(scale)scale.value='AUTO';
  drawPlayerCardHistory();
  openPlayerSoccerBeeHistory(player,query);
  if(playerCardHistoryResize)playerCardHistoryResize.disconnect();
  if(typeof ResizeObserver!=='undefined'){
    const plots=[$('#playerCardHistoryPlot'),$('#playerCardSoccerBeePlot')].filter(Boolean),widths=new Map(plots.map(el=>[el,el.clientWidth]));
    playerCardHistoryResize=new ResizeObserver(entries=>{
      let changed=false;entries.forEach(({target,contentRect})=>{if(contentRect.width&&Math.abs(contentRect.width-(widths.get(target)||0))>1){widths.set(target,contentRect.width);changed=true;}});
      if(changed){drawPlayerCardHistory();drawPlayerSoccerBeeHistory();}
    });
    plots.forEach(el=>playerCardHistoryResize.observe(el));
  }
}
function bindPlayerCardHistory(){
  const range=$('#playerCardHistoryRange'),scale=$('#playerCardHistoryScale'),legend=$('#playerCardHistoryLegend'),all=$('#playerCardHistoryAll'),slider=$('#playerCardHistoryDate');
  if(range)range.onchange=e=>{if(playerCardHistoryState){playerCardHistoryState.mode=e.target.value;playerCardHistoryState.index=null;drawPlayerCardHistory();if(playerCardSoccerBeeState?.mode==='MATCH'){playerCardSoccerBeeState.index=null;drawPlayerSoccerBeeHistory();}}};
  if(scale)scale.onchange=e=>{if(playerCardHistoryState){playerCardHistoryState.scale=e.target.value;drawPlayerCardHistory();}};
  if(legend)legend.onclick=e=>{
    const button=e.target.closest('[data-ability-series]'),state=playerCardHistoryState;if(!button||!state)return;
    const key=button.dataset.abilitySeries;if(state.enabled.has(key))state.enabled.delete(key);else state.enabled.add(key);drawPlayerCardHistory();
    legend.querySelector('[data-ability-series="'+key+'"]')?.focus();
  };
  if(all)all.onclick=()=>{if(playerCardHistoryState){playerCardHistoryState.enabled=new Set(PLAYER_CARD_HISTORY_METRICS.map(m=>m.key));drawPlayerCardHistory();}};
  if(slider)slider.oninput=e=>selectPlayerCardHistoryPoint(Number(e.target.value));
}
bindPlayerCardHistory();

let playerCardHexFrame=null, playerCardHexShowTimer=null, playerCardHexDrawTimer=null;
function clearPlayerCardAnimation(){
  if(playerCardHexFrame){ cancelAnimationFrame(playerCardHexFrame); playerCardHexFrame=null; }
  if(playerCardHexShowTimer){ clearTimeout(playerCardHexShowTimer); playerCardHexShowTimer=null; }
  if(playerCardHexDrawTimer){ clearTimeout(playerCardHexDrawTimer); playerCardHexDrawTimer=null; }
}
function playerCardHexPoints(stats,progress){
  const angles=[-Math.PI/2,-Math.PI/6,Math.PI/6,Math.PI/2,5*Math.PI/6,-5*Math.PI/6];
  return stats.map((value,index)=>{
    const radius=(Math.max(0,Math.min(100,value||0))/100)*50*progress;
    const x=50+radius*Math.cos(angles[index]);
    const y=50+radius*Math.sin(angles[index]);
    return x.toFixed(2)+","+y.toFixed(2);
  }).join(" ");
}
function resetPlayerCardHex(){
  clearPlayerCardAnimation();
  const panel=$("#playerCardHexPanel"), shape=$("#playerCardHexShape");
  if(panel) panel.classList.remove("visible","values-active");
  if(shape){
    shape.classList.remove("drawing","complete");
    shape.setAttribute("points","50,50 50,50 50,50 50,50 50,50 50,50");
    shape.style.strokeDasharray="280"; shape.style.strokeDashoffset="280"; shape.style.opacity="0";
  }
  ["Pac","Sho","Pas","Dri","Def","Phy"].forEach(k=>{ const el=$("#playerCardHex"+k); if(el) el.textContent="0"; });
}
function drawPlayerCardHex(stats){
  const shape=$("#playerCardHexShape"); if(!shape) return;
  const vals=stats.map(v=>Number.isFinite(v)?v:0);
  const ids=["Pac","Sho","Pas","Dri","Def","Phy"];
  const duration=1480, start=performance.now();
  shape.classList.remove("complete"); shape.classList.add("drawing");
  shape.style.opacity=".25"; shape.style.strokeDasharray="280"; shape.style.strokeDashoffset="280";
  const frame=now=>{
    const linear=Math.min(1,(now-start)/duration);
    const p=1-Math.pow(1-linear,3);
    shape.setAttribute("points",playerCardHexPoints(vals,p));
    shape.style.strokeDashoffset=String(280*(1-p));
    shape.style.opacity=String(.25+.75*p);
    ids.forEach((k,i)=>{ const el=$("#playerCardHex"+k); if(el) el.textContent=String(Math.round(vals[i]*p)); });
    if(linear<1) playerCardHexFrame=requestAnimationFrame(frame);
    else{
      playerCardHexFrame=null; shape.setAttribute("points",playerCardHexPoints(vals,1)); shape.style.strokeDashoffset="0"; shape.style.opacity="1";
      shape.classList.remove("drawing"); shape.classList.add("complete");
      ids.forEach((k,i)=>{ const el=$("#playerCardHex"+k); if(el) el.textContent=String(vals[i]); });
    }
  };
  playerCardHexFrame=requestAnimationFrame(frame);
}
function playPlayerCardReveal(stats){
  resetPlayerCardHex();
  const panel=$("#playerCardHexPanel"); if(!panel) return;
  if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches){
    panel.classList.add('visible','values-active');
    const shape=$('#playerCardHexShape');if(shape){shape.setAttribute('points',playerCardHexPoints(stats,1));shape.style.opacity='1';shape.style.strokeDashoffset='0';shape.classList.add('complete');}
    ['Pac','Sho','Pas','Dri','Def','Phy'].forEach((k,i)=>{const el=$('#playerCardHex'+k);if(el)el.textContent=String(stats[i]);});return;
  }
  playerCardHexShowTimer=setTimeout(()=>{
    playerCardHexShowTimer=null; panel.classList.add("visible");
    playerCardHexDrawTimer=setTimeout(()=>{
      playerCardHexDrawTimer=null; panel.classList.add("values-active"); drawPlayerCardHex(stats);
    },760);
  },520);
}
function openPlayerCard(player,query){
  const name=String(player||"").trim(); if(!name||isOwnGoalPlayer(name)) return;
  const cardInfo=resolvePlayerCardQuery(query);
  const roster=playerCardRoster(name,cardInfo)||{};
  const stat=playerCardCurrentStats(name,cardInfo);
  const team=stat.mainTeam&&stat.mainTeam!=="-"?stat.mainTeam:(roster.team||"");
  const photo=roster.photo||"";
  const tLogo=teamLogo(team), hLogo=headerLogo();
  const pos=String(roster.pos||"").trim()||"PLAYER";
  const displayName=String(roster.engName||"").trim()||name;
  const year=cardInfo.year, playerCardCutoff=cardInfo.asOf;
  const abilityCalc=abilitySystemEnabled()?playerAbilityRecordAtDate(name,year,cardInfo.half,playerCardCutoff,true):null;
  const ovr=abilityCalc?Math.floor(abilityCalc.ovr):null;
  const abilities=abilityCalc?[abilityCalc.pac,abilityCalc.sho,abilityCalc.pas,abilityCalc.dri,abilityCalc.def,abilityCalc.phy].map(v=>Math.floor(v)):[null,null,null,null,null,null];
  const labels=["Pac","Sho","Pas","Dri","Def","Phy"];

  $("#playerCardYear").textContent=playerCardYearShort(year);
  $("#playerCardName").textContent=displayName;
  $("#playerCardName").title=displayName;
  $("#playerCardOVR").textContent=ovr===null?"—":String(ovr);
  $("#playerCardPosition").textContent=pos;
  labels.forEach((k,i)=>{ const el=$("#playerCardStat"+k); if(el) el.textContent=abilities[i]===null?"—":String(abilities[i]); });
  renderPlayerCardPerformance(name,stat,playerCardCutoff,cardInfo);
  renderPlayerCardAchievements(name,playerCardCutoff);

  const photoWrap=$("#playerCardPhotoWrap");
  photoWrap.title='';delete photoWrap.dataset.photoState;
  photoWrap.innerHTML='<div class="ggfc-player-card-photo-fallback">'+esc(playerInitials(name))+'</div>';
  if(normalizePlayerPhotoUrl(photo)){
    const img=document.createElement('img');img.className='ggfc-player-card-photo';
    img.alt=name+' 선수 사진';img.decoding='async';img.referrerPolicy='no-referrer';
    img.dataset.playerPhotoSource=photo;img.dataset.photoIndex='0';
    img.addEventListener('error',()=>handlePlayerPhotoError(img));
    img.src=playerPhotoCandidates(photo)[0];
    photoWrap.appendChild(img);
  }

  const club=$("#playerCardClub");
  club.style.backgroundImage=tLogo?'url("'+tLogo+'")':'none';
  club.textContent=tLogo?'':(team?teamDisplayName(team):'GGFC');
  club.title=team?teamDisplayName(team):"";

  const brand=$("#playerCardBrandLogo");
  brand.style.backgroundImage=hLogo?'url("'+hLogo+'")':'none';
  brand.textContent=hLogo?'':displaySettings().brandTitle.slice(0,4);
  const watermark=$("#playerCardWatermark");
  watermark.style.backgroundImage=hLogo?'url("'+hLogo+'")':(tLogo?'url("'+tLogo+'")':'none');

  const mask=$("#playerCardMask");
  mask.classList.remove("on");
  resetPlayerCardHex();
  void mask.offsetWidth;
  mask.classList.add("on"); mask.setAttribute("aria-hidden","false");
  document.body.style.overflow="hidden";
  mask.scrollTop=0;
  openPlayerCardHistory(name,cardInfo);
  playPlayerCardReveal(abilities.map(v=>v===null?0:v));
  setTimeout(()=>$("#playerCardClose").focus(),80);
}
function closePlayerCard(){
  const mask=$("#playerCardMask"); if(!mask) return;
  clearPlayerCardAnimation();
  if(playerCardHistoryResize){playerCardHistoryResize.disconnect();playerCardHistoryResize=null;}
  playerCardHistoryState=null;playerCardSoccerBeeState=null;
  mask.classList.remove("on"); mask.setAttribute("aria-hidden","true");
  document.body.style.overflow="";
}

function leagueSymbolHtml(code){
  const logo=leagueLogo(code);
  return '<div class="league-symbol'+(logo?' has-logo':'')+'">'+(logo?'<img src="'+logo+'" alt="">':esc(code))+'</div>';
}

function renderKPI(){
  const ms=matches(), ts=teamStats(), ps=playerStats();
  const goals = ms.reduce((s,m)=>s+m.hs+m.as,0);
  const top = ps.slice().sort((a,b)=>b.g-a.g)[0];
  const avgAtt = ms.length? Math.round(DB.attendance.filter(a=>matchIds().has(a.id)).length/ms.length*10)/10 : 0;
  const items=[
    {l:"총 경기",v:ms.length,s:seasonLabel()+" · "+ts.length+"개 팀"},
    {l:"총 득점",v:goals,s:ms.length?"경기당 "+(Math.round(goals/ms.length*10)/10)+"골":"—"},
    {l:"등록 선수",v:ps.length,s:"경기당 평균 출석 "+avgAtt+"명"},
    {l:"득점왕",v:top?top.g:0,s:top?top.player:"—"}
  ];
  $("#kpis").innerHTML = items.map(i=>'<div class="card kpi"><div class="l">'+i.l+'</div><div class="v">'+i.v+'</div><div class="s">'+esc(i.s)+'</div></div>').join("");
  $("#dashSub").textContent = seasonLabel()+" · "+(comp==="ALL"?"전체 대회":comp)+" 기준 누계 요약";
}
function renderStanding(el, full){
  const ts=teamStats(), max=Math.max(1,...ts.map(t=>t.pts));
  const cols = full
    ? [{t:"#"},{t:"팀"},{t:"경기",n:1},{t:"승",n:1},{t:"무",n:1},{t:"패",n:1},{t:"득점",n:1},{t:"실점",n:1},{t:"득실",n:1},{t:"파울",n:1},{t:"승점",n:1},{t:"승률",n:1}]
    : [{t:"#"},{t:"팀"},{t:"경기",n:1},{t:"승·무·패",n:1},{t:"승점",n:1},{t:""}];
  const rows = ts.map((t,i)=>{
    const r=['<span class="rank'+(i<3?" top":"")+'">'+(i+1)+'</span>', teamChip(t.team)];
    if(full) r.push(t.p,t.w,t.d,t.l,t.gf,t.ga,(t.gf-t.ga>0?"+":"")+(t.gf-t.ga),t.f,"<b>"+t.pts+"</b>",pct(t.w,t.p)+"%");
    else r.push(t.p, t.w+"·"+t.d+"·"+t.l, "<b>"+t.pts+"</b>", '<div class="bar"><i style="width:'+(t.pts/max*100)+'%;background:'+teamColor(t.team)+'"></i></div>');
    return r;
  });
  el.innerHTML = tbl(cols, rows);
}
function seasonYears(){
  const s=new Set(); DB.matches.forEach(m=>{ const y=String(m.date||"").slice(0,4); if(/^\d{4}$/.test(y)) s.add(y); });
  return [...s].sort().reverse();
}
function renderRecordSeasonSettings(){
  const btn=$("#seasonCfgBtn"), panel=$("#seasonPanel"), range=$("#recordSeasonRange");
  const y=recordYear||"";
  if(btn){
    btn.disabled=!y || !admin;
    btn.title=admin ? (y? y+"년 상·하반기 기간 설정":"시즌을 먼저 선택하세요") : "관리자 로그인 후 기간을 수정할 수 있습니다";
  }
  if(!y){
    if(range) range.textContent="시즌을 선택하면 상·하반기 설정 기간이 표시됩니다.";
    if(panel) panel.style.display="none";
    return;
  }
  const c=seasonCfg(y);
  if(range) range.textContent=y+"년 기준 · 상반기 "+c.h1s+" ~ "+c.h1e+" · 하반기 "+c.h2s+" ~ "+c.h2e+(admin?"":" · 기간 수정은 관리자 전용");
  if($("#h1s")) $("#h1s").value=c.h1s;
  if($("#h1e")) $("#h1e").value=c.h1e;
  if($("#h2s")) $("#h2s").value=c.h2s;
  if($("#h2e")) $("#h2e").value=c.h2e;
  if(!admin && panel) panel.style.display="none";
}

function matchGround(m){
  const direct=String(m.ground||m.field||m.venue||"").trim().toUpperCase();
  let x=direct.match(/(?:^|\s)([AB])(?:\s*구장)?$/i);
  if(x) return x[1].toUpperCase();
  const no=String(m.no||"").trim().toUpperCase().replace(/\s+/g,"");
  x=no.match(/([AB])$/);
  return x?x[1]:"";
}
function teamScorers(m, team, multiline=false){
  const totals={};
  DB.goals.filter(g=>g.id===m.id).forEach(g=>{
    let gt=String(g.team||"").trim();
    if(!gt && g.player){
      const a=DB.attendance.find(x=>x.id===m.id && x.player===g.player);
      gt=a?String(a.team||"").trim():"";
    }
    if(gt!==team || !g.player || num(g.g)<=0) return;
    const name=isOwnGoalPlayer(g.player)?'자책골':g.player;
    totals[name]=(totals[name]||0)+num(g.g);
  });
  const rows=Object.entries(totals)
    .sort((a,b)=>b[1]-a[1] || a[0].localeCompare(b[0]))
    .map(([name,g])=>esc(name)+" "+g+"골");
  /* 경기일별 상세 기록과 경기달력은 multiline=true로 득점자를 한 명씩 세로로 표시한다. */
  return rows.join(multiline?"<br>":", ");
}
function fixtureLogoHtml(team){
  const logo=teamLogo(team);
  return logo?'<img class="fixture-team-logo" src="'+logo+'" alt="'+esc(teamDisplayName(team))+' 로고">':'<span class="fixture-logo-fallback" aria-hidden="true">'+teamInitials(team)+'</span>';
}
function fixtureMomHtml(m){
  // 경기 ID가 같은 실제 MOM 기록만 표시한다. 중복 행은 이름을 한 번만 보여 준다.
  const matchId=String(m.id??'').trim();
  const names=[...new Set((DB.moms||[])
    .filter(r=>matchId && String(r.id??'').trim()===matchId && num(r.mom)>0)
    .map(r=>String(r.player||'').trim())
    .filter(name=>name && !isOwnGoalPlayer(name)))];
  return '<div class="fixture-mom'+(names.length?'':' empty-mom')+'"><span class="fixture-mom-label">MOM</span>'+
    (names.length?names.map(name=>'<span class="fixture-mom-name">'+esc(name)+'</span>').join(''):'<span class="fixture-mom-name">미등록</span>')+'</div>';
}
function fixtureScoreRow(m,homeSc,awaySc,variant){
  return '<div class="fixture-score-row '+(variant||'')+'">'+
    '<div class="fixture-team-copy home"><div class="fixture-team-name">'+esc(teamDisplayName(m.home))+'</div><div class="fixture-team-scorers'+(homeSc?'':' none')+'">'+(homeSc||'득점자 없음')+'</div></div>'+
    '<div class="fixture-logo-wrap">'+fixtureLogoHtml(m.home)+'</div>'+
    '<div class="fixture-score-center"><div class="fixture-score-value">'+num(m.hs)+' <span>-</span> '+num(m.as)+'</div>'+fixtureMomHtml(m)+'</div>'+
    '<div class="fixture-logo-wrap">'+fixtureLogoHtml(m.away)+'</div>'+
    '<div class="fixture-team-copy away"><div class="fixture-team-name">'+esc(teamDisplayName(m.away))+'</div><div class="fixture-team-scorers'+(awaySc?'':' none')+'">'+(awaySc||'득점자 없음')+'</div></div>'+
  '</div>';
}
function groundMatchCard(m){
  const homeSc=teamScorers(m,m.home,true), awaySc=teamScorers(m,m.away,true);
  const meta=[];
  if(m.round) meta.push(esc(m.round));
  if(m.no) meta.push(esc(m.no));
  const fouls=matchTeamFouls(m);
  if(fouls.home+fouls.away>0) meta.push("파울 "+fouls.home+":"+fouls.away);
  if(forfeitText(m)) meta.push(esc(forfeitText(m)));
  return '<div class="ground-match fixture-match-card match-detail-card"'+matchDetailAttrs(m)+'>'+
    '<div class="ground-match-meta">'+(meta.length?meta.map(x=>'<span>'+x+'</span>').join('<span>·</span>'):'<span>&nbsp;</span>')+'</div>'+
    fixtureScoreRow(m,homeSc,awaySc,'ground-fixture')+
    '</div>';
}
function groundPanel(code, list){
  const title=code+"구장";
  if(!list.length) return '<div class="ground-panel"><div class="ground-title">'+title+'</div><div class="ground-empty">해당 구장에 등록된 경기가 없습니다.</div></div>';
  const groups=[];
  list.forEach(m=>{
    const name=m.comp||"정규리그";
    let g=groups.find(x=>x.name===name);
    if(!g){ g={name,items:[]}; groups.push(g); }
    g.items.push(m);
  });
  return '<div class="ground-panel"><div class="ground-title">'+title+'</div><div class="ground-content">'+
    groups.map(g=>'<div class="comp-group"><div class="comp-title">'+esc(g.name)+'</div>'+g.items.map(groundMatchCard).join("")+'</div>').join("")+
    '</div></div>';
}

function dashboardMatchDates(){
  return [...new Set(matches().map(m=>normDate(m.date)).filter(Boolean))].sort().reverse();
}
function ensureDashboardDate(){
  if(!dashDate){
    const days=dashboardMatchDates();
    dashDate=days[0]||"";
  }
  return dashDate;
}
function renderDashboardDateControls(){
  const days=dashboardMatchDates();
  ensureDashboardDate();
  const options='<option value="">경기일 선택</option>'+days.map(d=>
    '<option value="'+esc(d)+'"'+(d===dashDate?' selected':'')+'>'+esc(d)+'</option>'
  ).join("");
  if($("#dashTopDateSel")) $("#dashTopDateSel").innerHTML=options;
  if($("#dashTopDate")) $("#dashTopDate").value=dashDate||"";
}
function setDashboardDate(date){
  dashDate=normDate(date);
  if(dashDate){
    selDay=dashDate;
    recordMode="DAY";
    recordDate=dashDate;
    recordYear=dashDate.slice(0,4);
  }
  renderDashboardDateControls();
  renderLeagueSummary();
  renderRecentMatches();
}
function compCompact(v){
  return String(v||"").trim().toLowerCase().replace(/[\s_.\-]/g,"");
}
function isRegularComp(v){
  const n=compCompact(v);
  return n.includes("정규리그") || n==="regularleague" || n==="regular";
}
function isInterleagueComp(v){
  const n=compCompact(v);
  return n.includes("인터리그") || n.includes("교차리그") || n==="interleague";
}
function tournamentCompName(v){
  const n=compCompact(v);
  if(n.includes("챔피언스리그") || n.includes("챔스") || n.includes("championsleague")) return "챔피언스리그";
  if(n.includes("커뮤니티실드") || n.includes("communityshield")) return "커뮤니티실드";
  if(n.includes("fa컵") || n.includes("facup")) return "FA컵";
  return "";
}
function dateHalfKey(date){
  const d=normDate(date||"");
  const y=d.slice(0,4);
  if(!/^\d{4}$/.test(y)) return "";
  const sameDay=DB.matches.filter(m=>normDate(m.date)===d);
  const explicit=sameDay.map(m=>normHalf(m.half)).find(Boolean);
  if(explicit) return explicit;
  const c=seasonCfg(y);
  if(d>=c.h1s && d<=c.h1e) return "H1";
  if(d>=c.h2s && d<=c.h2e) return "H2";
  return "";
}
function matchHalfKey(m){
  const hv=normHalf(m.half);
  if(hv) return hv;
  return dateHalfKey(m.date);
}
function selectedHalfContext(date){
  const d=normDate(date||"");
  return {date:d,year:d.slice(0,4),half:dateHalfKey(d)};
}
function sameSelectedHalf(m,ctx){
  const d=normDate(m.date);
  if(!d || d.slice(0,4)!==ctx.year) return false;
  if(!ctx.half) return true;
  return matchHalfKey(m)===ctx.half;
}
function leagueMatchesOnDate(date){
  const ctx=selectedHalfContext(date);
  if(!ctx.date || !/^\d{4}$/.test(ctx.year)) return [];
  const seen=new Set();
  return DB.matches.filter(m=>{
    const d=normDate(m.date);
    if(d!==ctx.date || !sameSelectedHalf(m,ctx) || !(isRegularComp(m.comp) || isInterleagueComp(m.comp))) return false;
    /* 같은 경기가 중복 적재되어도 팀 경기 수에 한 번만 반영한다. */
    const pair=[String(m.home||"").trim(),String(m.away||"").trim()].sort().join("~");
    const key=[d,compCompact(m.comp),String(m.round||"").trim(),String(m.no||"").trim(),pair].join("|");
    if(seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function leagueMembership(date){
  const target=normDate(date||""), votes={};
  if(!target) return {};

  /* 엑셀 경기기록의 '그룹' 값을 조회 날짜 기준으로 읽는다.
     같은 팀의 그룹이 날짜별로 달라져도 날짜를 변경하면 즉시 해당 날짜의 그룹으로 재분류된다. */
  DB.matches.filter(m=>normDate(m.date)===target && (isRegularComp(m.comp) || isInterleagueComp(m.comp))).forEach(m=>{
    [m.home,m.away].filter(Boolean).forEach(team=>{
      const code=matchTeamGroup(m,team);
      if(!code) return;
      const v=votes[team]||(votes[team]={A:0,B:0});
      v[code]=(v[code]||0)+1;
    });
  });

  const out={};
  Object.entries(votes).forEach(([team,v])=>out[team]=v.B>v.A?"B":"A");

  /* 기존 데이터처럼 그룹 열이 비어 있는 경우에만 경기번호의 A/B를 임시 대체값으로 사용한다. */
  leagueMatchesOnDate(target).forEach(m=>{
    let ground=matchGround(m); if(!ground) ground="A";
    [m.home,m.away].filter(Boolean).forEach(team=>{
      if(!out[team]) out[team]=matchTeamGroup(m,team) || ground;
    });
  });
  return out;
}
const LEAGUE_TEAM_DISPLAY_PRIORITY = ["A특공대","풀파워","어우씨","D져스","이지스","F킬러"];
function leagueTeamDisplayOrder(name){
  const i=LEAGUE_TEAM_DISPLAY_PRIORITY.indexOf(String(name||"").trim());
  return i<0 ? 999 : i;
}
function groundTeamStats(code,date){
  const stats={}, member=leagueMembership(date), league=leagueMatchesOnDate(date);
  const get=team=>stats[team]||(stats[team]={team,p:0,w:0,d:0,l:0,gf:0,ga:0,pts:0});
  Object.keys(member).filter(t=>member[t]===code).forEach(get);
  league.forEach(m=>{
    if(!m.home || !m.away) return;
    const hs=num(m.hs), as=num(m.as);
    const H=member[m.home]===code?get(m.home):null;
    const A=member[m.away]===code?get(m.away):null;
    const hr=matchResult(m,m.home), ar=matchResult(m,m.away);
    if(H){ H.p++; H.gf+=hs; H.ga+=as; if(hr==="W"){H.w++;H.pts+=3;} else if(hr==="D"){H.d++;H.pts++;} else H.l++; }
    if(A){ A.p++; A.gf+=as; A.ga+=hs; if(ar==="W"){A.w++;A.pts+=3;} else if(ar==="D"){A.d++;A.pts++;} else A.l++; }
  });
  /* 경기결과 카드의 팀 배치는 리그별 성적순이 아니라 지정된 고정 우선순위로 표시한다. */
  return Object.values(stats).sort((a,b)=>
    leagueTeamDisplayOrder(a.team)-leagueTeamDisplayOrder(b.team) || a.team.localeCompare(b.team)
  );
}
function teamInitials(name){
  const chars=Array.from(String(name||"").replace(/\s+/g,""));
  return esc(chars.slice(0,2).join("")||"팀");
}
function leagueTeamCard(t){
  const diff=t.gf-t.ga, logo=teamLogo(t.team);
  return '<div class="league-team-card">'+
    '<div class="league-crest'+(logo?' has-logo':'')+'" style="background:'+teamColor(t.team)+'">'+(logo?'<img src="'+logo+'" alt="">':teamInitials(t.team))+'</div>'+ 
    '<div class="league-team-name" title="'+esc(teamDisplayName(t.team))+'">'+esc(teamDisplayName(t.team))+'</div>'+
    '<div class="league-team-rule"></div>'+
    '<div class="league-team-wdl">'+t.w+'승 '+t.d+'무 '+t.l+'패</div>'+
    '<div class="league-team-goals">'+t.gf+'득 '+t.ga+'실</div>'+
  '</div>';
}
function leagueZone(code,date){
  const list=groundTeamStats(code,date), ctx=selectedHalfContext(date);
  const members=new Set(list.map(x=>x.team));
  const count=leagueMatchesOnDate(date).filter(m=>members.has(m.home)||members.has(m.away)).length;
  const halfName=ctx.half==="H1"?"상반기":ctx.half==="H2"?"하반기":"선택 기간";
  const leagueName=leagueGroupLabel(code);
  return '<div class="league-zone '+code.toLowerCase()+'">'+
    '<div class="league-zone-head">'+leagueSymbolHtml(code)+'<div><div class="league-zone-title">'+leagueName+'</div></div></div>'+
    (list.length?'<div class="league-team-grid">'+list.map(leagueTeamCard).join("")+'</div>':'<div class="league-zone-empty">'+esc(date||"선택 날짜")+'의 '+leagueName+'(그룹 '+code+') 팀 기록이 없습니다.</div>')+
  '</div>';
}
function roundOrder(label){
  const n=compCompact(label);
  if(n.includes("예선")||n.includes("조별")) return 5;
  if(n.includes("64강")) return 10;
  if(n.includes("32강")) return 20;
  if(n.includes("16강")) return 30;
  if(n.includes("8강")||n.includes("준준결승")||n.includes("quarter")) return 40;
  if(n.includes("4강")||n.includes("준결승")||n.includes("semi")) return 50;
  if(n.includes("3·4")||n.includes("34위")||n.includes("3위")) return 55;
  if(n.includes("결승")||n==="final") return 60;
  const r=n.match(/(?:round|r)(\d+)/);
  if(r) return 100+parseInt(r[1],10);
  return 500;
}
function tournamentMatches(name,date){
  const target=normDate(date||""), year=target.slice(0,4);
  return DB.matches.filter(m=>{
    const d=normDate(m.date);
    return d && d<=target && d.slice(0,4)===year && tournamentCompName(m.comp)===name;
  }).sort((a,b)=>normDate(a.date).localeCompare(normDate(b.date)) || String(a.no||"").localeCompare(String(b.no||""),undefined,{numeric:true}));
}
function tournamentRoundGroups(name,date){
  const ms=tournamentMatches(name,date), groups=[];
  ms.forEach(m=>{
    const label=String(m.round||"").trim() || normDate(m.date) || "경기";
    let g=groups.find(x=>x.label===label);
    if(!g){ g={label,order:roundOrder(label),date:normDate(m.date),items:[]}; groups.push(g); }
    g.items.push(m);
  });
  groups.sort((a,b)=>a.order-b.order || a.date.localeCompare(b.date) || a.label.localeCompare(b.label,undefined,{numeric:true}));
  return groups;
}
function tournamentMatchCard(m){
  const hs=num(m.hs), as=num(m.as), hr=matchResult(m,m.home), homeWin=hr==="W", awayWin=hr==="L";
  return '<div class="tournament-match">'+
    '<div class="tournament-match-date">'+esc(normDate(m.date))+(m.no?' · '+esc(m.no):'')+'</div>'+
    '<div class="tournament-team-row '+(homeWin?'winner':awayWin?'loser':'')+'"><div class="tournament-team-name">'+esc(m.home||'미정')+'</div><div class="tournament-team-score">'+hs+'</div></div>'+
    '<div class="tournament-team-row '+(awayWin?'winner':homeWin?'loser':'')+'"><div class="tournament-team-name">'+esc(m.away||'미정')+'</div><div class="tournament-team-score">'+as+'</div></div>'+
    '<div class="tournament-match-info">'+(hs===as?'무승부 · 승부차기/연장 결과는 비고 또는 라운드에 기록':'승자 '+esc(homeWin?m.home:m.away))+'</div>'+
  '</div>';
}
function tournamentBoard(name,date){
  const groups=tournamentRoundGroups(name,date), ms=tournamentMatches(name,date);
  if(!groups.length) return '<div class="tournament-board"><div class="tournament-head"><div class="tournament-name">'+esc(name)+'</div></div><div class="tournament-empty">선택일까지 등록된 토너먼트 경기가 없습니다.</div></div>';
  const last=ms[ms.length-1], winners=new Set(ms.filter(m=>num(m.hs)!==num(m.as)).map(m=>num(m.hs)>num(m.as)?m.home:m.away));
  return '<div class="tournament-board">'+
    '<div class="tournament-head"><div class="tournament-name">'+esc(name)+' 토너먼트</div><div class="tournament-meta">'+groups.length+'개 라운드 · '+ms.length+'경기 · '+esc(normDate(last.date))+'까지</div></div>'+
    '<div class="tournament-rounds">'+groups.map(g=>'<div class="tournament-round"><div class="tournament-round-title">'+esc(g.label)+'</div><div class="tournament-round-body">'+g.items.map(tournamentMatchCard).join('')+'</div></div>').join('')+'</div>'+
  '</div>';
}
function selectedTournamentNames(date){
  const target=normDate(date||"");
  const day=DB.matches.filter(m=>normDate(m.date)===target).map(m=>tournamentCompName(m.comp)).filter(Boolean);
  const filtered=tournamentCompName(comp);
  if(filtered) return [filtered];
  return [...new Set(day)];
}
function renderLeagueSummary(){
  ensureDashboardDate();
  const box=$("#dashLeagueSummary"), title=$("#dashLeagueSummaryTitle"), dateLabel=$("#dashLeagueSummaryDate");
  if(!dashDate){
    if(title) title.textContent="경기결과";
    if(dateLabel) dateLabel.textContent="";
    box.innerHTML='<div class="empty">등록된 경기가 없습니다.</div>'; return;
  }
  const ctx=selectedHalfContext(dashDate), halfName=ctx.half==="H1"?"상반기":ctx.half==="H2"?"하반기":"선택 기간";
  if(title) title.textContent="경기결과";
  if(dateLabel) dateLabel.textContent=dashDate.replace(/-/g,".");
  box.innerHTML=(admin?'<div class="league-rule-note" data-dashboard-admin data-export-ignore><b>'+halfName+' 당일 집계:</b> 슈퍼리그/챌린지리그 팀 구성은 선택한 날짜의 엑셀 <b>그룹</b> 값을 기준으로 합니다. 정규리그와 인터리그 결과만 합산하며, 날짜별 그룹 변경은 조회 날짜 변경 시 자동 반영됩니다. 토너먼트 대회는 상단 현황에 반영하지 않습니다.</div>':'')+
    '<div class="league-overview">'+leagueZone("A",dashDate)+leagueZone("B",dashDate)+'</div>';
}

function recordBaseMatches(){
  return DB.matches.filter(m=>comp==="ALL" || m.comp===comp);
}
function uniqueRecordMatches(list){
  const seen=new Set();
  return list.filter(m=>{
    const pair=[String(m.home||"").trim(),String(m.away||"").trim()].sort().join("~");
    const key=[normDate(m.date),compCompact(m.comp),String(m.round||"").trim(),String(m.no||"").trim(),pair].join("|");
    if(seen.has(key)) return false;
    seen.add(key); return true;
  });
}
function recordDates(){
  return [...new Set(recordBaseMatches().map(m=>normDate(m.date)).filter(Boolean))].sort().reverse();
}
function recordYears(){
  return [...new Set(recordDates().map(d=>d.slice(0,4)).filter(y=>/^\d{4}$/.test(y)))].sort().reverse();
}
function recordDatesForYear(year){
  return recordDates().filter(d=>!year || d.slice(0,4)===year).sort();
}
function setRecordYearDefaults(year){
  const dates=recordDatesForYear(year);
  if(dates.length){
    recordDate=dates[dates.length-1];
    recordStart=dates[0];
    recordEnd=dates[dates.length-1];
  }else{
    recordDate="";
    recordStart=year?year+"-01-01":"";
    recordEnd=year?year+"-12-31":"";
  }
}
function ensureRecordState(){
  const dates=recordDates(), latest=dates[0]||"", years=recordYears();
  if(!recordYear || !years.includes(recordYear)) recordYear=years[0]||(latest?latest.slice(0,4):"");
  const seasonDates=recordDatesForYear(recordYear);
  if(!recordDate || !seasonDates.includes(recordDate)) recordDate=(dashDate&&seasonDates.includes(dashDate))?dashDate:(seasonDates[seasonDates.length-1]||latest);
  if(!recordStart || !seasonDates.includes(recordStart)) recordStart=seasonDates[0]||(recordYear?recordYear+"-01-01":latest);
  if(!recordEnd || !seasonDates.includes(recordEnd)) recordEnd=seasonDates[seasonDates.length-1]||(recordYear?recordYear+"-12-31":latest);
}
function recordHalfSegmentList(year, halfMode){
  if(halfMode!=="H1" && halfMode!=="H2") return [];
  const c=seasonCfg(year);
  return (c.repSegments && Array.isArray(c.repSegments[halfMode])) ? c.repSegments[halfMode] : [];
}
function ensureRecordSegment(){
  if(recordMode!=="H1" && recordMode!=="H2"){ recordSegment="ALL"; return; }
  const list=recordHalfSegmentList(recordYear,recordMode);
  if(recordSegment!=="ALL"){
    const idx=parseInt(recordSegment,10)-1;
    if(!Number.isInteger(idx) || idx<0 || idx>=list.length) recordSegment="ALL";
  }
}
function recordSegmentOptionsHtml(year,halfMode){
  const list=recordHalfSegmentList(year,halfMode);
  const halfName=halfMode==="H1"?"상반기":"하반기";
  let html='<option value="ALL"'+(recordSegment==="ALL"?' selected':'')+'>'+halfName+' 전체</option>';
  html+=list.map((seg,i)=>{
    const mode=String(seg.mode||"REP").toUpperCase()==="IND"?"개별승점":"대표승점";
    const done=seg.complete===true?" · 완료":"";
    const text=(i+1)+'구간 · '+(seg.s||'-')+' ~ '+(seg.e||'-')+' · '+mode+done;
    return '<option value="'+(i+1)+'"'+(String(recordSegment)===String(i+1)?' selected':'')+'>'+esc(text)+'</option>';
  }).join("");
  return html;
}
function recordQueryInfo(){
  ensureRecordState();
  ensureRecordSegment();
  const dates=recordDates(), latest=dates[0]||"";
  let start="", end="", label="", basis="";
  if(recordMode==="LATEST"){
    start=end=latest; label=latest?"최근 경기일 "+latest:"최근 경기일"; basis="가장 최근에 등록된 경기일";
  }else if(recordMode==="DAY"){
    start=end=normDate(recordDate||dashDate||latest); label=start?start+" 단일 경기일":"단일 경기일"; basis="선택한 한 경기일";
  }else if(recordMode==="SEASON" || recordMode==="YEAR"){
    const c=seasonCfg(recordYear);
    start=c.h1s||recordYear+"-01-01"; end=c.h2e||recordYear+"-12-31";
    label=recordYear+" 시즌 전체"; basis="설정된 시즌 전체 "+start+" ~ "+end;
  }else if(recordMode==="H1" || recordMode==="H2"){
    const c=seasonCfg(recordYear);
    const halfName=recordMode==="H1"?"상반기":"하반기";
    const segs=recordHalfSegmentList(recordYear,recordMode);
    const segIdx=recordSegment!=="ALL" ? parseInt(recordSegment,10)-1 : -1;
    const seg=(segIdx>=0 && segIdx<segs.length)?segs[segIdx]:null;
    if(seg && seg.s && seg.e){
      start=normDate(seg.s); end=normDate(seg.e);
      label=recordYear+" 시즌 "+halfName+" "+(segIdx+1)+"구간";
      basis=halfName+" "+(segIdx+1)+"구간 "+start+" ~ "+end;
    }else{
      start=recordMode==="H1"?c.h1s:c.h2s; end=recordMode==="H1"?c.h1e:c.h2e;
      label=recordYear+" 시즌 "+halfName;
      basis=halfName+" 전체 "+start+" ~ "+end;
    }
  }else{
    start=normDate(recordStart); end=normDate(recordEnd);
    if(start&&end&&start>end){ const tmp=start; start=end; end=tmp; }
    label=(start||"시작 경기일")+" ~ "+(end||"종료 경기일"); basis="선택한 실제 경기일 구간";
  }
  const list=uniqueRecordMatches(recordBaseMatches().filter(m=>{
    const d=normDate(m.date); return d && (!start||d>=start) && (!end||d<=end);
  })).sort((a,b)=>normDate(b.date).localeCompare(normDate(a.date)) || String(a.no||"").localeCompare(String(b.no||""),undefined,{numeric:true}));
  const resolvedMode=recordMode==="YEAR"?"SEASON":recordMode;
  const resolvedYear=String(recordYear||(end||start||latest||"").slice(0,4));
  return {start,end,label,basis,list,mode:resolvedMode,year:resolvedYear};
}
function renderRecordControls(){
  ensureRecordState();
  const dates=recordDates(), years=recordYears(), seasonDates=recordDatesForYear(recordYear);
  const modeEl=$("#recordMode"), yearEl=$("#recordYear"), dateEl=$("#recordDate"), dateSel=$("#recordDateSel"), segmentEl=$("#recordSegment");
  if(modeEl) modeEl.value=recordMode==="YEAR"?"SEASON":recordMode;
  if(yearEl) yearEl.innerHTML=(years.length?years:[String(new Date().getFullYear())]).map(y=>'<option value="'+esc(y)+'"'+(y===recordYear?' selected':'')+'>'+esc(y)+' 시즌</option>').join("");
  ensureRecordSegment();
  if(segmentEl && (recordMode==="H1" || recordMode==="H2")) segmentEl.innerHTML=recordSegmentOptionsHtml(recordYear,recordMode);
  if(dateEl) dateEl.value=recordDate||"";
  if(dateSel) dateSel.innerHTML='<option value="">등록 경기일 선택</option>'+seasonDates.slice().reverse().map(d=>'<option value="'+esc(d)+'"'+(d===recordDate?' selected':'')+'>'+esc(d)+'</option>').join("");
  const rangeOpts=seasonDates.map(d=>'<option value="'+esc(d)+'">'+esc(d)+'</option>').join("");
  if($("#recordStartSel")) $("#recordStartSel").innerHTML=(rangeOpts||'<option value="">경기일 없음</option>');
  if($("#recordEndSel")) $("#recordEndSel").innerHTML=(rangeOpts||'<option value="">경기일 없음</option>');
  if($("#recordStartSel")) $("#recordStartSel").value=recordStart||"";
  if($("#recordEndSel")) $("#recordEndSel").value=recordEnd||"";
  const needsYear=recordMode!=="LATEST";
  if($("#recordYearWrap")) $("#recordYearWrap").style.display=needsYear?"block":"none";
  if($("#recordSegmentWrap")) $("#recordSegmentWrap").style.display=(recordMode==="H1" || recordMode==="H2")?"block":"none";
  if($("#recordDateWrap")) $("#recordDateWrap").style.display=recordMode==="DAY"?"block":"none";
  if($("#recordRangeWrap")) $("#recordRangeWrap").style.display=recordMode==="RANGE"?"block":"none";
  renderRecordSeasonSettings();
  const info=recordQueryInfo();
  if($("#recordQueryNote")) $("#recordQueryNote").innerHTML='<b>조회 기준:</b> '+esc(info.basis)+' · 상·하반기 선택 시 저장된 구간 일정으로 세부 조회 가능 · 상단 대회 필터 '+(comp==="ALL"?'전체 대회':'「'+esc(comp)+'」')+' 적용 · 동일 경기 중복 행은 한 번만 계산합니다.';
}
function renderLinkedRecordControls(prefix){
  ensureRecordState();
  const years=recordYears(), seasonDates=recordDatesForYear(recordYear);
  const modeEl=$("#"+prefix+"RecordMode"), yearEl=$("#"+prefix+"RecordYear"), dateEl=$("#"+prefix+"RecordDate"), dateSel=$("#"+prefix+"RecordDateSel"), segmentEl=$("#"+prefix+"RecordSegment");
  if(!modeEl) return;
  modeEl.value=recordMode==="YEAR"?"SEASON":recordMode;
  if(yearEl) yearEl.innerHTML=(years.length?years:[String(new Date().getFullYear())]).map(y=>'<option value="'+esc(y)+'"'+(y===recordYear?' selected':'')+'>'+esc(y)+' 시즌</option>').join("");
  ensureRecordSegment();
  if(segmentEl && (recordMode==="H1" || recordMode==="H2")) segmentEl.innerHTML=recordSegmentOptionsHtml(recordYear,recordMode);
  if(dateEl) dateEl.value=recordDate||"";
  if(dateSel) dateSel.innerHTML='<option value="">등록 경기일 선택</option>'+seasonDates.slice().reverse().map(d=>'<option value="'+esc(d)+'"'+(d===recordDate?' selected':'')+'>'+esc(d)+'</option>').join("");
  const rangeOpts=seasonDates.map(d=>'<option value="'+esc(d)+'">'+esc(d)+'</option>').join("");
  const startEl=$("#"+prefix+"RecordStartSel"), endEl=$("#"+prefix+"RecordEndSel");
  if(startEl){ startEl.innerHTML=rangeOpts||'<option value="">경기일 없음</option>'; startEl.value=recordStart||""; }
  if(endEl){ endEl.innerHTML=rangeOpts||'<option value="">경기일 없음</option>'; endEl.value=recordEnd||""; }
  const needsYear=recordMode!=="LATEST";
  const yearWrap=$("#"+prefix+"RecordYearWrap"), segmentWrap=$("#"+prefix+"RecordSegmentWrap"), dateWrap=$("#"+prefix+"RecordDateWrap"), rangeWrap=$("#"+prefix+"RecordRangeWrap");
  if(yearWrap) yearWrap.style.display=needsYear?"block":"none";
  if(segmentWrap) segmentWrap.style.display=(recordMode==="H1" || recordMode==="H2")?"block":"none";
  if(dateWrap) dateWrap.style.display=recordMode==="DAY"?"block":"none";
  if(rangeWrap) rangeWrap.style.display=recordMode==="RANGE"?"block":"none";
  const info=recordQueryInfo(), note=$("#"+prefix+"RecordQueryNote");
  if(note) note.innerHTML='<b>조회 기준:</b> '+esc(info.basis)+' · '+esc(info.label)+' · 상단 대회 필터 '+(comp==="ALL"?'전체 대회':'「'+esc(comp)+'」')+' 적용 · 상·하반기 기간은 종합기록의 경기 기록 조회에서 설정합니다.';
}
function scopedPeriodInfo(kind){
  ensureRecordState();
  const years=recordYears(), latest=recordDates()[0]||"";
  let mode=kind==="ranking"?rankingRangeMode:h2hRangeMode;
  let year=kind==="ranking"?rankingRangeYear:h2hRangeYear;
  let startSel=kind==="ranking"?rankingRangeStart:h2hRangeStart;
  let endSel=kind==="ranking"?rankingRangeEnd:h2hRangeEnd;
  let segment=kind==="ranking"?rankingRangeSegment:h2hRangeSegment;
  if(!year||!years.includes(year)) year=recordYear||years[0]||(latest?latest.slice(0,4):"");
  const dates=recordDatesForYear(year);
  if(!startSel||!dates.includes(startSel)) startSel=dates[0]||(year?year+"-01-01":"");
  if(!endSel||!dates.includes(endSel)) endSel=dates[dates.length-1]||(year?year+"-12-31":"");
  let start="",end="",label="",halfKey="",segmentIndex=-1;
  const c=seasonCfg(year);
  if(!mode){
    const ctx=latestDbPeriodContext(dates[dates.length-1]||latest);
    mode=(ctx&&ctx.year===year)?ctx.half:((dates[dates.length-1]||latest)>=c.h2s?"H2":"H1");
    segment=(ctx&&ctx.year===year)?ctx.segment:"ALL";
  }
  if(mode==="SEASON"){start=c.h1s;end=c.h2e;label=year+" 시즌 전체";segment="ALL";}
  else if(mode==="H1" || mode==="H2"){
    halfKey=mode;
    const segs=recordHalfSegmentList(year,mode);
    if(segment!=="ALL"){const i=parseInt(segment,10)-1;if(Number.isInteger(i)&&i>=0&&i<segs.length) segmentIndex=i;else segment="ALL";}
    if(segmentIndex>=0){const seg=segs[segmentIndex];start=normDate(seg.s);end=normDate(seg.e);label=year+" 시즌 "+(mode==="H2"?"하반기":"상반기")+" "+(segmentIndex+1)+"구간";}
    else {start=mode==="H2"?c.h2s:c.h1s;end=mode==="H2"?c.h2e:c.h1e;label=year+" 시즌 "+(mode==="H2"?"하반기":"상반기");}
  }
  else if(mode==="RANGE"){start=normDate(startSel);end=normDate(endSel);if(start&&end&&start>end){const x=start;start=end;end=x;}label=(start||"시작")+" ~ "+(end||"종료");segment="ALL";}
  else {mode="H1";halfKey="H1";start=c.h1s;end=c.h1e;label=year+" 시즌 상반기";}
  if(kind==="ranking"){rankingRangeMode=mode;rankingRangeYear=year;rankingRangeStart=startSel;rankingRangeEnd=endSel;rankingRangeSegment=segment||"ALL";}
  else {h2hRangeMode=mode;h2hRangeYear=year;h2hRangeStart=startSel;h2hRangeEnd=endSel;h2hRangeSegment=segment||"ALL";}
  const list=uniqueRecordMatches(recordBaseMatches().filter(m=>{const d=normDate(m.date);return d&&(!start||d>=start)&&(!end||d<=end);})).sort((a,b)=>normDate(b.date).localeCompare(normDate(a.date))||String(a.no||"").localeCompare(String(b.no||""),undefined,{numeric:true}));
  const latestInScope=list.map(m=>normDate(m.date)).filter(Boolean).sort().pop()||"";
  const activeHalf=halfKey||(latestInScope?(latestInScope>=c.h2s?"H2":"H1"):"");
  return {start,end,label,list,year,mode,half:activeHalf,segment:segment||"ALL",segmentIndex,asOf:latestInScope||end};
}
function rankingQueryInfo(){return scopedPeriodInfo("ranking");}
function h2hQueryInfo(){return scopedPeriodInfo("h2h");}
/* 랭킹 5종의 조회기간 표기는 세부 구간 날짜가 아니라 해당 시즌의 상/하반기를 명확하게 보여준다. */
function rankingHalfPeriodLabel(info){
  info=info||{};
  const year=String(info.year||"");
  let h=String(info.half||"");
  if(!h && (info.mode==="H1"||info.mode==="H2")) h=info.mode;
  if(!h && year){
    const c=seasonCfg(year), d=normDate(info.asOf||info.end||info.start||"");
    if(d) h=d>=c.h2s?"H2":"H1";
  }
  if(year && (h==="H1"||h==="H2")) return year+"년 "+(h==="H2"?"하반기":"상반기");
  return info.label||"조회 기간";
}
function renderDashboardPeriodControls(){
  const years=recordYears();
  const render=(kind)=>{
    const info=scopedPeriodInfo(kind), prefix=kind==="ranking"?"ranking":"h2h";
    const modeEl=$("#"+prefix+"RangeMode"), yearEl=$("#"+prefix+"RangeYear"), segmentEl=$("#"+prefix+"RangeSegment"), startEl=$("#"+prefix+"RangeStart"), endEl=$("#"+prefix+"RangeEnd");
    if(modeEl) modeEl.value=info.mode;
    if(yearEl) yearEl.innerHTML=(years.length?years:[info.year]).filter(Boolean).map(y=>'<option value="'+esc(y)+'"'+(y===info.year?' selected':'')+'>'+esc(y)+' 시즌</option>').join("");
    if(segmentEl && (info.mode==="H1"||info.mode==="H2")){
      const segs=recordHalfSegmentList(info.year,info.mode);
      const halfName=info.mode==="H2"?"하반기":"상반기";
      segmentEl.innerHTML='<option value="ALL"'+(info.segment==="ALL"?' selected':'')+'>'+halfName+' 전체</option>'+segs.map((seg,i)=>'<option value="'+(i+1)+'"'+(String(info.segment)===String(i+1)?' selected':'')+'>'+(i+1)+'구간 · '+esc(seg.s||'-')+' ~ '+esc(seg.e||'-')+'</option>').join('');
    }
    const segWrap=$$(kind==="ranking"?".ranking-segment-only":".h2h-segment-only"); segWrap.forEach(el=>el.style.display=(info.mode==="H1"||info.mode==="H2")?"block":"none");
    const dates=recordDatesForYear(info.year), opts=dates.map(d=>'<option value="'+esc(d)+'">'+esc(d)+'</option>').join("");
    if(startEl){startEl.innerHTML=opts||'<option value="">경기일 없음</option>';startEl.value=kind==="ranking"?rankingRangeStart:h2hRangeStart;}
    if(endEl){endEl.innerHTML=opts||'<option value="">경기일 없음</option>';endEl.value=kind==="ranking"?rankingRangeEnd:h2hRangeEnd;}
    const rangeOnly=$$(kind==="ranking"?".ranking-range-only":".h2h-range-only"); rangeOnly.forEach(el=>el.style.display=info.mode==="RANGE"?"block":"none");
    const note=$("#"+prefix+"RangeNote");
    if(note){
      if(kind==="ranking"){
        const scope=halfTeamRankingInfo(info);
        note.textContent=scope.label+' · '+scope.list.length+'경기 · 모든 랭킹은 정규·인터리그 반기 전체 누적 · 구간·대회 필터로 누적값을 제한하지 않습니다.';
      }else{
        note.innerHTML='<b>'+esc(info.label)+'</b> · '+info.list.length+'경기 · DB 최종일 기준 기본조회 · 상단 대회 필터 '+(comp==="ALL"?'전체 대회':'「'+esc(comp)+'」')+' 적용';
      }
    }
  };
  render("ranking"); render("h2h");
}
function recordMatchRoundNumber(m){
  const no=String(m&&m.no||'').normalize('NFKC').trim();
  // 경기번호 13R-A의 13R을 최우선으로 사용한다. 1경기 / 1A는 라운드가 아니다.
  const hit=no.match(/^(\d+)\s*R(?:\s*[-–—_.]?\s*[AB])?$/i);
  return hit?Number(hit[1]):abilityMatchRoundNumber(m);
}
function recordRoundRangeLabel(list){
  const rows=uniqueRecordMatches(list||[]), rounds=rows.map(recordMatchRoundNumber).filter(n=>n>0);
  if(!rounds.length)return '라운드 미등록';
  const min=Math.min(...rounds), max=Math.max(...rounds), missing=rows.length-rounds.length;
  return (min===max?min+'R':min+'R ~ '+max+'R')+(missing?' · 미등록 '+missing+'경기':'');
}
function halfTeamRankingInfo(info){
  info=info||{};
  const dates=(info.list||[]).map(m=>normDate(m.date)).filter(Boolean).sort();
  const reference=normDate(info.asOf)||dates[dates.length-1]||normDate(info.end)||normDate(info.start);
  const year=String(info.year||(reference||'').slice(0,4));
  const cfg=seasonCfg(year);
  const explicit=/^(H1|H2)$/.test(info.mode)?info.mode:info.half;
  const half=/^(H1|H2)$/.test(explicit)?explicit:(reference && reference>=cfg.h2s?'H2':'H1');
  const start=half==='H2'?cfg.h2s:cfg.h1s, end=half==='H2'?cfg.h2e:cfg.h1e;
  // 반기 전체 정규·인터리그 기록. 세부 구간이나 대회 필터로 누적 점수를 잘라내지 않는다.
  const list=uniqueRecordMatches((DB.matches||[]).filter(m=>{
    const d=normDate(m.date);
    return /^20\d{2}$/.test(year)&&d>=start&&d<=end&&(isRegularComp(m.comp)||isInterleagueComp(m.comp));
  }));
  return {year,half,mode:half,start,end,asOf:end,list,label:year+'년 '+(half==='H2'?'하반기':'상반기')+' 전체'};
}
function halfTeamRanking(info){
  const scope=halfTeamRankingInfo(info), attendance=teamAttendanceCounts(scope.list);
  const detail=representativePointsDetailForList(scope.list,scope,{representativeOnly:true});
  const map=new Map(statsFromMatches(scope.list).map(t=>[t.team,{...t}]));
  Object.keys(detail.totals).forEach(team=>{if(!map.has(team))map.set(team,{team,p:0,w:0,d:0,l:0,gf:0,ga:0,f:0,pts:0});});
  const teams=[...map.values()].map(t=>({...t,representative:num(detail.totals[t.team]),attendance:num(attendance[t.team])}));
  teams.sort((a,b)=>b.representative-a.representative || b.attendance-a.attendance || b.pts-a.pts || leagueTeamDisplayOrder(a.team)-leagueTeamDisplayOrder(b.team) || a.team.localeCompare(b.team,'ko'));
  const ranks=sharedRanks(teams,t=>[t.representative,t.attendance,t.pts].join('|'));
  return {scope,detail,teams,ranks};
}
function teamAttendanceCounts(list){
  /* 팀 누적 참석수는 경기 수가 아니라 "참석한 날짜" 기준으로 집계한다.
     같은 선수가 같은 날 같은 팀으로 여러 경기에 출전해도 참석 1회로 계산한다. */
  const matchesInScope=uniqueRecordMatches(list||[]);
  const dateByMatchId=new Map(matchesInScope.map(m=>[m.id,normDate(m.date)]));
  const seen=new Set(), totals={};
  DB.attendance.forEach(a=>{
    const date=dateByMatchId.get(a.id);
    const team=String(a.team||"").trim(), player=String(a.player||"").trim();
    if(!date||!team||!player) return;
    const k=date+"|"+team+"|"+player;
    if(seen.has(k)) return;
    seen.add(k);
    totals[team]=(totals[team]||0)+1;
  });
  return totals;
}
function representativeSegmentQueryIncluded(seg,info,list,scoreMode){
  const mode=String((info&&info.mode)||'').toUpperCase();
  const year=String((info&&info.year)||seg.year||'');
  if(year && seg.year!==year) return false;
  const cfg=seasonCfg(seg.year);
  const pointMode=String(scoreMode||seg.mode||'REP').toUpperCase()==='IND'?'IND':'REP';
  let asOf=normDate((info&&info.asOf)||(info&&info.end)||(info&&info.start));
  let activeHalf=String((info&&info.half)||'');
  if(!activeHalf && mode==='H1') activeHalf='H1';
  if(!activeHalf && mode==='H2') activeHalf='H2';
  if(!activeHalf && asOf) activeHalf=asOf>=cfg.h2s?'H2':'H1';
  /* 상반기 조회에서는 상반기 대표승점만, 하반기 조회에서는 하반기 대표승점만 사용한다.
     과거처럼 하반기에 상반기 대표승점을 이월해 합산하지 않는다. */
  if(activeHalf && seg.half!==activeHalf) return false;
  if(!asOf){
    if(activeHalf==='H1') asOf=cfg.h1e;
    else if(activeHalf==='H2') asOf=cfg.h2e;
  }
  if(!asOf){const dates=(list||[]).map(m=>normDate(m.date)).filter(Boolean).sort();asOf=dates.length?dates[dates.length-1]:'';}
  if(!asOf) return false;
  if(pointMode==='REP') return !!seg.end && seg.end<=asOf;
  return !!seg.start && seg.start<=asOf;
}
function representativeEligibleMatches(){
  /* 대표/구간승점은 관리자에게 확정된 시즌 운영 점수이므로 현재 화면의 대회 필터(comp)에 의해
     사라지면 안 된다. 전체 Excel DB에서 토너먼트만 제외하고 계산한다.
     이렇게 하면 과거 파일의 '정규리그' 표기가 조금 달라도 완료 구간이 0점이 되는 문제를 막는다. */
  return uniqueRecordMatches((DB.matches||[]).filter(m=>!tournamentCompName(m.comp)));
}
function representativeLeagueMembershipForSegment(sourceList,year,asOf){
  const out=leagueMembershipForList(sourceList||[]);
  const teams=[...new Set((sourceList||[]).flatMap(m=>[m.home,m.away]).filter(Boolean))];
  const missing=()=>teams.filter(t=>!out[t]);
  if(!missing().length) return out;

  /* 구간 안에 그룹 값이 일부 비어 있으면 같은 시즌에서 해당 구간 종료일까지 가장 최근에
     기록된 Excel 그룹 값을 찾아 보완한다. */
  const history=uniqueRecordMatches((DB.matches||[]).filter(m=>{
    const d=normDate(m.date);
    return d && d.slice(0,4)===String(year) && (!asOf || d<=asOf) && !tournamentCompName(m.comp);
  })).sort((a,b)=>normDate(b.date).localeCompare(normDate(a.date)));
  missing().forEach(team=>{
    for(const m of history){
      if(m.home!==team && m.away!==team) continue;
      const code=matchTeamGroup(m,team);
      if(code){out[team]=code;break;}
    }
  });

  /* 마지막 보완: 해당 구간 마지막 경기일의 기존 리그 판정 로직을 사용한다. */
  const dates=(sourceList||[]).map(m=>normDate(m.date)).filter(Boolean).sort();
  const fallback=dates.length?leagueMembership(dates[dates.length-1]):{};
  missing().forEach(team=>{if(fallback[team]) out[team]=fallback[team];});

  /* GGFC는 슈퍼/챌린지 각 3팀 운영이 기본이다. 엑셀의 일부 과거 행에서 그룹 셀이
     비어 있어 마지막까지 소속을 못 찾은 팀이 있을 때만, 이미 판정된 A/B 수를 기준으로
     남은 팀을 3:3이 되도록 보완한다. 명시된 그룹 값은 절대 덮어쓰지 않는다. */
  const unresolved=missing();
  if(teams.length===6 && unresolved.length){
    let aCount=teams.filter(t=>out[t]==="A").length;
    let bCount=teams.filter(t=>out[t]==="B").length;
    unresolved.slice().sort((a,b)=>leagueTeamDisplayOrder(a)-leagueTeamDisplayOrder(b)||a.localeCompare(b,"ko")).forEach(team=>{
      if(aCount<3 && (aCount<=bCount || bCount>=3)){out[team]="A";aCount++;}
      else {out[team]="B";bCount++;}
    });
  }
  return out;
}
function representativeFinalSnapshotForSegment(year,seg){
  const start=normDate(seg&&seg.s), end=normDate(seg&&seg.e);
  const sourceList=uniqueRecordMatches(representativeEligibleMatches().filter(m=>{
    const d=normDate(m.date);
    return d&&d.slice(0,4)===String(year)&&d>=start&&d<=end;
  }));
  const membership=representativeLeagueMembershipForSegment(sourceList,String(year),end);
  const stats=statsFromMatches(sourceList);
  const finalPoints={}, finalStandings={A:[],B:[]};
  ["A","B"].forEach(code=>{
    const leagueTeams=stats.filter(t=>membership[t.team]===code)
      .sort((a,b)=>b.pts-a.pts || (b.gf-b.ga)-(a.gf-a.ga) || b.gf-a.gf || a.team.localeCompare(b.team));
    finalStandings[code]=leagueTeams.map((t,i)=>({rank:i+1,team:t.team,pts:t.pts,gd:t.gf-t.ga,gf:t.gf}));
    [5,3,1].forEach((point,i)=>{const t=leagueTeams[i];if(t) finalPoints[t.team]=point;});
  });
  return {finalPoints,finalStandings,finalGames:sourceList.length,finalizedAt:new Date().toISOString()};
}
function representativeSegmentsWithFinalization(year,half,list,existing){
  const old=Array.isArray(existing)?existing:[];
  return (list||[]).map((seg,i)=>{
    const next=Object.assign({},seg);
    const mode=String(next.mode||'REP').toUpperCase()==='IND'?'IND':'REP';
    if(mode==='REP' && next.complete===true){
      const prev=old[i]||{};
      const same=normDate(prev.s)===normDate(next.s)&&normDate(prev.e)===normDate(next.e)&&String(prev.mode||'REP').toUpperCase()==='REP'&&prev.complete===true;
      if(same && prev.finalPoints && typeof prev.finalPoints==='object'){
        next.finalPoints=Object.assign({},prev.finalPoints);
        next.finalStandings=prev.finalStandings?JSON.parse(JSON.stringify(prev.finalStandings)):null;
        next.finalGames=Number(prev.finalGames||0);
        next.finalizedAt=String(prev.finalizedAt||'');
      }else{
        Object.assign(next,representativeFinalSnapshotForSegment(year,next));
      }
    }else{
      delete next.finalPoints; delete next.finalStandings; delete next.finalGames; delete next.finalizedAt;
    }
    return next;
  });
}
function representativePointsDetailForList(list,info,options){
  const queryList=uniqueRecordMatches(list||[]), totals={}, segments=[], representativeOnly=!!(options&&options.representativeOnly);
  const explicitYear=String((info&&info.year)||"");
  const queryYears=[...new Set(queryList.map(m=>normDate(m.date).slice(0,4)).filter(y=>/^\d{4}$/.test(y)&&parseInt(y,10)>=2026))];
  /* 팀순위 조회에서 시즌이 명시되면 경기 유무와 관계없이 그 시즌의 저장 설정을 직접 읽는다. */
  const years=(explicitYear&&parseInt(explicitYear,10)>=2026?[explicitYear]:queryYears).sort();
  const eligibleAll=representativeEligibleMatches();

  years.forEach(y=>{
    const cfg=seasonCfg(y);
    ["H1","H2"].forEach(halfKey=>{
      const halfList=(cfg.repSegments&&cfg.repSegments[halfKey])||[];
      halfList.forEach((seg,segIndex)=>{
        const mode=String(seg&&seg.mode||"REP").toUpperCase()==="IND"?"IND":"REP";
        const descriptor={
          year:y,half:halfKey,index:segIndex+1,start:normDate(seg.s),end:normDate(seg.e),
          complete:seg.complete===true,enabled:cfg.repEnabled===true,mode
        };
        descriptor.inQuery=!representativeOnly || mode==="REP" ? representativeSegmentQueryIncluded(descriptor,info,queryList,mode) : false;
        if(representativeOnly && mode!=="REP"){ segments.push(descriptor); return; }

        let sourceList=uniqueRecordMatches(eligibleAll.filter(m=>{
          const d=normDate(m.date);
          return d&&d.slice(0,4)===y&&d>=descriptor.start&&d<=descriptor.end;
        }));

        /* 완료된 대표승점 구간은 관리자 확정값이므로, 과거 데이터의 대회명 표기 차이 등으로
           1차 대상 목록이 비어 버리면 동일 날짜 범위의 전체 비토너먼트 경기에서 한 번 더 복구한다. */
        if(mode==="REP" && descriptor.complete && !sourceList.length){
          sourceList=uniqueRecordMatches((DB.matches||[]).filter(m=>{
            const d=normDate(m.date);
            return d&&d.slice(0,4)===y&&d>=descriptor.start&&d<=descriptor.end&&!tournamentCompName(m.comp);
          }));
        }

        /* 개별승점 구간을 날짜/기간으로 조회할 때 선택 종료일 이후 경기는 포함하지 않는다. */
        const queryMode=String((info&&info.mode)||"").toUpperCase();
        const asOf=normDate((info&&info.end)||(info&&info.start));
        if(mode==="IND" && asOf && (queryMode==="DAY"||queryMode==="LATEST"||queryMode==="RANGE")){
          sourceList=sourceList.filter(m=>normDate(m.date)<=asOf);
        }
        descriptor.games=sourceList.length;
        descriptor.leagues=[];
        if(!descriptor.enabled || !descriptor.inQuery){segments.push(descriptor);return;}
        if(mode==="REP" && !descriptor.complete){segments.push(descriptor);return;}

        /* 관리자가 구간완료한 대표승점 구간은 완료 시점에 저장한 최종 순위 스냅샷을 우선 사용한다.
           이렇게 하면 이후 조회기간/대회필터가 달라져도 확정된 5·3·1점이 팀순위에서 사라지지 않는다. */
        if(mode==="REP" && descriptor.complete && seg.finalPoints && typeof seg.finalPoints==='object'){
          Object.entries(seg.finalPoints).forEach(([team,point])=>{ totals[team]=(totals[team]||0)+Number(point||0); });
          const standings=(seg.finalStandings&&typeof seg.finalStandings==='object')?seg.finalStandings:{};
          ["A","B"].forEach(code=>{
            const rows=Array.isArray(standings[code])?standings[code]:[];
            const awards=rows.slice(0,3).map(r=>({rank:Number(r.rank||0),team:r.team,appliedPoint:Number(seg.finalPoints[r.team]||0),repPoint:Number(seg.finalPoints[r.team]||0),pts:Number(r.pts||0),gd:Number(r.gd||0),gf:Number(r.gf||0)}));
            descriptor.leagues.push({code,label:leagueGroupLabel(code)||code,teams:rows.length,awards});
          });
          descriptor.games=Number(seg.finalGames||0);
          descriptor.finalizedAt=String(seg.finalizedAt||'');
          segments.push(descriptor);return;
        }

        const membership=representativeLeagueMembershipForSegment(sourceList,y,descriptor.end);
        const segmentStats=statsFromMatches(sourceList);
        ["A","B"].forEach(code=>{
          const leagueTeams=segmentStats
            .filter(t=>membership[t.team]===code)
            .sort((a,b)=>b.pts-a.pts || (b.gf-b.ga)-(a.gf-a.ga) || b.gf-a.gf || a.team.localeCompare(b.team));
          const awards=[];
          if(mode==="REP"){
            [5,3,1].forEach((appliedPoint,i)=>{
              const t=leagueTeams[i]; if(!t) return;
              totals[t.team]=(totals[t.team]||0)+appliedPoint;
              awards.push({rank:i+1,team:t.team,appliedPoint,repPoint:appliedPoint,pts:t.pts,gd:t.gf-t.ga,gf:t.gf});
            });
          }else{
            leagueTeams.forEach((t,i)=>{
              const appliedPoint=Number(t.pts||0);
              totals[t.team]=(totals[t.team]||0)+appliedPoint;
              awards.push({rank:i+1,team:t.team,appliedPoint,individualPoint:appliedPoint,pts:t.pts,gd:t.gf-t.ga,gf:t.gf});
            });
          }
          descriptor.leagues.push({code,label:leagueGroupLabel(code)||code,teams:leagueTeams.length,awards});
        });
        segments.push(descriptor);
      });
    });
  });
  return {totals,segments};
}
function representativePointsForList(list,info){ return representativePointsDetailForList(list,info).totals; }
function renderRepresentativePointBreakdown(detail,info){
  const box=$("#dashRepresentativePointBreakdown"); if(!box) return;
  const year=parseInt((info&&info.year)||0,10);
  if(!year || year<2026){
    box.innerHTML='<div class="rep-breakdown-note" data-dashboard-admin data-export-ignore><span class="rep-status-chip off">미적용</span> 구간별 승점 운영은 2026년 기록부터 적용됩니다.</div>'; return;
  }
  const cfg=seasonCfg(String(year));
  if(!cfg.repEnabled){
    box.innerHTML='<div class="rep-breakdown-note" data-dashboard-admin data-export-ignore><span class="rep-status-chip off">OFF</span> '+year+'년 구간별 승점 운영이 꺼져 있습니다. 관리자 상단 <b>대표승점</b> 메뉴에서 적용할 수 있습니다.</div>'; return;
  }
  const segments=(detail&&detail.segments||[]).filter(x=>x.year===String(year));
  const relevant=segments.filter(x=>x.inQuery);
  if(!relevant.length){
    box.innerHTML='<div class="rep-breakdown-note" data-dashboard-admin data-export-ignore><span class="rep-status-chip off">0점</span> 현재 조회기간에 포함되는 승점 구간이 없습니다.</div>'; return;
  }
  const cards=relevant.map(seg=>{
    const title=(seg.half==="H2"?'하반기 ':'상반기 ')+seg.index+'구간';
    const isIndividual=seg.mode==="IND";
    const modeChip='<span class="rep-mode-chip'+(isIndividual?' ind':'')+'">'+(isIndividual?'개별승점':'대표승점')+'</span>';
    if(!isIndividual && !seg.complete){
      return '<div class="rep-segment-card"><div class="rep-segment-head"><span>'+title+' '+modeChip+' <span class="rep-status-chip off">미완료</span></span><span>'+esc(seg.start)+' ~ '+esc(seg.end)+' · '+seg.games+'경기</span></div><div class="rep-breakdown-note" data-dashboard-admin data-export-ignore>대표승점 구간은 관리자가 구간완료 처리하기 전까지 슈퍼리그·챌린지리그 모두 0점으로 처리됩니다.</div></div>';
    }
    const leagues=(seg.leagues||[]).map(l=>{
      const awards=l.awards&&l.awards.length?l.awards.map(a=>'<div class="rep-award-row"><span class="rep-award-rank">'+a.rank+'위</span><span class="rep-award-team">'+esc(teamDisplayName(a.team))+'</span><span class="rep-award-pts">+'+Number(a.appliedPoint||0)+'점</span><span class="muted">'+(isIndividual?'(경기 승점)':'(구간 승점 '+a.pts+')')+'</span></div>').join(''):'<div class="muted" style="font-size:11px">순위 산출 데이터 없음</div>';
      return '<div style="margin-top:7px"><div style="font-size:11px;font-weight:950;color:var(--pl-purple);margin-bottom:3px">'+esc(l.label)+'</div>'+awards+'</div>';
    }).join('');
    const state=isIndividual?'<span class="rep-status-chip">경기별 반영</span>':'<span class="rep-status-chip">완료</span>';
    return '<div class="rep-segment-card"><div class="rep-segment-head"><span>'+title+' '+modeChip+' '+state+'</span><span>'+esc(seg.start)+' ~ '+esc(seg.end)+' · '+seg.games+'경기</span></div>'+leagues+'</div>';
  }).join('');
  const totalPairs=Object.entries(detail.totals||{}).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).map(([t,p])=>esc(teamDisplayName(t))+' '+p+'점').join(' · ');
  const repComplete=relevant.filter(x=>x.mode!=="IND"&&x.complete).length;
  const repPending=relevant.filter(x=>x.mode!=="IND"&&!x.complete).length;
  const indCount=relevant.filter(x=>x.mode==="IND").length;
  box.innerHTML='<details class="rep-breakdown"><summary>구간별 승점 산출 내역 확인 '+(repComplete?'<span class="rep-status-chip">대표 완료 '+repComplete+'</span>':'')+(repPending?' <span class="rep-status-chip off">대표 미완료 '+repPending+'</span>':'')+(indCount?' <span class="rep-mode-chip ind">개별 '+indCount+'구간</span>':'')+'</summary><div class="rep-breakdown-note" data-dashboard-admin data-export-ignore>'+esc(info.label)+' 기준 · 대표승점은 현재 조회 반기의 완료 구간만 반영 · 다른 반기 및 개별승점 구간은 팀 순위 대표승점에서 제외 · '+(totalPairs||'확정 적용승점 없음')+'</div><div class="rep-breakdown-grid">'+cards+'</div></details>';
}

function refreshRecordLinkedViews(){
  renderRecentMatches();
  renderTeam();
  renderPlayer();
}
function leagueMembershipForList(list){
  const ms=uniqueRecordMatches(list||[]).slice().sort((a,b)=>normDate(a.date).localeCompare(normDate(b.date)));
  const latest={};
  ms.forEach(m=>{
    const d=normDate(m.date);
    [m.home,m.away].filter(Boolean).forEach(team=>{
      const code=matchTeamGroup(m,team);
      if(code && (!latest[team] || d>=latest[team].date)) latest[team]={date:d,code};
    });
  });
  const dates=[...new Set(ms.map(m=>normDate(m.date)).filter(Boolean))].sort();
  const fallback=dates.length?leagueMembership(dates[dates.length-1]):{};
  const out={};
  const teams=[...new Set(ms.flatMap(m=>[m.home,m.away]).filter(Boolean))];
  teams.forEach(team=>{
    if(latest[team]) out[team]=latest[team].code;
    else if(fallback[team]) out[team]=fallback[team];
  });
  return out;
}
function teamStandingGroupedHtml(list){
  const ts=statsFromMatches(list), membership=leagueMembershipForList(list), attendanceTotals=teamAttendanceCounts(list);
  const groups={A:[],B:[]};
  ts.forEach(t=>{
    const code=membership[t.team] || "A";
    (groups[code==="B"?"B":"A"]).push(t);
  });
  const head='<thead><tr><th aria-label="리그"></th><th>순위</th><th>팀</th><th class="num">경기</th><th class="num">승점</th><th class="num">참석수</th><th class="num">승</th><th class="num">무</th><th class="num">패</th><th class="num">득점</th><th class="num">실점</th><th class="num">득실</th><th class="num">파울</th><th class="num">승률</th></tr></thead>';
  let body='';
  ["A","B"].forEach(code=>{
    const rows=groups[code].slice(0,3);
    if(!rows.length) return;
    const logo=leagueLogo(code), label=leagueGroupLabel(code)||code;
    const emblem=logo?'<div class="league-standing-emblem"><img src="'+logo+'" alt="'+esc(label)+' 로고"></div>':'<div class="league-standing-emblem"><span class="league-standing-fallback">'+esc(label)+'</span></div>';
    rows.forEach((t,i)=>{
      const diff=t.gf-t.ga;
      body+='<tr class="'+(code==="B"&&i===0?'league-b-start':'')+'">'+
        (i===0?'<td class="league-standing-cell" rowspan="'+rows.length+'">'+emblem+'</td>':'')+
        '<td><span class="rank top league-standing-rank rank-'+(i+1)+'">'+(i+1)+'</span></td>'+
        '<td>'+teamChip(t.team)+'</td>'+
        '<td class="num">'+t.p+'</td><td class="num"><b>'+t.pts+'</b></td><td class="num"><b>'+Number(attendanceTotals[t.team]||0)+'</b></td>'+
        '<td class="num">'+t.w+'</td><td class="num">'+t.d+'</td><td class="num">'+t.l+'</td>'+
        '<td class="num">'+t.gf+'</td><td class="num">'+t.ga+'</td><td class="num">'+(diff>0?'+':'')+diff+'</td><td class="num">'+(t.f||0)+'</td>'+
        '<td class="num">'+pct(t.w,t.p)+'%</td></tr>';
    });
  });
  if(!body) return '<div class="empty">선택한 조회 구간에 팀 순위 기록이 없습니다.</div>';
  return '<table class="team-league-standing">'+head+'<tbody>'+body+'</tbody></table>';
}
function teamStandingFromList(el,list){
  el.innerHTML=teamStandingGroupedHtml(list);
}
function queryRosterStats(list){
  const ps=queryPlayerStats(list), byName={}; ps.forEach(p=>byName[p.player]=p);
  const years=[...new Set((list||[]).map(m=>normDate(m.date).slice(0,4)).filter(y=>/^\d{4}$/.test(y)))];
  const targetYear=years.length===1?years[0]:recordYear;
  const teamGames={}; uniqueRecordMatches(list||[]).forEach(m=>[m.home,m.away].forEach(t=>{if(t) teamGames[t]=(teamGames[t]||0)+1;}));
  const out=DB.roster.filter(r=>r.player && !isOwnGoalPlayer(r.player) && (!r.year || !targetYear || String(r.year)===targetYear)).map(r=>{
    const p=byName[r.player]||{att:0,g:0}, team=r.team||p.mainTeam||"-", tg=teamGames[team]||0;
    return {year:r.year,team,no:r.no,player:r.player,pos:r.pos,memo:r.memo,att:p.att||0,g:p.g||0,teamGames:tg,rate:pct(p.att||0,tg)};
  });
  const known=new Set(out.map(r=>r.player));
  ps.filter(p=>!known.has(p.player)&&p.att>0).forEach(p=>out.push({year:targetYear||"",team:p.mainTeam,no:"",player:p.player,pos:"",memo:"명단 미등록",att:p.att,g:p.g,teamGames:p.teamGames,rate:p.attendanceRate}));
  return out.sort((a,b)=>(a.team||"").localeCompare(b.team||"")||b.att-a.att||b.g-a.g);
}

function statsFromMatches(list){
  const t={}, foulIndex=personalTeamFoulIndex(list);
  const get=n=>t[n]||(t[n]={team:n,p:0,w:0,d:0,l:0,gf:0,ga:0,f:0,pts:0});
  list.forEach(m=>{
    if(!m.home||!m.away) return;
    const H=get(m.home), A=get(m.away), hs=num(m.hs), as=num(m.as);
    H.p++; A.p++; H.gf+=hs; H.ga+=as; A.gf+=as; A.ga+=hs; const fouls=matchTeamFouls(m,foulIndex); H.f+=fouls.home; A.f+=fouls.away;
    const hr=matchResult(m,m.home), ar=matchResult(m,m.away);
    if(hr==="W"){H.w++;H.pts+=3;} else if(hr==="D"){H.d++;H.pts++;} else H.l++;
    if(ar==="W"){A.w++;A.pts+=3;} else if(ar==="D"){A.d++;A.pts++;} else A.l++;
  });
  return Object.values(t).sort((a,b)=>b.pts-a.pts || (b.gf-b.ga)-(a.gf-a.ga) || b.gf-a.gf || a.team.localeCompare(b.team));
}
function queryPlayerStats(list){
  const ms=uniqueRecordMatches(list||[]), ids=new Set(ms.map(m=>m.id)), M={};
  ms.forEach(m=>M[m.id]=m);
  const players={};
  const get=name=>players[name]||(players[name]={player:name,teams:{},att:0,w:0,d:0,l:0,g:0,a:0,sv:0,f:0,mom:0,pts:0});
  const seenAttendance=new Set();
  DB.attendance.forEach(r=>{
    if(!r.player || isOwnGoalPlayer(r.player) || !ids.has(r.id)) return;
    const key=r.id+"|"+r.player;
    if(seenAttendance.has(key)) return;
    seenAttendance.add(key);
    const m=M[r.id]; if(!m) return;
    const P=get(r.player), team=String(r.team||"").trim();
    P.att++;
    if(team) P.teams[team]=(P.teams[team]||0)+1;
    const res=matchResult(m,team);
    if(res==="W"){P.w++;P.pts+=3;} else if(res==="D"){P.d++;P.pts++;} else if(res==="L") P.l++;
  });
  DB.goals.forEach(r=>{
    if(!r.player || isOwnGoalPlayer(r.player) || !ids.has(r.id)) return;
    const P=get(r.player); P.g+=num(r.g); P.a+=num(r.a);
  });
  (DB.saves||[]).forEach(r=>{
    if(!r.player || isOwnGoalPlayer(r.player) || !ids.has(r.id)) return;
    const P=get(r.player); P.sv+=num(r.saves);
  });
  (DB.fouls||[]).forEach(r=>{
    if(!r.player || isOwnGoalPlayer(r.player) || !ids.has(r.id)) return;
    const P=get(r.player); P.f+=num(r.fouls);
  });
  (DB.moms||[]).forEach(r=>{
    if(!r.player || isOwnGoalPlayer(r.player) || !ids.has(r.id)) return;
    const P=get(r.player); P.mom+=num(r.mom);
  });

  const years=[...new Set(ms.map(m=>normDate(m.date).slice(0,4)).filter(y=>/^\d{4}$/.test(y)))];
  const targetYear=years.length===1?years[0]:recordYear;
  const roster=DB.roster.filter(r=>r.player && !isOwnGoalPlayer(r.player) && (!r.year || !targetYear || String(r.year)===targetYear));
  roster.forEach(r=>{
    const P=get(r.player), team=String(r.team||"").trim();
    if(team && P.teams[team]===undefined) P.teams[team]=0;
    if(team) P.rosterTeam=team;
    P.no=r.no;
  });

  const teamGames={};
  ms.forEach(m=>[m.home,m.away].forEach(team=>{ if(team) teamGames[team]=(teamGames[team]||0)+1; }));
  return Object.values(players).map(P=>{
    const main=Object.entries(P.teams).sort((a,b)=>b[1]-a[1] || a[0].localeCompare(b[0]))[0];
    const mainTeam=(main&&main[1]>0)?main[0]:(P.rosterTeam||(main?main[0]:"-"));
    const games=teamGames[mainTeam]||0;
    return Object.assign(P,{mainTeam,teamGames:games,attendanceRate:pct(P.att,games),winRate:pct(P.w,P.w+P.d+P.l)});
  });
}

/* ---------- V3.19: Matchday Story · Streak · Milestone · New Record · Achievement ---------- */
const V319_MILESTONES={
  att:[10,25,50,100,150,200,300],
  g:[10,25,50,75,100,150,200],
  a:[10,25,50,75,100],
  sv:[50,100,200,300,500],
  mom:[5,10,20,30,50]
};
const V319_ACHIEVEMENTS=[
  {id:'DEBUT',icon:'👟',name:'DEBUT',ko:'첫 출전',desc:'GGFC 공식 경기 첫 출전',test:s=>s.att>=1},
  {id:'REGULAR',icon:'🎽',name:'REGULAR',ko:'레귤러',desc:'통산 25경기 출전',test:s=>s.att>=25},
  {id:'FIFTY_CLUB',icon:'5️⃣',name:'FIFTY CLUB',ko:'50경기 클럽',desc:'통산 50경기 출전',test:s=>s.att>=50},
  {id:'CENTURY_CLUB',icon:'💯',name:'CENTURY CLUB',ko:'센추리 클럽',desc:'통산 100경기 출전',test:s=>s.att>=100},
  {id:'IRON_MAN',icon:'🦾',name:'IRON MAN',ko:'아이언맨',desc:'통산 200경기 출전',test:s=>s.att>=200},
  {id:'FIRST_GOAL',icon:'⚽',name:'FIRST GOAL',ko:'첫 골',desc:'GGFC 공식 경기 첫 득점',test:s=>s.g>=1},
  {id:'DOUBLE_DIGITS',icon:'🔟',name:'DOUBLE DIGITS',ko:'두 자릿수 득점',desc:'통산 10골',test:s=>s.g>=10},
  {id:'SNIPER',icon:'🎯',name:'SNIPER',ko:'스나이퍼',desc:'통산 25골',test:s=>s.g>=25},
  {id:'GOAL_MACHINE',icon:'🔥',name:'GOAL MACHINE',ko:'골 머신',desc:'통산 50골',test:s=>s.g>=50},
  {id:'GOAL_CENTURION',icon:'👑',name:'GOAL CENTURION',ko:'100골 클럽',desc:'통산 100골',test:s=>s.g>=100},
  {id:'CREATOR',icon:'🪄',name:'CREATOR',ko:'크리에이터',desc:'통산 10도움',test:s=>s.a>=10},
  {id:'PLAYMAKER',icon:'🎩',name:'PLAYMAKER',ko:'플레이메이커',desc:'통산 25도움',test:s=>s.a>=25},
  {id:'ASSIST_KING',icon:'🤝',name:'ASSIST KING',ko:'어시스트 킹',desc:'통산 50도움',test:s=>s.a>=50},
  {id:'SAFE_HANDS',icon:'🧤',name:'SAFE HANDS',ko:'세이프 핸즈',desc:'통산 50선방',test:s=>s.sv>=50},
  {id:'THE_WALL',icon:'🧱',name:'THE WALL',ko:'더 월',desc:'통산 100선방',test:s=>s.sv>=100},
  {id:'STAR_PLAYER',icon:'⭐',name:'STAR PLAYER',ko:'스타 플레이어',desc:'통산 MOM 5회',test:s=>s.mom>=5},
  {id:'SUPERSTAR',icon:'🌟',name:'SUPERSTAR',ko:'슈퍼스타',desc:'통산 MOM 10회',test:s=>s.mom>=10},
  {id:'WINNER',icon:'🏅',name:'WINNER',ko:'위너',desc:'통산 25승',test:s=>s.w>=25},
  {id:'CHAMPION',icon:'🏆',name:'CHAMPION',ko:'챔피언',desc:'통산 50승',test:s=>s.w>=50},
  {id:'DUAL_THREAT',icon:'⚡',name:'DUAL THREAT',ko:'듀얼 스렛',desc:'통산 20골 · 20도움',test:s=>s.g>=20&&s.a>=20}
];
let v319CareerCache={key:'',map:null};
function v319DateMatches(cutoff,exclusive=false){
  const d=normDate(cutoff);
  return uniqueRecordMatches((DB.matches||[]).filter(m=>{
    const md=normDate(m.date); if(!md)return false;
    return !d || (exclusive?md<d:md<=d);
  }));
}
function v319StoryDayMatches(date){
  const d=normDate(date);
  return uniqueRecordMatches((DB.matches||[]).filter(m=>normDate(m.date)===d && (comp==='ALL'||m.comp===comp)));
}
function v319CareerStatsMap(cutoff,exclusive=false){
  const d=normDate(cutoff), key=[d,exclusive?'X':'I',(DB.matches||[]).length,(DB.attendance||[]).length,(DB.goals||[]).length,(DB.saves||[]).length,(DB.moms||[]).length].join('|');
  if(v319CareerCache.key===key&&v319CareerCache.map)return v319CareerCache.map;
  const ms=v319DateMatches(d,exclusive), byId=new Map(ms.map(m=>[String(m.id),m])), ids=new Set(byId.keys()), out={};
  const get=name=>out[name]||(out[name]={player:name,att:0,w:0,d:0,l:0,g:0,a:0,sv:0,f:0,mom:0,pts:0});
  const seen=new Set();
  (DB.attendance||[]).forEach(r=>{
    const name=String(r.player||'').trim(),id=String(r.id||''); if(!name||isOwnGoalPlayer(name)||!ids.has(id))return;
    const k=id+'|'+normalizePlayerMatchKey(name); if(seen.has(k))return;seen.add(k);
    const m=byId.get(id),P=get(name),res=matchResult(m,String(r.team||'').trim());P.att++;
    if(res==='W'){P.w++;P.pts+=3;}else if(res==='D'){P.d++;P.pts++;}else if(res==='L')P.l++;
  });
  (DB.goals||[]).forEach(r=>{const name=String(r.player||'').trim(),id=String(r.id||'');if(!name||isOwnGoalPlayer(name)||!ids.has(id))return;const P=get(name);P.g+=num(r.g);P.a+=num(r.a);});
  (DB.saves||[]).forEach(r=>{const name=String(r.player||'').trim(),id=String(r.id||'');if(!name||isOwnGoalPlayer(name)||!ids.has(id))return;get(name).sv+=num(r.saves);});
  (DB.fouls||[]).forEach(r=>{const name=String(r.player||'').trim(),id=String(r.id||'');if(!name||isOwnGoalPlayer(name)||!ids.has(id))return;get(name).f+=num(r.fouls);});
  (DB.moms||[]).forEach(r=>{const name=String(r.player||'').trim(),id=String(r.id||'');if(!name||isOwnGoalPlayer(name)||!ids.has(id))return;get(name).mom+=num(r.mom);});
  if(!exclusive)v319CareerCache={key,map:out};
  return out;
}
function v319AchievementList(stats){return V319_ACHIEVEMENTS.filter(a=>a.test(stats||{}));}
function playerAchievementCount(player,cutoff){return v319AchievementList(v319CareerStatsMap(cutoff)[player]||{}).length;}
function v319DayPlayerRows(date){
  const ms=v319StoryDayMatches(date),byId=new Map(ms.map(m=>[String(m.id),m])),ids=new Set(byId.keys()),out={};
  const get=name=>out[name]||(out[name]={player:name,teams:new Set(),matchIds:new Set(),w:0,d:0,l:0,g:0,a:0,sv:0,f:0,mom:0});
  const seen=new Set();
  (DB.attendance||[]).forEach(r=>{
    const id=String(r.id||''),name=String(r.player||'').trim();if(!ids.has(id)||!name||isOwnGoalPlayer(name))return;
    const k=id+'|'+normalizePlayerMatchKey(name);if(seen.has(k))return;seen.add(k);
    const P=get(name),team=String(r.team||'').trim(),res=matchResult(byId.get(id),team);P.matchIds.add(id);if(team)P.teams.add(team);
    if(res==='W')P.w++;else if(res==='D')P.d++;else if(res==='L')P.l++;
  });
  (DB.goals||[]).forEach(r=>{const id=String(r.id||''),name=String(r.player||'').trim();if(!ids.has(id)||!name||isOwnGoalPlayer(name))return;const P=get(name);P.g+=num(r.g);P.a+=num(r.a);});
  (DB.saves||[]).forEach(r=>{const id=String(r.id||''),name=String(r.player||'').trim();if(!ids.has(id)||!name||isOwnGoalPlayer(name))return;get(name).sv+=num(r.saves);});
  (DB.fouls||[]).forEach(r=>{const id=String(r.id||''),name=String(r.player||'').trim();if(!ids.has(id)||!name||isOwnGoalPlayer(name))return;get(name).f+=num(r.fouls);});
  (DB.moms||[]).forEach(r=>{const id=String(r.id||''),name=String(r.player||'').trim();if(!ids.has(id)||!name||isOwnGoalPlayer(name))return;get(name).mom+=num(r.mom);});
  return Object.values(out).map(P=>({...P,att:P.matchIds.size,teams:[...P.teams]}));
}
function v319PlayerDaySeries(player,cutoff){
  const name=String(player||'').trim(), ms=v319DateMatches(cutoff), byId=new Map(ms.map(m=>[String(m.id),m])), ids=new Set(byId.keys()), days=new Map(),seen=new Set();
  const get=date=>{if(!days.has(date))days.set(date,{date,w:0,d:0,l:0,g:0,a:0,mom:0,sv:0});return days.get(date);};
  (DB.attendance||[]).forEach(r=>{
    const id=String(r.id||'');if(!ids.has(id)||normalizePlayerMatchKey(r.player)!==normalizePlayerMatchKey(name))return;
    const k=id+'|'+normalizePlayerMatchKey(name);if(seen.has(k))return;seen.add(k);
    const m=byId.get(id),D=get(normDate(m.date)),res=matchResult(m,String(r.team||'').trim());if(res==='W')D.w++;else if(res==='D')D.d++;else if(res==='L')D.l++;
  });
  const add=(rows,key,field)=>{(rows||[]).forEach(r=>{const id=String(r.id||'');if(!ids.has(id)||normalizePlayerMatchKey(r.player)!==normalizePlayerMatchKey(name))return;const m=byId.get(id);if(!m)return;get(normDate(m.date))[field]+=num(r[key]);});};
  add(DB.goals,'g','g');add(DB.goals,'a','a');add(DB.moms,'mom','mom');add(DB.saves,'saves','sv');
  return [...days.values()].sort((a,b)=>a.date.localeCompare(b.date));
}
function v319TailCount(rows,test){let n=0;for(let i=rows.length-1;i>=0;i--){if(!test(rows[i]))break;n++;}return n;}
function v319StreaksOnDate(date){
  const d=normDate(date), players=v319DayPlayerRows(d).map(x=>x.player), out=[];
  players.forEach(player=>{
    const rows=v319PlayerDaySeries(player,d);if(!rows.length||rows[rows.length-1].date!==d)return;
    const candidates=[
      {type:'득점',icon:'🔥',count:v319TailCount(rows,r=>r.g>0),min:2,text:'연속 득점'},
      {type:'공격P',icon:'⚡',count:v319TailCount(rows,r=>r.g+r.a>0),min:2,text:'연속 공격포인트'},
      {type:'무패',icon:'🛡️',count:v319TailCount(rows,r=>r.l===0),min:3,text:'연속 무패'},
      {type:'연승',icon:'🚀',count:v319TailCount(rows,r=>r.w>0&&r.d===0&&r.l===0),min:2,text:'연속 승리'},
      {type:'MOM',icon:'⭐',count:v319TailCount(rows,r=>r.mom>0),min:2,text:'연속 MOM'}
    ];
    candidates.filter(x=>x.count>=x.min).forEach(x=>out.push({...x,player}));
  });
  return out.sort((a,b)=>b.count-a.count||({MOM:5,'득점':4,'공격P':3,'연승':2,'무패':1}[b.type]||0)-({MOM:5,'득점':4,'공격P':3,'연승':2,'무패':1}[a.type]||0)||compareNamesKo(a.player,b.player));
}
function v319MilestonesOnDate(date){
  const d=normDate(date),before=v319CareerStatsMap(d,true),after=v319CareerStatsMap(d,false), players=new Set(v319DayPlayerRows(d).map(x=>x.player)),out=[];
  const meta={att:['출전','경기','👕'],g:['득점','골','⚽'],a:['도움','도움','🎯'],sv:['선방','선방','🧤'],mom:['MOM','회','⭐']};
  players.forEach(player=>{
    const prev=before[player]||{},cur=after[player]||{};
    Object.entries(V319_MILESTONES).forEach(([key,levels])=>levels.forEach(level=>{
      if(num(prev[key])<level&&num(cur[key])>=level){const [label,unit,icon]=meta[key];out.push({player,key,level,icon,label,text:'통산 '+level+(unit==='경기'?'경기':unit)+' 달성'});}
    }));
  });
  return out.sort((a,b)=>b.level-a.level||compareNamesKo(a.player,b.player));
}
function v319AchievementUnlocksOnDate(date){
  const d=normDate(date),before=v319CareerStatsMap(d,true),after=v319CareerStatsMap(d,false),players=new Set(v319DayPlayerRows(d).map(x=>x.player)),out=[];
  players.forEach(player=>{
    const prev=new Set(v319AchievementList(before[player]||{}).map(a=>a.id));
    v319AchievementList(after[player]||{}).filter(a=>!prev.has(a.id)).forEach(a=>out.push({player,...a}));
  });
  return out;
}
function v319MaxGroup(rows,keyFn,valueFn,filterFn=()=>true){
  const map=new Map();(rows||[]).filter(filterFn).forEach(r=>{const k=keyFn(r);if(!k)return;map.set(k,(map.get(k)||0)+num(valueFn(r)));});
  let best=null;map.forEach((value,key)=>{if(!best||value>best.value)best={key,value};});return best;
}
function v319NewRecordsOnDate(date){
  const d=normDate(date), day=v319StoryDayMatches(d), dayIds=new Set(day.map(m=>String(m.id))), beforeMatches=v319DateMatches(d,true), beforeIds=new Set(beforeMatches.map(m=>String(m.id))), out=[];
  const push=(icon,label,subject,value,previous,unit)=>{if(value>0&&value>previous)out.push({icon,label,subject,value,previous,unit,text:(previous>0?'종전 '+previous+unit+' → ':'첫 기준 기록 · ')+value+unit});};
  const bestPlayerMetric=(rows,key,unit,icon,label)=>{
    const current=v319MaxGroup(rows,r=>dayIds.has(String(r.id))?String(r.id)+'|'+String(r.player||'').trim():'',r=>r[key],r=>!isOwnGoalPlayer(r.player));
    const previous=v319MaxGroup(rows,r=>beforeIds.has(String(r.id))?String(r.id)+'|'+String(r.player||'').trim():'',r=>r[key],r=>!isOwnGoalPlayer(r.player));
    if(current){const parts=current.key.split('|');push(icon,label,parts.slice(1).join('|'),current.value,previous?previous.value:0,unit);}
  };
  bestPlayerMetric(DB.goals,'g','골','⚽','한 경기 최다 득점');
  bestPlayerMetric(DB.goals,'a','도움','🎯','한 경기 최다 도움');
  bestPlayerMetric(DB.saves,'saves','선방','🧤','한 경기 최다 선방');
  const beforeTeamScores=beforeMatches.flatMap(m=>[{team:m.home,v:num(m.hs)},{team:m.away,v:num(m.as)}]),dayTeamScores=day.flatMap(m=>[{team:m.home,v:num(m.hs)},{team:m.away,v:num(m.as)}]);
  const prevTeam=Math.max(0,...beforeTeamScores.map(x=>x.v)),curTeam=dayTeamScores.sort((a,b)=>b.v-a.v)[0];if(curTeam)push('🚨','팀 한 경기 최다 득점',teamDisplayName(curTeam.team),curTeam.v,prevTeam,'골');
  const prevTotal=Math.max(0,...beforeMatches.map(m=>num(m.hs)+num(m.as))),curTotal=day.slice().sort((a,b)=>(num(b.hs)+num(b.as))-(num(a.hs)+num(a.as)))[0];if(curTotal)push('🎆','한 경기 최다 총득점',teamDisplayName(curTotal.home)+' vs '+teamDisplayName(curTotal.away),num(curTotal.hs)+num(curTotal.as),prevTotal,'골');
  const prevDiff=Math.max(0,...beforeMatches.map(m=>Math.abs(num(m.hs)-num(m.as)))),curDiff=day.slice().sort((a,b)=>Math.abs(num(b.hs)-num(b.as))-Math.abs(num(a.hs)-num(a.as)))[0];
  if(curDiff){const diff=Math.abs(num(curDiff.hs)-num(curDiff.as)),winner=num(curDiff.hs)>num(curDiff.as)?curDiff.home:num(curDiff.as)>num(curDiff.hs)?curDiff.away:'무승부';if(winner!=='무승부')push('📈','역대 최다 점수차 승리',teamDisplayName(winner),diff,prevDiff,'골 차');}
  return out.slice(0,6);
}
function v319UpcomingMilestone(player,stats){
  const meta={att:['출전','경기'],g:['득점','골'],a:['도움','도움'],sv:['선방','선방'],mom:['MOM','회']},candidates=[];
  Object.entries(V319_MILESTONES).forEach(([key,levels])=>{const cur=num(stats[key]),next=levels.find(x=>x>cur);if(next){const [label,unit]=meta[key];candidates.push({key,label,unit,current:cur,target:next,left:next-cur,ratio:cur/next});}});
  return candidates.sort((a,b)=>a.left-b.left||b.ratio-a.ratio)[0]||null;
}
function v319MatchdayStory(date){
  const d=normDate(date),rows=v319DayPlayerRows(d),matches=v319StoryDayMatches(d),milestones=v319MilestonesOnDate(d),records=v319NewRecordsOnDate(d),streaks=v319StreaksOnDate(d),unlocks=v319AchievementUnlocksOnDate(d),story=[];
  records.slice(0,2).forEach(x=>story.push({icon:x.icon,kicker:'NEW RECORD',title:x.subject,text:x.label+' · '+x.text}));
  milestones.slice(0,2).forEach(x=>story.push({icon:x.icon,kicker:'MILESTONE',title:x.player,text:x.text}));
  streaks.slice(0,2).forEach(x=>story.push({icon:x.icon,kicker:'STREAK',title:x.player,text:x.count+'경기일 '+x.text}));
  unlocks.slice(0,1).forEach(x=>story.push({icon:x.icon,kicker:'ACHIEVEMENT',title:x.player,text:x.name+' · '+x.ko+' 획득'}));
  if(rows.length){
    const scorer=rows.slice().sort((a,b)=>b.g-a.g||b.a-a.a||compareNamesKo(a.player,b.player))[0];if(scorer&&scorer.g>0)story.push({icon:'⚽',kicker:'TOP SCORER',title:scorer.player,text:d+' · '+scorer.g+'골'+(scorer.a?' · '+scorer.a+'도움':'')});
    const helper=rows.slice().sort((a,b)=>b.a-a.a||b.g-a.g||compareNamesKo(a.player,b.player))[0];if(helper&&helper.a>0&&(!scorer||helper.player!==scorer.player))story.push({icon:'🎯',kicker:'TOP ASSIST',title:helper.player,text:d+' · '+helper.a+'도움'});
    const moms=rows.filter(r=>r.mom>0).sort((a,b)=>b.mom-a.mom||compareNamesKo(a.player,b.player));if(moms.length)story.push({icon:'⭐',kicker:'MOM',title:moms.slice(0,3).map(x=>x.player).join(' · '),text:'오늘의 MOM '+moms.reduce((s,x)=>s+x.mom,0)+'회'});
  }
  if(matches.length){
    const big=matches.slice().sort((a,b)=>Math.abs(num(b.hs)-num(b.as))-Math.abs(num(a.hs)-num(a.as)))[0],diff=Math.abs(num(big.hs)-num(big.as));
    if(diff>0)story.push({icon:'🏟️',kicker:'MATCHDAY',title:teamDisplayName(big.home)+' '+num(big.hs)+' : '+num(big.as)+' '+teamDisplayName(big.away),text:'오늘 가장 큰 점수차 · '+diff+'골 차'});
  }
  return story.slice(0,8);
}
function v319StoryItemHtml(x){return '<article class="v319-story-item"><div class="v319-story-icon">'+esc(x.icon)+'</div><div><div class="v319-story-kicker">'+esc(x.kicker)+'</div><div class="v319-story-title">'+esc(x.title)+'</div><div class="v319-story-text">'+esc(x.text)+'</div></div></article>';}
function v319InsightEmpty(text){return '<div class="v319-insight-empty">'+esc(text)+'</div>';}
function renderV319Story(selectedDate=dashDate){
  const date=normDate(selectedDate),dateText=date?date.replace(/-/g,'.'):'—';
  const dateEls=['#matchdayStoryDate','#streakDate','#milestoneDate','#newRecordDate','#achievementUnlockDate'];dateEls.forEach(sel=>{const el=$(sel);if(el)el.textContent=dateText;});
  const story=$('#matchdayStory');if(story){const rows=v319MatchdayStory(date);story.innerHTML=rows.length?'<div class="v319-story-grid">'+rows.map(v319StoryItemHtml).join('')+'</div>':v319InsightEmpty('선택한 경기일에서 생성할 스토리가 없습니다.');}
  const streak=$('#streakBoard');if(streak){const rows=v319StreaksOnDate(date).slice(0,8);streak.innerHTML=rows.length?'<div class="v319-list">'+rows.map(x=>'<div class="v319-list-row"><span class="v319-list-icon">'+esc(x.icon)+'</span><div><b>'+playerCardLink(x.player,esc(x.player),{start:date,end:date,asOf:date,allCompetitions:true})+'</b><small>'+esc(x.text)+'</small></div><strong>'+x.count+'일</strong></div>').join('')+'</div>':v319InsightEmpty('현재 이어지고 있는 주요 연속 기록이 없습니다.');}
  const milestone=$('#milestoneBoard');if(milestone){const rows=v319MilestonesOnDate(date);milestone.innerHTML=rows.length?'<div class="v319-list">'+rows.slice(0,8).map(x=>'<div class="v319-list-row"><span class="v319-list-icon">'+esc(x.icon)+'</span><div><b>'+playerCardLink(x.player,esc(x.player),{start:date,end:date,asOf:date,allCompetitions:true})+'</b><small>'+esc(x.label)+' milestone</small></div><strong>'+x.level+'</strong></div>').join('')+'</div>':v319InsightEmpty('이 경기일에 새로 달성한 통산 마일스톤이 없습니다.');}
  const record=$('#newRecordBoard');if(record){const rows=v319NewRecordsOnDate(date);record.innerHTML=rows.length?'<div class="v319-list">'+rows.map(x=>'<div class="v319-list-row"><span class="v319-list-icon">'+esc(x.icon)+'</span><div><b>'+esc(x.subject)+'</b><small>'+esc(x.label)+'</small></div><strong>'+x.value+esc(x.unit)+'</strong></div>').join('')+'</div>':v319InsightEmpty('이 경기일에 경신된 역대 기록이 없습니다.');}
  const achieve=$('#achievementUnlockBoard');if(achieve){const rows=v319AchievementUnlocksOnDate(date);achieve.innerHTML=rows.length?'<div class="v319-achievement-grid">'+rows.slice(0,10).map(x=>'<div class="v319-achievement"><span>'+esc(x.icon)+'</span><div><b>'+esc(x.name)+'</b><small>'+playerCardLink(x.player,esc(x.player),{start:date,end:date,asOf:date,allCompetitions:true})+' · '+esc(x.ko)+'</small></div></div>').join('')+'</div>':v319InsightEmpty('이 경기일에 새로 해금된 Achievement가 없습니다.');}
}
let insightDate='';
function renderInsights(){
  const dates=[...new Set(recordBaseMatches().map(m=>normDate(m.date)).filter(Boolean))].sort().reverse();
  if(!dates.includes(insightDate))insightDate=dates.includes(dashDate)?dashDate:(dates[0]||'');
  const select=document.getElementById('insightDate');
  select.innerHTML=dates.length?dates.map(date=>'<option value="'+esc(date)+'">'+esc(date)+'</option>').join(''):'<option value="">경기 기록 없음</option>';
  select.value=insightDate;select.disabled=!dates.length;
  select.onchange=()=>{insightDate=select.value;renderV319Story(insightDate);};
  document.getElementById('insightLatest').onclick=()=>{insightDate=dates[0]||'';select.value=insightDate;renderV319Story(insightDate);};
  renderV319Story(insightDate);
}
function v319AchievementHtml(player,cutoff,compact=false){
  const stats=v319CareerStatsMap(cutoff)[player]||{},list=v319AchievementList(stats),next=v319UpcomingMilestone(player,stats),chips=list.map(a=>'<span class="v319-badge" title="'+esc(a.desc)+'"><i>'+esc(a.icon)+'</i>'+esc(a.name)+'</span>').join('');
  if(compact)return '<span class="v319-badge-count" title="Achievement '+list.length+'개">🏅 '+list.length+'</span>';
  return '<div class="v319-player-achievements">'+(chips?'<div class="v319-badges">'+chips+'</div>':v319InsightEmpty('아직 해금된 Achievement가 없습니다.'))+(next?'<div class="v319-next-milestone"><b>NEXT MILESTONE</b><span>'+esc(next.label)+' '+next.current+' / '+next.target+(next.unit==='경기'?'경기':next.unit)+'</span><div><i style="width:'+Math.max(2,Math.min(100,next.ratio*100))+'%"></i></div></div>':'')+'</div>';
}
function renderPlayerAchievementBoard(players,cutoff){
  const box=$('#playerAchievementBoard');if(!box)return;
  const rows=(players||[]).map(p=>{const stats=v319CareerStatsMap(cutoff)[p.player]||{},list=v319AchievementList(stats);return {player:p.player,count:list.length,list};}).sort((a,b)=>b.count-a.count||compareNamesKo(a.player,b.player));
  box.innerHTML=rows.length?'<div class="v319-player-achievement-grid">'+rows.map(r=>'<article class="v319-player-achievement-card"><header>'+playerCardLink(r.player,'<b>'+esc(r.player)+'</b>',{asOf:cutoff,allCompetitions:true})+'<span>🏅 '+r.count+'</span></header><div class="v319-badges">'+(r.list.length?r.list.slice(-6).reverse().map(a=>'<span class="v319-badge" title="'+esc(a.desc)+'"><i>'+esc(a.icon)+'</i>'+esc(a.name)+'</span>').join(''):'<span class="muted">첫 Achievement를 기다리는 중</span>')+'</div></article>').join('')+'</div>':v319InsightEmpty('표시할 선수가 없습니다.');
}
// Career frame progression is cosmetic: no OVR, ability or match-stat writes.
const CAREER_FRAME_METRICS=[
  {key:'att',label:'통산 출전',unit:'경기'}, {key:'g',label:'통산 득점',unit:'골'},
  {key:'a',label:'통산 도움',unit:'도움'}, {key:'sv',label:'통산 선방',unit:'선방'},
  {key:'mom',label:'통산 MOM',unit:'회'}, {key:'w',label:'통산 승리',unit:'승'}
];
const CAREER_FRAME_TIERS=[
  {id:'NORMAL',name:'NORMAL',title:'커리어의 시작',thresholds:null},
  {id:'SILVER',name:'SILVER',title:'쌓여 가는 존재감',thresholds:[50,25,25,100,5,25]},
  {id:'GOLD',name:'GOLD',title:'팀을 빛내는 커리어',thresholds:[100,50,50,200,10,50]},
  {id:'LEGEND',name:'LEGEND',title:'GGFC에 남긴 발자취',thresholds:[200,100,100,500,25,100]}
];
function careerFrameState(stats){
  const values=CAREER_FRAME_METRICS.map(m=>Math.max(0,num(stats?.[m.key])));
  let index=0;
  CAREER_FRAME_TIERS.forEach((tier,i)=>{if(tier.thresholds?.some((target,j)=>values[j]>=target))index=i;});
  const tier=CAREER_FRAME_TIERS[index],next=CAREER_FRAME_TIERS[index+1]||null;
  const routes=CAREER_FRAME_METRICS.map((metric,i)=>({...metric,value:values[i],target:next?.thresholds[i]||null,remaining:next?Math.max(0,next.thresholds[i]-values[i]):0}));
  const earned=tier.thresholds?CAREER_FRAME_METRICS.filter((m,i)=>values[i]>=tier.thresholds[i]).map(m=>m.label):[];
  return {tier,next,routes,earned};
}
function renderCareerFrame(player,cutoff){
  const stats=v319CareerStatsMap(cutoff)[player]||{},state=careerFrameState(stats);
  const card=document.querySelector('#playerCardContainer .ggfc-player-card');
  if(card)card.dataset.careerTier=state.tier.id;
  const badge=document.getElementById('playerCardFrameBadge');
  if(badge){badge.textContent=state.tier.name;badge.title=state.tier.title;}
  const box=document.getElementById('playerCardFrameProgress');
  if(!box)return;
  const date=normDate(cutoff)||'전체 기록';
  const next=state.next?'<p class="career-frame-next"><b>'+state.next.name+'</b>까지 아래 조건 중 <b>하나</b>를 달성하세요.</p><div class="career-frame-routes">'+state.routes.map(route=>{
    return '<div class="career-frame-route"><span>'+route.label+'</span><b>'+route.value+' / '+route.target+' '+route.unit+'</b><progress max="'+route.target+'" value="'+Math.min(route.value,route.target)+'" aria-label="'+route.label+' '+route.value+' / '+route.target+'"></progress><small>'+route.remaining+' '+route.unit+' 남음</small></div>';
  }).join('')+'</div>':'<p class="career-frame-complete">최고 등급 LEGEND 달성 · 앞으로 쌓는 기록도 통산 업적에 계속 반영됩니다.</p>';
  const rules=CAREER_FRAME_TIERS.slice(1).map(tier=>'<li><b>'+tier.name+'</b><span>'+CAREER_FRAME_METRICS.map((m,i)=>m.label.replace('통산 ','')+' '+tier.thresholds[i]+m.unit).join(' / ')+'</span></li>').join('');
  box.dataset.careerTier=state.tier.id;
  box.innerHTML='<header><span>CAREER FRAME</span><strong>'+state.tier.name+'</strong></header><p class="career-frame-title">'+state.tier.title+'</p><p class="career-frame-basis">'+esc(date)+' 기준 · 전체 시즌·대회 통산 기록</p><p class="career-frame-earned">'+(state.earned.length?'현재 등급 달성 근거: '+state.earned.join(' · '):'아직 SILVER 기준에 도달하지 않았습니다.')+'</p>'+next+'<details class="career-frame-rules"><summary>등급 기준 전체 보기</summary><p>NORMAL은 기본 등급입니다. 각 등급은 아래 조건 중 하나만 충족하면 적용됩니다. 누적 업적 개수나 능력치 점수는 사용하지 않습니다.</p><ul>'+rules+'</ul><p>출전은 경기 ID당 1회입니다. 같은 날 여러 경기에 출전하면 경기 수만큼 집계합니다. 시즌·조회 구간이 바뀌어도 기준일까지의 통산 기록을 사용하며, 과거 날짜 조회와 기록 정정 시 해당 기록에 맞춰 등급을 다시 계산합니다. 프레임은 OVR·능력치에 영향을 주지 않습니다.</p></details>';
}
function renderPlayerCardAchievements(player,cutoff){
  const box=$('#playerCardAchievements');if(box)box.innerHTML=v319AchievementHtml(player,cutoff,false);
  renderCareerFrame(player,cutoff);
}

function sharedRanks(list,valueFn){
  let previous, rank=0;
  return list.map((item,i)=>{
    const value=valueFn(item);
    if(i===0 || value!==previous) rank=i+1;
    previous=value;
    return rank;
  });
}
function renderDashboardQueryRankings(info){
  // 모든 랭킹은 팀 순위와 동일한 시즌·반기 전체 기록으로 계산한다.
  info=halfTeamRankingInfo(info||rankingQueryInfo());
  const list=info.list||[], period=info.label+" · "+list.length+"경기 기준";
  if($("#dashScorerQueryNote")) $("#dashScorerQueryNote").textContent=period+" · 득점 ↓ · 경기수 ↑ · 동률이면 이름순";
  if($("#dashAttendanceQueryNote")) $("#dashAttendanceQueryNote").textContent=period+" · 출석률은 주 소속팀 경기 수 대비 선수 출석 횟수입니다. 출석률이 같으면 경기수·득점과 관계없이 이름순";

  if($("#dashPlayerPointQueryNote")) $("#dashPlayerPointQueryNote").textContent=period+" · 실제 출석 경기의 승점 누적 · 승점·경기수·득점 동률이면 이름순";
  if($("#dashTeamFoulQueryNote")) $("#dashTeamFoulQueryNote").textContent=period+" · 누적 파울 ↑ · 경기수 ↓ · 동률이면 팀 이름순. 경기별 개인파울 합계 우선, 없으면 기존 팀파울 적용";

  const players=queryPlayerStats(list);
  const scorers=players.filter(p=>p.g>0).sort((a,b)=>b.g-a.g || a.att-b.att || compareNamesKo(a.player,b.player)).slice(0,20);
  $("#dashScorers").innerHTML=tbl(
    [{t:"#"},{t:"선수"},{t:"팀"},{t:"경기",n:1},{t:"득점",n:1}],
    scorers.map((p,i)=>['<span class="rank'+(i<3?' top':'')+'">'+(i+1)+'</span>',playerCardLink(p.player,'<b>'+esc(p.player)+'</b>',info),'<span class="muted">'+teamChip(p.mainTeam)+'</span>',p.att,'<b>'+p.g+'</b>'])
  );

  const attendance=players.filter(p=>p.teamGames>0).sort((a,b)=>b.attendanceRate-a.attendanceRate || compareNamesKo(a.player,b.player)).slice(0,20);
  const attendanceRanks=sharedRanks(attendance,p=>p.attendanceRate);
  $("#dashAttendanceRank").innerHTML=tbl(
    [{t:"#"},{t:"선수"},{t:"팀"},{t:"출석",n:1},{t:"팀 경기",n:1},{t:"출석률",n:1}],
    attendance.map((p,i)=>['<span class="rank'+(attendanceRanks[i]<=3?' top':'')+'">'+attendanceRanks[i]+'</span>',playerCardLink(p.player,'<b>'+esc(p.player)+'</b>',info),'<span class="muted">'+teamChip(p.mainTeam)+'</span>',p.att,p.teamGames,'<b>'+p.attendanceRate+'%</b>'])
  );

  const ranking=halfTeamRanking(info), {teams,ranks:teamPointRanks,scope}=ranking;
  const basis=scope.label+' · '+recordRoundRangeLabel(scope.list)+' · '+scope.list.length+'경기';
  if($("#dashTeamPointPeriod")) $("#dashTeamPointPeriod").textContent=basis;
  if($("#dashTeamPointQueryNote")) $("#dashTeamPointQueryNote").textContent='대표승점 → 누적 참석수 → 누적 승점 순으로 정렬합니다. 정규·인터리그 반기 전체 누적. 참석수는 같은 날·같은 팀·같은 선수를 1명으로 계산하며 다른 날짜의 참석은 합산합니다. 승점은 승 3점·무 1점·패 0점의 합계입니다. 세 기준이 같으면 공동순위입니다.';
  $("#dashTeamPointRank").innerHTML=tbl(
    [{t:"#"},{t:"팀"},{t:"대표승점",n:1},{t:"누적 참석수",n:1},{t:"누적 승점",n:1},{t:"득실차",n:1}],
    teams.map((t,i)=>['<span class="rank'+(teamPointRanks[i]<=3?' top':'')+'">'+teamPointRanks[i]+'</span>',teamChip(t.team),'<span class="rep-point'+(t.representative?'':' zero')+'">'+t.representative+'</span>','<b>'+t.attendance+'</b>','<b>'+t.pts+'</b>',(t.gf-t.ga>0?'+':'')+(t.gf-t.ga)])
  );
  renderRepresentativePointBreakdown(ranking.detail,scope);

  const playerPointsAll=players.filter(p=>p.att>0).sort((a,b)=>b.pts-a.pts || b.att-a.att || b.g-a.g || compareNamesKo(a.player,b.player));
  const playerPoints=playerPointsAll.slice(0,5);
  const playerPointRanks=sharedRanks(playerPoints,p=>p.pts);
  let tiedBeyond=0;
  if(playerPoints.length===5){
    const fifthPts=playerPoints[4].pts;
    tiedBeyond=playerPointsAll.slice(5).filter(p=>p.pts===fifthPts).length;
  }
  $("#dashPlayerPointRank").innerHTML=tbl(
    [{t:"#"},{t:"선수"},{t:"경기",n:1},{t:"승점",n:1}],
    playerPoints.map((p,i)=>{
      const extra=(i===4 && tiedBeyond>0)?' <span class="muted" style="font-size:12px">외 '+tiedBeyond+'명</span>':'';
      return ['<span class="rank'+(playerPointRanks[i]<=3?' top':'')+'">'+playerPointRanks[i]+'</span>',playerCardLink(p.player,'<b>'+esc(p.player)+'</b>',info)+extra,p.att,'<b>'+p.pts+'</b>'];
    })
  );

  const foulTeams=statsFromMatches(list).sort((a,b)=>a.f-b.f || b.p-a.p || compareNamesKo(teamDisplayName(a.team),teamDisplayName(b.team)) || compareNamesKo(a.team,b.team));
  const foulRanks=sharedRanks(foulTeams,t=>t.f);
  $("#dashTeamFoulRank").innerHTML=tbl(
    [{t:"#"},{t:"팀"},{t:"경기",n:1},{t:"파울",n:1}],
    foulTeams.map((t,i)=>['<span class="rank'+(foulRanks[i]<=3?' top':'')+'">'+foulRanks[i]+'</span>',teamChip(t.team),t.p,'<b>'+t.f+'</b>'])
  );
}
function headToHeadTeams(list){
  const fromMatches=[...new Set((list||[]).flatMap(m=>[m.home,m.away]).filter(Boolean))];
  const known=LEAGUE_TEAM_DISPLAY_PRIORITY.filter(t=>fromMatches.includes(t));
  const extras=fromMatches.filter(t=>!known.includes(t)).sort((a,b)=>teamDisplayName(a).localeCompare(teamDisplayName(b),"ko"));
  return known.concat(extras);
}
function headToHeadTeamHtml(team,header){
  const logo=teamLogo(team), name=teamDisplayName(team);
  const icon=logo?'<img src="'+logo+'" alt="'+esc(name)+' 로고">':'<span class="h2h-fallback">'+teamInitials(team)+'</span>';
  return header
    ? '<div class="headtohead-team-head">'+icon+'<span>'+esc(name)+'</span></div>'
    : '<div class="headtohead-row-team">'+icon+'<span>'+esc(name)+'</span></div>';
}
function renderHeadToHead(info){
  const box=$("#dashHeadToHead"); if(!box) return;
  info=info||h2hQueryInfo();
  const list=uniqueRecordMatches(info.list||[]), teams=headToHeadTeams(list);
  const period=$("#dashHeadToHeadPeriod");
  if(period) period.textContent=info.label+(list.length?' · '+list.length+'경기':'');
  if(teams.length<2){ box.innerHTML='<div class="empty">상대전적을 계산할 팀간 경기 기록이 부족합니다.</div>'; return; }
  const matrix={};
  teams.forEach(a=>{ matrix[a]={}; teams.forEach(b=>matrix[a][b]={w:0,d:0,l:0}); });
  list.forEach(m=>{
    if(!m.home||!m.away||!matrix[m.home]||!matrix[m.away]) return;
    const hr=matchResult(m,m.home), ar=matchResult(m,m.away);
    if(hr==="W") matrix[m.home][m.away].w++; else if(hr==="D") matrix[m.home][m.away].d++; else if(hr==="L") matrix[m.home][m.away].l++;
    if(ar==="W") matrix[m.away][m.home].w++; else if(ar==="D") matrix[m.away][m.home].d++; else if(ar==="L") matrix[m.away][m.home].l++;
  });
  const head='<thead><tr><th>팀 명</th>'+teams.map(t=>'<th>'+headToHeadTeamHtml(t,true)+'</th>').join('')+'</tr></thead>';
  const body='<tbody>'+teams.map(row=>'<tr><th>'+headToHeadTeamHtml(row,false)+'</th>'+teams.map(col=>{
    if(row===col) return '<td class="headtohead-cell diagonal">-</td>';
    const x=matrix[row][col];
    return '<td class="headtohead-cell"><span class="w">'+x.w+'승</span> <span class="d">'+x.d+'무</span> <span class="l">'+x.l+'패</span></td>';
  }).join('')+'</tr>').join('')+'</tbody>';
  box.innerHTML='<table class="headtohead-table" aria-label="팀간 상대전적 승패표">'+head+body+'</table>';
}

function recordAttendanceBlock(list){
  const ids=new Set(list.map(m=>m.id)), byTeam={};
  DB.attendance.filter(a=>ids.has(a.id)).forEach(a=>{
    if(!a.team||!a.player) return;
    const arr=byTeam[a.team]||(byTeam[a.team]=[]);
    if(!arr.includes(a.player)) arr.push(a.player);
  });
  list.forEach(m=>[m.home,m.away].filter(Boolean).forEach(t=>{if(squadAtMatch(m,t)&&!byTeam[t])byTeam[t]=[];}));
  if(!Object.keys(byTeam).length) return '';

  const date=normDate((list[0]||{}).date), membership=leagueMembership(date);
  const teamGroup=team=>{
    if(membership[team]) return membership[team];
    for(const m of list){
      if(m.home!==team && m.away!==team) continue;
      const g=matchTeamGroup(m,team); if(g) return g;
      const ground=matchGround(m); if(ground) return ground;
    }
    return "A";
  };
  const grouped={A:[],B:[]};
  Object.entries(byTeam).forEach(([team,players])=>grouped[teamGroup(team)==="B"?"B":"A"].push([team,players]));
  ["A","B"].forEach(code=>grouped[code].sort((a,b)=>leagueTeamDisplayOrder(a[0])-leagueTeamDisplayOrder(b[0]) || a[0].localeCompare(b[0])));
  const col=code=>'<div class="record-attendance-league"><div class="record-attendance-league-title">'+leagueGroupLabel(code)+'</div>'+
    (grouped[code].length?grouped[code].map(([team,players])=>
      '<div class="record-attendance-item">'+teamChip(team)+' <span class="muted">('+players.length+'명 출석)</span><br><span class="squad-names">'+squadAttendanceHtml(list,team)+'</span></div>'
    ).join(""):'<div class="record-attendance-item muted">출석 기록 없음</div>')+'</div>';
  return '<div class="record-attendance"><div class="record-attendance-title export-section-head"><span>출석 명단 <small>굵은 이름: 실제 출석</small></span></div><div class="record-attendance-grid">'+col("A")+col("B")+'</div></div>';
}
function recordDayBlock(date,list,open){
  const A=list.filter(m=>matchGround(m)==="A"), B=list.filter(m=>matchGround(m)==="B"), unassigned=list.filter(m=>!matchGround(m));
  A.push(...unassigned);
  const goals=list.reduce((s,m)=>s+num(m.hs)+num(m.as),0), fouls=totalTeamFouls(list);
  return '<details class="record-day"'+playerCardQueryAttrs({start:date,end:date})+(open?' open':'')+'><summary><span class="record-day-date">'+esc(date)+'</span><span class="record-day-meta">'+list.length+'경기 · '+goals+'골 · 파울 '+fouls+'회</span></summary><div class="record-day-body">'+
    '<div class="ground-grid">'+groundPanel("A",A)+groundPanel("B",B)+'</div>'+recordAttendanceBlock(list)+'</div></details>';
}
function renderRecentMatches(){
  renderRecordControls();
  const info=recordQueryInfo(), list=info.list, box=$("#dashRecent");
  renderDashboardPeriodControls();
  renderDashboardQueryRankings();
  renderHeadToHead();
  if($("#dashRecentNote")) $("#dashRecentNote").textContent=info.label;
  if(!list.length){
    box.innerHTML='<div class="empty">'+esc(info.label)+'에 현재 대회 필터와 일치하는 경기가 없습니다.</div>'; return;
  }
  const ids=new Set(list.map(m=>m.id));
  const dates=[...new Set(list.map(m=>normDate(m.date)).filter(Boolean))].sort().reverse();
  const teams=[...new Set(list.flatMap(m=>[m.home,m.away]).filter(Boolean))];
  const goals=list.reduce((s,m)=>s+num(m.hs)+num(m.as),0), fouls=totalTeamFouls(list);
  const att=DB.attendance.filter(a=>ids.has(a.id));
  const uniquePlayers=new Set(att.map(a=>a.player).filter(Boolean)).size;
  const summaries=[
    {l:"경기일",v:dates.length,s:dates.length>1?dates[dates.length-1]+" ~ "+dates[0]:dates[0]},
    {l:"총 경기",v:list.length,s:teams.length+"개 팀"},
    {l:"총 득점",v:goals,s:"파울 "+fouls+"회"},
    {l:"출석 선수",v:uniquePlayers,s:"연인원 "+att.length+"명"}
  ];
  const standingHtml=teamStandingGroupedHtml(list);
  const byDate=dates.map(d=>({date:d,items:list.filter(m=>normDate(m.date)===d).sort((a,b)=>String(a.no||"").localeCompare(String(b.no||""),undefined,{numeric:true}))}));
  box.innerHTML='<div class="record-analysis-note" data-dashboard-admin data-export-ignore><b>'+esc(info.label)+'</b>의 경기 결과를 누적 집계합니다. 승점은 승 3점·무 1점·패 0점이며, 몰수패가 입력된 팀은 점수와 관계없이 패배·상대팀은 승리로 계산합니다. 경기일별 상세에는 A·B구장 결과, 팀별 득점자, 스코어 아래의 MOM 선수와 출석 명단이 표시됩니다. 참석수는 같은 날짜·같은 팀·같은 선수의 중복 출전을 1회로 계산합니다.</div>'+ 
    '<div class="record-summary-grid">'+summaries.map(x=>'<div class="record-summary-item"><div class="l">'+esc(x.l)+'</div><div class="v">'+x.v+'</div><div class="s">'+esc(x.s||'—')+'</div></div>').join('')+'</div>'+ 
    '<div class="record-export-section" id="exportDayDetailsSection"><div class="record-period-head"><div class="sec-t">경기일별 상세 기록</div><div class="record-period-label" data-dashboard-admin data-export-ignore>최신 경기일부터 표시 · 날짜를 눌러 펼치기 · 대진을 눌러 상세기록 보기</div></div>'+ 
    '<div class="record-day-list">'+byDate.map((x,i)=>recordDayBlock(x.date,x.items,i===0)).join('')+'</div></div>'+ 
    '<div class="record-export-section" id="exportTeamStandingSection"><div class="record-period-head"><div class="record-period-heading"><div class="sec-t">팀 순위 및 누적 기록</div><span class="record-round-range">'+esc(recordRoundRangeLabel(list))+'</span></div><div class="record-period-label">'+esc(info.start||'')+(info.end&&info.end!==info.start?' ~ '+esc(info.end):'')+'</div></div>'+ 
    '<div class="tablewrap record-standing-table">'+standingHtml+'</div></div>';
}
function renderDash(){
  ensureDashboardDate();
  renderDashboardDateControls();
  renderLeagueSummary();
  renderRecentMatches();
  if($("#dashSub")) $("#dashSub").textContent="경기결과 · 팀순위 · 개인순위 · 출석 · 상대전적";
}
function matchCard(m){
  const homeSc=teamScorers(m,m.home,true), awaySc=teamScorers(m,m.away,true), fouls=matchTeamFouls(m);
  return '<div class="match fixture-match-card">'+
    '<div class="top"><span class="pill">'+esc(m.comp||"정규리그")+'</span>'+(m.round?'<span class="pill">'+esc(m.round)+'</span>':'')+(m.no?'<span class="pill">'+esc(m.no)+' 경기</span>':'')+(m.half?'<span class="pill">'+halfLabel(normHalf(m.half))+'</span>':'')+(forfeitText(m)?'<span class="pill l">'+esc(forfeitText(m))+'</span>':'')+'<span>'+esc(m.date||"")+'</span><span class="muted">파울 '+fouls.home+':'+fouls.away+'</span></div>'+
    fixtureScoreRow(m,homeSc,awaySc,'calendar-fixture')+
    '</div>';
}
function renderCal(){
  const y=calRef.getFullYear(), mo=calRef.getMonth();
  $("#calMonth").textContent = y+"년 "+(mo+1)+"월";
  const first=new Date(y,mo,1), start=first.getDay(), days=new Date(y,mo+1,0).getDate();
  const byDate={}; matches().forEach(m=>{ (byDate[m.date]||(byDate[m.date]=[])).push(m); });
  let h = ["일","월","화","수","목","금","토"].map(d=>'<div class="wd">'+d+'</div>').join("");
  for(let i=0;i<start;i++) h+='<div class="day blank"></div>';
  for(let d=1;d<=days;d++){
    const key = y+"-"+String(mo+1).padStart(2,"0")+"-"+String(d).padStart(2,"0");
    const list = byDate[key];
    h += '<button class="day'+(list?" has":"")+(selDay===key?" sel":"")+'" '+(list?'data-d="'+key+'"':"disabled")+'>'+
      '<span class="d">'+d+'</span>'+(list? '<span class="tag">'+list.length+'경기</span>':'')+'</button>';
  }
  $("#cal").innerHTML = h;
  $$("#cal .day.has").forEach(b=> b.onclick=()=>{ selDay=b.dataset.d; renderCal(); renderDay(); });
  renderDay();
}
function renderDay(){
  const list = selDay? matches().filter(m=>m.date===selDay) : [];
  $("#dayTitle").textContent = selDay? selDay+" 경기 기록" : "경기 상세";
  if(!selDay){ $("#dayDetail").innerHTML='<div class="empty">달력에서 파란색으로 표시된 날짜를 선택하세요.</div>'; return; }
  const att = DB.attendance.filter(a=>list.some(m=>m.id===a.id));
  const byTeam={};
  att.forEach(a=>{
    if(!a.team || !a.player) return;
    const arr=byTeam[a.team]||(byTeam[a.team]=[]);
    if(!arr.includes(a.player)) arr.push(a.player);
  });
  $("#dayDetail").innerHTML = list.map(matchCard).join("") +
    (Object.keys(byTeam).length? '<div class="sec-t" style="margin-top:20px">출석 명단</div>'+
      Object.entries(byTeam).map(([t,ps])=>'<div style="font-size:13px;margin-bottom:8px">'+teamChip(t)+' <span class="muted">('+ps.length+'명)</span><br><span class="muted">'+esc(ps.join(", "))+'</span></div>').join("") : "");
}
const TEAM_RECORD_COLORS={
  "A특공대":"#7B2CBF",
  "풀파워":"#1976D2",
  "어우씨":"#B8862B",
  "D져스":"#FFFFFF",
  "이지스":"#FF5F9E",
  "F킬러":"#00A86B"
};
function teamRecordColor(name){
  const key=String(name||"").trim();
  return TEAM_RECORD_COLORS[key]||teamColor(key);
}
function renderTeamPointsChart(list,info){
  const box=$("#teamPointsChart"), period=$("#teamPointsChartPeriod");
  if(!box) return;
  const ms=uniqueRecordMatches((list||[]).filter(m=>normDate(m.date))).slice().sort((a,b)=>
    normDate(a.date).localeCompare(normDate(b.date)) || String(a.no||"").localeCompare(String(b.no||""),undefined,{numeric:true})
  );
  const dates=[...new Set(ms.map(m=>normDate(m.date)).filter(Boolean))];
  const present=[...new Set(ms.flatMap(m=>[m.home,m.away]).filter(Boolean))];
  const teams=LEAGUE_TEAM_DISPLAY_PRIORITY.filter(t=>present.includes(t)).concat(
    present.filter(t=>!LEAGUE_TEAM_DISPLAY_PRIORITY.includes(t)).sort((a,b)=>teamDisplayName(a).localeCompare(teamDisplayName(b),"ko"))
  );
  if(period) period.textContent=(info&&info.label?info.label+" · ":"")+dates.length+"개 경기일";
  if(!dates.length || !teams.length){
    box.innerHTML='<div class="team-points-chart-empty">선택한 조회 구간에 표시할 팀 경기 기록이 없습니다.</div>';
    return;
  }

  const series=teams.map(team=>{
    let total=0;
    const vals=dates.map(date=>{
      ms.filter(m=>normDate(m.date)===date && (m.home===team||m.away===team)).forEach(m=>{
        const r=matchResult(m,team);
        if(r==="W") total+=3; else if(r==="D") total+=1;
      });
      return total;
    });
    return {team,vals,color:teamRecordColor(team)};
  });
  const maxVal=Math.max(3,...series.flatMap(s=>s.vals));
  const yMax=Math.max(3,Math.ceil(maxVal/3)*3);
  /* 마지막 팀 로고와 승점을 표시할 공간을 우측에 확보합니다. */
  const width=Math.max(860,210+Math.max(1,dates.length-1)*92), height=410;
  const left=58,right=150,top=30,bottom=64, plotW=width-left-right, plotH=height-top-bottom;
  const x=i=>dates.length===1?left+plotW/2:left+(plotW*i/(dates.length-1));
  const y=v=>top+plotH-(v/yMax)*plotH;
  const ticks=[];
  const tickStep=Math.max(1,Math.ceil(yMax/6));
  for(let v=0;v<=yMax;v+=tickStep) ticks.push(v);
  if(ticks[ticks.length-1]!==yMax) ticks.push(yMax);
  const fmtDate=d=>{ const p=String(d||"").split("-"); return p.length===3?(Number(p[1])+"/"+Number(p[2])):d; };
  const grid=ticks.map(v=>
    '<line x1="'+left+'" y1="'+y(v)+'" x2="'+(width-right)+'" y2="'+y(v)+'" stroke="rgba(255,255,255,.13)" stroke-width="1"/>'+ 
    '<text x="'+(left-10)+'" y="'+(y(v)+4)+'" text-anchor="end" fill="rgba(255,255,255,.72)" font-size="12">'+v+'</text>'
  ).join("");
  const xlabels=dates.map((d,i)=>
    '<line x1="'+x(i)+'" y1="'+top+'" x2="'+x(i)+'" y2="'+(top+plotH)+'" stroke="rgba(255,255,255,.055)" stroke-width="1"/>'+ 
    '<text x="'+x(i)+'" y="'+(height-27)+'" text-anchor="middle" fill="rgba(255,255,255,.78)" font-size="12">'+esc(fmtDate(d))+'</text>'
  ).join("");
  const paths=series.map(s=>{
    const pts=s.vals.map((v,i)=>x(i).toFixed(1)+','+y(v).toFixed(1)).join(' ');
    const circles=s.vals.map((v,i)=>'<circle cx="'+x(i)+'" cy="'+y(v)+'" r="4.2" fill="'+s.color+'" stroke="#241c2a" stroke-width="2"><title>'+esc(teamDisplayName(s.team))+' · '+esc(dates[i])+' · 누적 '+v+'점</title></circle>').join('');
    const under=s.team==="D져스"?'<polyline points="'+pts+'" fill="none" stroke="rgba(0,0,0,.65)" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>':'';
    return under+'<polyline points="'+pts+'" fill="none" stroke="'+s.color+'" stroke-width="3.4" stroke-linejoin="round" stroke-linecap="round"/>'+circles;
  }).join("");

  /* 마지막 지점의 로고/승점이 서로 겹치지 않도록 라벨 Y 위치를 보정합니다. */
  const minGap=38, minLabelY=top+18, maxLabelY=top+plotH-18;
  const endLabels=series.map(s=>({
    team:s.team,
    color:s.color,
    value:s.vals[s.vals.length-1]||0,
    anchorY:y(s.vals[s.vals.length-1]||0),
    labelY:y(s.vals[s.vals.length-1]||0)
  })).sort((a,b)=>a.labelY-b.labelY || leagueTeamDisplayOrder(a.team)-leagueTeamDisplayOrder(b.team));
  if(endLabels.length){
    endLabels[0].labelY=Math.max(minLabelY,endLabels[0].labelY);
    for(let i=1;i<endLabels.length;i++) endLabels[i].labelY=Math.max(endLabels[i].labelY,endLabels[i-1].labelY+minGap);
    if(endLabels[endLabels.length-1].labelY>maxLabelY){
      endLabels[endLabels.length-1].labelY=maxLabelY;
      for(let i=endLabels.length-2;i>=0;i--) endLabels[i].labelY=Math.min(endLabels[i].labelY,endLabels[i+1].labelY-minGap);
      if(endLabels[0].labelY<minLabelY){
        const shift=minLabelY-endLabels[0].labelY;
        endLabels.forEach(e=>e.labelY+=shift);
      }
    }
  }
  const lastX=x(dates.length-1);
  const logoX=width-right+18, logoSize=32, scoreX=logoX+logoSize+9;
  const endpointLabels=endLabels.map(e=>{
    const logo=teamLogo(e.team);
    const connector='<path d="M '+(lastX+6).toFixed(1)+' '+e.anchorY.toFixed(1)+' L '+(logoX-7)+' '+e.labelY.toFixed(1)+'" fill="none" stroke="'+e.color+'" stroke-width="1.7" stroke-dasharray="3 3" opacity=".8"/>';
    const logoHtml=logo
      ? '<image href="'+esc(logo)+'" x="'+logoX+'" y="'+(e.labelY-logoSize/2)+'" width="'+logoSize+'" height="'+logoSize+'" preserveAspectRatio="xMidYMid meet"><title>'+esc(teamDisplayName(e.team))+'</title></image>'
      : '<g><circle cx="'+(logoX+logoSize/2)+'" cy="'+e.labelY+'" r="'+(logoSize/2)+'" fill="'+e.color+'" stroke="rgba(255,255,255,.65)"/><text x="'+(logoX+logoSize/2)+'" y="'+(e.labelY+4)+'" text-anchor="middle" fill="'+(e.team==="D져스"?'#241c2a':'#fff')+'" font-size="11" font-weight="900">'+esc(Array.from(teamDisplayName(e.team))[0]||'?')+'</text></g>';
    const score='<text x="'+scoreX+'" y="'+(e.labelY+5)+'" fill="#fff" font-size="15" font-weight="900" paint-order="stroke" stroke="#241c2a" stroke-width="4" stroke-linejoin="round">'+e.value+'점</text>';
    return connector+logoHtml+score;
  }).join('');

  const svg='<div class="team-points-chart-wrap"><svg viewBox="0 0 '+width+' '+height+'" role="img" aria-label="팀별 일자별 승점 누적 그래프">'+
    '<rect x="0" y="0" width="'+width+'" height="'+height+'" rx="14" fill="#241c2a"/>'+ 
    grid+xlabels+
    '<line x1="'+left+'" y1="'+(top+plotH)+'" x2="'+(width-right)+'" y2="'+(top+plotH)+'" stroke="rgba(255,255,255,.34)" stroke-width="1.2"/>'+ 
    '<text x="18" y="'+(top+plotH/2)+'" transform="rotate(-90 18 '+(top+plotH/2)+')" text-anchor="middle" fill="rgba(255,255,255,.74)" font-size="12">누적 승점</text>'+ 
    paths+endpointLabels+'</svg></div>';
  const legend='<div class="team-points-chart-legend">'+series.map(s=>'<span><i style="background:'+s.color+'"></i>'+teamChip(s.team)+'</span>').join('')+'</div>';
  box.innerHTML=svg+legend;
}
function renderTeam(){
  renderLinkedRecordControls("team");
  const info=recordQueryInfo(), list=info.list||[];
  if($("#teamPeriodLabel")) $("#teamPeriodLabel").textContent=info.label+" · "+list.length+"경기";
  teamStandingFromList($("#teamTable"),list);
  renderTeamPointsChart(list,info);
  const ts=statsFromMatches(list).slice().sort((a,b)=>leagueTeamDisplayOrder(a.team)-leagueTeamDisplayOrder(b.team) || teamDisplayName(a.team).localeCompare(teamDisplayName(b.team),"ko")), ps=queryPlayerStats(list);
  $("#teamCards").innerHTML = ts.map(t=>{
    const top=ps.filter(p=>p.mainTeam===t.team&&p.g>0).sort((a,b)=>b.g-a.g||a.att-b.att||a.player.localeCompare(b.player)).slice(0,3);
    return '<div class="card"><div style="font-weight:650;margin-bottom:2px">'+teamChip(t.team)+'</div>'+ 
      '<div class="muted" style="font-size:12.5px;margin-bottom:14px">'+esc(info.label)+' · '+t.p+'경기 · 승점 '+t.pts+' · 승률 '+pct(t.w,t.p)+'%</div>'+ 
      '<div class="bar" style="margin-bottom:14px"><i style="width:'+pct(t.w,t.p)+'%;background:'+teamRecordColor(t.team)+'"></i></div>'+ 
      '<div class="sec-t" style="margin-bottom:6px">조회 구간 주요 득점</div>'+ 
      (top.length?top.map(p=>'<div style="font-size:13px;display:flex;justify-content:space-between"><span>'+esc(p.player)+'</span><span class="muted">'+p.g+'골 · '+p.att+'출석</span></div>').join(""):'<div class="muted" style="font-size:13px">기록 없음</div>')+'</div>';
  }).join("")||'';
}
function playerRecordSearchQuery(){return normalizePlayerMatchKey($('#memberPlayerSearch')?.value||'');}
function bindPlayerRecordSearch(){
  const input=$('#memberPlayerSearch'),clear=$('#playerRecordSearchClear');
  if(input)input.oninput=()=>renderPlayer();
  if(clear)clear.onclick=()=>{if(input){input.value='';renderPlayer();input.focus();}};
}
function renderPlayer(){
  bindPlayerRecordSearch();
  renderLinkedRecordControls("player");
  const info=recordQueryInfo(), list=info.list||[];
  if($("#playerPeriodLabel")) $("#playerPeriodLabel").textContent=info.label+" · "+list.length+"경기";
  const draftNames=draftPlayerNameSet(info.year);
  const search=playerRecordSearchQuery(),matchesName=name=>!search||normalizePlayerMatchKey(name).includes(search);
  const careerCutoff=normDate(info.end)||normDate(info.asOf)||recordDates()[0]||"";
  const careerMap=v319CareerStatsMap(careerCutoff);
  const allPlayers=queryPlayerStats(list).filter(p=>draftPlayerVisible(p.player,draftNames)).map(p=>{const achievements=v319AchievementList(careerMap[p.player]||{});return Object.assign(p,{achievements,achievementCount:achievements.length});}).sort((a,b)=>String(a.player||"").localeCompare(String(b.player||""),"ko-KR"));
  const ps=allPlayers.filter(p=>matchesName(p.player)),emptySearch='<div class="empty">검색한 이름과 일치하는 선수가 없습니다.</div>';
  if($('#playerRecordSearchStatus'))$('#playerRecordSearchStatus').textContent=(search?'검색 결과 ':'전체 ')+ps.length+'명 / '+allPlayers.length+'명';
  if($('#playerRecordSearchClear'))$('#playerRecordSearchClear').disabled=!String($('#memberPlayerSearch')?.value||'');
  if($("#playerPeriodLabel")) $("#playerPeriodLabel").textContent+=' · 선수명단 등록 선수 '+allPlayers.length+'명';
  $("#playerTable").innerHTML=tbl(
    [{t:"선수"},{t:"주 소속"},{t:"출석",n:1},{t:"출석률",n:1},{t:"승",n:1},{t:"무",n:1},{t:"패",n:1},{t:"승률",n:1},{t:"득점",n:1},{t:"어시스트",n:1},{t:"개인파울",n:1},{t:"선방",n:1},{t:"MOM",n:1},{t:"승점",n:1},{t:"업적",n:1}],
    ps.map(p=>[playerCardLink(p.player,playerFaceChip(p.player,false,info.year),info),'<span class="muted">'+teamChip(p.mainTeam)+'</span>',p.att,'<b>'+p.attendanceRate+'%</b>',p.w,p.d,p.l,p.winRate+'%',p.g,p.a||0,p.f||0,p.sv||0,p.mom||0,'<b>'+p.pts+'</b>',v319AchievementHtml(p.player,careerCutoff,true)])
  );
  if(search&&!ps.length)$('#playerTable').innerHTML=emptySearch;
  if($("#memberPlayerCards")) $("#memberPlayerCards").innerHTML=search&&!ps.length?emptySearch:mobilePlayerCards(ps,info);
  renderPlayerAchievementBoard(ps,careerCutoff);
  const rs=queryRosterStats(list).filter(r=>draftPlayerVisible(r.player,draftNames)&&matchesName(r.player));
  $("#rosterTable").innerHTML=rs.length?tbl(
    [{t:"연도"},{t:"팀"},{t:"등번호",n:1},{t:"선수"},{t:"포지션"},{t:"출석",n:1},{t:"팀 경기",n:1},{t:"출석률",n:1},{t:"득점",n:1},{t:"비고"}],
    rs.map(r=>[esc(r.year||"—"),'<span class="muted">'+teamChip(r.team)+'</span>',esc(r.no||""),playerCardLink(r.player,playerFaceChip(r.player,false,r.year||info.year),info),esc(r.pos||""),r.att,r.teamGames,'<b>'+r.rate+'%</b>','<b>'+r.g+'</b>','<span class="muted">'+esc(r.memo||"")+'</span>']))
    :search?emptySearch:'<div class="empty">선택한 조회 구간에 표시할 선수명단이 없습니다.</div>';
  const specials=DB.specials.filter(x=>{const d=normDate(x.date);return draftPlayerVisible(x.player,draftNames)&&matchesName(x.player)&&d&&(!info.start||d>=info.start)&&(!info.end||d<=info.end);}).sort((a,b)=>(b.date||"").localeCompare(a.date||""));
  $("#specialTable").innerHTML=search&&!specials.length?'<div class="empty">검색한 선수의 특이사항 기록이 없습니다.</div>':tbl([{t:"날짜"},{t:"선수"},{t:"구분"},{t:"내용"}],specials.map(x=>[esc(x.date),playerCardLink(x.player,'<b>'+esc(x.player)+'</b>',info),'<span class="pill">'+esc(x.type)+'</span>',esc(x.memo)]));
}
function pairStats(a,b,list){
  const ms=uniqueRecordMatches(list||chemMatches()), ids=new Set(ms.map(m=>detailMatchKey(m.id)));
  const goal=analysisGoalLookup(ms);
  const teamOf=new Map(); analysisAttendance(ms).forEach(r=>{
    const id=detailMatchKey(r.id),team=String(r.team||'').trim();
    if(!ids.has(id)||!r.player||!team)return;
    const key=JSON.stringify([id,normalizePlayerMatchKey(r.player)]);if(!teamOf.has(key))teamOf.set(key,new Set());teamOf.get(key).add(team);
  });
  const tog={p:0,w:0,d:0,l:0,ag:0,bg:0,rows:[]};
  const vs ={p:0,aw:0,d:0,bw:0,ag:0,bg:0,rows:[]};
  ms.slice().sort((x,y)=>(y.date||"").localeCompare(x.date||"")).forEach(m=>{
    const at=teamOf.get(JSON.stringify([detailMatchKey(m.id),normalizePlayerMatchKey(a)])),bt=teamOf.get(JSON.stringify([detailMatchKey(m.id),normalizePlayerMatchKey(b)]));
    if(at?.size!==1||bt?.size!==1)return;
    const ta=[...at][0],tb=[...bt][0];
    if(![m.home,m.away].includes(ta)||![m.home,m.away].includes(tb))return;
    const ag=goal(m.id,ta,a), bg=goal(m.id,tb,b);
    const resOf=t=>matchResult(m,t);
    const r=resOf(ta); if(!r) return;
    if(ta===tb){ tog.p++; tog[r.toLowerCase()]++; tog.ag+=ag; tog.bg+=bg; tog.rows.push({m,team:ta,r,ag,bg}); }
    else { vs.p++; if(r==="W") vs.aw++; else if(r==="D") vs.d++; else vs.bw++; vs.ag+=ag; vs.bg+=bg; vs.rows.push({m,ta,tb,r,ag,bg}); }
  });
  return {tog,vs};
}

/* ---------- V3.21.1 CHEMISTRY MAP NETWORK ---------- */
function chemistryNemesis(target,list){
  const names=chemPlayers().filter(name=>name!==target);
  const rows=names.map(name=>{
    const stats=pairStats(target,name,list||chemMatches()), vs=stats.vs;
    if(!vs.p)return null;
    return {name,p:vs.p,w:vs.aw,d:vs.d,l:vs.bw,gf:vs.ag,ga:vs.bg,pain:vs.bw-vs.aw};
  }).filter(Boolean);
  rows.sort((a,b)=>b.pain-a.pain||b.l-a.l||b.p-a.p||(a.gf-a.ga)-(b.gf-b.ga)||compareNamesKo(a.name,b.name));
  return rows[0]||null;
}
function chemistryMapPeerLinks(target,partners){
  const visible=new Set((partners||[]).map(x=>x.name).filter(Boolean)), links=new Map();
  (partners||[]).forEach(row=>{
    const from=row.name;if(!from)return;
    const all=chemistry(from).mates.filter(x=>x.name!==from&&visible.has(x.name));
    const qualified=all.filter(x=>x.p>=2), top=(qualified.length?qualified:all)[0];
    if(!top)return;
    const pair=[from,top.name].sort(compareNamesKo), key=pair.join('\u0000');
    const prev=links.get(key);
    const direction={from,to:top.name,score:top.score,p:top.p};
    if(prev){
      prev.directions.push(direction);
      prev.score=Math.max(prev.score,top.score);
      prev.p=Math.max(prev.p,top.p);
      prev.mutual=prev.directions.some(x=>x.from===pair[0]&&x.to===pair[1])&&prev.directions.some(x=>x.from===pair[1]&&x.to===pair[0]);
    }else links.set(key,{a:pair[0],b:pair[1],score:top.score,p:top.p,directions:[direction],mutual:false});
  });
  return [...links.values()];
}
function chemistryMapModel(target){
  const analysis=chemistry(target), qualified=analysis.mates.filter(x=>x.p>=2);
  const source=(qualified.length>=6?qualified:analysis.mates).slice(0,12);
  const maxTogether=Math.max(1,...source.map(x=>x.p));
  const scores=source.map(x=>Math.max(0,Math.min(100,num(x.score))));
  const minScore=scores.length?Math.min(...scores):0, maxScore=scores.length?Math.max(...scores):100;
  return {analysis,partners:source,maxTogether,minScore,maxScore,peerLinks:chemistryMapPeerLinks(target,source),nemesis:chemistryNemesis(target,chemMatches())};
}
function chemistryMapSvg(target,model){
  const W=780,H=500,cx=390,cy=250, nodes=model.partners;
  if(!nodes.length)return '<div class="empty chemistry-map-empty">함께 뛴 선수 기록이 없어 CHEMISTRY MAP을 만들 수 없습니다.</div>';
  const total=nodes.length, maxP=model.maxTogether;
  const minScore=Number.isFinite(model.minScore)?model.minScore:0, maxScore=Number.isFinite(model.maxScore)?model.maxScore:100;
  const relativeSize=score=>{
    const safe=Math.max(0,Math.min(100,num(score)));
    const t=maxScore>minScore?(safe-minScore)/(maxScore-minScore):.5;
    return 25+t*19;
  };
  const positions=nodes.map((row,i)=>{
    const angle=-Math.PI/2+(Math.PI*2*i/total)+(i%2?0.055:-0.055);
    const closeness=row.p/maxP;
    const radius=105+(1-closeness)*65;
    return {row,x:cx+Math.cos(angle)*radius*1.42,y:cy+Math.sin(angle)*radius*.76,i,r:relativeSize(row.score)};
  });
  const posByName=new Map(positions.map(p=>[p.row.name,p]));
  const peerLines=(model.peerLinks||[]).map(link=>{
    const a=posByName.get(link.a), b=posByName.get(link.b);if(!a||!b)return '';
    const score=Math.max(0,Math.min(100,num(link.score)));
    const width=(1.2+score/100*4.1).toFixed(2),opacity=(.28+score/100*.48).toFixed(2);
    const detail=link.directions.map(d=>esc(d.from)+' → '+esc(d.to)+' · '+d.p+'경기 · '+d.score+'점').join(' / ');
    return '<line class="chem-map-peer-link'+(link.mutual?' mutual':'')+'" x1="'+a.x.toFixed(1)+'" y1="'+a.y.toFixed(1)+'" x2="'+b.x.toFixed(1)+'" y2="'+b.y.toFixed(1)+'" style="stroke-width:'+width+';opacity:'+opacity+'"><title>BEST LINK · '+detail+'</title></line>';
  }).join('');
  const lines=positions.map(({row,x,y})=>{
    const width=(1.4+Math.max(0,Math.min(100,row.score))/100*7).toFixed(2);
    const opacity=(.28+Math.max(0,Math.min(100,row.score))/100*.58).toFixed(2);
    return '<line class="chem-map-link" x1="'+cx+'" y1="'+cy+'" x2="'+x.toFixed(1)+'" y2="'+y.toFixed(1)+'" style="stroke-width:'+width+';opacity:'+opacity+'"><title>'+esc(target)+' + '+esc(row.name)+' · '+row.p+'경기 · 커플점수 '+row.score+'</title></line>';
  }).join('');
  const partnerNodes=positions.map(({row,x,y,i,r})=>{
    const photo=playerPhoto(row.name),clip='chemClip'+i;
    const initials=esc(String(row.name||'?').trim().slice(0,2));
    const avatar=photo
      ?'<defs><clipPath id="'+clip+'"><circle cx="'+x.toFixed(1)+'" cy="'+y.toFixed(1)+'" r="'+r.toFixed(1)+'"/></clipPath></defs><image href="'+esc(photo)+'" x="'+(x-r).toFixed(1)+'" y="'+(y-r).toFixed(1)+'" width="'+(r*2).toFixed(1)+'" height="'+(r*2).toFixed(1)+'" preserveAspectRatio="xMidYMid slice" clip-path="url(#'+clip+')" class="chem-map-photo"/>'
      :'<circle class="chem-map-avatar-fallback" cx="'+x.toFixed(1)+'" cy="'+y.toFixed(1)+'" r="'+r.toFixed(1)+'"/><text class="chem-map-initials" x="'+x.toFixed(1)+'" y="'+(y+5).toFixed(1)+'">'+initials+'</text>';
    return '<g class="chem-map-node" data-chem-focus="'+esc(row.name)+'" role="button" tabindex="0" aria-label="'+esc(row.name)+' 선수 중심으로 보기">'+
      '<circle class="chem-map-node-ring" cx="'+x.toFixed(1)+'" cy="'+y.toFixed(1)+'" r="'+(r+4).toFixed(1)+'"/>'+avatar+
      '<rect class="chem-map-score-bg" x="'+(x-25).toFixed(1)+'" y="'+(y+r-2).toFixed(1)+'" width="50" height="21" rx="10.5"/>'+
      '<text class="chem-map-score" x="'+x.toFixed(1)+'" y="'+(y+r+12).toFixed(1)+'">'+row.score+' ♥</text>'+
      '<text class="chem-map-name" x="'+x.toFixed(1)+'" y="'+(y+r+37).toFixed(1)+'">'+esc(row.name)+'</text>'+
      '<text class="chem-map-games" x="'+x.toFixed(1)+'" y="'+(y+r+52).toFixed(1)+'">'+row.p+'경기</text></g>';
  }).join('');
  const centerPhoto=playerPhoto(target),centerR=53,centerClip='chemCenterClip';
  const centerAvatar=centerPhoto
    ?'<defs><clipPath id="'+centerClip+'"><circle cx="'+cx+'" cy="'+cy+'" r="'+centerR+'"/></clipPath></defs><image href="'+esc(centerPhoto)+'" x="'+(cx-centerR)+'" y="'+(cy-centerR)+'" width="'+(centerR*2)+'" height="'+(centerR*2)+'" preserveAspectRatio="xMidYMid slice" clip-path="url(#'+centerClip+')" class="chem-map-photo"/>'
    :'<circle class="chem-map-center-fallback" cx="'+cx+'" cy="'+cy+'" r="'+centerR+'"/><text class="chem-map-center-initials" x="'+cx+'" y="'+(cy+7)+'">'+esc(String(target||'?').trim().slice(0,2))+'</text>';
  return '<svg class="chemistry-map-svg" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+esc(target)+' 선수 Chemistry Map">'+
    '<circle class="chem-map-orbit chem-map-orbit-one" cx="'+cx+'" cy="'+cy+'" r="125"/><circle class="chem-map-orbit chem-map-orbit-two" cx="'+cx+'" cy="'+cy+'" r="165"/>'+peerLines+lines+partnerNodes+
    '<g class="chem-map-center"><circle class="chem-map-center-ring" cx="'+cx+'" cy="'+cy+'" r="60"/>'+centerAvatar+
    '<rect class="chem-map-center-label-bg" x="'+(cx-75)+'" y="'+(cy+65)+'" width="150" height="35" rx="17.5"/><text class="chem-map-center-name" x="'+cx+'" y="'+(cy+88)+'">'+esc(target)+'</text></g></svg>';
}
function chemistryMapSideHtml(target,model){
  const partners=(model.analysis.mates.filter(x=>x.p>=2).length?model.analysis.mates.filter(x=>x.p>=2):model.analysis.mates).slice(0,3);
  const medals=['🥇','🥈','🥉'];
  const partnerHtml=partners.length?partners.map((x,i)=>
    '<button type="button" class="chem-side-partner" data-chem-other="'+esc(x.name)+'"><span class="chem-side-rank">'+medals[i]+'</span><span class="chem-side-person">'+playerFaceChip(x.name,false)+'<small>'+x.p+'경기 · '+x.w+'승 '+x.d+'무 '+x.l+'패 · 승률 '+x.rate+'%</small></span><strong>'+x.score+'</strong></button>'
  ).join(''):'<div class="chem-side-empty">2경기 이상 함께 뛴 파트너가 없습니다.</div>';
  const n=model.nemesis;
  const nemesisHtml=n?'<button type="button" class="chem-nemesis" data-chem-other="'+esc(n.name)+'"><span class="chem-nemesis-icon">⚔</span><span class="chem-side-person">'+playerFaceChip(n.name,false)+'<small>맞대결 '+n.p+'경기 · '+esc(target)+' 기준 <b>'+n.w+'승 '+n.d+'무 '+n.l+'패</b><br>득점 '+n.gf+' : '+n.ga+'</small></span><span class="chem-nemesis-tag">NEMESIS</span></button>':'<div class="chem-side-empty">맞대결 기록이 없습니다.</div>';
  return '<section class="chem-side-profile"><span class="chem-side-eyebrow">'+esc(String(target).toUpperCase())+' CHEMISTRY</span>'+playerFaceChip(target,true)+'<div class="chem-side-base"><b>'+model.analysis.base+'경기</b><span>출전</span><b>'+model.analysis.baseRate+'%</b><span>승률</span><b>'+model.analysis.baseGoals+'골</b><span>득점</span></div></section>'+
    '<section class="chem-side-section"><h3>BEST PARTNER</h3>'+partnerHtml+'</section><section class="chem-side-section nemesis-section"><h3>NEMESIS</h3>'+nemesisHtml+'<p>맞대결에서 선택 선수에게 가장 어려웠던 상대를 패배 우위 → 패배 수 → 맞대결 수 순으로 계산합니다.</p></section>';
}
function bindChemistryMapInteractions(){
  const map=$('#chemistryMap'),side=$('#chemistryMapSide');
  const focus=name=>{if(!name||name===chemSel)return;chemSel=name;chemOther='';renderChem();requestAnimationFrame(()=>$('#chemistryMap')?.scrollIntoView({block:'nearest',behavior:'smooth'}));};
  if(map){
    map.querySelectorAll('[data-chem-focus]').forEach(el=>{
      const run=()=>focus(el.getAttribute('data-chem-focus'));
      el.addEventListener('click',run);
      el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();run();}});
    });
  }
  if(side)side.querySelectorAll('[data-chem-other]').forEach(el=>el.addEventListener('click',()=>{
    const name=el.getAttribute('data-chem-other');if(!name||name===chemSel)return;
    chemOther=name;const input=$('#chemOther');if(input)input.value=name;renderPair(chemSel,chemOther);updateChemCompareButton();
    $('#chemPair')?.scrollIntoView({block:'nearest',behavior:'smooth'});
  }));
}
function renderChemistryMap(){
  const map=$('#chemistryMap'),side=$('#chemistryMapSide'),note=$('#chemMapNote');if(!map||!side)return;
  if(!chemSel){map.innerHTML='<div class="empty chemistry-map-empty">분석할 선수를 선택해 주세요.</div>';side.innerHTML='';return;}
  const model=chemistryMapModel(chemSel);
  map.innerHTML=chemistryMapSvg(chemSel,model);side.innerHTML=chemistryMapSideHtml(chemSel,model);
  if(note)note.textContent=(chemYear==='ALL'?'전체 연도':chemYear+'년')+' · 최대 12명 · 중심 거리는 동행경기, 원 크기는 선택 선수와의 커플점수 상대비교, 점선은 12명 사이 각 선수의 BEST PARTNER 연결입니다.';
  bindChemistryMapInteractions();
}

function normalizePlayerPhotoUrl(src){
  let v=String(src||'').trim().replace(/&amp;/g,'&').replace(/^['"]|['"]$/g,'').trim();
  if(!v)return '';
  const formula=photoFormulaArgument(v);
  if(formula){if(formula.url===null)return '';v=formula.url.trim();}
  if(/^=|^#(?:VALUE!|REF!|N\/A|NAME\?|SPILL!|BLOCKED!)/i.test(v))return '';
  if(/^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(v))return v;
  if(/^www\./i.test(v))v='https://'+v;
  // Accept repository-relative images; reject executable, local, and unknown URL schemes.
  if(/^[a-z][a-z0-9+.-]*:/i.test(v) && !/^https?:/i.test(v))return '';
  if(/[\u0000-\u001f\u007f]/.test(v))return '';
  if(!/^https?:|^\/\//i.test(v)&&!/[\/]|\.(?:png|jpe?g|webp|gif|avif|svg)(?:[?#]|$)/i.test(v))return '';
  if(v.includes('\\'))return '';
  try{
    const u=new URL(v,location.href);
    if(!['https:','http:'].includes(u.protocol) || u.username || u.password)return '';
    if(u.hostname==='github.com'){
      const p=u.pathname.split('/');
      if(p[3]==='blob' && p.length>=6){u.hostname='raw.githubusercontent.com';p.splice(3,1);u.pathname=p.join('/');}
    }
    if(u.hostname==='drive.google.com'||u.hostname==='www.drive.google.com'){
      const m=u.pathname.match(/\/file\/d\/([^/]+)/), id=m?m[1]:u.searchParams.get('id');
      if(!id||!/^[\w-]+$/.test(id))return '';
      const image=new URL('https://drive.google.com/thumbnail');
      image.searchParams.set('id',id);image.searchParams.set('sz','w800');
      const key=u.searchParams.get('resourcekey');if(key)image.searchParams.set('resourcekey',key);
      return image.href;
    }
    if(u.hostname==='dropbox.com'||u.hostname==='www.dropbox.com'){
      u.searchParams.delete('dl');u.searchParams.set('raw','1');
    }
    return u.href;
  }catch(e){return '';}
}

function playerPhotoCandidates(source){
  const first=normalizePlayerPhotoUrl(source);if(!first)return [];
  const urls=[first];
  try{
    const u=new URL(first);
    if(u.hostname==='drive.google.com'&&u.searchParams.has('id')){
      const backup=new URL('https://drive.google.com/uc');
      backup.searchParams.set('export','view');backup.searchParams.set('id',u.searchParams.get('id'));
      const key=u.searchParams.get('resourcekey');if(key)backup.searchParams.set('resourcekey',key);
      urls.push(backup.href);
    }
  }catch(e){}
  return [...new Set(urls)];
}
function handlePlayerPhotoError(img){
  const sources=playerPhotoCandidates(img.dataset.playerPhotoSource||'');
  const next=(Number(img.dataset.photoIndex)||0)+1;
  if(next<sources.length){img.dataset.photoIndex=String(next);img.src=sources[next];return;}
  const wrapper=img.parentElement||img.parentNode;
  if(wrapper){wrapper.title='사진을 불러오지 못했습니다. 사진 링크와 공개 설정을 확인해 주세요.';wrapper.dataset.photoState='unavailable';}
  img.remove();
}
function playerPhoto(name,year=chemYear){
  const row=selectPlayerRoster(name,year==='ALL'?'':year);
  return normalizePlayerPhotoUrl(row?.photo||'');
}
function playerFaceChip(name,large,year=chemYear){
  const nm=String(name||""), photo=playerPhoto(nm,year);
  const initial=esc(Array.from(nm.replace(/\s+/g,"")).slice(0,1).join("")||"선");
  const image=photo?'<img src="'+esc(photo)+'" data-player-photo-source="'+esc(photo)+'" data-photo-index="0" alt="'+esc(nm)+' 선수 사진" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="handlePlayerPhotoError(this)">':'';
  return '<span class="player-face-chip'+(large?' large':'')+'"><span class="player-face"><span class="player-face-fallback">'+initial+'</span>'+image+'</span><span class="player-face-name">'+esc(nm)+'</span></span>';
}

function monthlyPlayerStats(player){
  const all=matches().filter(m=>{
    const d=normDate(m.date);
    return d && (chemYear==="ALL" || d.slice(0,4)===chemYear);
  });
  const M={}; all.forEach(m=>M[m.id]=m);
  const ids=new Set(all.map(m=>m.id));
  const bucket={};
  const get=ym=>bucket[ym]||(bucket[ym]={month:ym,att:0,w:0,d:0,l:0,g:0,pts:0,teams:{},teamGames:0,attendanceRate:0,winRate:0});
  const seen=new Set();
  DB.attendance.forEach(r=>{
    if(!r.player || r.player!==player || !ids.has(r.id)) return;
    const key=r.id+"|"+r.player;
    if(seen.has(key)) return;
    seen.add(key);
    const m=M[r.id]; if(!m) return;
    const ym=normDate(m.date).slice(0,7); if(!ym) return;
    const B=get(ym), team=String(r.team||"").trim();
    B.att++;
    if(team) B.teams[team]=(B.teams[team]||0)+1;
    const res=matchResult(m,team);
    if(res==="W"){B.w++;B.pts+=3;} else if(res==="D"){B.d++;B.pts++;} else if(res==="L") B.l++;
  });
  DB.goals.forEach(r=>{
    if(!r.player || r.player!==player || !ids.has(r.id)) return;
    const m=M[r.id]; if(!m) return;
    const ym=normDate(m.date).slice(0,7); if(!ym) return;
    get(ym).g+=num(r.g);
  });
  let months=[];
  if(chemYear!=="ALL") months=Array.from({length:12},(_,i)=>chemYear+"-"+String(i+1).padStart(2,"0"));
  else {
    const existing=[...new Set(all.map(m=>normDate(m.date).slice(0,7)).filter(Boolean))].sort();
    months=existing;
  }
  months.forEach(ym=>{
    const B=get(ym);
    let main=Object.entries(B.teams).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],"ko-KR"))[0];
    let mainTeam=main?main[0]:"";
    if(!mainTeam){
      const y=ym.slice(0,4);
      const rr=DB.roster.find(r=>r.player===player && (!r.year || String(r.year)===y));
      mainTeam=rr?String(rr.team||"").trim():"";
    }
    B.mainTeam=mainTeam;
    B.teamGames=all.filter(m=>normDate(m.date).slice(0,7)===ym && mainTeam && (m.home===mainTeam||m.away===mainTeam)).length;
    B.attendanceRate=pct(B.att,B.teamGames);
    B.winRate=pct(B.w,B.w+B.d+B.l);
  });
  return months.map(ym=>bucket[ym]).filter(Boolean);
}
function monthlyMetricInfo(){
  return {
    att:{label:"경기수",unit:"경기",pct:false},
    g:{label:"득점",unit:"골",pct:false},
    wdl:{label:"승·무·패",unit:"경기",pct:false,multi:true},
    pts:{label:"승점",unit:"점",pct:false},
    winRate:{label:"승률",unit:"%",pct:true},
    attendanceRate:{label:"출석률",unit:"%",pct:true}
  }[monthlyMetric] || {label:"득점",unit:"골",pct:false};
}
function monthlyLineChart(rows){
  const info=monthlyMetricInfo();
  if(!rows.length) return '<div class="empty">월별 그래프를 표시할 경기 기록이 없습니다.</div>';
  const W=Math.max(760,rows.length*72), H=info.multi?330:300, L=48,R=24,T=info.multi?55:30,B=54, cw=W-L-R,ch=H-T-B;
  const x=i=>L+(rows.length===1?cw/2:(cw*i/(rows.length-1)));

  if(info.multi){
    const series=[
      {key:"w",label:"승",cls:"monthly-chart-win",color:"#00a85a",shift:-4,labelDy:-11},
      {key:"d",label:"무",cls:"monthly-chart-draw",color:"#f28c28",shift:0,labelDy:4},
      {key:"l",label:"패",cls:"monthly-chart-loss",color:"#e90052",shift:4,labelDy:16}
    ];
    const allVals=series.flatMap(S=>rows.map(r=>num(r[S.key])));
    let max=Math.max(1,...allVals);
    max=Math.max(1,Math.ceil(max*1.2));
    const y=v=>T+ch-(Math.max(0,Math.min(max,v))/max)*ch;
    let grid='';
    for(let i=0;i<=4;i++){
      const yy=T+ch*i/4, val=Math.round(max*(1-i/4));
      grid+='<line class="monthly-chart-grid" x1="'+L+'" y1="'+yy+'" x2="'+(W-R)+'" y2="'+yy+'"></line>'+ 
        '<text class="monthly-chart-axis" x="'+(L-8)+'" y="'+(yy+4)+'" text-anchor="end">'+val+'</text>';
    }
    const legend='<g class="monthly-chart-legend">'+series.map((S,i)=>{
      const lx=L+i*88, ly=22;
      return '<line class="'+S.cls+'" x1="'+lx+'" y1="'+ly+'" x2="'+(lx+22)+'" y2="'+ly+'" stroke="'+S.color+'"></line>'+ 
        '<circle cx="'+(lx+11)+'" cy="'+ly+'" r="3.5" fill="'+S.color+'"></circle>'+ 
        '<text x="'+(lx+30)+'" y="'+ly+'" fill="'+S.color+'">'+S.label+'</text>';
    }).join('')+'</g>';
    const axisLabels=rows.map((r,i)=>{
      const lab=chemYear==="ALL"?r.month:r.month.slice(5)+"월";
      return '<text class="monthly-chart-axis" x="'+x(i)+'" y="'+(H-20)+'" text-anchor="middle">'+esc(lab)+'</text>';
    }).join('');
    const lines=series.map((S,si)=>{
      const vals=rows.map(r=>num(r[S.key]));
      const pts=rows.map((r,i)=>(x(i)+S.shift)+','+y(vals[i])).join(' ');
      const poly=rows.length>1?'<polyline class="monthly-chart-line '+S.cls+'" style="animation-delay:'+(si*90)+'ms" points="'+pts+'"></polyline>':'';
      const points=rows.map((r,i)=>{
        const delay=170+i*45+si*70, val=vals[i], xx=x(i)+S.shift, yy=y(val);
        return '<circle class="monthly-chart-dot '+S.cls+'" style="animation-delay:'+delay+'ms" cx="'+xx+'" cy="'+yy+'" r="3.5"><title>'+esc(r.month)+' · '+S.label+' '+val+'경기</title></circle>'+ 
          '<text class="monthly-chart-value '+S.cls+'" style="animation-delay:'+(delay+35)+'ms" x="'+xx+'" y="'+Math.max(12,Math.min(H-B-2,yy+S.labelDy))+'">'+val+'</text>';
      }).join('');
      return poly+points;
    }).join('');
    return '<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+esc(chemSel)+' 월별 승 무 패 그래프">'+grid+legend+lines+axisLabels+'</svg>';
  }

  const vals=rows.map(r=>num(r[monthlyMetric]));
  let max=info.pct?100:Math.max(1,...vals);
  if(!info.pct) max=Math.max(1,Math.ceil(max*1.15));
  const y=v=>T+ch-(Math.max(0,Math.min(max,v))/max)*ch;
  const pts=rows.map((r,i)=>x(i)+','+y(vals[i])).join(' ');
  const area=rows.length>1?L+','+(T+ch)+' '+pts+' '+x(rows.length-1)+','+(T+ch):'';
  let grid='';
  for(let i=0;i<=4;i++){
    const yy=T+ch*i/4, val=Math.round(max*(1-i/4));
    grid+='<line class="monthly-chart-grid" x1="'+L+'" y1="'+yy+'" x2="'+(W-R)+'" y2="'+yy+'"></line>'+ 
      '<text class="monthly-chart-axis" x="'+(L-8)+'" y="'+(yy+4)+'" text-anchor="end">'+val+(info.pct?'%':'')+'</text>';
  }
  const labels=rows.map((r,i)=>{
    const lab=chemYear==="ALL"?r.month:r.month.slice(5)+"월";
    const delay=180+i*45;
    return '<text class="monthly-chart-axis" x="'+x(i)+'" y="'+(H-20)+'" text-anchor="middle">'+esc(lab)+'</text>'+ 
      '<circle class="monthly-chart-dot" style="animation-delay:'+delay+'ms" cx="'+x(i)+'" cy="'+y(vals[i])+'" r="3.5"><title>'+esc(r.month)+' · '+info.label+' '+vals[i]+info.unit+'</title></circle>'+ 
      '<text class="monthly-chart-value" style="animation-delay:'+(delay+40)+'ms" x="'+x(i)+'" y="'+Math.max(14,y(vals[i])-10)+'">'+vals[i]+(info.pct?'%':'')+'</text>';
  }).join('');
  return '<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+esc(chemSel)+' 월별 '+info.label+' 그래프">'+ 
    '<defs><linearGradient id="monthlyArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#37003c"/><stop offset="100%" stop-color="#37003c" stop-opacity="0"/></linearGradient></defs>'+grid+ 
    (rows.length>1?'<polygon class="monthly-chart-area" points="'+area+'"></polygon><polyline class="monthly-chart-line" points="'+pts+'"></polyline>':'')+labels+'</svg>';
}
function renderMonthlyPlayerStats(){
  const chart=$("#monthlyChart"); if(!chart) return;
  const rows=monthlyPlayerStats(chemSel);
  const active=rows.filter(r=>r.att||r.g||r.teamGames);
  const shown=chemYear==="ALL"?active:rows;
  const total=active.reduce((a,r)=>({att:a.att+r.att,g:a.g+r.g,pts:a.pts+r.pts,w:a.w+r.w,d:a.d+r.d,l:a.l+r.l,teamGames:a.teamGames+r.teamGames}),{att:0,g:0,pts:0,w:0,d:0,l:0,teamGames:0});
  const overallWin=pct(total.w,total.w+total.d+total.l), overallAtt=pct(total.att,total.teamGames);
  $("#monthlyStatNote").textContent=(chemYear==="ALL"?"전체 기록의 실제 경기 월":"선택 연도의 1월~12월")+" · "+chemSel+" 기준";
  $("#monthlySummary").innerHTML=[
    ["경기수",total.att+"경기"],["득점",total.g+"골"],["승점",total.pts+"점"],["승률",overallWin+"%"],["출석률",overallAtt+"%"]
  ].map(x=>'<div class="monthly-summary-item"><div class="k">'+x[0]+'</div><div class="v">'+x[1]+'</div></div>').join('');
  chart.innerHTML=monthlyLineChart(shown);
  $("#monthlyStatTable").innerHTML=shown.length?tbl(
    [{t:"월"},{t:"주 소속"},{t:"경기",n:1},{t:"승",n:1},{t:"무",n:1},{t:"패",n:1},{t:"승률",n:1},{t:"득점",n:1},{t:"승점",n:1},{t:"팀 경기",n:1},{t:"출석률",n:1}],
    shown.map(r=>[esc(r.month),r.mainTeam?teamChip(r.mainTeam):'<span class="muted">—</span>',r.att,r.w,r.d,r.l,r.winRate+'%',r.g,r.pts,r.teamGames,r.attendanceRate+'%'])
  ):'<div class="empty">월별 STATISTICS를 계산할 기록이 없습니다.</div>';
}

function renderPair(a,b){
  const box=$("#chemPair");
  if(!a||!b||a===b){ box.innerHTML='<div class="muted" style="font-size:12.5px">상대 선수를 고르면 두 선수의 동행 기록과 맞대결 기록을 비교해 보여줍니다.</div>'; return; }
  const {tog,vs}=pairStats(a,b);
  const rate=pct(tog.w,tog.p);
  const chip=(t)=>teamChip(t);
  const head='<div class="sec-t chem-pair-title" style="margin:0 0 10px">'+playerFaceChip(a,false)+' <span class="muted">vs</span> '+playerFaceChip(b,false)+' <span>상세 분석</span></div>';
  const t1='<div style="font-size:13.5px;margin-bottom:6px"><b>같은 팀 동행</b> '+tog.p+'경기 · '+tog.w+'·'+tog.d+'·'+tog.l+' · 승률 <b>'+rate+'%</b> · '+esc(a)+' '+tog.ag+'골 / '+esc(b)+' '+tog.bg+'골</div>';
  const t2='<div style="font-size:13.5px;margin-bottom:10px"><b>맞대결</b> '+vs.p+'경기 · '+esc(a)+' '+vs.aw+'승 · 무 '+vs.d+' · '+esc(b)+' '+vs.bw+'승 · '+esc(a)+' '+vs.ag+'골 / '+esc(b)+' '+vs.bg+'골</div>';
  const rowsT=tog.rows.slice(0,10).map(x=>[esc(x.m.date), esc(x.m.comp||""), (x.m.no?esc(x.m.no):"")+(x.m.round?" / "+esc(x.m.round):""), chip(x.team),
    x.r==="W"?'<b style="color:#46A171">승</b>':x.r==="D"?'<b>무</b>':'<b style="color:#E56458">패</b>', x.ag+"골", x.bg+"골"]);
  const rowsV=vs.rows.slice(0,10).map(x=>[esc(x.m.date), esc(x.m.comp||""), (x.m.no?esc(x.m.no):"")+(x.m.round?" / "+esc(x.m.round):""), chip(x.ta)+' <span class="muted">vs</span> '+chip(x.tb),
    x.r==="W"?'<b style="color:#46A171">'+esc(a)+' 승</b>':x.r==="D"?'<b>무승부</b>':'<b style="color:#E56458">'+esc(b)+' 승</b>', x.ag+"골", x.bg+"골"]);
  box.innerHTML = head + t1 + t2 +
    '<div class="grid g2">'+
      '<div><div class="muted" style="font-size:12.5px;margin-bottom:6px">같은 팀으로 뛰 경기</div><div class="tablewrap">'+
        (rowsT.length? tbl([{t:"날짜"},{t:"대회"},{t:"경기/라운드"},{t:"팀"},{t:"결과",n:1},{t:esc(a),n:1},{t:esc(b),n:1}], rowsT) : '<div class="empty">함께 뛰 경기가 없습니다.</div>')+'</div></div>'+
      '<div><div class="muted" style="font-size:12.5px;margin-bottom:6px">서로 다른 팀으로 만난 경기</div><div class="tablewrap">'+
        (rowsV.length? tbl([{t:"날짜"},{t:"대회"},{t:"경기/라운드"},{t:"대결"},{t:"결과",n:1},{t:esc(a),n:1},{t:esc(b),n:1}], rowsV) : '<div class="empty">맞대결 기록이 없습니다.</div>')+'</div></div>'+
    '</div>';
}
function renderChem(){
  const ys = yearList(), ysel = $("#chemYear");
  if(chemYear!=="ALL" && !ys.includes(chemYear)) chemYear="ALL";
  ysel.innerHTML = '<option value="ALL"'+(chemYear==="ALL"?" selected":"")+'>전체 연도</option>'+
    ys.map(y=>'<option'+(y===chemYear?" selected":"")+'>'+esc(y)+'</option>').join("");
  const names = chemPlayers();
  const sel = $("#chemPlayer"), otherInput = $("#chemOther");
  const playerSuggest=$("#chemPlayerSuggest"), otherSuggest=$("#chemOtherSuggest");
  if(!names.length){
    chemSel='';chemOther='';updateChemCompareButton();
    sel.value='';
    if(playerSuggest){playerSuggest.innerHTML='';playerSuggest.classList.remove("on");}
    $("#chemSum").innerHTML='<span class="muted">해당 조건의 경기 기록이 없습니다.</span>';
    otherInput.value='';
    if(otherSuggest){otherSuggest.innerHTML='';otherSuggest.classList.remove("on");}
    $("#chemPair").innerHTML='';
    if($("#monthlySummary")) $("#monthlySummary").innerHTML='';
    if($("#monthlyChart")) $("#monthlyChart").innerHTML='<div class="empty">월별 STATISTICS를 표시할 선수가 없습니다.</div>';
    if($("#monthlyStatTable")) $("#monthlyStatTable").innerHTML='';
    $("#chemMate").innerHTML='<div class="empty">데이터가 없습니다.</div>';
    $("#chemCoach").innerHTML='<div class="empty">데이터가 없습니다.</div>';
    if($("#chemistryMap")) $("#chemistryMap").innerHTML='<div class="empty chemistry-map-empty">CHEMISTRY MAP을 표시할 선수가 없습니다.</div>';
    if($("#chemistryMapSide")) $("#chemistryMapSide").innerHTML=''; return;
  }
  if(!chemSel || !names.includes(chemSel)) chemSel = names[0];
  sel.value = chemSel;
  if(playerSuggest){playerSuggest.innerHTML='';playerSuggest.classList.remove("on");}
  const others = names.filter(n=>n!==chemSel);
  if(chemOther && !others.includes(chemOther)) chemOther="";
  otherInput.value = chemOther || '';
  if(otherSuggest){otherSuggest.innerHTML='';otherSuggest.classList.remove("on");}
  const c = chemistry(chemSel);
  $("#chemSum").innerHTML = '<div class="chem-selected-summary">'+playerFaceChip(chemSel,true)+'<span>· '+(chemYear==="ALL"?"전체 연도":chemYear+"년")+
    ' 기준 <b>'+c.base+'경기</b> 출전 · 승률 <b>'+c.baseRate+'%</b> ('+c.bw+'·'+c.bd+'·'+c.bl+') · 득점 <b>'+c.baseGoals+'골</b> (경기당 '+c.baseGpg+'골)</span></div>';
  $("#chemSum").innerHTML+='<p class="chem-goal-scope">베스트 커플 득점은 <b>두 선수가 같은 경기·같은 팀으로 함께 출석한 경기</b>에서의 각 선수 득점입니다. 상대팀으로 만났거나 한 선수만 출석한 경기의 골은 제외되어, 위의 전체 출석경기 득점과 다를 수 있습니다.</p>';
  $("#chemSum").innerHTML+='<p class="chem-goal-scope">경기일에 유효한 팀스쿼드와 선수 시작일을 적용합니다. 스쿼드만으로 출석이나 득점을 추가하지 않습니다. 출석팀 불일치·시작일 이전 기록은 분석에서 제외하며 관리자가 원본을 확인할 수 있습니다.</p>';
  const squadIssues=squadRecordIssues(chemMatches(),[chemSel,chemOther]);
  if(squadIssues.length)$("#chemSum").innerHTML+='<p class="chem-goal-scope">선택 선수의 스쿼드·시작일 확인 대상 '+squadIssues.length+'건이 있습니다. 원본 확인 전 분석 결과는 잠정값입니다.</p>';
  if($("#monthlyMetric")) $("#monthlyMetric").value=monthlyMetric;
  renderChemistryMap();
  renderMonthlyPlayerStats();
  const bar = v => '<div class="bar"><i style="width:'+Math.min(v,100)+'%;background:'+(v>=60?"#46A171":v>=40?"#2783DE":"#D5803B")+'"></i></div>';
  const main = c.mates.filter(x=>x.p>=2);
  const rowsM = (main.length>=10? main : main.concat(c.mates.filter(x=>x.p<2))).slice(0,10);
  $("#chemMate").innerHTML = rowsM.length? tbl(
    [{t:"동료"},{t:"동행",n:1},{t:"승·무·패",n:1},{t:"승률",n:1},{t:"출석률",n:1},{t:"동행 중 본인 득점",n:1},{t:"동행 중 동료 득점",n:1},{t:"커플점수",n:1},{t:""}],
    rowsM.map(x=>[playerFaceChip(x.name,false), x.p+"경기", x.w+"·"+x.d+"·"+x.l, x.rate+"%", x.att+"%", x.tg+"골", x.mg+"골", "<b>"+x.score+"</b>", bar(x.score)]))
    : '<div class="empty">2경기 이상 함께 뛰어 분석할 조합이 없습니다.</div>';
  $("#chemCoach").innerHTML = c.coaches.length? tbl(
    [{t:"감독"},{t:"동행",n:1},{t:"승·무·패",n:1},{t:"승률",n:1},{t:"출석률",n:1},{t:"본인 득점",n:1},{t:"감독점수",n:1},{t:""}],
    c.coaches.slice(0,10).map(x=>[esc(x.name), x.p+"경기", x.w+"·"+x.d+"·"+x.l, x.rate+"%", x.att+"%", x.tg+"골", "<b>"+x.score+"</b>", bar(x.score)]))
    : '<div class="empty">감독 기록이 없습니다.</div>';
  renderPair(chemSel, chemOther);
  updateChemCompareButton();
}
function rosterStats(){
  const ps = playerStats(), byName = {};
  ps.forEach(p=>byName[p.player]=p);
  const teamGames={};
  matches().forEach(m=>{ [m.home,m.away].forEach(t=>{ if(t) teamGames[t]=(teamGames[t]||0)+1; }); });
  const out = DB.roster.filter(r=>r.player&&!isOwnGoalPlayer(r.player)).map(r=>{
    const p = byName[r.player] || {att:0,g:0};
    const tg = teamGames[r.team] || p.teamGames || 0;
    return { year:r.year, team:r.team||p.mainTeam||"-", no:r.no, player:r.player, pos:r.pos, memo:r.memo, photo:r.photo||"",
      att:p.att||0, g:p.g||0, teamGames:tg, rate:pct(p.att||0, tg) };
  });
  const known = new Set(out.map(r=>r.player));
  ps.filter(p=>!known.has(p.player) && p.att>0).forEach(p=>out.push({
    year:"", team:p.mainTeam, no:"", player:p.player, pos:"", memo:"명단 미등록", photo:"",
    att:p.att, g:p.g, teamGames:p.teamGames, rate:pct(p.att,p.teamGames) }));
  return out.sort((a,b)=> (a.team||"").localeCompare(b.team||"") || b.att-a.att || b.g-a.g);
}
function autoHalf(m){
  const d=String(m.date||""), y=d.slice(0,4);
  if(!/^\d{4}$/.test(y)) return "";
  const c=seasonCfg(y);
  if(d>=c.h1s && d<=c.h1e) return "\uc0c1\ubc18\uae30";
  if(d>=c.h2s && d<=c.h2e) return "\ud558\ubc18\uae30";
  return "";
}
function buildRecordXlsx(){
  const mrows=[];
  matches().slice().sort((a,b)=>(a.date||"").localeCompare(b.date||"")).forEach(m=>{
    [[m.home,m.away,m.hs,m.as,m.hf],[m.away,m.home,m.as,m.hs,m.af]].forEach(([t,o,gf,ga,f])=>{
      if(!t) return;
      const att = DB.attendance.filter(a=>a.id===m.id && a.team===t);
      const coach = (att[0]||{}).coach || "";
      const sc = DB.goals.filter(g=>g.id===m.id && g.team===t && g.g>0)
        .map(g=>g.player+" "+g.g).join(", ");
      const ac = DB.goals.filter(g=>g.id===m.id && g.team===t && num(g.a)>0)
        .map(g=>g.player+" "+num(g.a)).join(", ");
      const pf = (DB.fouls||[]).filter(g=>g.id===m.id && g.team===t && num(g.fouls)>0)
        .map(g=>g.player+" "+num(g.fouls)).join(", ");
      const sv = (DB.saves||[]).filter(g=>g.id===m.id && g.team===t && num(g.saves)>0)
        .map(g=>g.player+" "+num(g.saves)).join(", ");
      const mom = (DB.moms||[]).filter(g=>g.id===m.id && g.team===t && num(g.mom)>0)
        .map(g=>g.player+(num(g.mom)>1?" "+num(g.mom):"")).join(", ");
      mrows.push(uniRow(m.date, m.comp, halfLabel(normHalf(m.half))||autoHalf(m), m.round||"", m.no||"", t, coach, o, gf, ga, f, att.map(a=>a.player), sc, isForfeitTeam(m,t)?"몰수패":"", matchTeamGroup(m,t), ac, pf, sv, mom, ""));
    });
  });
  const registered=draftPlayerNameSet();
  const rs = rosterStats().filter(r=>draftPlayerVisible(r.player,registered));
  return [
    { name:UNI.name, head:UNI.head, rows:mrows.length?mrows:UNI.rows },
    { name:"선수명단", head:"연도,팀,등번호,선수,영문이름,포지션,비고,사진(URL),시즌,시작일자,출석,팀경기수,출석률,득점누계,어시스트누계,개인파울누계,선방누계,MOM누계",
      rows: rs.map(r=>{
        const raw=(DB.roster||[]).find(x=>String(x.player||"").trim()===String(r.player||"").trim() && String(x.year||"").trim()===String(r.year||"").trim()) ||
                  (DB.roster||[]).find(x=>String(x.player||"").trim()===String(r.player||"").trim()) || {};
        const psAll=playerStats().find(p=>p.player===r.player)||{};
        return [r.year||"", r.team||"", r.no||"", r.player, raw.engName||"", r.pos||"", r.memo||"", r.photo||"", raw.season||"", raw.startDate||"", r.att, r.teamGames, r.rate+"%", r.g, psAll.a||0, psAll.f||0, psAll.sv||0, psAll.mom||0].map(String);
      }) },
    { name:"팀스쿼드", head:"날짜,대회,반기,그룹,팀,감독,코치,"+Array.from({length:15},(_,i)=>'선수'+(i+1)).join(','),
      rows:squadRows().map(r=>[r.date,r.comp,halfLabel(r.half),r.group,r.team,r.members.find(x=>x.role==='감독')?.player||'',r.members.find(x=>x.role==='코치')?.player||'',...Array.from({length:15},(_,i)=>r.members.filter(x=>x.role==='선수')[i]?.player||'')]) },
    { name:"스페셜기록", head:SCHEMA.specials.head,
      rows: DB.specials.map(s=>[s.date||"", s.player||"", s.type||"", s.memo||""]) }
  ];
}
function logoSettingRow(type,key,label){
  ensureLogoSettings();
  const src=type==="team"?teamLogo(key):type==="league"?leagueLogo(key):headerLogo();
  const editable=type!=="header";
  const shownLabel=type==="team"?teamDisplayName(key):type==="league"?leagueGroupLabel(key):label;
  return '<div class="logo-row logo-row-editable" data-logo-row="'+type+'|'+esc(key)+'">'+
    '<div class="logo-preview">'+(src?'<img src="'+src+'" alt="">':esc(type==="league"?key:type==="header"?'HEAD':'LOGO'))+'</div>'+ 
    '<div class="logo-row-main">'+
      (editable?'<input class="logo-name-input" type="text" maxlength="30" value="'+esc(shownLabel)+'" data-logo-name="1" data-logo-type="'+type+'" data-logo-key="'+esc(key)+'"'+(admin?'':' disabled')+'>':'<div class="logo-row-name">'+esc(label)+'</div>')+
      (type==="team" && shownLabel!==key?'<div class="logo-key-note">DB 원본명: '+esc(key)+'</div>':'')+
    '</div>'+ 
    '<div class="logo-row-actions">'+
      (editable?'<button class="btn sm" data-logo-name-save="1" data-logo-type="'+type+'" data-logo-key="'+esc(key)+'"'+(admin?'':' disabled')+'>이름 저장</button>':'')+
      '<button class="btn sm" data-logo-pick="1" data-logo-type="'+type+'" data-logo-key="'+esc(key)+'"'+(admin?'':' disabled')+'>'+(src?'변경':'등록')+'</button>'+ 
      (src?'<button class="btn sm" data-logo-remove="1" data-logo-type="'+type+'" data-logo-key="'+esc(key)+'"'+(admin?'':' disabled')+'>삭제</button>':'')+'</div>'+ 
  '</div>';
}
function saveLogoDisplayName(type,key,input){
  if(!admin){ toast("관리자 로그인 후 수정할 수 있습니다."); return; }
  const value=String(input&&input.value||"").trim();
  if(!value){ toast("표시명을 입력해 주세요."); return; }
  ensureLogoSettings();
  if(type==="league"){
    if(key==="A") DB.settings.display.leagueA=value;
    else if(key==="B") DB.settings.display.leagueB=value;
  }else if(type==="team"){
    if(value===key) delete DB.settings.teamNames[key];
    else DB.settings.teamNames[key]=value;
  }
  save(); renderAll(); toast(value+" 표시명을 저장했습니다.");
}
function renderLogoManager(){
  const box=$("#logoManager"); if(!box) return;
  ensureLogoSettings();
  const teams=teamList();
  box.innerHTML='<div class="logo-manager-group"><div class="logo-manager-title">헤더 로고</div><div class="logo-manager-grid">'+
    logoSettingRow("header","brand","GGFC 헤더 왼쪽 로고")+'</div></div>'+ 
    '<div class="logo-manager-group"><div class="logo-manager-title">리그 로고 · 리그명</div><div class="logo-manager-grid">'+
    logoSettingRow("league","A",leagueGroupLabel("A"))+logoSettingRow("league","B",leagueGroupLabel("B"))+'</div></div>'+ 
    '<div class="logo-manager-group"><div class="logo-manager-title">팀 로고 · 팀명</div><div class="logo-manager-grid">'+
    (teams.length?teams.map(t=>logoSettingRow("team",t,teamDisplayName(t))).join(""):'<div class="muted">등록된 팀이 없습니다.</div>')+'</div></div>';
  box.querySelectorAll("[data-logo-pick]").forEach(b=>b.onclick=()=>openLogoPicker(b.dataset.logoType,b.dataset.logoKey));
  box.querySelectorAll("[data-logo-remove]").forEach(b=>b.onclick=()=>removeLogo(b.dataset.logoType,b.dataset.logoKey));
  box.querySelectorAll("[data-logo-name-save]").forEach(b=>b.onclick=()=>{
    const inp=box.querySelector('[data-logo-name="1"][data-logo-type="'+b.dataset.logoType+'"][data-logo-key="'+CSS.escape(b.dataset.logoKey)+'"]');
    saveLogoDisplayName(b.dataset.logoType,b.dataset.logoKey,inp);
  });
  box.querySelectorAll("[data-logo-name]").forEach(inp=>inp.onkeydown=e=>{ if(e.key==="Enter"){
    e.preventDefault(); saveLogoDisplayName(inp.dataset.logoType,inp.dataset.logoKey,inp);
  }});
}
let logoTarget=null;
function openLogoPicker(type,key){
  if(!admin){ toast("로고 등록은 관리자만 가능합니다."); return; }
  logoTarget={type,key};
  const input=$("#logoFilepick"); input.value=""; input.click();
}
function removeLogo(type,key){
  if(!admin) return;
  ensureLogoSettings();
  if(type==="team") delete DB.settings.teamLogos[key];
  else if(type==="league") DB.settings.leagueLogos[key]="";
  else if(type==="header") DB.settings.headerLogo="";
  save(); renderAll(); toast("로고를 삭제했습니다.");
}
function resizedLogoData(file){
  return new Promise((resolve,reject)=>{
    const rd=new FileReader();
    rd.onerror=()=>reject(new Error("이미지 파일을 읽지 못했습니다."));
    rd.onload=()=>{
      const img=new Image();
      img.onerror=()=>reject(new Error("지원하지 않는 이미지 형식입니다."));
      img.onload=()=>{
        const max=240, scale=Math.min(1,max/Math.max(img.width||1,img.height||1));
        const w=Math.max(1,Math.round(img.width*scale)), h=Math.max(1,Math.round(img.height*scale));
        const cv=document.createElement("canvas"); cv.width=w; cv.height=h;
        const ctx=cv.getContext("2d"); ctx.clearRect(0,0,w,h); ctx.drawImage(img,0,0,w,h);
        resolve(cv.toDataURL("image/png"));
      };
      img.src=rd.result;
    };
    rd.readAsDataURL(file);
  });
}

function recordDataIssues(){
  const totals=new Map();
  (DB.goals||[]).forEach(r=>{
    const key=JSON.stringify([r.id,r.team]);totals.set(key,(totals.get(key)||0)+num(r.g));
  });
  return uniqueRecordMatches(DB.matches||[]).filter(m=>!forfeitTeamNames(m).length).map(m=>{
    const homeGoals=totals.get(JSON.stringify([m.id,m.home]))||0, awayGoals=totals.get(JSON.stringify([m.id,m.away]))||0;
    return {match:m,homeGoals,awayGoals};
  }).filter(x=>num(x.match.hs)!==x.homeGoals||num(x.match.as)!==x.awayGoals)
    .sort((a,b)=>normDate(a.match.date).localeCompare(normDate(b.match.date))||String(a.match.no).localeCompare(String(b.match.no),undefined,{numeric:true}));
}
function renderRecordDataValidation(){
  const summary=$('#dataValidationSummary'), details=$('#dataValidationDetails'), table=$('#dataValidationTable');
  if(!summary||!details||!table)return;
  const issues=recordDataIssues();
  summary.textContent=issues.length
    ? '팀 점수와 득점자 합계가 다른 경기 '+issues.length+'건입니다. 원본 기록지에서 점수와 득점자 입력을 확인해 주세요. 자책골은 팀 득점에 포함하며, 몰수승·패 경기는 점검에서 제외합니다.'
    : (DB.matches.length?'팀 점수와 득점자 합계가 일치합니다. 자책골 포함 · 몰수승·패 경기 제외':'점검할 경기 기록이 없습니다. 통합 기록지를 업로드해 주세요.');
  details.style.display=issues.length?'':'none';
  table.innerHTML=tbl([{t:'경기일'},{t:'대회 · 라운드 · 경기번호'},{t:'대진'},{t:'팀 점수'},{t:'득점자 합계'}],issues.map(({match:m,homeGoals,awayGoals})=>[
    esc(normDate(m.date)),esc([m.comp,m.round,m.no].filter(Boolean).join(' · ')),esc(m.home+' : '+m.away),num(m.hs)+' : '+num(m.as),homeGoals+' : '+awayGoals
  ]));
  const squadIssues=squadRecordIssues();
  if(squadIssues.length){
    summary.textContent+=' 스쿼드·시작일 확인 '+squadIssues.length+'건 (경기일·팀·선수별 중복 제외).';details.style.display='';
    table.innerHTML+='<h4>스쿼드·시작일 확인</h4><p>출석 원본은 유지합니다. 시작일 이전 또는 해당 팀 스쿼드에 없는 출석은 커플 분석에서 제외하며, 팀을 임의로 변경하지 않습니다. 용병 출전이라면 해당 날짜 스쿼드에 반영해 주세요.</p>'+tbl([{t:'경기일'},{t:'선수'},{t:'출석팀'},{t:'스쿼드 소속'},{t:'확인 내용'}],squadIssues.map(r=>[r.date,esc(r.player),esc(r.team),esc(r.assigned),esc(r.reason)]));
  }
}
function renderData(){
  $("#dataStat").innerHTML = tbl([{t:"데이터"},{t:"건수",n:1},{t:"비고"}],[
    ["경기", DB.matches.length, '<span class="muted">'+esc(compList().join(", ")||"—")+'</span>'],
    ["출석(연인원)", DB.attendance.length, '<span class="muted">'+teamList().length+'개 팀</span>'],
    ["득점/어시스트", DB.goals.length, '<span class="muted">총 '+DB.goals.reduce((s,g)=>s+num(g.g),0)+'골 · '+DB.goals.reduce((s,g)=>s+num(g.a),0)+'도움</span>'],
    ["개인파울", (DB.fouls||[]).length, '<span class="muted">총 '+(DB.fouls||[]).reduce((s,g)=>s+num(g.fouls),0)+'회 · 경기·팀별 합계로 팀파울 반영</span>'],
    ["선방", (DB.saves||[]).length, '<span class="muted">총 '+(DB.saves||[]).reduce((s,g)=>s+num(g.saves),0)+'회</span>'],
    ["MOM", (DB.moms||[]).length, '<span class="muted">총 '+(DB.moms||[]).reduce((s,g)=>s+num(g.mom),0)+'회 · 선수 능력치 반영</span>'],
    ["SoccerBee", (DB.soccerbee||[]).length, '<span class="muted">측정 이력 '+(DB.soccerbee||[]).length+'건</span>'],
    ["선수명단", DB.roster.length, '<span class="muted">'+esc([...new Set(DB.roster.map(r=>r.year).filter(Boolean))].join(", ")||"—")+'</span>'],
    ["팀스쿼드", squadRows().length, '<span class="muted">적용일별 감독·코치·선수 명단</span>'],
    ["스페셜 기록", DB.specials.length, '<span class="muted">우승·MVP 등</span>']
  ]);
  $("#sheetSpec").innerHTML = tbl([{t:"시트명"},{t:"열 구성 (1행 헤더 고정)"},{t:"설명"}],
    TEMPLATE.map(t=>['<b>'+esc(t.name)+'</b>', '<code>'+esc(t.head)+'</code>', '<span class="muted">'+esc(t.desc)+'</span>']));
  ["#upAll","#clearBtn","#importJson","#sampleBtn"].forEach(s=>$(s).disabled=!admin);
  renderDisplaySettings();
  renderLogoManager();
  renderRecordDataValidation();
}
let activeView='dash';
function renderActiveView(v){
  if(['data','rep','abilitycfg'].includes(v)&&!admin)v='dash';
  const renderers={insights:renderInsights,dash:renderDash,cal:renderCal,team:renderTeam,player:renderPlayer,ability:renderAbility,chem:renderChem,data:renderData,rep:renderRepresentativeAdminView,abilitycfg:renderAbilityConfig};
  activeView=renderers[v]?v:'dash';renderers[activeView]();
}
function renderAll(){
  const cs=compList();if(comp!=='ALL'&&!cs.includes(comp))comp='ALL';
  $('#compFilter').innerHTML='<option value="ALL">전체 대회</option>'+cs.map(c=>'<option'+(c===comp?' selected':'')+'>'+esc(c)+'</option>').join('');
  renderDisplaySettings();renderActiveView(activeView);GGFC.refreshUI();
}

/* ---------- events ---------- */
$("#abilityHalfSections").addEventListener("click",handleAbilitySortClick);
$("#abilityHalfSections").addEventListener("change",handleAbilitySortChange);
document.addEventListener("click",e=>{
  const player=e.target.closest(".player-card-link");
  if(player){
    e.preventDefault();
    const scope=player.closest('[data-card-query]');let query=null;
    if(scope){try{query=JSON.parse(scope.dataset.cardQuery);}catch(err){query=null;}}
    openPlayerCard(player.dataset.player||player.textContent,query);return;
  }
  if(e.target===$("#playerCardMask")) closePlayerCard();
});
$("#playerCardClose").onclick=closePlayerCard;
document.addEventListener("keydown",e=>{ if(e.key==="Escape" && $("#playerCardMask").classList.contains("on")) closePlayerCard(); });
function goTab(v){
  /* 데이터 관리와 대표승점 설정은 관리자 로그인 상태에서만 접근할 수 있다. */
  if((v==="data" || v==="rep" || v==="abilitycfg") && !admin) v="dash";
  const b = $$("#tabs button").find(x=>x.dataset.v===v); if(!b) return;
  $$("#tabs button").forEach(x=>x.classList.toggle("on",x===b));
  $$("section.view").forEach(s=>s.classList.toggle("on", s.id==="v-"+v));
  syncMobileNav(v);
  if(typeof closeMemberSidebar==='function') closeMemberSidebar(true);
  if(activeView!==v)renderActiveView(v);
}
$("#tabs").onclick = e=>{ const b=e.target.closest("button"); if(!b) return;
  if((b.dataset.v==="data" || b.dataset.v==="rep" || b.dataset.v==="abilitycfg") && !admin) return;
  goTab(b.dataset.v); location.hash=b.dataset.v; window.scrollTo({top:0,behavior:"smooth"});
};
window.addEventListener("hashchange",()=>{
  const requested=location.hash.slice(1);
  if((requested==="data" || requested==="rep" || requested==="abilitycfg") && !admin){
    goTab("dash");
    history.replaceState(null,"","#dash");
    return;
  }
  goTab(requested);
});
$("#compFilter").onchange = e=>{ comp=e.target.value; dashDate=""; renderAll(); };
$("#prevM").onclick=()=>{ calRef=new Date(calRef.getFullYear(),calRef.getMonth()-1,1); renderCal(); };
$("#nextM").onclick=()=>{ calRef=new Date(calRef.getFullYear(),calRef.getMonth()+1,1); renderCal(); };
$("#todayBtn").onclick=()=>{ calRef=new Date(); renderCal(); };
function normalizeChemSearch(v){return String(v||'').normalize('NFKC').toLowerCase().replace(/\s+/g,'').trim();}
function chemSuggestionNames(kind,query){
  const q=normalizeChemSearch(query), names=chemPlayers().filter(n=>kind!=='other'||n!==chemSel);
  if(!q) return names.slice(0,8);
  return names.filter(n=>normalizeChemSearch(n).includes(q)).sort((a,b)=>{
    const aa=normalizeChemSearch(a),bb=normalizeChemSearch(b),as=aa.startsWith(q)?0:1,bs=bb.startsWith(q)?0:1;
    return as-bs||aa.indexOf(q)-bb.indexOf(q)||a.localeCompare(b,'ko');
  }).slice(0,10);
}
function renderChemSuggestions(kind){
  const input=$(kind==='base'?'#chemPlayer':'#chemOther'), box=$(kind==='base'?'#chemPlayerSuggest':'#chemOtherSuggest');
  if(!input||!box) return;
  const q=String(input.value||'').trim(), matches=chemSuggestionNames(kind,q);
  if(!document.activeElement||document.activeElement!==input){box.classList.remove('on');return;}
  box.innerHTML=matches.length?matches.map(n=>{
    const exact=normalizeChemSearch(n)===normalizeChemSearch(q);
    return '<button type="button" class="chem-suggestion-btn'+(exact?' active':'')+'" data-chem-kind="'+kind+'" data-chem-name="'+esc(n)+'" role="option"><span>'+esc(n)+'</span><span class="chem-suggestion-match">'+(exact?'정확히 일치':'부분 일치')+'</span></button>';
  }).join(''):'<div class="chem-suggestion-empty">입력한 글자가 포함된 선수가 없습니다.</div>';
  box.classList.add('on');
}
function selectChemSuggestion(kind,name){
  const names=chemPlayers(), v=String(name||'').trim();
  if(!names.includes(v)) return;
  if(kind==='base'){chemSel=v;if(chemOther===chemSel)chemOther='';}
  else {if(v===chemSel)return;chemOther=v;}
  renderChem();
}
function applyTypedChemPlayer(kind){
  const names=chemPlayers(), el=$(kind==='base'?'#chemPlayer':'#chemOther');
  const raw=String(el.value||'').trim();
  if(kind==='other'&&!raw){chemOther='';renderChem();return;}
  let v=names.find(n=>normalizeChemSearch(n)===normalizeChemSearch(raw));
  if(!v){const m=chemSuggestionNames(kind,raw);if(m.length===1)v=m[0];}
  if(!v){toast('검색 결과에서 선수를 선택해 주세요.');renderChemSuggestions(kind);return;}
  if(kind==='base'){chemSel=v;if(chemOther===chemSel)chemOther='';}
  else {if(v===chemSel){toast('상대 선수는 기준 선수와 다른 선수를 선택하세요.');return;}chemOther=v;}
  renderChem();
}
['base','other'].forEach(kind=>{
  const el=$(kind==='base'?'#chemPlayer':'#chemOther');
  if(!el)return;
  el.addEventListener('input',()=>renderChemSuggestions(kind));
  el.addEventListener('focus',()=>renderChemSuggestions(kind));
  el.addEventListener('change',()=>applyTypedChemPlayer(kind));
  el.addEventListener('keydown',e=>{
    if(e.key==='Enter'){e.preventDefault();applyTypedChemPlayer(kind);}
    else if(e.key==='Escape'){const box=$(kind==='base'?'#chemPlayerSuggest':'#chemOtherSuggest');if(box)box.classList.remove('on');}
  });
});
document.addEventListener('mousedown',e=>{
  const b=e.target.closest('.chem-suggestion-btn');
  if(b){e.preventDefault();selectChemSuggestion(b.dataset.chemKind,b.dataset.chemName);return;}
  if(!e.target.closest('.chem-search-wrap')) $$('.chem-suggestions').forEach(x=>x.classList.remove('on'));
});
$('#chemYear').onchange=e=>{chemYear=e.target.value;renderChem();};
$('#monthlyMetric').onchange=e=>{monthlyMetric=e.target.value;renderMonthlyPlayerStats();};

/* ---------- 대표승점 상단 관리자 메뉴 ---------- */
function representativeAdminYears(){
  ensureLogoSettings();
  const s=new Set(seasonYears().filter(y=>parseInt(y,10)>=2026));
  Object.keys((DB.settings&&DB.settings.seasons)||{}).forEach(y=>{if(/^\d{4}$/.test(y)&&parseInt(y,10)>=2026)s.add(y);});
  const current=String(new Date().getFullYear()); if(parseInt(current,10)>=2026) s.add(current);
  if(!s.size) s.add("2026");
  return [...s].sort().reverse();
}
function repHalfName(half){return half==="H2"?"하반기":"상반기";}
function repHalfContainer(half){return $(half==="H2"?"#repAdminH2Segments":"#repAdminH1Segments");}
function repHalfCountEl(half){return $(half==="H2"?"#repAdminH2Count":"#repAdminH1Count");}
function representativeSeasonExactPayload(y,source){
  const raw=source||((DB.settings&&DB.settings.seasons&&DB.settings.seasons[y])||{}), c=seasonCfg(y);
  const cleanHalf=(half)=>{
    const arr=raw.repSegments&&Array.isArray(raw.repSegments[half])?raw.repSegments[half]:[];
    const count=Math.max(1,Math.min(4,parseInt(raw.repCounts&&raw.repCounts[half],10)||arr.length||(c.repCounts&&c.repCounts[half])||3));
    return Array.from({length:count},(_,i)=>{
      const x=arr[i]||((c.repSegments&&c.repSegments[half]&&c.repSegments[half][i])||{});
      return {s:normDate(x.s||""),e:normDate(x.e||""),complete:x.complete===true,mode:String(x.mode||"REP").toUpperCase()==="IND"?"IND":"REP",finalPoints:(x.finalPoints&&typeof x.finalPoints==="object")?Object.assign({},x.finalPoints):null,finalStandings:(x.finalStandings&&typeof x.finalStandings==="object")?JSON.parse(JSON.stringify(x.finalStandings)):null,finalGames:Number(x.finalGames||0),finalizedAt:String(x.finalizedAt||"")};
    });
  };
  const h1=cleanHalf("H1"),h2=cleanHalf("H2");
  return {h1s:normDate(raw.h1s||c.h1s||y+"-01-01"),h1e:normDate(raw.h1e||c.h1e||y+"-06-30"),h2s:normDate(raw.h2s||c.h2s||y+"-07-01"),h2e:normDate(raw.h2e||c.h2e||y+"-12-31"),repEnabled:raw.repEnabled===true,repCounts:{H1:h1.length,H2:h2.length},repSegments:{H1:h1,H2:h2},repSavedAt:raw.repSavedAt||new Date().toISOString()};
}
/* 저장 버튼에서는 seasonCfg의 자동분할/정규화를 거치지 않고 현재 편집값을 시즌 전용 키에 마지막으로 직접 기록한다. */
function saveRepresentativeSeasonBackupExact(y,source){
  try{
    const payload=representativeSeasonExactPayload(y,source); payload.repSavedAt=new Date().toISOString();
    localStorage.setItem(REP_SETTINGS_YEAR_PREFIX+y,JSON.stringify({version:5,year:y,season:payload,savedAt:payload.repSavedAt}));
    let snap={version:5,seasons:{},savedAt:payload.repSavedAt};
    try{const old=JSON.parse(localStorage.getItem(REP_SETTINGS_KEY)||"null");if(old&&old.seasons&&typeof old.seasons==="object") snap=old;}catch(e){}
    snap.version=5;snap.seasons=snap.seasons||{};snap.seasons[y]=payload;snap.savedAt=payload.repSavedAt;
    localStorage.setItem(REP_SETTINGS_KEY,JSON.stringify(snap));
    return true;
  }catch(e){console.error(y+"년 대표승점 정확 저장 실패:",e);return false;}
}
function representativeEditorSegments(half){
  const box=repHalfContainer(half); if(!box) return [];
  return $$(".rep-admin-segment",box).map(card=>({
    s:normDate(card.querySelector('[data-rep-date="start"]')?.value),
    e:normDate(card.querySelector('[data-rep-date="end"]')?.value),
    complete:card.querySelector('[data-rep-complete]')?.checked===true,
    mode:String(card.querySelector('[data-rep-mode]')?.value||"REP").toUpperCase()==="IND"?"IND":"REP"
  }));
}
function captureRepresentativeAdminDraft(y){
  y=String(y||repAdminYear||$("#repAdminYear")?.value||""); if(!y) return null;
  const cfg=seasonCfg(y), h1=representativeEditorSegments("H1"), h2=representativeEditorSegments("H2");
  if(!h1.length && !h2.length) return repAdminDrafts[y]||null;
  const c1=Math.max(1,Math.min(4,parseInt($("#repAdminH1Count")?.value,10)||h1.length||cfg.repCounts.H1));
  const c2=Math.max(1,Math.min(4,parseInt($("#repAdminH2Count")?.value,10)||h2.length||cfg.repCounts.H2));
  const fill=(half,list,count)=>Array.from({length:count},(_,i)=>list[i]||((cfg.repSegments&&cfg.repSegments[half]&&cfg.repSegments[half][i])||splitRangeIntoCount(half==="H2"?cfg.h2s:cfg.h1s,half==="H2"?cfg.h2e:cfg.h1e,count)[i]));
  const draft={h1s:cfg.h1s,h1e:cfg.h1e,h2s:cfg.h2s,h2e:cfg.h2e,repEnabled:$("#repAdminEnabled")?.checked===true,repCounts:{H1:c1,H2:c2},repSegments:{H1:fill("H1",h1,c1),H2:fill("H2",h2,c2)}};
  repAdminDrafts[y]=JSON.parse(JSON.stringify(draft)); return draft;
}
function representativeAdminRenderCfg(y){
  const stored=seasonCfg(y), draft=repAdminDrafts[y]; if(!draft) return stored;
  return {h1s:draft.h1s||stored.h1s,h1e:draft.h1e||stored.h1e,h2s:draft.h2s||stored.h2s,h2e:draft.h2e||stored.h2e,repEnabled:draft.repEnabled===true,repCounts:{H1:draft.repCounts?.H1||stored.repCounts.H1,H2:draft.repCounts?.H2||stored.repCounts.H2},repSegments:{H1:(draft.repSegments?.H1||stored.repSegments.H1),H2:(draft.repSegments?.H2||stored.repSegments.H2)}};
}
function representativeEditorSegmentsSafe(half,cfg){
  const editor=representativeEditorSegments(half), countEl=repHalfCountEl(half);
  const expected=Math.max(1,Math.min(4,parseInt(countEl&&countEl.value,10)||(cfg.repCounts&&cfg.repCounts[half])||editor.length||1));
  const stored=(cfg.repSegments&&Array.isArray(cfg.repSegments[half]))?cfg.repSegments[half]:[];
  const defaults=splitRangeIntoCount(half==="H2"?cfg.h2s:cfg.h1s,half==="H2"?cfg.h2e:cfg.h1e,expected);
  return Array.from({length:expected},(_,i)=>{
    /* 카드 자체가 DOM에서 누락된 경우에만 기존 저장값으로 보완한다. 입력칸을 비운 것은 검증에서 그대로 잡는다. */
    if(editor[i]) return editor[i];
    const x=stored[i]||defaults[i]||{};
    return {s:normDate(x.s||''),e:normDate(x.e||''),complete:x.complete===true,mode:String(x.mode||'REP').toUpperCase()==='IND'?'IND':'REP'};
  });
}
function representativeHalfSignature(list){
  return JSON.stringify((list||[]).map(x=>({s:normDate(x&&x.s),e:normDate(x&&x.e),complete:x&&x.complete===true,mode:String(x&&x.mode||'REP').toUpperCase()==='IND'?'IND':'REP'})));
}
function representativeSegmentCard(seg,index,half){
  const done=seg&&seg.complete===true, halfLabel=repHalfName(half), mode=String(seg&&seg.mode||"REP").toUpperCase()==="IND"?"IND":"REP";
  const cfg=seasonCfg(repAdminYear||String(new Date().getFullYear()));
  const minDate=half==="H2"?cfg.h2s:cfg.h1s, maxDate=half==="H2"?cfg.h2e:cfg.h1e;
  return '<div class="rep-admin-segment'+(done?' complete':'')+'" data-rep-admin-index="'+index+'" data-rep-half="'+half+'">'+
    '<div class="rep-admin-segment-head"><span>'+halfLabel+' '+index+'구간</span><span><span class="rep-mode-chip'+(mode==='IND'?' ind':'')+'" data-rep-mode-chip>'+(mode==='IND'?'개별승점':'대표승점')+'</span> <span class="rep-status-chip'+(done?'':' off')+'" data-rep-status>'+(done?'완료':'미완료')+'</span></span></div>'+
    '<div class="rep-admin-segment-dates">'+
      '<div class="record-field"><label>'+index+'구간 시작일</label><input type="date" data-rep-date="start" min="'+esc(minDate)+'" max="'+esc(maxDate)+'" value="'+esc(seg&&seg.s||'')+'"></div>'+
      '<div class="record-field"><label>'+index+'구간 종료일</label><input type="date" data-rep-date="end" min="'+esc(minDate)+'" max="'+esc(maxDate)+'" value="'+esc(seg&&seg.e||'')+'"></div>'+
    '</div>'+
    '<div class="record-field rep-admin-segment-mode"><label>승점 방식</label><select data-rep-mode><option value="REP"'+(mode==='REP'?' selected':'')+'>대표승점 · 리그별 1위 5 / 2위 3 / 3위 1</option><option value="IND"'+(mode==='IND'?' selected':'')+'>개별승점 · 경기 승 3 / 무 1 / 패 0</option></select></div>'+
    '<div class="rep-admin-segment-foot"><label class="rep-admin-complete"><input type="checkbox" data-rep-complete'+(done?' checked':'')+'> 구간완료</label><span class="muted" style="font-size:11px">대표승점은 완료 후 반영 · 개별승점은 경기별 즉시 반영</span></div>'+
  '</div>';
}

function drawRepresentativeAdminSegments(half,list){
  const box=repHalfContainer(half); if(!box) return;
  box.innerHTML=(list||[]).map((seg,i)=>representativeSegmentCard(seg,i+1,half)).join('');
}
function updateRepresentativeAdminStatus(){
  const badge=$("#repAdminStatus"), enabled=$("#repAdminEnabled")?.checked===true;
  if(badge){badge.textContent=enabled?'구간별 승점 적용':'구간별 승점 미적용';badge.classList.toggle('on',enabled);}
}
function renderRepresentativeAdminView(){
  const yearEl=$("#repAdminYear"); if(!yearEl) return;
  const years=representativeAdminYears();
  if(!repAdminYear || !years.includes(repAdminYear)) repAdminYear=recordYear&&years.includes(recordYear)?recordYear:years[0];
  yearEl.innerHTML=years.map(y=>'<option value="'+esc(y)+'"'+(y===repAdminYear?' selected':'')+'>'+esc(y)+' 시즌</option>').join('');
  const cfg=representativeAdminRenderCfg(repAdminYear);
  if($("#repAdminEnabled")) $("#repAdminEnabled").checked=cfg.repEnabled===true;
  if($("#repAdminH1Count")) $("#repAdminH1Count").value=cfg.repCounts.H1;
  if($("#repAdminH2Count")) $("#repAdminH2Count").value=cfg.repCounts.H2;
  drawRepresentativeAdminSegments("H1",cfg.repSegments.H1);
  drawRepresentativeAdminSegments("H2",cfg.repSegments.H2);
  if($("#repAdminH1Range")) $("#repAdminH1Range").textContent=cfg.h1s+' ~ '+cfg.h1e;
  if($("#repAdminH2Range")) $("#repAdminH2Range").textContent=cfg.h2s+' ~ '+cfg.h2e;
  updateRepresentativeAdminStatus();
  const note=$("#repAdminPeriodNote"); if(note) note.textContent=repAdminYear+' 시즌 · 상반기 '+cfg.repCounts.H1+'구간 / 하반기 '+cfg.repCounts.H2+'구간 (각 최대 4구간) · 각 구간별 대표/개별 승점 선택 · 날짜/방식 변경 시 완료 상태 자동 해제 · 저장 시 별도 백업까지 자동 저장';
  [yearEl,$("#repAdminEnabled"),$("#repAdminH1Count"),$("#repAdminH2Count"),$("#repAdminH1CountApply"),$("#repAdminH2CountApply"),$("#repAdminH1AutoSplit"),$("#repAdminH2AutoSplit"),$("#repAdminSave"),$("#repAdminReset")].filter(Boolean).forEach(el=>el.disabled=!admin);
  $$('#repAdminH1Segments input, #repAdminH1Segments select, #repAdminH2Segments input, #repAdminH2Segments select').forEach(el=>el.disabled=!admin);
}
function resizeRepresentativeAdminSegments(half,autoSplit=false){
  if(!admin) return;
  const y=repAdminYear||$("#repAdminYear")?.value; if(!y) return;
  const cfg=seasonCfg(y), countEl=repHalfCountEl(half);
  const count=Math.max(1,Math.min(4,parseInt(countEl?.value,10)||1));
  if(countEl) countEl.value=count;
  const start=half==="H2"?cfg.h2s:cfg.h1s, end=half==="H2"?cfg.h2e:cfg.h1e;
  const current=representativeEditorSegments(half), defaults=splitRangeIntoCount(start,end,count);
  const countChanged=current.length!==count;
  const next=(autoSplit||countChanged)?defaults:current;
  drawRepresentativeAdminSegments(half,next);
  captureRepresentativeAdminDraft(y);
  const other=half==="H2"?"H1":"H2", otherCount=representativeEditorSegments(other).length || cfg.repCounts[other];
  if($("#repAdminPeriodNote")) $("#repAdminPeriodNote").textContent=y+' 시즌 · '+repHalfName(half)+' '+count+'구간 / '+repHalfName(other)+' '+otherCount+'구간'+((autoSplit||countChanged)?' · '+repHalfName(half)+' 날짜 자동분할됨 (모두 미완료)':'');
}
function validateRepresentativeAdminSegments(y,half,list,cfg){
  if(!list.length) return repHalfName(half)+' 구간을 1개 이상 설정하세요.';
  const hs=half==="H2"?cfg.h2s:cfg.h1s, he=half==="H2"?cfg.h2e:cfg.h1e;
  for(let i=0;i<list.length;i++){
    const seg=list[i], s=normDate(seg.s), e=normDate(seg.e);
    if(!s||!e) return repHalfName(half)+' '+(i+1)+'구간의 시작일과 종료일을 입력하세요.';
    if(s>e) return repHalfName(half)+' '+(i+1)+'구간 시작일이 종료일보다 늦습니다.';
    if(s<hs||e>he) return repHalfName(half)+' '+(i+1)+'구간은 '+hs+' ~ '+he+' 안에서 설정하세요.';
    if(!['REP','IND'].includes(String(seg.mode||'REP').toUpperCase())) return repHalfName(half)+' '+(i+1)+'구간의 승점 방식을 선택하세요.';
    if(i>0 && s<=normDate(list[i-1].e)) return repHalfName(half)+' '+(i+1)+'구간이 이전 구간과 겹치거나 날짜 순서가 올바르지 않습니다.';
  }
  return '';
}
/* 저장 전에 과거 버전에서 남은 범위 밖 날짜를 자동 보정한다.
   단순히 범위를 넘은 날짜는 반기 경계로 보정하고, 그 결과 겹침/역전이 생기면
   해당 반기 전체를 현재 구간 수대로 다시 균등 분할한다. */
function normalizeRepresentativeAdminSegmentsForSave(half,list,cfg){
  const hs=half==="H2"?cfg.h2s:cfg.h1s, he=half==="H2"?cfg.h2e:cfg.h1e;
  let changed=false;
  const clipped=(list||[]).slice(0,4).map(seg=>{
    let s=normDate(seg.s), e=normDate(seg.e);
    const os=s, oe=e;
    if(s&&s<hs) s=hs;
    if(e&&e>he) e=he;
    if(s!==os||e!==oe) changed=true;
    const stillSame=s===os&&e===oe;
    return {s,e,complete:stillSame&&seg.complete===true,mode:String(seg.mode||'REP').toUpperCase()==='IND'?'IND':'REP'};
  });
  /* 겹침/역전은 자동 재분할하지 않는다. 저장 검증에서 사용자에게 정확히 알려주고,
     이미 입력한 다른 구간 일정과 완료 상태를 임의로 지우지 않는다. */
  return {list:clipped,changed,rebuilt:false};
}
if($("#repAdminYear")) $("#repAdminYear").onchange=e=>{if(repAdminYear) captureRepresentativeAdminDraft(repAdminYear);repAdminYear=e.target.value;renderRepresentativeAdminView();};
if($("#repAdminEnabled")) $("#repAdminEnabled").onchange=()=>{updateRepresentativeAdminStatus();captureRepresentativeAdminDraft(repAdminYear);};
if($("#repAdminH1CountApply")) $("#repAdminH1CountApply").onclick=()=>resizeRepresentativeAdminSegments("H1",false);
if($("#repAdminH2CountApply")) $("#repAdminH2CountApply").onclick=()=>resizeRepresentativeAdminSegments("H2",false);
if($("#repAdminH1AutoSplit")) $("#repAdminH1AutoSplit").onclick=()=>{resizeRepresentativeAdminSegments("H1",true);toast('상반기를 설정한 구간 수대로 자동분할했습니다. 상반기 구간완료는 모두 해제되었습니다.');};
if($("#repAdminH2AutoSplit")) $("#repAdminH2AutoSplit").onclick=()=>{resizeRepresentativeAdminSegments("H2",true);toast('하반기를 설정한 구간 수대로 자동분할했습니다. 하반기 구간완료는 모두 해제되었습니다.');};
["H1","H2"].forEach(half=>{const box=repHalfContainer(half);if(box) box.addEventListener('change',e=>{
  if(!admin) return;
  const card=e.target.closest('.rep-admin-segment'); if(!card) return;
  const check=card.querySelector('[data-rep-complete]'), status=card.querySelector('[data-rep-status]');
  if((e.target.matches('[data-rep-date]') || e.target.matches('[data-rep-mode]')) && check && check.checked){
    check.checked=false;
    toast(repHalfName(half)+' '+card.dataset.repAdminIndex+'구간 '+(e.target.matches('[data-rep-mode]')?'승점 방식':'날짜')+'이 변경되어 구간완료가 해제되었습니다.');
  }
  if(e.target.matches('[data-rep-mode]')){
    const chip=card.querySelector('[data-rep-mode-chip]'), isInd=e.target.value==='IND';
    if(chip){chip.textContent=isInd?'개별승점':'대표승점';chip.classList.toggle('ind',isInd);}
  }
  const done=check&&check.checked===true; card.classList.toggle('complete',done);
  if(status){status.textContent=done?'완료':'미완료';status.classList.toggle('off',!done);}
  captureRepresentativeAdminDraft(repAdminYear||$("#repAdminYear")?.value);

  /* '구간완료'는 단순 화면 체크가 아니라 운영 확정 동작이다.
     완료/해제 체크 즉시 시즌 설정을 저장하고 종합기록 팀순위를 재계산한다.
     날짜/방식 변경은 기존대로 완료 상태만 해제하고 사용자가 저장 버튼으로 확정한다. */
  if(e.target.matches('[data-rep-complete]')){
    if(done && $("#repAdminEnabled")) $("#repAdminEnabled").checked=true;
    updateRepresentativeAdminStatus();

    /* 구간완료는 저장 버튼을 우회하지 않고 현재 시즌 설정에 즉시 확정한다.
       상·하반기 입력을 검증한 뒤 다른 완료 구간의 확정값도 함께 보존한다. */
    const y=repAdminYear||$("#repAdminYear")?.value;
    if(y){
      const cfg=seasonCfg(y);
      let h1=representativeEditorSegmentsSafe("H1",cfg).slice(0,4);
      let h2=representativeEditorSegmentsSafe("H2",cfg).slice(0,4);
      const err=validateRepresentativeAdminSegments(y,"H1",h1,cfg)||validateRepresentativeAdminSegments(y,"H2",h2,cfg);
      if(err){
        if(check) check.checked=!done;
        card.classList.toggle('complete',!done);
        if(status){status.textContent=!done?'완료':'미완료';status.classList.toggle('off',done);}
        captureRepresentativeAdminDraft(y);toast(err);return;
      }
      h1=representativeSegmentsWithFinalization(y,"H1",h1,cfg.repSegments.H1);
      h2=representativeSegmentsWithFinalization(y,"H2",h2,cfg.repSegments.H2);
      const currentIndex=Math.max(0,(parseInt(card.dataset.repAdminIndex,10)||1)-1);
      const targetList=half==="H2"?h2:h1;
      const targetSeg=targetList[currentIndex];
      if(targetSeg){
        if(done && String(targetSeg.mode||'REP').toUpperCase()==='REP') Object.assign(targetSeg,representativeFinalSnapshotForSegment(y,targetSeg));
        else { delete targetSeg.finalPoints; delete targetSeg.finalStandings; delete targetSeg.finalGames; delete targetSeg.finalizedAt; }
      }
      DB.settings=DB.settings||{}; DB.settings.seasons=DB.settings.seasons||{};
      const prev=DB.settings.seasons[y]||{};
      DB.settings.seasons[y]=Object.assign({},prev,{
        h1s:cfg.h1s,h1e:cfg.h1e,h2s:cfg.h2s,h2e:cfg.h2e,
        repEnabled:($("#repAdminEnabled")?.checked===true)||done,
        repCounts:{H1:Math.max(1,Math.min(4,h1.length||1)),H2:Math.max(1,Math.min(4,h2.length||1))},
        repSegments:{H1:h1,H2:h2},
        repSavedAt:new Date().toISOString()
      });
      delete DB.settings.seasons[y].repCount; delete DB.settings.seasons[y].repList;
      const result=save();
      repAdminDrafts[y]=JSON.parse(JSON.stringify(DB.settings.seasons[y]));
      if(!result.cloudPending && !result.databaseSaved && !result.representativeSaved){toast('대표승점 설정을 저장하지 못했습니다. 저장공간을 확인해주세요.');return;}
      applyLatestDbPeriodDefaults(true);
      renderDashboardPeriodControls();
      renderDashboardQueryRankings(rankingQueryInfo());
      renderHeadToHead();
      toast(y+'년 '+repHalfName(half)+' '+card.dataset.repAdminIndex+'구간을 '+(done?'완료 처리하고 해당 반기 대표승점을 반영했습니다.':'미완료로 변경했습니다.'));
    }
  }
});});
if($("#repAdminSave")) $("#repAdminSave").onclick=()=>{
  if(!admin){toast('관리자 모드에서만 저장할 수 있습니다.');return;}
  const y=repAdminYear||$("#repAdminYear")?.value; if(!y) return;
  const cfg=seasonCfg(y), draftBeforeSave=captureRepresentativeAdminDraft(y);
  const h1Raw=(draftBeforeSave&&draftBeforeSave.repSegments&&draftBeforeSave.repSegments.H1)||representativeEditorSegmentsSafe("H1",cfg), h2Raw=(draftBeforeSave&&draftBeforeSave.repSegments&&draftBeforeSave.repSegments.H2)||representativeEditorSegmentsSafe("H2",cfg);
  const h1Fix=normalizeRepresentativeAdminSegmentsForSave("H1",h1Raw,cfg);
  const h2Fix=normalizeRepresentativeAdminSegmentsForSave("H2",h2Raw,cfg);
  let h1=h1Fix.list, h2=h2Fix.list;
  if(h1Fix.changed) drawRepresentativeAdminSegments("H1",h1);
  if(h2Fix.changed) drawRepresentativeAdminSegments("H2",h2);
  let err=validateRepresentativeAdminSegments(y,"H1",h1,cfg); if(!err) err=validateRepresentativeAdminSegments(y,"H2",h2,cfg); if(err){toast(err);return;}
  /* 완료된 대표승점 구간은 저장 시점의 최종 팀 승점 순위를 스냅샷으로 확정한다. */
  h1=representativeSegmentsWithFinalization(y,"H1",h1,cfg.repSegments&&cfg.repSegments.H1);
  h2=representativeSegmentsWithFinalization(y,"H2",h2,cfg.repSegments&&cfg.repSegments.H2);
  DB.settings=DB.settings||{seasons:{}}; DB.settings.seasons=DB.settings.seasons||{};
  const prev=DB.settings.seasons[y]||{};
  const hasActiveSegment=h1.concat(h2).some(seg=>seg.mode==='IND' || seg.complete===true);
  let enabled=$("#repAdminEnabled")?.checked===true;
  /* 구간완료까지 했는데 시즌 적용 체크가 꺼져 있어 팀순위가 0점이 되는 상황을 방지한다. */
  if(hasActiveSegment && !enabled){
    enabled=true;
    if($("#repAdminEnabled")) $("#repAdminEnabled").checked=true;
    updateRepresentativeAdminStatus();
  }
  const next=Object.assign({},prev,{
    /* 선택한 시즌의 반기 기간과 모든 구간 설정을 한 묶음으로 저장한다. */
    h1s:cfg.h1s,h1e:cfg.h1e,h2s:cfg.h2s,h2e:cfg.h2e,
    repEnabled:enabled,
    repCounts:{H1:Math.min(4,h1.length),H2:Math.min(4,h2.length)},
    repSegments:{H1:h1.slice(0,4),H2:h2.slice(0,4)},
    repSavedAt:new Date().toISOString()
  });
  delete next.repCount; delete next.repList;
  DB.settings.seasons[y]=next;
  /* 선택한 시즌은 시즌별 전용 키에도 즉시 저장한다. 다른 시즌으로 이동하거나 프로그램을 다시 열어도 유지된다. */
  const expectedH1=representativeHalfSignature(h1), expectedH2=representativeHalfSignature(h2);
  /* 현재 화면의 상/하반기 값을 exact payload로 먼저 저장하고, 전체 DB 저장 뒤 다시 한 번 마지막 쓰기를 수행한다. */
  const seasonBackupSaved=saveRepresentativeSeasonBackupExact(y,next);
  let saveResult=save();
  saveRepresentativeSeasonBackupExact(y,next);
  repAdminDrafts[y]=JSON.parse(JSON.stringify(next));
  let postCfg=seasonCfg(y);
  let exactHalves=representativeHalfSignature(postCfg.repSegments.H1)===expectedH1 && representativeHalfSignature(postCfg.repSegments.H2)===expectedH2;
  /* 저장 직후 한쪽 반기가 기본분할로 되돌아간 흔적이 있으면 원본 next를 다시 덮어써 복구한다.
     특히 상반기 저장이 하반기 설정을 리셋하는 문제를 방지한다. */
  if(!exactHalves){
    console.warn('대표승점 반기 설정 불일치 감지 · 원본으로 자동 복구', {year:y,expectedH1,expectedH2,post:postCfg.repSegments});
    DB.settings.seasons[y]=JSON.parse(JSON.stringify(next));
    saveRepresentativeSeasonBackupExact(y,next);
    try{ localStorage.setItem(KEY,JSON.stringify(DB)); }catch(e){ console.error('대표승점 자동 복구 DB 저장 실패',e); }
    postCfg=seasonCfg(y);
    exactHalves=representativeHalfSignature(postCfg.repSegments.H1)===expectedH1 && representativeHalfSignature(postCfg.repSegments.H2)===expectedH2;
  }
  const verified=exactHalves && (saveResult.cloudPending || (seasonBackupSaved && representativeSettingsPersistedForYear(y)));
  if(!verified){
    toast(y+'년 구간별 승점 설정 저장에 실패했습니다. 브라우저 저장공간을 확인해주세요.');
    console.error('대표승점 설정 저장 검증 실패', {year:y,saveResult,exactHalves});
    return;
  }
  /* 저장 직후 DB 최종일이 속한 반기·구간으로 모든 기본 조회를 다시 동기화한다. */
  applyLatestDbPeriodDefaults(true);
  repAdminDrafts[y]=JSON.parse(JSON.stringify(next));
  renderRepresentativeAdminView();
  renderDashboardPeriodControls();
  const refreshedRankingInfo=rankingQueryInfo();
  renderDashboardQueryRankings(refreshedRankingInfo);
  const autoFixed=h1Fix.changed||h2Fix.changed;
  if(saveResult.databaseSaved){
    toast(y+'년 구간별 승점 설정을 저장했습니다.'+(hasActiveSegment?' 대표/개별 구간 설정 적용도 활성화되었습니다.':'')+(autoFixed?' 범위를 벗어난 기존 날짜는 상·하반기 안으로 자동 보정했습니다.':''));
  }else{
    /* 전체 DB 저장이 용량 문제로 실패해도 대표승점 전용 저장은 유지된다. */
    toast(y+'년 구간별 승점 설정을 저장했습니다. (대표승점 설정 전용 저장 사용)'+(hasActiveSegment?' 대표/개별 구간 설정 활성화.':'')+(autoFixed?' 범위 밖 날짜 자동 보정 완료.':''));
  }
};
if($("#repAdminReset")) $("#repAdminReset").onclick=()=>{
  if(!admin) return;
  const y=repAdminYear||$("#repAdminYear")?.value; if(!y) return;
  if(!confirm(y+'년 구간별 승점 설정을 초기화하시겠습니까?')) return;
  DB.settings=DB.settings||{seasons:{}}; DB.settings.seasons=DB.settings.seasons||{};
  const prev=DB.settings.seasons[y]||{};
  const next=Object.assign({},prev); delete next.repEnabled; delete next.repCount; delete next.repList; delete next.repCounts; delete next.repSegments;
  DB.settings.seasons[y]=next; delete repAdminDrafts[y]; save(); renderRepresentativeAdminView(); renderDashboardQueryRankings(); toast(y+'년 구간별 승점 설정을 초기화했습니다.');
};

$("#seasonCfgBtn").onclick=()=>{
  if(!admin){ toast("기간 설정은 관리자만 가능합니다."); return; }
  if(!recordYear){ toast("시즌을 먼저 선택하세요."); return; }
  const el=$("#seasonPanel"); el.style.display = el.style.display==="none"? "block":"none";
};
function fillRepresentativeSegmentsFromHalfDates(){
  const halves={H1:{s:normDate($("#h1s")?.value),e:normDate($("#h1e")?.value)},H2:{s:normDate($("#h2s")?.value),e:normDate($("#h2e")?.value)}};
  ["H1","H2"].forEach(h=>{
    const r=splitRangeIntoThree(halves[h].s,halves[h].e);
    r.forEach((seg,i)=>{const n=i+1,sEl=$("#rp"+h+"S"+n+"S"),eEl=$("#rp"+h+"S"+n+"E"),cEl=$("#rp"+h+"S"+n+"Complete"),stEl=$("#rp"+h+"S"+n+"Status");if(sEl)sEl.value=seg.s;if(eEl)eEl.value=seg.e;if(cEl)cEl.checked=false;if(stEl){stEl.textContent="미완료";stEl.classList.add("off");}});
  });
}
const repAutoSplit=$("#repAutoSplit");
if(repAutoSplit) repAutoSplit.onclick=()=>{
  if(!admin){toast("대표승점 구간 설정은 관리자만 가능합니다.");return;}
  fillRepresentativeSegmentsFromHalfDates();
  toast("대표승점 구간을 다시 나눴습니다. 자동분할된 구간은 모두 미완료 상태입니다. 확인 후 저장하세요.");
};
function updateRepresentativeCompleteVisual(h,i){
  const cEl=$("#rp"+h+"S"+i+"Complete"), stEl=$("#rp"+h+"S"+i+"Status");
  if(!cEl||!stEl) return;
  stEl.textContent=cEl.checked?"완료":"미완료";
  stEl.classList.toggle("off",!cEl.checked);
}
["H1","H2"].forEach(h=>{
  for(let i=1;i<=3;i++){
    const cEl=$("#rp"+h+"S"+i+"Complete"), sEl=$("#rp"+h+"S"+i+"S"), eEl=$("#rp"+h+"S"+i+"E");
    if(cEl) cEl.onchange=()=>updateRepresentativeCompleteVisual(h,i);
    [sEl,eEl].filter(Boolean).forEach(el=>el.addEventListener("change",()=>{
      if(cEl && cEl.checked){ cEl.checked=false; updateRepresentativeCompleteVisual(h,i); toast((h==="H1"?"상반기":"하반기")+" "+i+"구간 날짜가 변경되어 구간완료가 해제되었습니다."); }
    }));
  }
});
function validateRepresentativeSegments(repSegments,h1s,h1e,h2s,h2e){
  const ranges={H1:{s:h1s,e:h1e},H2:{s:h2s,e:h2e}};
  for(const h of ["H1","H2"]){
    const arr=repSegments[h]||[];
    if(arr.length!==3) return halfLabel(h)+" 대표승점 구간이 3개가 아닙니다.";
    for(let i=0;i<3;i++){
      const seg=arr[i], s=normDate(seg.s), e=normDate(seg.e), base=ranges[h];
      if(!s||!e) return halfLabel(h)+" "+(i+1)+"구간 날짜를 입력하세요.";
      if(s>e) return halfLabel(h)+" "+(i+1)+"구간의 시작일이 종료일보다 늦습니다.";
      if(s<base.s||e>base.e) return halfLabel(h)+" "+(i+1)+"구간은 해당 "+halfLabel(h)+" 기간 안에 있어야 합니다.";
      if(i>0 && s<=normDate(arr[i-1].e)) return halfLabel(h)+" 대표승점 구간이 서로 겹칩니다.";
    }
  }
  return "";
}
$("#seasonSave").onclick=()=>{
  if(!recordYear || !admin) return;
  DB.settings = DB.settings||{seasons:{}}; DB.settings.seasons = DB.settings.seasons||{};
  const h1s=normDate($("#h1s").value), h1e=normDate($("#h1e").value), h2s=normDate($("#h2s").value), h2e=normDate($("#h2e").value);
  if(!h1s||!h1e||!h2s||!h2e||h1s>h1e||h2s>h2e){toast("상·하반기 시작/종료 날짜를 확인하세요.");return;}
  const prev=DB.settings.seasons[recordYear]||{};
  DB.settings.seasons[recordYear]=Object.assign({},prev,{h1s,h1e,h2s,h2e});
  save(); applyLatestDbPeriodDefaults(true); refreshRecordLinkedViews(); renderLeagueSummary(); renderDashboardPeriodControls(); renderDashboardQueryRankings(); renderHeadToHead(); renderRepresentativeAdminView(); renderAbility(); toast(recordYear+"년 상·하반기 기간을 저장했습니다.");
};
$("#seasonReset").onclick=()=>{
  if(!recordYear || !admin) return;
  DB.settings=DB.settings||{seasons:{}}; DB.settings.seasons=DB.settings.seasons||{};
  const prev=DB.settings.seasons[recordYear]||{};
  DB.settings.seasons[recordYear]=Object.assign({},prev,{h1s:recordYear+"-01-01",h1e:recordYear+"-06-30",h2s:recordYear+"-07-01",h2e:recordYear+"-12-31"});
  save(); applyLatestDbPeriodDefaults(true); refreshRecordLinkedViews(); renderLeagueSummary(); renderRecordSeasonSettings(); renderDashboardPeriodControls(); renderDashboardQueryRankings(); renderHeadToHead(); renderAbility(); toast(recordYear+"년 상·하반기 기간을 기본값(1~6월 · 7~12월)으로 되돌렸습니다. 대표승점 설정은 유지됩니다.");
};
$("#dashTopDate").onchange=e=>setDashboardDate(e.target.value);
$("#dashTopDateSel").onchange=e=>setDashboardDate(e.target.value);
$("#dashTopLatest").onclick=()=>{ dashDate=dashboardMatchDates()[0]||""; setDashboardDate(dashDate); };
$("#recordMode").onchange=e=>{ recordMode=e.target.value; recordSegment="ALL"; refreshRecordLinkedViews(); };
$("#recordYear").onchange=e=>{
  recordYear=e.target.value;
  recordSegment="ALL";
  setRecordYearDefaults(recordYear);
  if($("#seasonPanel")) $("#seasonPanel").style.display="none";
  refreshRecordLinkedViews();
};
$("#recordSegment").onchange=e=>{ recordSegment=e.target.value||"ALL"; refreshRecordLinkedViews(); };
$("#recordDate").onchange=e=>{ recordDate=normDate(e.target.value); refreshRecordLinkedViews(); };
$("#recordDateSel").onchange=e=>{ if(e.target.value) recordDate=normDate(e.target.value); refreshRecordLinkedViews(); };
$("#recordStartSel").onchange=e=>{ recordStart=normDate(e.target.value); };
$("#recordEndSel").onchange=e=>{ recordEnd=normDate(e.target.value); };
$("#recordApply").onclick=()=>{
  recordStart=normDate($("#recordStartSel").value)||recordStart;
  recordEnd=normDate($("#recordEndSel").value)||recordEnd;
  recordDate=normDate($("#recordDate").value)||recordDate;
  refreshRecordLinkedViews();
};
$("#recordLatest").onclick=()=>{ applyLatestDbPeriodDefaults(true); refreshRecordLinkedViews(); renderDashboardPeriodControls(); renderDashboardQueryRankings(); renderHeadToHead(); renderAbility(); };
function bindDashboardPeriodEvents(){
  const bind=(kind)=>{
    const prefix=kind==="ranking"?"ranking":"h2h";
    const mode=$("#"+prefix+"RangeMode"), year=$("#"+prefix+"RangeYear"), segment=$("#"+prefix+"RangeSegment"), start=$("#"+prefix+"RangeStart"), end=$("#"+prefix+"RangeEnd"), apply=$("#"+prefix+"RangeApply");
    if(mode) mode.onchange=e=>{if(kind==="ranking"){rankingRangeMode=e.target.value;rankingRangeSegment="ALL";}else{h2hRangeMode=e.target.value;h2hRangeSegment="ALL";}renderDashboardPeriodControls();};
    if(year) year.onchange=e=>{if(kind==="ranking"){rankingRangeYear=e.target.value;rankingRangeStart="";rankingRangeEnd="";rankingRangeSegment="ALL";}else{h2hRangeYear=e.target.value;h2hRangeStart="";h2hRangeEnd="";h2hRangeSegment="ALL";}renderDashboardPeriodControls();};
    if(segment) segment.onchange=e=>{if(kind==="ranking")rankingRangeSegment=e.target.value||"ALL";else h2hRangeSegment=e.target.value||"ALL";renderDashboardPeriodControls();if(kind==="ranking")renderDashboardQueryRankings();else renderHeadToHead();};
    if(start) start.onchange=e=>{if(kind==="ranking")rankingRangeStart=e.target.value;else h2hRangeStart=e.target.value;};
    if(end) end.onchange=e=>{if(kind==="ranking")rankingRangeEnd=e.target.value;else h2hRangeEnd=e.target.value;};
    if(apply) apply.onclick=()=>{if(start){if(kind==="ranking")rankingRangeStart=start.value;else h2hRangeStart=start.value;}if(end){if(kind==="ranking")rankingRangeEnd=end.value;else h2hRangeEnd=end.value;}renderDashboardPeriodControls();if(kind==="ranking")renderDashboardQueryRankings();else renderHeadToHead();};
  };
  bind("ranking");bind("h2h");
}
bindDashboardPeriodEvents();

function bindLinkedRecordEvents(prefix){
  const mode=$("#"+prefix+"RecordMode"), year=$("#"+prefix+"RecordYear"), segment=$("#"+prefix+"RecordSegment"), date=$("#"+prefix+"RecordDate"), dateSel=$("#"+prefix+"RecordDateSel");
  const start=$("#"+prefix+"RecordStartSel"), end=$("#"+prefix+"RecordEndSel"), apply=$("#"+prefix+"RecordApply"), latestBtn=$("#"+prefix+"RecordLatest");
  if(mode) mode.onchange=e=>{ recordMode=e.target.value; recordSegment="ALL"; refreshRecordLinkedViews(); };
  if(year) year.onchange=e=>{ recordYear=e.target.value; recordSegment="ALL"; setRecordYearDefaults(recordYear); if($("#seasonPanel")) $("#seasonPanel").style.display="none"; refreshRecordLinkedViews(); };
  if(segment) segment.onchange=e=>{ recordSegment=e.target.value||"ALL"; refreshRecordLinkedViews(); };
  if(date) date.onchange=e=>{ recordDate=normDate(e.target.value); refreshRecordLinkedViews(); };
  if(dateSel) dateSel.onchange=e=>{ if(e.target.value) recordDate=normDate(e.target.value); refreshRecordLinkedViews(); };
  if(start) start.onchange=e=>{ recordStart=normDate(e.target.value); };
  if(end) end.onchange=e=>{ recordEnd=normDate(e.target.value); };
  if(apply) apply.onclick=()=>{ if(start) recordStart=normDate(start.value)||recordStart; if(end) recordEnd=normDate(end.value)||recordEnd; if(date) recordDate=normDate(date.value)||recordDate; refreshRecordLinkedViews(); };
  if(latestBtn) latestBtn.onclick=()=>{ applyLatestDbPeriodDefaults(true); refreshRecordLinkedViews(); renderDashboardPeriodControls(); renderDashboardQueryRankings(); renderHeadToHead(); renderAbility(); };
}
bindLinkedRecordEvents("team");
bindLinkedRecordEvents("player");

function setAdmin(v){
  v=!!v && GGFC.authorized;
  admin=v;syncAbilityAdminControls();
  document.body.classList.toggle("admin-mode", !!v);
  if(!v) $("#seasonPanel").style.display="none";
  $("#lockBadge").className="badge "+(v?"open":"locked");
  $("#lockBadge").textContent = v? "🔓 관리자 모드" : "🔒 열람 모드";
  $("#lockBtn").textContent = v? "로그아웃" : "관리자 로그인";

  /* 데이터 관리와 대표승점 설정 탭은 관리자에게만 노출한다. */
  const dataTab=$("#dataTab") || $$("#tabs button").find(x=>x.dataset.v==="data");
  const repTab=$("#repTab") || $$("#tabs button").find(x=>x.dataset.v==="rep");
  const abilityCfgTab=$("#abilityCfgTab") || $$("#tabs button").find(x=>x.dataset.v==="abilitycfg");
  if(dataTab) dataTab.style.display=v?"":"none";
  if(repTab) repTab.style.display=v?"":"none";
  if(abilityCfgTab) abilityCfgTab.style.display=v?"":"none";

  /* 랭킹 설명 문구는 관리자 모드에서만 표시한다. */
  $$(".admin-ranking-note").forEach(el=>el.style.display=v?"block":"none");

  /* 관리자 전용 화면에서 로그아웃하면 일반 대시보드로 즉시 복귀한다. */
  if(!v && (($("#v-data") && $("#v-data").classList.contains("on")) || ($("#v-rep") && $("#v-rep").classList.contains("on")) || ($("#v-abilitycfg") && $("#v-abilitycfg").classList.contains("on")))){
    goTab("dash");
    history.replaceState(null,"","#dash");
  }

  renderAll();
}
$("#lockBtn").onclick=()=>{
  if(typeof closeMemberSidebar==='function') closeMemberSidebar(true);
  GGFC.loginOrLogout();
};
$("#pwCancel").onclick=()=>GGFC.closeLogin();
$("#adminLoginForm").onsubmit=e=>{e.preventDefault();GGFC.signIn();};
$("#pwShow").onclick=()=>GGFC.togglePassword();
document.addEventListener('keydown',e=>{if(e.key==='Escape' && $('#mask').classList.contains('on'))GGFC.closeLogin();});
$("#mask").onclick=e=>{if(e.target===$("#mask"))GGFC.closeLogin();};

if($("#abilityYear")) $("#abilityYear").onchange=e=>{if(!admin)return;abilityYear=e.target.value;abilityAsOfDate="";renderAbility();};
if($("#abilityHalf")) $("#abilityHalf").onchange=e=>{if(!admin)return;abilityHalf=e.target.value;renderAbility();};
if($("#abilityAsOfDate")) $("#abilityAsOfDate").onchange=e=>{if(!admin)return;
  const d=normDate(e.target.value); abilityAsOfDate=d;
  if(d&&/^\d{4}/.test(d)) abilityYear=d.slice(0,4);
  renderAbility();
};
if($("#abilityDateLatest")) $("#abilityDateLatest").onclick=()=>{if(!admin)return;
  const ds=abilityYearGameDates(abilityYear);
  abilityAsOfDate=ds[0]||"";
  renderAbility();
  toast(abilityAsOfDate?abilityAsOfDate+" 최신 경기 기준으로 전환했습니다.":"선택 시즌에 경기 기록이 없습니다.");
};
if($("#abilityRefresh")) $("#abilityRefresh").onclick=()=>{if(!admin)return;renderAbility();toast(abilityAsOfDate?abilityAsOfDate+" 경기 종료 기준으로 선수 능력치를 다시 계산했습니다.":"선수 능력치를 다시 계산했습니다.");};
if($("#abilitySystemEnabled")) $("#abilitySystemEnabled").onchange=e=>{
  if(!admin){e.target.checked=abilitySystemEnabled();return;} ensureAbilityData();DB.settings.ability.enabled=!!e.target.checked;save();renderAll();toast(e.target.checked?"선수 능력치 시스템을 선수카드에 적용합니다.":"선수 능력치 시스템을 비활성화했습니다. Draft 수동 능력치는 사용하지 않습니다.");
};
if($("#soccerbeeUpload")) $("#soccerbeeUpload").onclick=()=>{if(!admin){toast("관리자 모드에서만 업로드할 수 있습니다.");return;}$("#soccerbeeFilepick").click();};
if($("#soccerbeeFilepick")) $("#soccerbeeFilepick").onchange=async e=>{
  if(!GGFC.canEdit()){e.target.value="";return;}
  const f=e.target.files[0];e.target.value="";if(!f)return;
  try{
    const n=await importSoccerBeeXlsx(await f.arrayBuffer()), result=importSoccerBeeXlsx.lastResult||{};
    save();renderAll();
    const miss=(result.unmatched||[]);
    toast("SoccerBee "+n+"건 이름 매칭 완료 · 최신 적용 "+(result.latest||0)+"명"+(miss.length?" · 미매칭 "+miss.length+"명":""));
    if(miss.length) console.warn("SoccerBee 선수명 미매칭:",miss);
  }catch(err){toast("SoccerBee 불러오기 실패: "+err.message);}
};
if($("#soccerbeeClear")) $("#soccerbeeClear").onclick=()=>{if(!admin)return;if(confirm("SoccerBee 측정 이력을 모두 삭제할까요? 경기기록과 선수명단은 유지됩니다.")){ensureAbilityData();DB.soccerbee=[];save();renderAll();toast("SoccerBee DB를 초기화했습니다.");}};

$("#logoFilepick").onchange=async e=>{
  if(!GGFC.canEdit()){e.target.value="";return;}
  const f=e.target.files[0]; e.target.value="";
  if(!f || !logoTarget) return;
  if(!admin){ logoTarget=null; return; }
  try{
    const data=await resizedLogoData(f);
    ensureLogoSettings();
    if(logoTarget.type==="team") DB.settings.teamLogos[logoTarget.key]=data;
    else if(logoTarget.type==="league") DB.settings.leagueLogos[logoTarget.key]=data;
    else if(logoTarget.type==="header") DB.settings.headerLogo=data;
    const label=logoTarget.type==="team"?teamDisplayName(logoTarget.key):logoTarget.type==="league"?leagueGroupLabel(logoTarget.key):"헤더";
    logoTarget=null; save(); renderAll(); toast(label+" 로고를 등록했습니다.");
  }catch(err){ logoTarget=null; toast("로고 등록 실패: "+err.message); }
};

let pendKind=null;
$("#tplAll").onclick=()=>{ downloadBlob("GGFC_통합_기록지_양식.xlsx", buildXlsx()); toast("통합 엑셀 양식(경기기록·팀스쿼드·선수명단·스페셜기록)을 내려받았습니다."); };
$("#expXlsx").onclick=()=>{ downloadBlob("GGFC_기록_"+ymd(new Date())+".xlsx", buildXlsx(buildRecordXlsx())); toast("현재 기록을 엑셀로 내보냈습니다 (선수명단에 출석률·득점 누계 포함)."); };
$("#upAll").onclick=()=>{if(!GGFC.canEdit()){toast("관리자 인증과 서버 연결이 필요합니다.");return;} pendKind="__all"; $("#filepick").accept=".xlsx,.csv,.txt"; $("#filepick").click(); };
$("#importJson").onclick=()=>{if(!GGFC.canEdit()){toast("관리자 인증과 서버 연결이 필요합니다.");return;} pendKind="__json"; $("#filepick").accept=".json"; $("#filepick").click(); };
$("#filepick").onchange=async e=>{
  if(!GGFC.canEdit()){e.target.value="";return;}
  const f=e.target.files[0]; e.target.value=""; if(!f) return;
  try{
    let msg="";
    if(pendKind==="__json"){
      DB=GGFC.normalizeDB(JSON.parse(await f.text()),true);
      msg="JSON 데이터를 불러왔습니다.";
    } else if(/\.xlsx$/i.test(f.name)){
      const done = await importXlsx(await f.arrayBuffer());
      msg="엑셀 반영 완료 — "+done.join(" · ")+" 시트";
    } else {
      msg=importCsvFile(await f.text());
    }
    const latest=latestMatchDate();
    if(latest){ focusDashboardDate(latest); applyLatestDbPeriodDefaults(true); }
    save(); renderAll();
    const issues=recordDataIssues();
    toast(msg+(latest?" · "+latest+" 기록 표시":"")+(issues.length?" · "+issues.length+"경기 점수 확인 필요 (데이터 관리)":""));
  }catch(err){ toast("불러오기 실패: "+err.message); }
};
$("#exportJson").onclick=()=>{ download("GGFC_기록_"+ymd(new Date())+".json", JSON.stringify(DB,null,2), "application/json"); toast("JSON 파일을 내려받았습니다."); };
$("#clearBtn").onclick=()=>{if(!GGFC.canEdit()){toast("관리자 인증과 서버 연결이 필요합니다.");return;} if(confirm("모든 기록을 삭제할까요? 되돌릴 수 없습니다.")){ DB=blankDB(); dashDate=""; recordMode="LATEST"; recordYear=""; recordDate=""; recordStart=""; recordEnd=""; rankingRangeMode="";rankingRangeYear="";rankingRangeSegment="ALL";h2hRangeMode="";h2hRangeYear="";h2hRangeSegment="ALL";latestDbPeriodSignature=""; save(); renderAll(); toast("전체 기록을 삭제했습니다."); } };
$("#sampleBtn").onclick=()=>{if(!GGFC.canEdit()){toast("관리자 인증과 서버 연결이 필요합니다.");return;} DB=sampleData(); dashDate=""; recordMode="LATEST"; recordYear=""; recordDate=""; recordStart=""; recordEnd=""; rankingRangeMode="";rankingRangeYear="";rankingRangeSegment="ALL";h2hRangeMode="";h2hRangeYear="";h2hRangeSegment="ALL";latestDbPeriodSignature=""; applyLatestDbPeriodDefaults(true); save(); renderAll(); toast("샘플 데이터를 불러왔습니다."); };

/* ---------- sample ---------- */
function sampleData(){
  const teams=["A특공대","풀파워","어우씨","D져스","이지스","라스트원"];
  const coaches={"A특공대":"박감독","풀파워":"정감독","어우씨":"최감독","D져스":"강감독","이지스":"윤감독","라스트원":"조감독"};
  const squads={
    "A특공대":["김철수","송재희","이한결","박도윤","장민석"],
    "풀파워":["이영호","최준영","오세훈","한지훈","권태현"],
    "어우씨":["정우성","배진우","신동혁","고상철","유재현"],
    "D져스":["윤성민","임재훈","노경환","서지호","문태일"],
    "이지스":["강백호","백승우","홍민기","차은우","남기훈"],
    "라스트원":["조현우","황인범","손흥규","김진수","양현종"]
  };
  const dates=["2026-03-07","2026-03-21","2026-04-11","2026-04-25","2026-05-09","2026-05-23","2026-06-13"];
  const M=[],A=[],G=[]; let n=0; let seed=7;
  const rnd=()=>{ seed=(seed*9301+49297)%233280; return seed/233280; };
  dates.forEach((d,di)=>{
    const order=teams.slice(); const pairs=[[order[0],order[1]],[order[2],order[3]],[order[4],order[5]]];
    const shift=di%3;
    const rot=teams.slice(shift).concat(teams.slice(0,shift));
    const ps=[[rot[0],rot[1]],[rot[2],rot[3]],[rot[4],rot[5]]];
    const compName = di===4? "FA컵" : di===6? "회장배" : "정규리그";
    ps.forEach(([h,a],pi)=>{
      const id="M"+String(++n).padStart(3,"0"); const gno=String(Math.floor(pi/2)+1)+(pi%2===0?"A":"B");
      const hs=Math.floor(rnd()*5), as=Math.floor(rnd()*5);
      M.push({id,date:d,comp:compName,no:gno,half:(di<4?"\uc0c1\ubc18\uae30":"\ud558\ubc18\uae30"),round:"R"+(di+1),home:h,away:a,hs,as,hf:Math.floor(rnd()*7),af:Math.floor(rnd()*7),homeGroup:(teams.indexOf(h)<4?"A":"B"),awayGroup:(teams.indexOf(a)<4?"A":"B")});
      [[h,hs],[a,as]].forEach(([t,sc])=>{
        const sq=squads[t].filter(()=>rnd()>0.18);
        (sq.length?sq:squads[t].slice(0,4)).forEach(p=>A.push({id,team:t,player:p,coach:coaches[t]}));
        let left=sc;
        while(left>0){ const p=squads[t][Math.floor(rnd()*squads[t].length)]; const g=Math.min(left,1+Math.floor(rnd()*2));
          const ex=G.find(x=>x.id===id&&x.player===p); if(ex) ex.g+=g; else G.push({id,team:t,player:p,g,a:0}); left-=g; }
      });
    });
  });
  const S=[
    {date:"2026-06-13",player:"김철수",type:"우승",memo:"2026 회장배 우승"},
    {date:"2026-05-09",player:"정우성",type:"MVP",memo:"FA컵 MVP"},
    {date:"2026-04-25",player:"송재희",type:"개근",memo:"상반기 전 경기 출석"}
  ];
  const R=[]; const pos=["FW","MF","MF","DF","GK"];
  teams.forEach(t=>squads[t].forEach((p,i)=>R.push({year:"2026",team:t,no:String(7+i),player:p,pos:pos[i]||"MF",memo:i===0?"\uc8fc\uc7a5":""})));
  return {matches:M,attendance:A,goals:G,saves:[],fouls:[],moms:[],soccerbee:[],specials:S,roster:R,settings:{seasons:{}}};
}


/* ---------- V3.19.2: high-resolution, aligned single-page matchday poster ---------- */
function exportSafeName(v){
  return String(v||'GGFC').trim().replace(/[\\/:*?"<>|]+/g,'_').replace(/\s+/g,'_').slice(0,80)||'GGFC';
}
let dashboardRendererPromise=null;
function loadDashboardRenderer(){
  if(typeof window.html2canvas==='function') return Promise.resolve(window.html2canvas);
  if(dashboardRendererPromise) return dashboardRendererPromise;
  dashboardRendererPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    let done=false;
    const finish=err=>{
      if(done) return;
      done=true; clearTimeout(timer); script.onload=script.onerror=null;
      if(err){script.remove();reject(err);} else resolve(window.html2canvas);
    };
    const failure=()=>finish(new Error('이미지 저장 모듈을 불러오지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.'));
    const timer=setTimeout(failure,12000);
    script.src='https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    script.onload=()=>typeof window.html2canvas==='function'?finish():failure();
    script.onerror=failure;
    document.head.appendChild(script);
  }).catch(err=>{dashboardRendererPromise=null;throw err;});
  return dashboardRendererPromise;
}
function settleExportResource(node,timeout,isReady){
  return new Promise(resolve=>{
    let done=false;
    const finish=()=>{
      if(done) return;
      done=true; clearTimeout(timer);
      node.removeEventListener('load',finish); node.removeEventListener('error',finish);
      resolve();
    };
    const timer=setTimeout(finish,timeout);
    node.addEventListener('load',finish); node.addEventListener('error',finish);
    if(isReady&&isReady()) finish();
  });
}
async function waitDashboardImages(root){
  await Promise.all([...root.querySelectorAll('img')].map(img=>settleExportResource(img,7000,()=>img.complete)));
}
function dashboardImagePlaceholder(){
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 180 180"><rect width="180" height="180" rx="16" fill="#eef3fa"/><path d="M90 26l48 18v42c0 31-21 54-48 66-27-12-48-35-48-66V44z" fill="#d5dfed"/><text x="90" y="87" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#355477">이미지</text><text x="90" y="109" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#355477">없음</text></svg>';
  return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
}
async function embedDashboardImages(root){
  // Embed readable images so the renderer cannot silently omit a remote logo.
  await waitDashboardImages(root);
  const groups=new Map();
  root.querySelectorAll('img').forEach(img=>{
    const url=img.currentSrc||img.src;
    if(!groups.has(url)) groups.set(url,[]);
    groups.get(url).push(img);
  });
  let unavailable=0;
  for(const [url,images] of groups){
    const img=images.find(x=>x.complete&&x.naturalWidth>0);
    let embedded=url,canvas=null;
    try{
      if(!img) throw new Error('Image unavailable');
      if(!/^data:/i.test(url)){
        canvas=root.ownerDocument.createElement('canvas');
        const scale=Math.min(1,2048/Math.max(img.naturalWidth,img.naturalHeight));
        canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
        canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
        const ctx=canvas.getContext('2d');
        if(!ctx) throw new Error('Canvas unavailable');
        ctx.drawImage(img,0,0,canvas.width,canvas.height);
        embedded=canvas.toDataURL('image/png');
        if(!embedded.startsWith('data:image/')) throw new Error('Image conversion failed');
      }
    }catch(err){unavailable++;embedded=dashboardImagePlaceholder();}
    finally{if(canvas){canvas.width=0;canvas.height=0;}}
    images.forEach(image=>{image.src=embedded;});
  }
  await waitDashboardImages(root);
  return unavailable;
}
function cleanDashboardSnapshot(root){
  root.querySelectorAll('[data-dashboard-admin],[data-export-ignore],.admin-ranking-note,script').forEach(node=>node.remove());
  root.querySelectorAll('*').forEach(node=>{
    [...node.attributes].forEach(attr=>{if(/^on/i.test(attr.name)) node.removeAttribute(attr.name);});
    node.removeAttribute('autofocus');
    if(node.tagName==='IMG'){
      const src=node.currentSrc||node.src;
      node.removeAttribute('srcset'); node.removeAttribute('sizes');
      node.loading='eager'; node.decoding='sync'; node.crossOrigin='anonymous';
      node.src=src;
    }
  });
  // Expand dates only in the snapshot; never change the user's live UI or query.
  root.querySelectorAll('details.record-day').forEach(node=>{node.open=true;});
}
function posterTable(source,selector,indices,labels){
  const table=source.querySelector(selector+' table');
  if(!table)return '<div class="poster-empty">기록 없음</div>';
  const head='<thead><tr>'+labels.map(t=>'<th>'+esc(t)+'</th>').join('')+'</tr></thead>';
  const body=[...table.querySelectorAll('tbody tr')].map(row=>'<tr>'+indices.map(i=>'<td>'+esc(row.cells[i]?.textContent.trim()||'—')+'</td>').join('')+'</tr>').join('');
  return '<table>'+head+'<tbody>'+body+'</tbody></table>';
}
function posterTeamIcon(team,extra=''){
  const src=teamLogo(team),name=teamDisplayName(team);
  if(src)return '<img class="poster-team-icon '+extra+'" src="'+src+'" alt="'+esc(name)+'">';
  return '<span class="poster-team-icon poster-initial '+extra+'">'+teamInitials(team)+'</span>';
}
function posterLeagueIcon(code){
  const src=leagueLogo(code),name=leagueGroupLabel(code);
  return src?'<img class="poster-league-logo" src="'+src+'" alt="'+esc(name)+'">':'<strong class="poster-league-name">'+esc(name)+'</strong>';
}
function posterMatchHtml(m){
  // Reuse the program's escaped, one-scorer-per-line presentation.
  const home=teamScorers(m,m.home,true),away=teamScorers(m,m.away,true);
  const forfeit=forfeitText(m);
  return '<article class="poster-match" data-match-id="'+esc(m.id)+'"><div class="poster-match-line">'+
    '<div class="poster-match-copy home"><b class="poster-match-team">'+esc(teamDisplayName(m.home))+'</b><div class="poster-scorers">'+home+'</div></div>'+posterTeamIcon(m.home)+
    '<div class="poster-match-center"><b class="poster-score">'+num(m.hs)+' <span>-</span> '+num(m.as)+'</b>'+fixtureMomHtml(m)+'</div>'+posterTeamIcon(m.away)+
    '<div class="poster-match-copy away"><b class="poster-match-team">'+esc(teamDisplayName(m.away))+'</b><div class="poster-scorers">'+away+'</div></div></div>'+
    (forfeit?'<div class="poster-forfeit">'+esc(forfeit)+'</div>':'')+'</article>';
}
function posterStandingHtml(source){
  const table=source.querySelector('.team-league-standing');
  if(!table)return '<div class="poster-empty">선택한 조회기간에 기록이 없습니다.</div>';
  const labels=['리그','순위','팀명','경기수','승점','승','무','패','득점','실점','득실차','참석수'];
  const head='<thead><tr>'+labels.map(x=>'<th>'+x+'</th>').join('')+'</tr></thead>';
  const body=[...table.querySelectorAll('tbody tr')].map(row=>{
    const cells=[...row.cells];let league='';
    if(cells[0]?.classList.contains('league-standing-cell')){
      const cell=cells.shift();league='<td class="poster-standing-league" rowspan="'+cell.rowSpan+'">'+cell.innerHTML+'</td>';
    }
    // Same values as the on-screen table; order follows the supplied design.
    return '<tr>'+league+[0,1,2,3,5,6,7,8,9,10,4].map((i,n)=>'<td class="'+(n===1?'poster-standing-team':'')+'">'+cells[i].innerHTML+'</td>').join('')+'</tr>';
  }).join('');
  return '<table class="poster-standing-table">'+head+'<tbody>'+body+'</tbody></table>';
}
function posterAttendanceHtml(list){
  const teams=headToHeadTeams(list);
  if(!teams.length)return '<div class="poster-empty">참석 기록 없음</div>';
  return '<table class="poster-attendance-table"><thead><tr><th>팀</th><th>감독</th><th>코치</th><th>선수 명단</th></tr></thead><tbody>'+teams.map(team=>{
    const members=squadAttendanceMembers(list,team);
    const names=rows=>rows.map(p=>'<span class="'+(p.att?'present':'absent')+'">'+esc(p.player)+'</span>').join(' ');
    return '<tr><th>'+posterTeamIcon(team)+'<span>'+esc(teamDisplayName(team))+'</span></th><td>'+names(members.filter(p=>p.role==='감독'))+'</td><td>'+names(members.filter(p=>p.role==='코치'))+'</td><td>'+names(members.filter(p=>!['감독','코치'].includes(p.role)))+'</td></tr>';
  }).join('')+'</tbody></table>';
}
function buildReferencePoster(doc,source){
  const date=normDate(dashDate||''),year=date.slice(0,4)||String(new Date().getFullYear());
  const dayMatches=uniqueRecordMatches(recordBaseMatches().filter(m=>normDate(m.date)===date)).sort((a,b)=>String(a.no||'').localeCompare(String(b.no||''),undefined,{numeric:true}));
  const half=dayMatches.length?(selectedHalfContext(date).half==='H2'?'하반기':'상반기'):'';
  const rounds=[...new Set(dayMatches.map(recordMatchRoundNumber).filter(n=>n>0))].sort((a,b)=>a-b);
  const round=rounds.length?'ROUND '+rounds[0]+(rounds.length>1?'–'+rounds[rounds.length-1]:''):'MATCH DAY';
  const brand=displaySettings().brandTitle||'GGFC';
  const title=(brand==='GGFC'?'GG풋살리그':brand+' 풋살리그');
  const weekday=date?['일','월','화','수','목','금','토'][new Date(date+'T12:00:00').getDay()]:'';
  const dateText=date?date.replace(/-0?/g,'.')+' ('+weekday+')':'경기일 미선택';
  const originalLogo=headerLogo();
  const brandLogo=originalLogo?'<img class="poster-brand-logo" src="'+originalLogo+'" alt="'+esc(brand)+'">':'<span class="poster-brand-logo poster-brand-fallback">'+esc(brand)+'</span>';
  const lanes=['A','B'].map(code=>{
    const teams=groundTeamStats(code,date);
    const cards=teams.length?teams.map(t=>'<div class="poster-league-team">'+posterTeamIcon(t.team,'card-icon')+'<b>'+esc(teamDisplayName(t.team))+'</b><div>'+t.w+'승 '+t.d+'무 '+t.l+'패</div><div>'+t.gf+'득 '+t.ga+'실</div></div>').join(''):'<div class="poster-empty">팀 기록 없음</div>';
    const games=dayMatches.filter(m=>(matchGround(m)||'A')===code);
    return '<section class="poster-lane lane-'+code+'"><div class="poster-league-mark">'+posterLeagueIcon(code)+'</div><div class="poster-team-cards">'+cards+'</div><div class="poster-games">'+(games.length?games.map(posterMatchHtml).join(''):'<div class="poster-empty">등록 경기 없음</div>')+'</div></section>';
  }).join('');
  const period=source.querySelector('#exportTeamStandingSection .record-period-label')?.textContent.trim()||'';
  const range=source.querySelector('#exportTeamStandingSection .record-round-range')?.textContent.trim()||'';
  const rankingPeriod=(source.querySelector('#dashScorerQueryNote')?.textContent||'').match(/^.*?경기 기준/)?.[0]||'';
  const h2h=source.querySelector('#dashHeadToHead table')?.outerHTML||'<div class="poster-empty">상대전적 기록 없음</div>';
  const panel=(cls,title,html)=>'<section class="poster-rank-panel '+cls+'"><h3>'+title+'</h3>'+html+'</section>';
  const root=doc.createElement('article');root.id='ggfc-reference-poster';root.className='ggfc-reference-poster';
  root.innerHTML='<header class="poster-hero poster-dark">'+brandLogo+'<div class="poster-hero-title">'+esc(year)+' '+esc(title)+'</div><div class="poster-hero-subtitle"><span>'+esc(half)+'</span> 경기결과</div><div class="poster-round">'+esc(round)+'</div><div class="poster-date">'+esc(dateText)+(DB.settings?.posterVenue?'<br>'+esc(DB.settings.posterVenue):'')+'</div></header>'+
    '<div class="poster-results">'+lanes+'</div>'+
    '<section class="poster-statistics poster-dark"><section class="poster-team-standing"><h3>#팀순위 <span>(구간'+(range?' · '+esc(range):'')+')</span></h3><div class="poster-period">'+esc(period)+'</div>'+posterStandingHtml(source)+'</section>'+
    '<div class="poster-ranking-period">'+esc(rankingPeriod)+'</div><div class="poster-rankings">'+
      panel('poster-rank-attendance','#개인순위 <span>(참석률)</span>',posterTable(source,'#dashAttendanceRank',[0,1,3,5],['순위','이름','경기수','참석률']))+
      panel('poster-rank-scorers','#개인순위 <span>(득점)</span>',posterTable(source,'#dashScorers',[0,1,3,4],['순위','이름','경기수','득점']))+
      '<div class="poster-rank-stack">'+
        panel('poster-rank-team','#팀순위 <span>(누적 승점)</span>',posterTable(source,'#dashTeamPointRank',[0,1,2,3,4,5],['순위','팀명','대표','참석','승점','득실']))+
        panel('poster-rank-player','#개인순위 <span>(누적 승점)</span>',posterTable(source,'#dashPlayerPointRank',[0,1,2,3],['순위','이름','경기수','승점']))+
        panel('poster-rank-fouls','#팀순위 <span>(팀파울)</span>',posterTable(source,'#dashTeamFoulRank',[0,1,2,3],['순위','이름','경기수','팀파울']))+'</div></div></section>'+
    '<section class="poster-attendance"><h3>#참석자</h3><div class="poster-attendance-note">'+esc(dateText)+' · 진한 이름: 참석 / 연한 이름: 미참석</div>'+posterAttendanceHtml(dayMatches)+'</section>'+
    '<section class="poster-headtohead poster-dark"><h3>#상대전적</h3><div class="poster-period">'+esc(source.querySelector('#dashHeadToHeadPeriod')?.textContent||'')+'</div>'+h2h+'</section>';
  cleanDashboardSnapshot(root);
  // Normalise UI-only classes without altering any live node or database value.
  root.querySelectorAll('[style]').forEach(node=>node.removeAttribute('style'));
  root.querySelectorAll('button.player-card-link').forEach(button=>{const span=doc.createElement('span');span.textContent=button.textContent;button.replaceWith(span);});
  // Substitute default league badges when the user has not registered a logo.
  root.querySelectorAll('.league-standing-fallback').forEach(node=>{
    const code=node.textContent.trim()===leagueGroupLabel('B')?'B':'A';node.parentElement.innerHTML=posterLeagueIcon(code);
  });
  return root;
}

function fitDashboardPoster(root){
  const sections=[...root.querySelectorAll('.poster-lane,.poster-statistics,.poster-attendance,.poster-headtohead')];
  sections.forEach(section=>{
    let inner=section.querySelector(':scope > .poster-fit-content');
    if(!inner){inner=root.ownerDocument.createElement('div');inner.className='poster-fit-content';while(section.firstChild)inner.appendChild(section.firstChild);section.appendChild(inner);}
    inner.style.transform='none';
  });
  root.querySelectorAll('.poster-rank-panel tbody tr').forEach(row=>row.style.height='');
  const lanes=[...root.querySelectorAll('.poster-lane')];
  const equalHeight=nodes=>{
    nodes=nodes.filter(Boolean);nodes.forEach(n=>n.style.height='auto');
    const height=Math.ceil(Math.max(0,...nodes.map(n=>n.getBoundingClientRect().height)));
    nodes.forEach(n=>n.style.height=height+'px');
  };
  const layout=scale=>{
    // Expand the layout width before scaling: tables always fill their full column.
    sections.forEach(section=>section.firstElementChild.style.width=((section.clientWidth-20)/scale)+'px');
    root.querySelectorAll('.poster-league-team,.poster-league-team b,.poster-team-cards,.poster-match').forEach(n=>n.style.height='auto');
    equalHeight([...root.querySelectorAll('.poster-league-team b')]);
    equalHeight([...root.querySelectorAll('.poster-league-team')]);
    equalHeight(lanes.map(n=>n.querySelector('.poster-team-cards')));
    const games=lanes.map(n=>[...n.querySelectorAll('.poster-match')]);
    for(let i=0;i<Math.max(0,...games.map(rows=>rows.length));i++)equalHeight(games.map(rows=>rows[i]));
    return sections.every(section=>{
      const inner=section.firstElementChild;
      return inner.scrollHeight*scale<=section.clientHeight-20&&inner.scrollWidth*scale<=section.clientWidth-19;
    });
  };
  // One shared scale keeps all names and statistics at the same visible font size.
  let scale=1;
  if(!layout(scale)){
    let low=.05,high=1;
    for(let i=0;i<12;i++){const mid=(low+high)/2;if(layout(mid))low=mid;else high=mid;}
    scale=low;layout(scale);
  }
  // Use remaining ranking space evenly, with matching row spacing in all three columns.
  const statistics=root.querySelector('.poster-statistics'),rankings=root.querySelector('.poster-rankings');
  if(statistics&&rankings){
    const available=(statistics.clientHeight-20)/scale-(rankings.getBoundingClientRect().top-statistics.firstElementChild.getBoundingClientRect().top);
    const columns=[...rankings.children].map(column=>({column,rows:[...column.querySelectorAll('tbody tr')]})).filter(x=>x.rows.length);
    const extra=Math.max(0,Math.min(12,...columns.map(x=>(available-x.column.getBoundingClientRect().height-2)/x.rows.length)));
    columns.forEach(x=>x.rows.forEach(row=>row.style.height=(row.getBoundingClientRect().height+extra)+'px'));
  }
  sections.forEach(section=>{
    section.firstElementChild.style.transform='scale('+scale+')';
    section.firstElementChild.style.transformOrigin='top left';
    section.dataset.contentScale=scale.toFixed(4);
  });
}
async function createDashboardExportSnapshot(source){
  if(!source.getBoundingClientRect().width)throw new Error('종합기록 화면을 연 뒤 다시 저장해 주세요.');
  const frame=document.createElement('iframe');frame.title='종합기록 이미지 준비';frame.tabIndex=-1;frame.setAttribute('aria-hidden','true');
  frame.style.cssText='position:fixed;left:-100000px;top:0;width:428px;height:2047px;border:0;pointer-events:none';document.body.appendChild(frame);
  try{
    const doc=frame.contentDocument;doc.documentElement.lang='ko';
    const base=doc.createElement('base');base.href=document.baseURI;doc.head.appendChild(base);
    const style=doc.createElement('link');style.rel='stylesheet';style.href=new URL('assets/ggfc-export.css?v=3.19.2',document.baseURI).href;
    const ready=settleExportResource(style,12000,()=>!!style.sheet);doc.head.appendChild(style);await ready;
    if(!style.sheet)throw new Error('출력 스타일을 불러오지 못했습니다.');
    const root=buildReferencePoster(doc,source);doc.body.appendChild(root);
    const fonts=await Promise.all([doc.fonts.load('700 28px GGFCTitle'),doc.fonts.load('400 10px GGFCBody'),doc.fonts.load('700 10px GGFCBody')]);
    if(fonts.some(list=>!list.length))throw new Error('출력 글꼴을 불러오지 못했습니다.');
    // Canvas text is measured in the calling document, so register export fonts there too.
    for(const [family,file,weight] of [['GGFCTitle','GmarketSansTTFBold.woff','700'],['GGFCBody','GGFCBody.woff','100 900']]){
      if(![...document.fonts].some(face=>face.family===family&&face.status==='loaded')){
        const face=new FontFace(family,'url("'+new URL('assets/fonts/'+file,document.baseURI).href+'")',{weight});
        document.fonts.add(await face.load());
      }
    }
    const unavailableImages=await embedDashboardImages(root);
    // Fit each section independently; every row remains in the single fixed-size poster.
    fitDashboardPoster(root);
    return {root,frame,width:428,height:2047,viewportWidth:428,viewportHeight:2047,unavailableImages,cleanup:()=>frame.remove()};
  }catch(err){frame.remove();throw err;}
}
async function renderDashboardPng(renderer,snapshot){
  let canvas,output;
  try{
    // Render text and layout at 4× first; never enlarge a low-resolution bitmap.
    canvas=await renderer(snapshot.root,{scale:4,backgroundColor:'#f3f5f8',useCORS:true,allowTaint:false,logging:false,imageTimeout:8000,removeContainer:true,scrollX:0,scrollY:0,windowWidth:428,windowHeight:2047,width:428,height:2047,onclone:async doc=>{
      await Promise.all([doc.fonts.load('700 28px GGFCTitle'),...[400,700,800,900].map(weight=>doc.fonts.load(weight+' 10px GGFCBody'))]);
      await doc.fonts.ready;
      fitDashboardPoster(doc.getElementById('ggfc-reference-poster'));
    }});
    if(!canvas||canvas.width!==1712||canvas.height!==8188)throw new Error('고해상도 출력 크기를 확인할 수 없습니다.');
    output=document.createElement('canvas');output.width=1600;output.height=7653;
    const ctx=output.getContext('2d',{alpha:false});
    if(!ctx)throw new Error('이미지 변환 화면을 만들지 못했습니다.');
    ctx.fillStyle='#f3f5f8';ctx.fillRect(0,0,output.width,output.height);
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    ctx.drawImage(canvas,0,0,output.width,output.height);
    const blob=await new Promise((resolve,reject)=>output.toBlob(b=>b?.size?resolve(b):reject(new Error('PNG 변환에 실패했습니다.')),'image/png'));
    return {blob,width:1600,height:7653};
  }finally{
    if(canvas){canvas.width=0;canvas.height=0;}
    if(output){output.width=0;output.height=0;}
  }
}
let dashboardExportBusy=false;
async function exportDashboardAsPng(button){
  if(!admin){toast('이미지 저장은 관리자 모드에서만 사용할 수 있습니다.');return;}
  if(dashboardExportBusy) return;
  const source=document.getElementById('v-dash');
  if(!source){toast('종합기록 화면을 찾을 수 없습니다.');return;}
  const label=button.textContent;
  const brand=exportSafeName(displaySettings().brandTitle||'GGFC');
  const stamp=exportSafeName(normDate(dashDate||'')||ymd(new Date()));
  const mobile=document.documentElement.classList.contains('ggfc-mobile')||window.matchMedia('(max-width: 820px)').matches;
  dashboardExportBusy=true;button.disabled=true;button.textContent='이미지 준비 중…';button.setAttribute('aria-busy','true');
  let snapshot;
  try{
    // Compose a fixed-size poster without changing the live query or stored records.
    snapshot=await createDashboardExportSnapshot(source);
    const renderer=await loadDashboardRenderer();
    button.textContent='이미지 만드는 중…';
    const result=await renderDashboardPng(renderer,snapshot);
    downloadBlob(brand+'_종합기록_'+stamp+'.png',result.blob);
    toast('종합기록 PNG 한 장을 저장했습니다. (1600 × 7653px)'+(snapshot.unavailableImages?' · 불러오지 못한 이미지는 대체 표시했습니다.':''));
  }catch(err){console.error(err);toast('이미지 저장 실패: '+err.message);}
  finally{
    if(snapshot) snapshot.cleanup();
    button.disabled=false;button.textContent=label;button.removeAttribute('aria-busy');dashboardExportBusy=false;
  }
}
document.addEventListener('click',e=>{
  const button=e.target.closest('[data-export-dashboard]');
  if(!button) return;
  e.preventDefault();e.stopPropagation();
  exportDashboardAsPng(button);
},true);


/* ---------- administrator display-name settings ---------- */
const displayNameSave=$("#displayNameSave");
if(displayNameSave) displayNameSave.onclick=()=>{
  if(!admin){ toast("관리자 로그인 후 수정할 수 있습니다."); return; }
  const brand=String($("#brandTitleInput").value||"").trim();
  const leagueA=String($("#leagueANameInput").value||"").trim();
  const leagueB=String($("#leagueBNameInput").value||"").trim();
  if(!brand || !leagueA || !leagueB){ toast("표시명 3개를 모두 입력해 주세요."); return; }
  ensureLogoSettings();
  DB.settings.display={brandTitle:brand,leagueA,leagueB};
  save(); renderAll(); toast("화면 표시명을 저장했습니다.");
};
const displayNameReset=$("#displayNameReset");
if(displayNameReset) displayNameReset.onclick=()=>{
  if(!admin){ toast("관리자 로그인 후 수정할 수 있습니다."); return; }
  ensureLogoSettings();
  DB.settings.display={brandTitle:"GGFC",leagueA:"슈퍼리그",leagueB:"챌린지리그"};
  save(); renderAll(); toast("기본 표시명으로 복원했습니다.");
};

/* ---------- boot ---------- */
load();setAdmin(false);renderAll();
if(location.hash)goTab(location.hash.slice(1));
initMemberUI();GGFC.start();
