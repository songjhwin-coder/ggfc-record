/* Historical snapshots: independent of active roster, league filters and career ratings. */
const AT_METRICS=[{key:'goals',label:'통합 득점',unit:'골'},{key:'games',label:'통합 경기수',unit:'경기'},{key:'titles',label:'통합 우승',unit:'회'},{key:'league',label:'리그 우승',unit:'회'},{key:'fa',label:'FA컵 우승',unit:'회'},{key:'champs',label:'챔스 우승',unit:'회'}];
const atState={metric:'goals',search:'',scope:'total'};
function atHeader(v){return String(v||'').normalize('NFKC').replace(/\s/g,'');}
function validateAllTimeHeaders(headers){
 const set=new Set(headers.map(atHeader));
 const outside=[...set].filter(h=>/^((?:19|20)\d{2})(경기수|득점)$/.test(h)&&(+h.slice(0,4)<2019||+h.slice(0,4)>2025));
 if(outside.length)throw Error('역대기록은 2019~2025년 보관 자료입니다. '+outside.join(', ')+' 열은 제외하고 2026년 이후 기록은 경기기록 시트에 입력하세요.');
 const missing=['통합경기수','통합득점','리그우승','FA컵우승','챔스우승'].filter(k=>!set.has(k));
 if(!['선수','선수명','이름'].some(k=>set.has(k)))missing.unshift('선수');
 if(missing.length)throw Error('역대기록 필수 열 확인: '+missing.join(', '));
}
function atCount(value,label,blank=null){
 const raw=String(value??'').trim();if(!raw||raw==='-')return blank;
 if(!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(raw))throw Error('역대기록 '+label+': 0 이상의 정수를 입력하세요 ('+raw+'). 엑셀 수식 오류도 확인하세요.');
 const n=Number(raw.replace(/,/g,''));if(!Number.isSafeInteger(n))throw Error('역대기록 '+label+': 수치가 너무 큽니다.');return n;
}
function applyAllTimeRows(objs){
 if(objs.length)validateAllTimeHeaders(Object.keys(objs[0]));
 const rows=[],seen=new Set(),years=new Set(),warnings=[];
 for(const o of objs){
  const player=String(pick(o,'선수','선수명','이름')).normalize('NFKC').trim(),key=normalizePlayerMatchKey(player);
  if(!player||isOwnGoalPlayer(player)||/^(전체경기수|총경기수|전체|총계|합계|소계)$/.test(atHeader(player)))continue;
  if(seen.has(key))throw Error('역대기록 선수 이름 중복: '+player+'. 동명이인은 구분된 이름을 사용하세요.');seen.add(key);
  const annual=[];
  for(const [header,value] of Object.entries(o)){const m=atHeader(header).match(/^((?:19|20)\d{2})(경기수|득점)$/);if(m){years.add(m[1]);annual.push({year:m[1],key:m[2]==='경기수'?'games':'goals',value:atCount(value,player+' '+header)});}}
  const total=(header,key)=>{const v=atCount(pick(o,header),player+' '+header),valid=annual.filter(r=>r.key===key&&r.value!==null),sum=valid.reduce((s,r)=>s+r.value,0);if(v!==null){if(valid.length&&sum!==v)warnings.push(player+' · '+header+': 입력 '+v+' / 연도별 합계 '+sum+' (입력값 적용)');return v;}return valid.length?sum:null;};
  const league=atCount(pick(o,'리그우승'),player+' 리그 우승',0),fa=atCount(pick(o,'FA컵우승'),player+' FA컵 우승',0),champs=atCount(pick(o,'챔스우승'),player+' 챔스 우승',0);
  rows.push({player,joined:String(pick(o,'입단','입단연도')||''),games:total('통합경기수','games'),goals:total('통합득점','goals'),league,fa,champs,titles:league+fa+champs,career:String(pick(o,'통합우승경력')||''),photo:readPlayerPhotoCell(o),photoCutout:readPlayerPhotoCell(o,true)});
 }
 DB.settings=DB.settings||{};
 DB.settings.allTimeRecords={rows,warnings,sourceRows:objs,headers:objs.length?Object.keys(objs[0]):[],years:[...years].sort(),updatedAt:new Date().toISOString()};
 return rows.length;
}
function allTimeRows(){const rows=DB.settings?.allTimeRecords?.rows;return Array.isArray(rows)?rows:[];}
function exportAllTimeSheet(){
 const data=DB.settings?.allTimeRecords||{},headers=data.headers?.length?data.headers:['No.','선수','입단','통합 경기수','통합 득점','리그 우승','FA컵 우승','챔스 우승','통합 우승 경력','사진(URL)','사진(URL) 배경삭제'];
 return {name:'역대기록',head:headers.join(','),rows:(data.sourceRows||[]).map(r=>headers.map(h=>r[h]??''))};
}
function atRanked(){
 const key=atState.metric;let previous=null,rank=0;
 return atDisplayRows().slice().sort((a,b)=>(b[key]??-1)-(a[key]??-1)||compareNamesKo(a.player,b.player)).map((r,i)=>{const value=r[key];if(value!==null&&value!==undefined){if(value!==previous)rank=i+1;previous=value;}return {...r,rank:value==null?null:rank};});
}
function atPhoto(p){
 const candidates=(DB.roster||[]).filter(r=>normalizePlayerMatchKey(r.player)===normalizePlayerMatchKey(p.player)).sort((a,b)=>String(b.year||'').localeCompare(String(a.year||'')));
 const rosterPhoto=candidates.map(r=>normalizePlayerPhotoUrl(r.photo)).find(Boolean),rosterCutout=candidates.map(r=>normalizePlayerPhotoUrl(r.photoCutout)).find(Boolean);
 const uploaded=uploadedPlayerPhoto(p.player);
 const urls=(uploaded?[uploaded]:[p.photo,p.photoCutout,rosterPhoto,rosterCutout]).map(normalizePlayerPhotoUrl).filter(Boolean),photo=urls[0],fallback=urls.find(u=>u!==photo);
 return '<span class="at-avatar"><span aria-hidden="true">'+esc(p.player.slice(0,1))+'</span>'+(photo?'<img src="'+esc(photo)+'" '+(fallback?'data-at-fallback="'+esc(fallback)+'"':'')+' alt="'+esc(p.player)+' 사진" loading="lazy" referrerpolicy="no-referrer" onerror="atPhotoError(this)">':'')+'</span>';
}
function atPhotoError(img){const fallback=img.dataset.atFallback;delete img.dataset.atFallback;if(fallback){img.src=fallback;return;}img.hidden=true;}
function atValue(v){return v==null?'—':Number(v).toLocaleString('ko-KR');}
function atResultsHtml(){
 const ranked=atRanked(),metric=AT_METRICS.find(m=>m.key===atState.metric),query=normalizePlayerMatchKey(atState.search),filtered=ranked.filter(p=>normalizePlayerMatchKey(p.player).includes(query)),top=ranked.filter(p=>p.rank!==null).slice(0,3);
 return '<div class="at-podium">'+top.map((p,i)=>'<article class="at-podium-card place-'+Math.min(2,p.rank-1)+'"><span class="at-rank">'+atMedal(p.rank)+p.rank+'위</span>'+atPhoto(p)+'<h3>'+esc(p.player)+'</h3><strong>'+atValue(p[metric.key])+' <small>'+metric.unit+'</small></strong><p>'+metric.label+'</p></article>').join('')+'</div><div class="at-table-caption"><h3>'+metric.label+' · 전체 랭킹</h3><span>검색 '+filtered.length+' / 전체 '+ranked.length+'명</span></div><div class="at-table-wrap" tabindex="0" role="region" aria-label="역대기록 랭킹 표, 좌우 스크롤 가능"><table class="at-table"><thead><tr><th scope="col">순위</th><th scope="col">선수</th><th scope="col">입단</th>'+AT_METRICS.map(m=>'<th scope="col" '+(m.key===metric.key?'class="at-active"':'')+'>'+m.label+'</th>').join('')+'</tr></thead><tbody>'+filtered.map(p=>'<tr><td>'+atMedal(p.rank)+'<b>'+ (p.rank===null?'—':p.rank)+'</b></td><th scope="row"><span class="at-player">'+atPhoto(p)+'<span>'+esc(p.player)+'</span></span></th><td>'+esc(p.joined||'—')+'</td>'+AT_METRICS.map(m=>'<td '+(m.key===metric.key?'class="at-active"':'')+'>'+atMetricCell(p,m.key)+'</td>').join('')+'</tr>').join('')+'</tbody></table>'+(filtered.length?'':'<p class="empty">검색 결과가 없습니다.</p>')+'</div>';
}
function renderAllTimeRecords(){
 const root=document.getElementById('allTimeContent');if(!root)return;
 const data=DB.settings?.allTimeRecords,live=atModernRecords(),rows=atDisplayRows(live),archive=atState.scope==='archive';
 const subnav='<div class="at-subnav" role="group" aria-label="역대기록 조회 범위"><button type="button" data-at-scope="total" aria-pressed="'+!archive+'"><b>전체 누적 기록</b><small>2019~2025 + 2026년 이후</small></button><button type="button" data-at-scope="archive" aria-pressed="'+archive+'"><b>2019~2025 역대기록</b><small>기존 자료 · 별도 보관</small></button></div>';
 const scope=archive?'2019~2025 역대기록 시트의 원본 통합값입니다. 2026년 이후 경기기록은 이 화면에 더하지 않습니다.':'기존 2019~2025 통합값에 2026-01-01 이후 경기기록의 득점과 출전 경기수를 더합니다. 출석은 경기당 1회이며 같은 날 여러 경기는 각각 셉니다.';
 root.innerHTML=subnav+(rows.length?'<div class="at-hero"><div><span>GGFC · '+(archive?'HISTORICAL ARCHIVE':'ALL-TIME RECORDS')+'</span><h3>'+(archive?'2019~2025 · 역대기록':'함께 쌓아 가는 누적 기록')+'</h3><p>현재 선수명단 등록 여부와 관계없이 기록이 있는 모든 선수를 표시합니다.</p></div><strong>'+rows.length+'<small>역대 선수</small></strong></div>'+(admin?'<div class="at-scope"><b>집계 기준 · '+(archive?'2019~2025 원본 보관':'과거 기록 + 경기기록 자동 가산')+'</b><p>'+scope+' 시즌·대회 조회 필터의 영향을 받지 않습니다.</p><p>'+(archive?'기존 우승 기록도 원본대로 유지합니다.':'2026년 이후 우승은 자동 가산하지 않습니다. 우승 순위는 2019~2025 자료 기준입니다. 경기기록 최종일: '+esc(live.lastDate||'기록 없음')+'.')+'</p>'+(!archive&&!allTimeRows().length?'<p>2019~2025 자료가 아직 없습니다. 현재는 2026년 이후 기록만 표시합니다.</p>':'')+'</div>':'')+'<div class="at-filters" role="group" aria-label="역대기록 순위 기준">'+AT_METRICS.map(m=>'<button type="button" data-at-metric="'+m.key+'" aria-pressed="'+(m.key===atState.metric)+'">'+m.label+'</button>').join('')+'</div><label class="at-search">선수 이름 검색<input type="search" id="atSearch" placeholder="전체 역대 선수 검색" value="'+esc(atState.search)+'"></label><div id="atResults">'+atResultsHtml()+'</div><p class="at-footnote">동일 기록은 공동 순위(1·2·2·4), 동점 내 이름순으로 표시합니다. 상단은 정렬된 첫 3명입니다. 우승 합계는 리그 + FA컵 + 챔스이며 빈 우승 칸은 0회입니다. 기존 경기수·득점이 미입력이면 전체 누적도 —로 표시하고 2026년 이후분은 별도 안내합니다. 사진이 없거나 불러오지 못하면 이름 첫 글자를 표시합니다.</p>':'<div class="at-empty"><b>'+(archive?'2019~2025 역대기록이 없습니다.':'아직 등록된 기록이 없습니다.')+'</b><p>관리자 모드 → 데이터 관리에서 역대기록 또는 경기기록 시트가 포함된 엑셀을 업로드하세요.</p></div>');
 const warnings=[...(data?.warnings||[]),...(!archive?live.warnings:[])];
 if(admin&&warnings.length)root.insertAdjacentHTML('beforeend','<details class="at-audit"><summary>관리자 · 원본 수치 확인 '+warnings.length+'건</summary><ul>'+warnings.map(w=>'<li>'+esc(w)+'</li>').join('')+'</ul></details>');
 if(admin&&archive)root.insertAdjacentHTML('beforeend','<p class="at-admin-note">보관 자료 관리: 엑셀 역대기록 시트에 2019~2025 값만 입력해 재업로드하세요. 해당 시트가 없으면 기존 자료를 유지하고, 헤더만 있는 빈 시트는 보관 자료를 비웁니다. 내보내기도 보관 원본만 사용하므로 2026년 이후분이 중복 가산되지 않습니다.</p>');
 root.onclick=e=>{const scopeButton=e.target.closest('[data-at-scope]');if(scopeButton){atState.scope=scopeButton.dataset.atScope;renderAllTimeRecords();root.querySelector('[data-at-scope="'+atState.scope+'"]').focus({preventScroll:true});return;}const b=e.target.closest('[data-at-metric]');if(!b)return;atState.metric=b.dataset.atMetric;renderAllTimeRecords();root.querySelector('[data-at-metric="'+atState.metric+'"]').focus({preventScroll:true});};
 root.oninput=e=>{if(e.target.id==='atSearch'){atState.search=e.target.value;document.getElementById('atResults').innerHTML=atResultsHtml();}};
}

