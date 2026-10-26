/* Read-only interleague/team history. Uses the existing validated fixtures and result rules. */
let interleagueState={tab:'leagues',year:'ALL',half:'ALL',team:'',competition:'ALL',page:1};
const INTERLEAGUE_PAGE_SIZE=30;
function interleagueScore(value){
 if(value===null||value===undefined||typeof value==='boolean'||String(value).trim()==='')return null;
 const n=Number(value);return Number.isFinite(n)&&Number.isInteger(n)&&n>=0?n:null;
}
function interleagueRangeMatch(m,state){
 const date=normDate(m.date);
 return (state.year==='ALL'||date.slice(0,4)===state.year)&&(state.half==='ALL'||matchHalfKey(m)===state.half);
}
function interleagueModel(state=interleagueState){
 const today=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'}),source=verifiedRecords(),valid=[],excluded=[];
 for(const m of source.matches){
  if(!interleagueRangeMatch(m,state))continue;
  const date=normDate(m.date),hs=interleagueScore(m.hs),as=interleagueScore(m.as);
  const realDate=/^\d{4}-\d{2}-\d{2}$/.test(date)&&!Number.isNaN(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date;
  if(!realDate||date>today||!m.home||!m.away||m.home===m.away||hs===null||as===null){excluded.push({m,reason:!realDate?'날짜 확인':date>today?'예정 경기':hs===null||as===null?'점수 미입력 또는 오류':'팀명 확인'});continue;}
  valid.push(m);
 }
 const inter=[],classification=[],legacy=[];
 for(const m of valid){
  if(!isLeagueFamilyComp(m.comp))continue; // Cup meetings remain in team history, not league-vs-league statistics.
  const h=matchTeamGroup(m,m.home),a=matchTeamGroup(m,m.away);
  if(!h||!a){classification.push({m,reason:'경기일 리그 소속 확인 필요'});continue;}
  if(h===a){if(isInterleagueComp(m.comp))classification.push({m,reason:'팀스쿼드 기준 같은 리그 · 인터리그 제외'});continue;}
  inter.push(m);
  if(!squadAtMatch(m,m.home)||!squadAtMatch(m,m.away))legacy.push(m);
 }
 const empty=key=>({key,p:0,w:0,d:0,l:0,gf:0,ga:0,winRate:null});
 const add=(row,m,team)=>{
  row.p++;const res=matchResult(m,team);row[res==='W'?'w':res==='D'?'d':'l']++;
  row.gf+=Number(team===m.home?m.hs:m.as);row.ga+=Number(team===m.home?m.as:m.hs);
  row.winRate=row.w/row.p*100;return row;
 };
 const league={A:empty('A'),B:empty('B')},byYear=new Map(),interTeams=new Map();
 for(const m of inter){
  const year=normDate(m.date).slice(0,4);if(!byYear.has(year))byYear.set(year,{year,A:empty('A'),B:empty('B')});
  for(const team of [m.home,m.away]){
   const code=matchTeamGroup(m,team);add(league[code],m,team);add(byYear.get(year)[code],m,team);
   if(!interTeams.has(team))interTeams.set(team,empty(team));add(interTeams.get(team),m,team);
  }
 }
 const eligible=state.competition==='INTER'?inter:state.competition==='ALL'?valid:valid.filter(m=>matchCompetition(m)===state.competition);
 const teams=[...new Set([...source.matches.flatMap(m=>[m.home,m.away]),...squadRows().map(r=>r.team)].filter(Boolean))].sort((a,b)=>leagueTeamDisplayOrder(a)-leagueTeamDisplayOrder(b)||compareNamesKo(a,b));
 const team=teams.includes(state.team)?state.team:teams[0]||'';
 const history=eligible.filter(m=>m.home===team||m.away===team),total=empty(team),opponents=new Map();
 for(const m of history){add(total,m,team);const other=m.home===team?m.away:m.home;if(!opponents.has(other))opponents.set(other,empty(other));add(opponents.get(other),m,team);}
 const sortRows=rows=>rows.sort((a,b)=>b.w-a.w||b.p-a.p||compareNamesKo(a.key,b.key));
 const sortMatches=rows=>rows.slice().sort((a,b)=>normDate(b.date).localeCompare(normDate(a.date))||num(b.no)-num(a.no)||String(a.id).localeCompare(String(b.id)));
 return {valid,inter:sortMatches(inter),league,years:[...byYear.values()].sort((a,b)=>b.year.localeCompare(a.year)),interTeams:sortRows([...interTeams.values()]),teams,team,total,opponents:sortRows([...opponents.values()]),history:sortMatches(history),excluded,classification,legacy,conflicts:source.issues.filter(x=>x.blocked&&(!state.year||state.year==='ALL'||normDate(x.date).slice(0,4)===state.year)).length};
}
function interleagueRate(row){return row.p?row.winRate.toFixed(1)+'%':'—';}
function interleagueMetrics(row){return '<div class="il-metrics">'+[['경기',row.p],['승',row.w],['무',row.d],['패',row.l],['득점',row.gf],['실점',row.ga]].map(([label,n])=>'<div><span>'+label+'</span><b>'+n+'</b></div>').join('')+'</div>';}
function interleagueTable(rows,first='팀',pick=false){
 if(!rows.length)return '<div class="empty">조회 조건에 해당하는 경기 기록이 없습니다.</div>';
 return tbl([{t:first},{t:'경기'},{t:'승'},{t:'무'},{t:'패'},{t:'승률'},{t:'득점'},{t:'실점'},{t:'득실차'}],rows.map(r=>[
  pick?'<button type="button" class="il-team-link" data-il-team="'+esc(r.key)+'">'+teamChip(r.key)+'</button>':teamChip(r.key),r.p,r.w,r.d,r.l,'<b>'+interleagueRate(r)+'</b>',r.gf,r.ga,r.gf-r.ga]));
}
function interleagueMatchesHtml(list,team=''){
 if(!list.length)return '<div class="empty">조회 조건에 해당하는 경기 기록이 없습니다.</div>';
 const pages=Math.ceil(list.length/INTERLEAGUE_PAGE_SIZE);interleagueState.page=Math.max(1,Math.min(interleagueState.page,pages));
 const start=(interleagueState.page-1)*INTERLEAGUE_PAGE_SIZE,rows=list.slice(start,start+INTERLEAGUE_PAGE_SIZE);
 const label=t=>({W:'승',D:'무',L:'패'}[t]||'—');
 return '<div class="tablewrap il-scroll" tabindex="0" role="region" aria-label="경기 이력 · 좌우 스크롤">'+tbl([{t:'경기일'},{t:'대회 · 라운드'},{t:'홈팀'},{t:'점수'},{t:'원정팀'},{t:team?'선택 팀 결과':'슈퍼리그 기준 결과'}],rows.map(m=>{
  const reference=team||(matchTeamGroup(m,m.home)==='A'?m.home:m.away),result=matchResult(m,reference),group=t=>{const c=matchTeamGroup(m,t);return c?'<small>'+esc(leagueGroupLabel(c))+'</small>':'';};
  return [esc(normDate(m.date)),esc(matchCompetition(m))+'<small>'+esc(m.round||'')+(m.no?' · '+esc(m.no)+'경기':'')+'</small>',teamChip(m.home)+group(m.home),'<b>'+Number(m.hs)+' : '+Number(m.as)+'</b>'+(forfeitText(m)?'<small>'+esc(forfeitText(m))+'</small>':''),teamChip(m.away)+group(m.away),'<span class="il-result '+result+'">'+label(result)+'</span>'];
 }))+'</div><div class="il-pagination"><button class="btn sm" type="button" data-il-page="-1" '+(interleagueState.page<=1?'disabled':'')+'>이전</button><span>'+interleagueState.page+' / '+pages+' · '+(start+1)+'–'+Math.min(start+INTERLEAGUE_PAGE_SIZE,list.length)+' / '+list.length+'경기</span><button class="btn sm" type="button" data-il-page="1" '+(interleagueState.page>=pages?'disabled':'')+'>다음</button></div>';
}
function renderInterleagueStats(){
 const root=document.getElementById('interleagueContent');if(!root)return;
 const s=interleagueState,years=[...new Set(verifiedRecords().matches.map(m=>normDate(m.date).slice(0,4)).filter(x=>/^\d{4}$/.test(x)))].sort().reverse();
 if(s.year!=='ALL'&&!years.includes(s.year))s.year='ALL';
 const competitions=[...new Set(verifiedRecords().matches.map(matchCompetition))].filter(Boolean).sort(compareNamesKo);
 if(!['ALL','INTER',...competitions].includes(s.competition))s.competition='ALL';
 const model=interleagueModel(s);s.team=model.team;
 const options=(items,value)=>items.map(([v,t])=>'<option value="'+esc(v)+'"'+(v===value?' selected':'')+'>'+esc(t)+'</option>').join('');
 const period=(s.year==='ALL'?'전체 시즌':s.year+' 시즌')+' · '+(s.half==='ALL'?'전체 반기':s.half==='H1'?'상반기':'하반기');
 const warningCount=model.classification.length+model.excluded.length;
 root.innerHTML='<div class="card"><nav class="il-tabs" aria-label="인터리그 분석 항목">'+[['leagues','리그 간 전적'],['teams','팀별 역대 전적']].map(([id,label])=>'<button type="button" class="btn '+(s.tab===id?'primary':'')+'" data-il-tab="'+id+'" aria-pressed="'+(s.tab===id)+'">'+label+'</button>').join('')+'</nav><div class="il-filters"><label>시즌<select id="ilYear">'+options([['ALL','전체 시즌'],...years.map(y=>[y,y+' 시즌'])],s.year)+'</select></label><label>반기<select id="ilHalf">'+options([['ALL','전체 반기'],['H1','상반기'],['H2','하반기']],s.half)+'</select></label>'+(s.tab==='teams'?'<label>팀<select id="ilTeam">'+options(model.teams.map(t=>[t,teamDisplayName(t)]),s.team)+'</select></label><label>대회 범위<select id="ilCompetition">'+options([['ALL','전체 대회'],['INTER','인터리그만'],...competitions.filter(c=>!isInterleagueComp(c)).map(c=>[c,c])],s.competition)+'</select></label>':'')+'<button type="button" class="btn sm" id="ilReset">전체 기간</button></div><p class="note il-period">'+esc(period)+' · 이 메뉴의 조회 조건을 적용합니다. 넓은 표는 좌우로 이동할 수 있습니다.</p></div>';
 if(s.tab==='leagues'){
  root.innerHTML+='<div class="il-overview">'+['A','B'].map(code=>{const row=model.league[code],logo=leagueLogo(code);return '<article class="card il-league il-league-'+code+'"><div class="il-league-title">'+(logo?'<img src="'+esc(logo)+'" alt="" loading="lazy">':'')+'<h3>'+esc(leagueGroupLabel(code))+'</h3></div><div class="il-rate"><strong>'+interleagueRate(row)+'</strong><span>인터리그 승률</span></div>'+interleagueMetrics(row)+'<div class="il-rate-bar"><i style="width:'+(row.winRate||0)+'%"></i></div></article>';}).join('')+'</div>';
  root.innerHTML+='<div class="card"><div class="sec-t">시즌별 리그 전적 <small>총 '+model.inter.length+'경기</small></div><div class="tablewrap il-scroll" tabindex="0" role="region" aria-label="시즌별 리그 전적 · 좌우 스크롤">'+(model.years.length?tbl([{t:'시즌'},{t:'경기'},{t:'슈퍼 승·무·패'},{t:'슈퍼 승률'},{t:'챌린지 승·무·패'},{t:'챌린지 승률'}],model.years.map(r=>[r.year,r.A.p,r.A.w+'승 '+r.A.d+'무 '+r.A.l+'패',interleagueRate(r.A),r.B.w+'승 '+r.B.d+'무 '+r.B.l+'패',interleagueRate(r.B)])):'<div class="empty">집계 가능한 인터리그가 없습니다.</div>')+'</div></div>';
  root.innerHTML+='<div class="card"><div class="sec-t">팀별 인터리그 전적</div><p class="note">팀을 선택하면 해당 팀의 인터리그 역대 전적으로 이동합니다. 팀의 소속이 바뀌어도 팀별 합계는 이어집니다.</p><div class="tablewrap il-scroll" tabindex="0" role="region" aria-label="팀별 인터리그 전적 · 좌우 스크롤">'+interleagueTable(model.interTeams,'팀',true)+'</div></div><div class="card"><div class="sec-t">인터리그 경기 이력</div>'+interleagueMatchesHtml(model.inter)+'</div>';
 }else{
  root.innerHTML+='<div class="card"><div class="il-team-summary"><h3>'+teamChip(model.team||'팀 없음')+'</h3><div class="il-rate"><strong>'+interleagueRate(model.total)+'</strong><span>승률</span></div></div>'+interleagueMetrics(model.total)+'<p class="note">'+esc(s.competition==='ALL'?'전체 대회':s.competition==='INTER'?'인터리그만':s.competition)+' · 등록된 경기기록 범위의 통산 전적입니다.</p></div><div class="card"><div class="sec-t">상대팀별 전적</div><div class="tablewrap il-scroll" tabindex="0" role="region" aria-label="상대팀별 전적 · 좌우 스크롤">'+interleagueTable(model.opponents,'상대팀')+'</div></div><div class="card"><div class="sec-t">'+esc(teamDisplayName(model.team))+' 경기 이력</div>'+interleagueMatchesHtml(model.history,model.team)+'</div>';
 }
 root.innerHTML+='<details class="card il-rules"><summary>집계 기준'+(warningCount?' · 확인 '+warningCount+'건':'')+'</summary><p>승률 = 승 ÷ (승 + 무 + 패) × 100. 무승부도 분모에 포함하며 소수점 한 자리로 표시합니다. 경기가 없으면 —로 표시합니다. 몰수패 등 결과는 기존 프로그램 판정 함수를 그대로 사용합니다. 승점삭감은 승패·승률을 바꾸지 않습니다.</p><p>인터리그는 리그 계열 대회 중 경기일 이전의 최신 팀스쿼드에서 한 팀은 슈퍼(A), 다른 팀은 챌린지(B)인 대진입니다. FA컵·챔스 등의 교차 대진은 인터리그에 포함하지 않고 팀별 전체 대회 전적에서 확인합니다. 팀스쿼드가 없는 구양식은 경기의 기존 그룹 정보를 사용합니다.</p><p>구양식 그룹 사용 '+model.legacy.length+'경기 · 리그 분류 확인 '+model.classification.length+'경기 · 점수/날짜/예정 경기 제외 '+model.excluded.length+'경기. 중복 내용이 같은 경기는 한 번, 충돌한 경기는 기존 검증 로직에 따라 제외합니다. 역대기록 시트의 개인 누적기록에는 팀별 대진이 없어 합산하지 않습니다.</p>'+(warningCount?'<div class="tablewrap il-scroll">'+tbl([{t:'날짜'},{t:'대진'},{t:'확인 내용'}],[...model.classification,...model.excluded].map(({m,reason})=>[esc(m.date),esc(m.home)+' / '+esc(m.away),esc(reason)]))+'</div>':'')+'</details>';
 root.querySelectorAll('[data-il-tab]').forEach(b=>b.onclick=()=>{s.tab=b.dataset.ilTab;s.page=1;renderInterleagueStats();});
 for(const [id,key] of [['ilYear','year'],['ilHalf','half'],['ilTeam','team'],['ilCompetition','competition']]){const el=document.getElementById(id);if(el)el.onchange=()=>{s[key]=el.value;s.page=1;renderInterleagueStats();};}
 root.querySelectorAll('[data-il-team]').forEach(b=>b.onclick=()=>{s.team=b.dataset.ilTeam;s.tab='teams';s.competition='INTER';s.page=1;renderInterleagueStats();});
 root.querySelectorAll('[data-il-page]').forEach(b=>b.onclick=()=>{s.page+=Number(b.dataset.ilPage);renderInterleagueStats();});
 document.getElementById('ilReset').onclick=()=>{s.year='ALL';s.half='ALL';s.page=1;renderInterleagueStats();};
}
