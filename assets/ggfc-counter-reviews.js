/* Self-reported review participation. The public counts and ability data are stored separately. */
window.GGFCCounterReviews=(()=>{
 const nameKey=KEY+'-counter-review-member',outboxPrefix=KEY+'-counter-review-pending:';
 const metrics=[['sot','유효슛'],['keyPass','키패스'],['defSuccess','수비성공'],['saves','선방']];
 const context=()=>GGFC.publicCounterContext(),adminAccess=()=>admin&&GGFC.authorized&&!window.GGFC_MEMBER_PREVIEW;
 const storedName=()=>{try{return localStorage.getItem(nameKey)||'';}catch{return '';}};
 const idOf=r=>verifiedFixtureKey({...r,id:r.matchId});
 let reviewer=storedName(),rosterSource=null,names=[],message='',flushing=false,retry=false;
 const volatile=new Map(),view={year:'',half:'',member:'',match:'',limit:80,loading:'',request:0,cache:new Map(),error:''};
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
   '<small>본인 이름을 선택하면 공유 저장 내역이 관리자에게 표시됩니다. 이미 확정된 기록도 확인 후 공유 저장할 수 있습니다.</small><small role="status" data-counter-review-note>'+esc(message)+'</small></div>';
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
  el.innerHTML=(empty?'<option value="">'+empty+'</option>':'')+items.map(([key,label])=>'<option value="'+esc(key)+'">'+esc(label)+'</option>').join('');
  el.value=value;
  if(el.selectedIndex===-1)el.selectedIndex=0;
  return el.value;
 }
 function matchesLabel(row){return [row.date,row.comp,row.round,row.no,teamDisplayName(row.home)+' vs '+teamDisplayName(row.away)].join(' · ');}
 function history(){
  const entries=view.cache.get(view.year)||[],latest=new Map();
  for(const row of entries){
   if(row.half!==view.half||!row.player||!row.reviewer||!Number.isFinite(row.savedAt))continue;
   const actor=normalizePlayerMatchKey(row.reviewer),fixture=idOf(row);
   const key=JSON.stringify([actor,fixture,teamRecordTeamKey(row.team),normalizePlayerMatchKey(row.player)]);
   const prior=latest.get(key);
   if(!prior||row.savedAt>prior.savedAt)latest.set(key,{...row,actor,fixture});
  }
  return [...latest.values()].sort((a,b)=>b.date.localeCompare(a.date)||b.savedAt-a.savedAt);
 }
 function draw(){
  if(!adminAccess())return;
  const box=byId('Data'),status=byId('Status'),refresh=byId('Refresh');
  const loading=view.loading===view.year;
  refresh.disabled=loading;
  status.textContent=loading?'공유 참여 내역 불러오는 중…':view.error;
  const rows=history(),summary=new Map(),matches=new Map();
  for(const r of rows){
   if(!summary.has(r.actor))summary.set(r.actor,{name:r.reviewer,rows:0,fixtures:new Set(),last:0});
   const s=summary.get(r.actor);s.rows++;s.fixtures.add(r.fixture);s.last=Math.max(s.last,r.savedAt);
   if(!matches.has(r.fixture))matches.set(r.fixture,matchesLabel(r));
  }
  const ranking=[...summary].sort((a,b)=>b[1].rows-a[1].rows||b[1].fixtures.size-a[1].fixtures.size||compareNamesKo(a[1].name,b[1].name));
  view.member=options(byId('Member'),ranking.map(([key,s])=>[key,s.name]),view.member,'전체');
  view.match=options(byId('Match'),[...matches],view.match,'전체');
  if(!rows.length){
   box.innerHTML=loading||view.error?'':'<p class="empty">선택한 반기에 저장된 참여 내역이 없습니다.</p>';
   return;
  }
  const filtered=rows.filter(r=>(!view.member||r.actor===view.member)&&(!view.match||r.fixture===view.match));
  box.innerHTML='<h3>참여자별 현황 · '+ranking.length+'명</h3><div class="tablewrap"><table><thead><tr><th>참여자</th><th>확인한 선수 기록</th><th>참여 대진</th><th>최근 공유 저장</th></tr></thead><tbody>'+
   ranking.map(([,r])=>'<tr><th scope="row">'+esc(r.name)+'</th><td>'+r.rows+'건</td><td>'+r.fixtures.size+'경기</td><td>'+esc(formatTime(r.last))+'</td></tr>').join('')+
   '</tbody></table></div><h3>대진별 확인 내역 · '+filtered.length+'건</h3>'+
   (filtered.length?'<div class="tablewrap"><table><thead><tr><th>대진</th><th>팀</th><th>기록 대상 선수</th><th>참여자</th>'+
     metrics.map(([,label])=>'<th>'+label+'</th>').join('')+'<th>공유 저장 시각</th></tr></thead><tbody>'+
     filtered.slice(0,view.limit).map(r=>'<tr><td>'+esc(matchesLabel(r))+'</td><td>'+esc(teamDisplayName(r.team))+'</td><th scope="row">'+esc(r.player)+'</th><td>'+esc(r.reviewer)+'</td>'+
      metrics.map(([key])=>'<td>'+esc(Number.isSafeInteger(r.counts?.[key])?r.counts[key]+'회':'—')+'</td>').join('')+'<td>'+esc(formatTime(r.savedAt))+'</td></tr>').join('')+
      '</tbody></table></div>':'<p class="empty">필터 조건과 일치하는 기록이 없습니다.</p>')+
   (filtered.length>view.limit?'<button type="button" class="btn" data-counter-review-more>더 보기</button>':'');
 }
 async function load(){
  const year=view.year,ref=context().reviewRef;
  if(!adminAccess()||view.loading===year)return;
  view.error='';
  if(!ref){view.error='Firebase 연결 후 다시 불러오세요.';draw();return;}
  const request=++view.request;
  view.loading=year;draw();
  try{
   const snapshot=await ref.child(year).get();
   if(request!==view.request||!adminAccess())return;
   view.cache.set(year,Object.values(snapshot.val()||{}).filter(row=>row&&typeof row==='object'));
  }catch(error){
   if(request!==view.request||!adminAccess())return;
   view.error=/permission/i.test(error?.code||error?.message||'')?'참여 내역 읽기 권한을 확인해 주세요. Firebase 규칙 게시와 관리자 로그인이 필요합니다.':'공유 연결을 확인한 뒤 다시 불러오세요.';
  }finally{
   if(request===view.request&&adminAccess()){view.loading='';draw();}
  }
 }
 function refreshAdminAccess(){
  if(adminAccess()||!view.year)return;
  view.request++;view.cache.clear();view.year=view.half=view.member=view.match=view.loading=view.error='';
  byId('Data').replaceChildren();byId('Status').textContent='';
 }
 function render(){
  if(!adminAccess()){refreshAdminAccess();return;}
  const year=byId('Year'),half=byId('Half'),day=latestMatchDate()||recordToday();
  if(!view.year){view.year=day.slice(0,4);view.half=latestDbPeriodContext(day)?.half||(+day.slice(5,7)<=6?'H1':'H2');}
  const years=[...new Set([view.year,...verifiedRecords().matches.map(m=>normDate(m.date).slice(0,4)).filter(Boolean)])].sort().reverse();
  options(year,years.map(y=>[y,y+'년']),view.year);half.value=view.half;
  year.onchange=()=>{
   view.request++;view.loading=view.error='';view.year=year.value;view.member=view.match='';view.limit=80;void load();
  };
  half.onchange=()=>{view.half=half.value;view.member=view.match='';view.limit=80;draw();};
  byId('Member').onchange=event=>{view.member=event.target.value;view.limit=80;draw();};
  byId('Match').onchange=event=>{view.match=event.target.value;view.limit=80;draw();};
  byId('Refresh').onclick=()=>void load();
  byId('Data').onclick=event=>{if(event.target.closest('[data-counter-review-more]')){view.limit+=80;draw();}};
  if(!view.cache.has(view.year)&&!view.error)void load();else draw();
 }
 return {selected,reviewerHtml,queue,flush,render,refreshAdminAccess};
})();