/* Derive additions each time; never write combined totals into the archive. */
function atModernRecords(){
 const matchesById=new Map(),ambiguous=new Set(),warnings=[],players=new Map();let lastDate='';
 for(const m of verifiedRecords().matches||[]){
  const date=normDate(m.date),id=detailMatchKey(m.id),home=String(m.home||'').trim(),away=String(m.away||'').trim();
  if(!id||!/^\d{4}-\d{2}-\d{2}$/.test(date)||date<'2026-01-01'||!home||!away)continue;
  const round=String(m.round||'').trim(),no=String(m.no||'').trim();
  const key=JSON.stringify([date,compCompact(m.comp),round,no,[home,away].sort(),round||no?'':id]);
  if(matchesById.has(id)&&matchesById.get(id).key!==key)ambiguous.add(id);
  matchesById.set(id,{key,date,teams:new Set([home,away])});
  if(date>lastDate)lastDate=date;
 }
 for(const id of ambiguous){matchesById.delete(id);warnings.push('경기ID '+id+'가 여러 경기에 연결되어 2026년 이후 집계에서 제외했습니다.');}
 const ensure=name=>{const key=normalizePlayerMatchKey(name);if(!players.has(key))players.set(key,{player:String(name).normalize('NFKC').trim(),games:0,goals:0});return players.get(key);};
 const resolve=r=>{const m=matchesById.get(detailMatchKey(r.id));return m&&m.teams.has(String(r.team||'').trim())?m:null;};
 const attendanceSeen=new Set();
 for(const r of verifiedRecords().attendance||[]){
  const m=resolve(r),name=normalizePlayerMatchKey(r.player);if(!m||!name||isOwnGoalPlayer(r.player))continue;
  const key=JSON.stringify([m.key,name]);if(attendanceSeen.has(key))continue;attendanceSeen.add(key);ensure(r.player).games++;
 }
 // First sum goal entries per imported match ID; duplicate aliases for the same
 // fixture are reconciled once, rather than counting the fixture twice.
 const goalsByFixture=new Map();
 for(const r of verifiedRecords().goals||[]){
  const m=resolve(r),name=normalizePlayerMatchKey(r.player),g=Number(r.g);if(!m||!name||isOwnGoalPlayer(r.player)||!Number.isSafeInteger(g)||g<=0)continue;
  const key=JSON.stringify([m.key,String(r.team||'').trim(),name]);if(!goalsByFixture.has(key))goalsByFixture.set(key,{player:r.player,counts:new Map()});
  const counts=goalsByFixture.get(key).counts,id=detailMatchKey(r.id);counts.set(id,(counts.get(id)||0)+g);
 }
 for(const item of goalsByFixture.values()){
  const values=[...item.counts.values()];ensure(item.player).goals+=Math.max(...values);
  if(new Set(values).size>1)warnings.push(item.player+' · 중복 경기의 득점값이 달라 큰 값 1건을 적용했습니다. 경기기록을 확인하세요.');
 }
 return {players,lastDate,warnings};
}
function atDisplayRows(live){
 if(atState.scope==='archive')return allTimeRows();
 live=live||atModernRecords();const combined=new Map();
 for(const p of allTimeRows())combined.set(normalizePlayerMatchKey(p.player),{...p,baseGames:p.games,baseGoals:p.goals,addedGames:0,addedGoals:0});
 for(const [key,p] of live.players){
  if(!combined.has(key))combined.set(key,{player:p.player,joined:'',games:0,goals:0,baseGames:0,baseGoals:0,league:0,fa:0,champs:0,titles:0,career:'',photo:'',photoCutout:'',addedGames:0,addedGoals:0});
  const row=combined.get(key);row.addedGames=p.games;row.addedGoals=p.goals;
  row.games=row.baseGames==null?null:row.baseGames+p.games;row.goals=row.baseGoals==null?null:row.baseGoals+p.goals;
 }
 return [...combined.values()];
}
function atMetricCell(p,key){
 if(atState.scope==='archive'||!['games','goals'].includes(key))return atValue(p[key]);
 const base=key==='games'?p.baseGames:p.baseGoals,added=key==='games'?p.addedGames:p.addedGoals;
 return '<b>'+atValue(p[key])+'</b><small class="at-breakdown">19~25 '+atValue(base)+'<br>26~ +'+atValue(added)+'</small>';
}

