/* Self-reported review participation. The public counts and ability data are stored separately. */
window.GGFCCounterReviews=(()=>{
 const nameKey=KEY+'-counter-review-member',outboxPrefix=KEY+'-counter-review-pending:';
 const metrics=[['sot','유효슛'],['keyPass','키패스'],['defSuccess','수비성공'],['saves','선방']];
 const context=()=>GGFC.publicCounterContext(),adminAccess=()=>admin&&GGFC.authorized&&!window.GGFC_MEMBER_PREVIEW;
 const storedName=()=>{try{return localStorage.getItem(nameKey)||'';}catch{return '';}};
 const idOf=r=>verifiedFixtureKey({...r,id:r.matchId});
 let reviewer=storedName(),rosterSource=null,names=[],message='',flushing=false,retry=false;
 const volatile=new Map(),pageSize=80,view={year:'',half:'',member:'',match:'',reviewLimit:pageSize,sharedLimit:pageSize,loading:false,rows:[],error:''};
 let subscription=null;
 function available(){
  const source=DB.roster;
  if(source!==rosterSource){
   rosterSource=source;
   const distinct=new Map();
   for(const row of source||[]){
    const name=String(row?.player||'').trim(),key=normalizePlayerMatchKey(name);
    if(key&&!distinct.has(key))distinct.set(key,name);
   }
   names=[...distinct].sort((a,b)=>compareNamesKo(a[1],b[1]));
  }
  return names;
 }
 function selected(){return available().some(([key])=>key===reviewer)?reviewer:'';}
 function reviewerHtml(){
  const active=selected();
  return '<div class="match-counter-reviewer"><label>참여자 이름 <select data-counter-reviewer><option value="">선택 안 함</option>'+
   available().map(([key,name])=>'<option value="'+esc(key)+'"'+(key===active?' selected':'')+'>'+esc(name)+'</option>').join('')+'</select></label>'+
   '<small>본인 이름을 선택하고 공유 저장하면 관리자 화면에 참여자로 표시됩니다. 이미 확정된 기록도 확인 후 공유 저장할 수 있습니다.</small><small role="status" data-counter-review-note>'+esc(message)+'</small></div>';
 }
 function feedback(value){
  message=value;
  document.querySelectorAll('[data-counter-review-note]').forEach(el=>{el.textContent=message;});
 }
 function pending(){
  const rows=new Map(volatile);
  try{
   for(const key of Object.keys(localStorage)){
    if(!key.startsWith(outboxPrefix)||rows.has(key))continue;
    try{const value=JSON.parse(localStorage.getItem(key));if(value?.match&&value.reviewer&&value.counts)rows.set(key,value);}catch{/* Ignore damaged drafts. */}
   }
  }catch{/* An open page can still send its in-memory drafts. */}
  return rows;
 }
 function queue({m,team,row},member,counts){
  if(!member||!counts||!metrics.slice(0,3).every(([key])=>Number.isSafeInteger(counts[key])))return;
  const match=Object.fromEntries(['id','date','comp','round','no','home','away'].map(key=>[key,m[key]]));
  const date=normDate(m.date),half=matchHalfKey(m)||(+date.slice(5,7)<=6?'H1':'H2');
  const key=outboxPrefix+encodeURIComponent(JSON.stringify([verifiedFixtureKey(m),teamRecordTeamKey(team),normalizePlayerMatchKey(row.player),member]));
  const item={match,team,player:row.player,reviewer:member,year:date.slice(0,4),half,counts};
  try{localStorage.setItem(key,JSON.stringify(item));volatile.delete(key);}catch{volatile.set(key,item);}
  feedback('참여 내역 공유 대기');
  if(flushing)retry=true;else void flush();
 }
 async function flush(){
  const c=context();
  if(flushing||!c.ready||!c.reviewRef)return;
  const rows=pending();
  if(!rows.size)return;
  flushing=true;
  let sent=0,waiting=0;
  const roster=new Map();
  for(const [i,row] of Object.entries(c.roster||{})){
   const key=normalizePlayerMatchKey(row?.player||'');
   if(key&&!roster.has(key))roster.set(key,{i,player:row.player});
  }
  try{
   for(const [key,item] of rows){
    const source=window.GGFCPublicCounters?.sourceFor(c.records,item.match,item.team,item.player),actor=roster.get(item.reviewer);
    if(!source||!actor){waiting++;continue;}
    const {m,a,mi,ai}=source,entry=[c.revision,mi,ai,actor.i].join('_');
    const value={
     sourceRevision:c.revision,matchIndex:String(mi),attendanceIndex:String(ai),reviewerIndex:String(actor.i),
     matchId:String(m.id),date:String(m.date),comp:String(m.comp),round:String(m.round),no:String(m.no),home:String(m.home),away:String(m.away),
     team:String(a.team),player:String(a.player),reviewer:String(actor.player),half:item.half,counts:item.counts,savedAt:firebase.database.ServerValue.TIMESTAMP
    };
    try{
     await c.reviewRef.child(item.year+'/'+entry).set(value);
     sent++;
     if(volatile.get(key)===item)volatile.delete(key);
     try{if(localStorage.getItem(key)===JSON.stringify(item))localStorage.removeItem(key);}catch{/* Replaying the same row is safe. */}
    }catch(error){
     waiting++;
     if(/permission/i.test(error?.code||error?.message||'')){waiting+=rows.size-sent-waiting;break;}
    }
   }
   feedback(waiting?'참여 내역 공유 대기 · 연결 또는 Firebase 규칙 확인':sent?'참여 내역 공유 완료':message);
  }finally{
   flushing=false;
   if(retry){retry=false;void flush();}
  }
 }
 document.addEventListener('change',event=>{
  const field=event.target;
  if(!field.matches('[data-counter-reviewer]'))return;
  reviewer=field.value;
  try{if(reviewer)localStorage.setItem(nameKey,reviewer);else localStorage.removeItem(nameKey);}catch{/* Selection works for this page. */}
  window.GGFCMatchRecords?.refreshPermissions();
  void flush();
 });
 window.addEventListener('online',()=>void flush());

 const byId=suffix=>document.getElementById('counterReview'+suffix);
 const formatTime=ms=>new Date(ms).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false});
 function options(el,items,value,empty=''){
  const html=(empty?'<option value="">'+empty+'</option>':'')+items.map(([key,label])=>'<option value="'+esc(key)+'">'+esc(label)+'</option>').join('');
  if(el.dataset.options!==html){el.innerHTML=html;el.dataset.options=html;}
  el.value=value;
  if(el.selectedIndex===-1)el.selectedIndex=0;
  return el.value;
 }
 function matchesLabel(row){return [normDate(row.date),row.comp,row.round,row.no,teamDisplayName(row.home)+' vs '+teamDisplayName(row.away)].join(' · ');}
 function fixtureHalf(row,match){
  return (match&&matchHalfKey(match))||normHalf(row.half)||latestDbPeriodContext(row.date)?.half||'';
 }
 function inPeriod(row,fixtures){
  if(normDate(row.date).slice(0,4)!==view.year)return false;
  return fixtureHalf(row,fixtures.get(idOf(row)))===view.half;
 }
 function sortRecords(rows){
  return rows.sort((a,b)=>normDate(b.date).localeCompare(normDate(a.date))||b.savedAt-a.savedAt);
 }
 function history(fixtures){
  const latest=new Map();
  for(const row of view.rows){
   if(!row.player||!row.reviewer||!Number.isFinite(row.savedAt)||!inPeriod(row,fixtures))continue;
   const actor=normalizePlayerMatchKey(row.reviewer),fixture=idOf(row);
   const key=JSON.stringify([actor,fixture,teamRecordTeamKey(row.team),normalizePlayerMatchKey(row.player)]);
   const prior=latest.get(key);
   if(!prior||row.savedAt>prior.savedAt)latest.set(key,{...row,actor,fixture});
  }
  return sortRecords([...latest.values()]);
 }
 function sharedRecords(fixtures){
  return sortRecords(liveCounterTeamPlayerRecords.filter(row=>inPeriod(row,fixtures))
   .map(row=>({...row,fixture:row.fixtureKey,counts:row.values})));
 }
 function recordsTable(rows,limit,kind){
  const named=kind==='review';
  if(!rows.length)return '<p class="empty">선택한 조건의 '+(named?'이름이 남은 참여 내역':'공유 저장 기록')+'이 없습니다.</p>';
  return '<div class="tablewrap"><table><thead><tr><th>대진</th><th>팀</th><th>기록 대상 선수</th>'+(named?'<th>참여자</th>':'')+
   metrics.map(([,label])=>'<th>'+label+'</th>').join('')+'<th>공유 저장 시각</th></tr></thead><tbody>'+
   rows.slice(0,limit).map(r=>'<tr><td>'+esc(matchesLabel(r))+'</td><td>'+esc(teamDisplayName(r.team))+'</td><th scope="row">'+esc(r.player)+'</th>'+
    (named?'<td>'+esc(r.reviewer)+'</td>':'')+metrics.map(([key])=>'<td>'+esc(Number.isSafeInteger(r.counts?.[key])?r.counts[key]+'회':'—')+'</td>').join('')+
    '<td>'+esc(formatTime(r.savedAt))+'</td></tr>').join('')+'</tbody></table></div>'+
   (rows.length>limit?'<button type="button" class="btn" data-counter-review-more="'+kind+'">더 보기</button>':'');
 }
 function refreshPublicStatus(){
  if(!adminAccess()||activeView!=='counterreviews')return;
  const el=byId('PublicStatus'),ready=!!window.GGFCPublicCounters?.ready;
  el.hidden=ready;
  el.textContent=ready?'':liveCounterTeamPlayerRecords.length?'공유 카운트 연결 확인 중 · 마지막으로 받은 공유 기록을 표시합니다.':'공유 카운트 연결 확인 중 · 공유 저장 현황을 확인하려면 서버 연결이 필요합니다.';
 }
 function draw(){
  if(!adminAccess()||activeView!=='counterreviews')return;
  refreshPublicStatus();
  const box=byId('Data'),status=byId('Status'),refresh=byId('Refresh');
  refresh.disabled=view.loading;
  status.textContent=view.loading?'이름이 남은 참여 내역 불러오는 중…':view.error;
  const fixtures=new Map(verifiedRecords().matches.map(m=>[verifiedFixtureKey(m),m]));
  const shared=sharedRecords(fixtures),rows=history(fixtures),summary=new Map(),matches=new Map();
  for(const r of [...shared,...rows])if(!matches.has(r.fixture))matches.set(r.fixture,matchesLabel(r));
  for(const r of rows){
   if(!summary.has(r.actor))summary.set(r.actor,{name:r.reviewer,rows:0,fixtures:new Set(),last:0});
   const s=summary.get(r.actor);s.rows++;s.fixtures.add(r.fixture);s.last=Math.max(s.last,r.savedAt);
  }
  const ranking=[...summary].sort((a,b)=>b[1].rows-a[1].rows||b[1].fixtures.size-a[1].fixtures.size||compareNamesKo(a[1].name,b[1].name));
  view.member=options(byId('Member'),ranking.map(([key,s])=>[key,s.name]),view.member,'전체');
  view.match=options(byId('Match'),[...matches],view.match,'전체');
  const visibleShared=shared.filter(r=>!view.match||r.fixture===view.match);
  const visibleReviews=rows.filter(r=>(!view.member||r.actor===view.member)&&(!view.match||r.fixture===view.match));
  const namedUnavailable=view.loading||!!view.error;
  box.innerHTML='<section aria-labelledby="counterSharedHeading"><h3 id="counterSharedHeading">대진별 공유 저장 현황 · '+visibleShared.length+'건</h3>'+
   '<p class="note">공유 저장된 기록 대상 선수와 최신 카운트입니다. 이름 선택 기능 도입 전이나 이름 없이 저장한 기록도 표시됩니다.</p>'+
   (visibleShared.length||window.GGFCPublicCounters?.ready?recordsTable(visibleShared,view.sharedLimit,'shared'):'')+'</section>'+
   '<section aria-labelledby="counterNamedHeading"><h3 id="counterNamedHeading">참여자별 현황 · '+ranking.length+'명</h3>'+
   (ranking.length?'<div class="tablewrap"><table><thead><tr><th>참여자</th><th>확인한 선수 기록</th><th>참여 대진</th><th>최근 공유 저장</th></tr></thead><tbody>'+
    ranking.map(([,r])=>'<tr><th scope="row">'+esc(r.name)+'</th><td>'+r.rows+'건</td><td>'+r.fixtures.size+'경기</td><td>'+esc(formatTime(r.last))+'</td></tr>').join('')+
    '</tbody></table></div>':namedUnavailable?'':'<p class="empty">이 반기에 이름을 선택해 저장한 참여자가 없습니다.</p>')+
   '<h3>대진별 확인 내역 · '+visibleReviews.length+'건</h3>'+
   (visibleReviews.length||!namedUnavailable?recordsTable(visibleReviews,view.reviewLimit,'review'):'')+'</section>';
 }
 function stop(){
  if(subscription){
   const {ref,receive}=subscription;
   subscription=null;
   ref.off('value',receive);
  }
  view.loading=false;
  view.rows=[];
 }
 function load(force=false){
  if(!adminAccess()||activeView!=='counterreviews')return;
  const year=view.year,root=context().reviewRef;
  if(!force&&subscription?.year===year&&subscription.root===root?.toString())return;
  const rows=subscription?.year===year?view.rows:[];
  stop();
  view.rows=rows;view.error='';
  if(!root){view.error='Firebase 연결 후 다시 불러오세요.';draw();return;}
  const ref=root.child(year);
  const receive=snapshot=>{
   if(subscription?.receive!==receive||!adminAccess())return;
   view.rows=Object.values(snapshot.val()||{}).filter(row=>row&&typeof row==='object');
   view.loading=false;view.error='';draw();
  };
  const failed=error=>{
   if(subscription?.receive!==receive||!adminAccess())return;
   view.loading=false;view.rows=[];
   view.error=/permission/i.test(error?.code||error?.message||'')?'이름이 남은 참여 내역을 읽을 수 없습니다. Firebase 규칙 게시와 관리자 로그인을 확인하세요.':'공유 연결을 확인한 뒤 참여 내역을 다시 불러오세요.';
   draw();
  };
  subscription={year,root:root.toString(),ref,receive};
  view.loading=true;draw();ref.on('value',receive,failed);
 }
 function refreshAdminAccess(){
  if(adminAccess()||!view.year)return;
  stop();
  view.year=view.half=view.member=view.match=view.error='';
  byId('Data').replaceChildren();byId('Status').textContent='';byId('PublicStatus').hidden=true;
  options(byId('Member'),[],'','전체');options(byId('Match'),[],'','전체');
 }
 function render(){
  if(!adminAccess()){refreshAdminAccess();return;}
  const year=byId('Year'),half=byId('Half'),matches=verifiedRecords().matches;
  if(!view.year){
   const latestSaved=liveCounterTeamPlayerRecords.reduce((latest,row)=>!latest||normDate(row.date)>normDate(latest.date)?row:latest,null);
   const day=normDate(latestSaved?.date)||latestMatchDate()||recordToday();
   const match=latestSaved?matches.find(m=>verifiedFixtureKey(m)===latestSaved.fixtureKey):matches.find(m=>normDate(m.date)===day);
   view.year=day.slice(0,4);view.half=fixtureHalf(latestSaved||{date:day},match)||'H1';
  }
  const years=[...new Set([view.year,...matches.map(m=>normDate(m.date).slice(0,4)),...liveCounterTeamPlayerRecords.map(r=>normDate(r.date).slice(0,4))].filter(Boolean))].sort().reverse();
  options(year,years.map(y=>[y,y+'년']),view.year);half.value=view.half;
  const resetFilters=()=>{view.member=view.match='';view.reviewLimit=view.sharedLimit=pageSize;};
  year.onchange=()=>{view.year=year.value;resetFilters();load();};
  half.onchange=()=>{view.half=half.value;resetFilters();draw();};
  byId('Member').onchange=event=>{view.member=event.target.value;view.reviewLimit=pageSize;draw();};
  byId('Match').onchange=event=>{view.match=event.target.value;view.reviewLimit=view.sharedLimit=pageSize;draw();};
  byId('Refresh').onclick=()=>load(true);
  byId('Data').onclick=event=>{
   const kind=event.target.closest('[data-counter-review-more]')?.dataset.counterReviewMore;
   if(!kind)return;
   if(kind==='shared')view.sharedLimit+=pageSize;else view.reviewLimit+=pageSize;
   draw();
  };
  if(subscription)draw();
  load();
 }
 return {selected,reviewerHtml,queue,flush,render,stop,refreshAdminAccess,refreshPublicStatus,onPublicChanged:draw};
})();
