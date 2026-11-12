/* Self-reported review participation. The public counts and ability data are stored separately. */
window.GGFCCounterReviews=(()=>{
 const nameKey=KEY+'-counter-review-member',outboxPrefix=KEY+'-counter-review-pending:';
 const metrics=[['sot','유효슛'],['keyPass','키패스'],['defSuccess','수비성공'],['saves','선방']];
 const context=()=>GGFC.publicCounterContext(),adminAccess=()=>admin&&GGFC.authorized&&!window.GGFC_MEMBER_PREVIEW;
 const storedName=()=>{try{return localStorage.getItem(nameKey)||'';}catch{return '';}};
 const idOf=r=>verifiedFixtureKey({...r,id:r.matchId});
 let reviewer=storedName(),rosterSource=null,names=[],message='',flushing=false,retry=false;
 const volatile=new Map(),pageSize=80,view={year:'',half:'',expanded:'',detailLimit:pageSize,loading:false,rows:[],error:''};
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
 function fixtureHalf(match){
  return matchHalfKey(match)||latestDbPeriodContext(match.date)?.half||'';
 }
 function periodFixtures(){
  const verified=verifiedRecords(),byId=new Map(),fixtures=new Map();
  for(const match of verified.matches){
   if(!String(match.comp||'').trim()||normDate(match.date).slice(0,4)!==view.year||fixtureHalf(match)!==view.half)continue;
   byId.set(match.id,match);
  }
  for(const row of verified.attendance){
   const match=byId.get(row.id);
   if(!match||!window.GGFCMatchRecords?.canEdit(match,{player:row.player,att:true,ownGoal:isOwnGoalPlayer(row.player)}))continue;
   fixtures.set(verifiedFixtureKey(match),match);
   byId.delete(row.id);
  }
  return fixtures;
 }
 function history(fixtures){
  const latest=new Map();
  for(const row of view.rows){
   if(!row.player||!row.reviewer||!Number.isFinite(row.savedAt))continue;
   const actor=normalizePlayerMatchKey(row.reviewer),fixture=idOf(row);
   if(!actor||!fixtures.has(fixture))continue;
   const key=JSON.stringify([actor,fixture,teamRecordTeamKey(row.team),normalizePlayerMatchKey(row.player)]);
   const prior=latest.get(key);
   if(!prior||row.savedAt>prior.savedAt)latest.set(key,{...row,actor,fixture});
  }
  return [...latest.values()].sort((a,b)=>normDate(b.date).localeCompare(normDate(a.date))||b.savedAt-a.savedAt);
 }
 function participationRanking(rows){
  const players=new Map();
  for(const row of draftRosterRows(view.year)){
   const name=String(row.player).trim(),actor=normalizePlayerMatchKey(name);
   if(actor&&!players.has(actor))players.set(actor,{actor,name,fixtures:new Set(),rows:[]});
  }
  for(const row of rows){
   if(!players.has(row.actor))players.set(row.actor,{actor:row.actor,name:row.reviewer,fixtures:new Set(),rows:[]});
   const player=players.get(row.actor);
   player.fixtures.add(row.fixture);player.rows.push(row);
  }
  return [...players.values()].sort((a,b)=>b.fixtures.size-a.fixtures.size||b.rows.length-a.rows.length||compareNamesKo(a.name,b.name));
 }
 function matchLabel(match){
  return [normDate(match.date),match.comp,match.round,match.no,teamDisplayName(match.home)+' vs '+teamDisplayName(match.away)].join(' · ');
 }
 function participantDetails(player,fixtures){
  const groups=new Map();
  for(const row of player.rows){
   if(!groups.has(row.fixture))groups.set(row.fixture,[]);
   groups.get(row.fixture).push(row);
  }
  let remaining=view.detailLimit;
  return '<section class="counter-review-detail" aria-label="'+esc(player.name)+' 공유 저장 내역"><h4>'+esc(player.name)+' 공유 저장 내역 · '+player.rows.length+'건</h4>'+
   (!player.rows.length?'<p class="note">이 반기에 이름을 남긴 공유 저장 내역이 없습니다.</p>':'')+
   [...groups].map(([fixture,rows])=>{
    if(remaining<=0)return '';
    const visible=rows.slice(0,remaining);
    remaining-=visible.length;
    return '<section class="counter-review-fixture"><h5>'+esc(matchLabel(fixtures.get(fixture)))+' · '+rows.length+'건</h5><ul>'+
     visible.map(row=>'<li><strong>'+esc(row.player)+'</strong> · '+esc(teamDisplayName(row.team))+
      ' · '+metrics.filter(([key])=>Number.isSafeInteger(row.counts?.[key])).map(([key,label])=>label+' '+row.counts[key]+'회').join(' · ')+
      '<time datetime="'+new Date(row.savedAt).toISOString()+'">'+esc(formatTime(row.savedAt))+'</time></li>').join('')+
     '</ul></section>';
   }).join('')+
   (player.rows.length>view.detailLimit?'<button type="button" class="btn counter-review-more" data-counter-review-more>더 보기</button>':'')+'</section>';
 }
 function draw(){
  if(!adminAccess()||activeView!=='counterreviews')return;
  const box=byId('Data'),status=byId('Status'),refresh=byId('Refresh');
  refresh.disabled=view.loading;
  status.textContent=view.loading?'공유 참여 내역 불러오는 중…':view.error;
  if(view.error||view.loading&&!view.rows.length){box.replaceChildren();return;}
  const fixtures=periodFixtures();
  if(!fixtures.size){box.innerHTML='<p class="empty">선택한 반기에 기록할 수 있는 완료 대진이 없습니다.</p>';return;}
  const players=participationRanking(history(fixtures)),previousFocus=document.activeElement?.dataset.counterReviewPlayer;
  if(!players.length){box.innerHTML='<p class="empty">선택한 연도의 선수 명단이나 참여 내역이 없습니다.</p>';return;}
  const rate=count=>pct(count,fixtures.size).toLocaleString('ko-KR',{maximumFractionDigits:1})+'%';
  let rank=0,prior=null;
  box.innerHTML='<h3>선수별 참여 순위</h3><p class="note">기록 가능한 완료 대진 '+fixtures.size+'경기 · 참여율이 같으면 기록 건수순</p>'+
   '<div class="tablewrap"><table class="counter-review-ranking"><thead><tr><th scope="col">순위</th><th scope="col">선수</th>'+
   '<th scope="col">참여 대진 / 전체</th><th scope="col">기록 건수</th><th scope="col">참여율</th></tr></thead><tbody>'+
   players.map((player,index)=>{
    if(!prior||player.fixtures.size!==prior.fixtures.size||player.rows.length!==prior.rows.length)rank=index+1;
    prior=player;
    const expanded=view.expanded===player.actor,count=player.fixtures.size;
    return '<tr><td>'+(count?rank:'—')+'</td><th scope="row"><button type="button" class="counter-review-player" data-counter-review-player="'+esc(player.actor)+'" aria-expanded="'+expanded+'"'+
     (expanded?' aria-controls="counterReviewDetail"':'')+'>'+esc(player.name)+'</button></th><td>'+count+' / '+fixtures.size+'경기</td><td>'+player.rows.length+'건</td><td><strong>'+rate(count)+'</strong></td></tr>'+
     (expanded?'<tr id="counterReviewDetail"><td colspan="5" class="counter-review-detail-cell">'+participantDetails(player,fixtures)+'</td></tr>':'');
   }).join('')+'</tbody></table></div>';
  if(previousFocus)[...box.querySelectorAll('[data-counter-review-player]')].find(el=>el.dataset.counterReviewPlayer===previousFocus)?.focus({preventScroll:true});
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
  view.year=view.half=view.expanded=view.error='';
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
  const resetDetails=()=>{view.expanded='';view.detailLimit=pageSize;};
  year.onchange=()=>{view.year=year.value;resetDetails();load();};
  half.onchange=()=>{view.half=half.value;resetDetails();draw();};
  byId('Refresh').onclick=()=>load(true);
  byId('Data').onclick=event=>{
   const player=event.target.closest('[data-counter-review-player]')?.dataset.counterReviewPlayer;
   if(player){view.expanded=view.expanded===player?'':player;view.detailLimit=pageSize;}
   else if(event.target.closest('[data-counter-review-more]'))view.detailLimit+=pageSize;
   else return;
   draw();
  };
  if(subscription)draw();
  load();
 }
 return {selected,reviewerHtml,queue,flush,render,stop,refreshAdminAccess};
})();