function atMedal(rank){
 const medals={1:['금메달','#d4aa3c','#fff0a0'],2:['은메달','#91a4b5','#e7eff6'],3:['동메달','#b97853','#f4c69f']},m=medals[rank];if(!m)return '';
 return '<svg class="at-medal" viewBox="0 0 32 40" role="img" aria-label="'+m[0]+'"><path d="M6 1h9l4 16-7 4z" fill="#183f65"/><path d="M17 1h9l-6 20-7-4z" fill="#3c8592"/><circle cx="16" cy="25" r="13" fill="'+m[1]+'"/><circle cx="16" cy="25" r="10" fill="none" stroke="'+m[2]+'" stroke-width="1.4"/><text x="16" y="30" text-anchor="middle" font-size="14" font-weight="800" fill="#fff">'+rank+'</text></svg>';
}

/* Workbook-owned leadership history; independent of player membership and match filters. */
function validateLeadershipHeaders(headers){
 const h=headers.map(atHeader);
 if(!h.some(k=>['운영년도','운영연도'].includes(k))||!h.includes('기수')||!h.some(k=>/^이름\(직무\)\d*$/.test(k)))throw Error('역대 운영진: 운영년도, 기수, 이름(직무)1~8 열을 확인하세요.');
}
function leadershipPeriod(value){
 const text=String(value||'').normalize('NFKC').trim(),clean=text.replace(/\s|년/g,'').replace(/[～〜–—]/g,'~');
 const m=clean.match(/^((?:19|20|21)\d{2})(?:[~\-]((?:19|20|21)\d{2}|현재|진행중)?)?$/);
 if(!m)throw Error('역대 운영진 운영년도 형식 확인: '+text+' (예: 2024~2025, 2026~)');
 const start=Number(m[1]),open=/[~\-]/.test(clean)&&(!m[2]||['현재','진행중'].includes(m[2])),end=open?null:Number(m[2]||m[1]);
 if(end!==null&&end<start)throw Error('역대 운영진 종료년도가 시작년도보다 빠릅니다: '+text);
 return {period:text,start,end,open};
}
function applyLeadershipRows(objs){
 if(objs.length)validateLeadershipHeaders(Object.keys(objs[0]));
 const rows=[],seen=new Map();
 for(const o of objs){
  const columns=Object.keys(o).filter(k=>/^이름\(직무\)\d*$/.test(atHeader(k))).sort((a,b)=>num(a.match(/\d+$/)?.[0])-num(b.match(/\d+$/)?.[0]));
  const values=columns.map(k=>String(o[k]||'').normalize('NFKC').trim()).filter(Boolean);
  if(!values.length)continue; // Keep empty future placeholders in the export source, not in the dashboard.
  const term=String(pick(o,'기수')||'').trim();if(!term)throw Error('역대 운영진: 기수를 입력하세요.');
  const period=leadershipPeriod(pick(o,'운영년도','운영연도')),members=[],memberKeys=new Set();
  for(const value of values){
   const m=value.match(/^(.+?)\s*\(([^()]+)\)\s*$/);if(!m)throw Error('역대 운영진: 이름(직무) 형식으로 입력하세요 — '+term+' '+value);
   const player=m[1].trim(),role=m[2].trim(),key=normalizePlayerMatchKey(player)+'|'+role;
   if(!memberKeys.has(key)){memberKeys.add(key);members.push({player,role});}
  }
  const row={...period,term,members},key=period.start+'|'+term,signature=JSON.stringify(row);
  if(seen.has(key)){if(seen.get(key)!==signature)throw Error('역대 운영진의 같은 기수·시작년도에 서로 다른 내용이 있습니다: '+term);continue;}
  seen.set(key,signature);rows.push(row);
 }
 DB.settings=DB.settings||{};DB.settings.leadershipHistory={rows,sourceRows:objs,headers:objs.length?Object.keys(objs[0]):[],updatedAt:new Date().toISOString()};
 return rows.length;
}
function leadershipRows(){return Array.isArray(DB.settings?.leadershipHistory?.rows)?DB.settings.leadershipHistory.rows:[];}
function exportLeadershipSheet(){
 const data=DB.settings?.leadershipHistory||{},headers=data.headers?.length?data.headers:['운영년도','기수',...Array.from({length:8},(_,i)=>'이름(직무)'+(i+1))];
 return {name:'역대 운영진',head:headers.join(','),rows:(data.sourceRows||[]).map(r=>headers.map(k=>r[k]??''))};
}
function leadershipView(year=Number(new Intl.DateTimeFormat('en',{timeZone:'Asia/Seoul',year:'numeric'}).format(new Date()))){
 const rows=leadershipRows().slice().sort((a,b)=>b.start-a.start||num(b.term.replace(/\D/g,''))-num(a.term.replace(/\D/g,'')));
 const current=rows.find(r=>r.start<=year&&(r.end===null||r.end>=year))||null;
 return {year,current,rows:current?[current,...rows.filter(r=>r!==current)]:rows};
}
function leadershipMemberPhoto(member){
 const archive=allTimeRows().find(r=>normalizePlayerMatchKey(r.player)===normalizePlayerMatchKey(member.player));
 return atPhoto({...archive,player:member.player});
}
function leadershipRoleHtml(member){
 const role=String(member.role||'');
 const president=/(^|[·/,&\s])회장(?=$|[·/,&\s(])/.test(role.normalize('NFKC'));
 const icon=president?'<svg class="lh-president-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 7l4.5 4L12 4l4.5 7L21 7l-2 11H5Z" fill="#e6b94f" stroke="#9a7123" stroke-width="1.4" stroke-linejoin="round"/><path d="M6 21h12" stroke="#9a7123" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="4" r="1.5" fill="#e6b94f"/></svg>':'';
 return '<span class="lh-role'+(president?' is-president':'')+'">'+icon+esc(role)+'</span>';
}
function renderLeadership(){
 const root=document.getElementById('leadershipContent');if(!root)return;
 const view=leadershipView(),current=view.current,unique=new Set(view.rows.flatMap(r=>r.members.map(m=>normalizePlayerMatchKey(m.player))));
 if(!view.rows.length){root.innerHTML='<div class="at-empty"><b>등록된 운영진 이력이 없습니다.</b><p>역대 운영진 시트가 포함된 통합 Excel을 업로드하면 표시됩니다.</p></div>';return;}
 const kpis=[['현재 운영기수',current?.term||'확인 필요'],['현재 운영진',current?current.members.length+'명':'—'],['운영 이력',view.rows.length+'개 기수'],['함께한 운영진',unique.size+'명']];
 root.innerHTML='<div class="lh-hero"><div><span>GGFC · PEOPLE BEHIND THE CLUB</span><h3>함께 만든 시간, 이어가는 GGFC</h3><p>'+esc(current?current.period+' · '+current.term+' 운영진이 함께합니다.':'등록된 운영진 이력을 최신 운영년도 순으로 표시합니다.')+'</p></div><div class="lh-hero-mark" aria-hidden="true">GGFC</div></div>'+(admin?'<div class="lh-kpis">'+kpis.map(([label,value])=>'<div><span>'+label+'</span><strong>'+esc(value)+'</strong></div>').join('')+'</div>':'')+'<div class="lh-history">'+view.rows.map(r=>{
  const active=r===current,status=active?'진행 중':r.start>view.year?'예정':'역대 운영진';
  return '<section class="lh-term '+(active?'is-current':'')+'"><header><div><span class="lh-term-label">'+esc(r.period)+'</span><h3>'+esc(r.term)+' 운영진</h3></div><span class="lh-status">'+status+'</span></header><div class="lh-members">'+r.members.map(m=>'<article class="lh-person">'+leadershipMemberPhoto(m)+'<div>'+leadershipRoleHtml(m)+'<h4>'+esc(m.player)+'</h4></div></article>').join('')+'</div></section>';
 }).join('')+'</div>'+(admin?'<p class="note">역대 운영진 시트의 운영년도·기수·이름(직무)를 읽습니다. 사진은 선수명단과 역대기록의 동일 이름으로 연결합니다. 운영년도 2026~는 종료년도 미정이며 현재 연도에 해당하는 최신 기수를 진행 중으로 표시합니다. 명단이 없는 행은 표시하지 않습니다.</p>':'');
}
