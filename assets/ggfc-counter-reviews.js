/* Admin coverage is calculated from confirmed shared counters and the verified attendance list. */
window.GGFCSharedRecordStatus=(()=>{
 const metrics=[['sot','유효슛'],['keyPass','키패스'],['defSuccess','수비성공'],['saves','선방']];
 const byId=suffix=>document.getElementById('counterReview'+suffix);
 const adminAccess=()=>admin&&GGFC.authorized&&!window.GGFC_MEMBER_PREVIEW;
 const visible=()=>adminAccess()&&activeView==='counterreviews';
 const formatTime=ms=>new Date(ms).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false});
 const pageSize=80,view={year:'',half:'',expanded:'',detailLimit:pageSize,loading:false,readState:'',source:null,request:0,loadFailed:false};

 function fixtureHalf(match){
  return matchHalfKey(match)||latestDbPeriodContext(match.date)?.half||'';
 }
 function coverage(){
  const verified=verifiedRecords(),fixtures=new Map(),players=new Map();
  for(const match of verified.matches){
   if(String(match.comp||'').trim()&&normDate(match.date).slice(0,4)===view.year&&fixtureHalf(match)===view.half)fixtures.set(match.id,match);
  }
  for(const row of verified.attendance){
   const match=fixtures.get(row.id);
   if(!match||!window.GGFCMatchRecords?.canEdit(match,{player:row.player,att:true,ownGoal:isOwnGoalPlayer(row.player)}))continue;
   const name=String(row.player).trim(),key=normalizePlayerMatchKey(name);
   if(!key)continue;
   if(!players.has(key))players.set(key,{key,name,attended:new Set(),saved:new Map()});
   const player=players.get(key);
   player.attended.add(match.id);
   const shared=window.GGFCPublicCounters?.latest(appTeamRecordKey(match,row.team,row.player));
   if(shared)player.saved.set(match.id,{match,team:row.team,values:shared.values,savedAt:shared.savedAt});
  }
  return [...players.values()].sort((a,b)=>compareCoverage(a,b)||compareNamesKo(a.name,b.name));
 }
 function compareCoverage(a,b){
  return b.saved.size*a.attended.size-a.saved.size*b.attended.size||b.saved.size-a.saved.size;
 }
 function matchLabel(match){
  return [normDate(match.date),match.comp,match.round,match.no,teamDisplayName(match.home)+' vs '+teamDisplayName(match.away)].join(' · ');
 }
 function savedDetails(player){
  const rows=[...player.saved.values()].sort((a,b)=>normDate(b.match.date).localeCompare(normDate(a.match.date))||b.savedAt-a.savedAt);
  return '<section class="counter-review-detail" aria-label="'+esc(player.name)+' 공유 저장 내역"><h4>'+esc(player.name)+' 공유 저장 내역 · '+rows.length+'경기</h4>'+
   (!rows.length?'<p class="note">선택한 반기에 공유 저장된 선수 기록이 없습니다.</p>':'')+
   rows.slice(0,view.detailLimit).map(row=>'<section class="counter-review-fixture"><h5>'+esc(matchLabel(row.match))+'</h5><p>'+esc(teamDisplayName(row.team))+
    ' · '+metrics.filter(([key])=>Number.isSafeInteger(row.values[key])).map(([key,label])=>label+' '+row.values[key]+'회').join(' · ')+
    '<time datetime="'+new Date(row.savedAt).toISOString()+'">'+esc(formatTime(row.savedAt))+'</time></p></section>').join('')+
   (rows.length>view.detailLimit?'<button type="button" class="btn counter-review-more" data-counter-review-more>더 보기</button>':'')+'</section>';
 }
 function draw(){
  if(!visible())return;
  const box=byId('Data'),status=byId('Status'),refresh=byId('Refresh');
  view.readState=window.GGFCPublicCounters?.readState||'loading';
  view.source=liveCounterTeamPlayerRecords;
  refresh.disabled=view.loading;
  const hasCache=view.source.length>0,failed=view.readState==='error'||view.loadFailed;
  status.textContent=view.loading?'공유 기록 불러오는 중…':failed?
   '공유 기록을 다시 불러오지 못했습니다. Firebase 연결을 확인하세요.'+(hasCache?' 마지막으로 받은 기록을 표시합니다.':''):
   view.readState==='loading'?(hasCache?'마지막으로 받은 공유 기록을 표시합니다.':'공유 기록 불러오는 중…'):'';
  if(view.readState!=='ready'&&!hasCache){box.replaceChildren();return;}
  const players=coverage(),previousFocus=document.activeElement?.dataset.counterReviewPlayer;
  if(!players.length){box.innerHTML='<p class="empty">선택한 반기에 기록할 수 있는 출석 대진이 없습니다.</p>';return;}
  const savedPlayers=players.filter(player=>player.saved.size>0).length,total=players.reduce((sum,player)=>sum+player.saved.size,0);
  let rank=0,prior=null;
  box.innerHTML='<h3>선수별 공유 저장 순위</h3><p class="note">공유 저장 '+savedPlayers+'명 / 출석 '+players.length+'명 · 선수별 경기 기록 '+total+'건</p>'+
   '<div class="tablewrap"><table class="counter-review-ranking"><thead><tr><th scope="col">순위</th><th scope="col">선수</th>'+
   '<th scope="col">공유 저장 / 출석</th><th scope="col">저장률</th></tr></thead><tbody>'+
   players.map((player,index)=>{
    if(!prior||compareCoverage(prior,player))rank=index+1;
    prior=player;
    const expanded=view.expanded===player.key,count=player.saved.size;
    const rate=pct(count,player.attended.size).toLocaleString('ko-KR',{maximumFractionDigits:1});
    return '<tr><td>'+(count?rank:'—')+'</td><th scope="row"><button type="button" class="counter-review-player" data-counter-review-player="'+esc(player.key)+'" aria-expanded="'+expanded+'"'+
     (expanded?' aria-controls="counterReviewDetail"':'')+'>'+esc(player.name)+'</button></th><td>'+count+' / '+player.attended.size+'경기</td><td><strong>'+rate+'%</strong></td></tr>'+
     (expanded?'<tr id="counterReviewDetail"><td colspan="4" class="counter-review-detail-cell">'+savedDetails(player)+'</td></tr>':'');
   }).join('')+'</tbody></table></div>';
  if(previousFocus)[...box.querySelectorAll('[data-counter-review-player]')].find(el=>el.dataset.counterReviewPlayer===previousFocus)?.focus({preventScroll:true});
 }
 function refreshFromSource(){
  if(!visible()||!view.year)return;
  const state=window.GGFCPublicCounters?.readState;
  if(view.source!==liveCounterTeamPlayerRecords||view.readState!==state){
   if(state==='ready')view.loadFailed=false;
   draw();
  }
 }
 function refreshAdminAccess(){
  if(adminAccess()||!view.year)return;
  view.request++;
  view.year=view.half=view.expanded='';view.loading=view.loadFailed=false;view.source=null;
  byId('Data').replaceChildren();byId('Status').textContent='';
 }
 function render(){
  if(!adminAccess()){refreshAdminAccess();return;}
  const year=byId('Year'),half=byId('Half'),matches=verifiedRecords().matches;
  if(!view.year){
   const day=latestMatchDate()||recordToday(),match=matches.find(m=>normDate(m.date)===day);
   view.year=day.slice(0,4);view.half=fixtureHalf(match||{date:day})||'H1';
  }
  const years=[...new Set([view.year,...matches.map(m=>normDate(m.date).slice(0,4))].filter(Boolean))].sort().reverse();
  const yearOptions=years.map(y=>'<option value="'+esc(y)+'">'+esc(y)+'년</option>').join('');
  if(year.dataset.options!==yearOptions){year.innerHTML=yearOptions;year.dataset.options=yearOptions;}
  year.value=view.year;half.value=view.half;
  year.onchange=half.onchange=()=>{view.year=year.value;view.half=half.value;view.expanded='';view.detailLimit=pageSize;draw();};
  byId('Refresh').onclick=async()=>{
   const request=++view.request;
   view.loading=true;view.loadFailed=false;draw();
   try{
    const ok=await window.GGFCPublicCounters?.reload();
    if(request===view.request)view.loadFailed=!ok;
   }finally{
    if(request===view.request){view.loading=false;draw();}
   }
  };
  byId('Data').onclick=event=>{
   const player=event.target.closest('[data-counter-review-player]')?.dataset.counterReviewPlayer;
   if(player){view.expanded=view.expanded===player?'':player;view.detailLimit=pageSize;}
   else if(event.target.closest('[data-counter-review-more]'))view.detailLimit+=pageSize;
   else return;
   draw();
  };
  draw();
 }
 return {render,refreshFromSource,refreshAdminAccess};
})();
