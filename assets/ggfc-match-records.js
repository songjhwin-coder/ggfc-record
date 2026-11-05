/* Missing-only counters; Excel arrays remain untouched. Shared writes use the existing revision guard. */
window.GGFCMatchRecords=(()=>{
 const fields={sot:'유효슛',keyPass:'키패스',defSuccess:'수비성공',saves:'선방'};
 const drafts=new Map(),saving=new Set(),statuses=new Map();
 const localKey=KEY+'-viewer-match-counters-v1',localRows=new Map();
 const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
 const signedIn=()=>admin&&GGFC.authorized&&window.GGFC_MEMBER_PREVIEW!==true;
 const writable=()=>signedIn()&&GGFC.canEdit();
 const eligible=(m,r)=>r.att&&!r.ownGoal&&!r.recordConflict&&!!m.round&&!!m.no&&playerEligibleOn(r.player,m.date);
 const editable=(r,k)=>(r.appFields||[]).includes(k)||!teamRecordValuePresent(r.recordValues[k]);
 const allowed=(r,k)=>k!=='saves'||r.keeper===true;
 const metric=v=>teamRecordValuePresent(v)?Number(v):null;
 const storedKey=r=>JSON.stringify([r.fixtureKey,teamRecordTeamKey(r.team),normalizePlayerMatchKey(r.player)]);
 function readLocal(){
  try{
   const file=JSON.parse(localStorage.getItem(localKey)||'null');if(file?.version!==1||!Array.isArray(file.records))return;
   for(const row of file.records){
    if(!row||typeof row.fixtureKey!=='string'||typeof row.team!=='string'||typeof row.player!=='string')continue;
    const values={},baseValues={};let valid=true;
    for(const k of Object.keys(fields)){if(!own(row.values||{},k))continue;const v=row.values[k];if(typeof v!=='number'||!Number.isSafeInteger(v)||v<0){valid=false;break;}values[k]=v;baseValues[k]=metric(row.baseValues?.[k]);}
    if(valid&&Object.keys(values).length)localRows.set(storedKey(row),{fixtureKey:row.fixtureKey,team:row.team,player:row.player,values,baseValues,updatedAt:String(row.updatedAt||'')});
   }
  }catch(e){/* A damaged local file never replaces the shared record DB. */}
 }
 function writeLocal(next){
  try{if(next.size)localStorage.setItem(localKey,JSON.stringify({version:1,records:[...next.values()]}));else localStorage.removeItem(localKey);localRows.clear();next.forEach((v,k)=>localRows.set(k,v));return true;}catch(e){return false;}
 }
 function localPending(key){return localRows.has(key)&&!String(statuses.get(key)||'').startsWith('공유 저장 완료');}
 function statusFor(key){return statuses.get(key)||(drafts.has(key)?'미저장':localRows.has(key)?'기기 저장\n미공유':'');}
 function saveLocal(key,c,d,values){
  const old=localRows.get(key),record={fixtureKey:verifiedFixtureKey(c.m),team:c.team,player:c.row.player,values:{...old?.values,...values},baseValues:{...old?.baseValues,...d.baseValues},updatedAt:new Date().toISOString()},next=new Map(localRows);next.set(key,record);
  if(!writeLocal(next)){statuses.set(key,'기기 저장 실패 · 입력은 유지됩니다');updateRowState(key);toast('기기 저장 공간을 확인하세요. 입력한 카운트는 현재 화면에 유지됩니다.');return false;}
  drafts.delete(key);statuses.set(key,'기기 저장\n미공유');refreshMatchDetailRecords();GGFC.refreshUI();return true;
 }
 function context(key){
  if(ggfcDetailState?.kind!=='match')return null;
  const m=verifiedRecords().matches.find(x=>verifiedFixtureKey(x)===ggfcDetailState.fixtureKey);if(!m)return null;
  for(const team of matchDetailData(m).teams)for(const row of team.rows)if(appTeamRecordKey(m,team.team,row.player)===key)return {m,team:team.team,row};
  return null;
 }
 function displayedValue(m,team,r,k){const key=appTeamRecordKey(m,team,r.player),d=drafts.get(key),local=localRows.get(key);return d&&own(d.values,k)?d.values[k]:local&&own(local.values,k)?local.values[k]:r.recordValues[k]??'';}
 function rowActionsHtml(m,team,r){
  if(!eligible(m,r)||!Object.keys(fields).some(k=>allowed(r,k)&&editable(r,k)))return '';
  const key=appTeamRecordKey(m,team,r.player),dirty=drafts.has(key),busy=saving.has(key),pending=writable()&&localPending(key);
  return '<div class="match-record-row-actions"><button type="button" data-match-record-save'+(busy||!dirty&&!pending?' disabled':'')+' aria-label="'+esc(r.player)+' 보완 기록 저장">'+(busy?'저장 중…':writable()?'공유 저장':'기기 저장')+'</button><button type="button" data-match-record-cancel'+(!dirty?' hidden':'')+(busy?' disabled':'')+'>취소</button><button type="button" data-match-record-clear-local'+(!localRows.has(key)?' hidden':'')+(busy?' disabled':'')+'>기기 초기화</button></div><span class="match-record-status" role="status">'+esc(statusFor(key))+'</span>';
 }
 function cellHtml(m,team,r,k){
  const value=r.recordValues[k],app=(r.appFields||[]).includes(k);
  if(eligible(m,r)&&allowed(r,k)&&editable(r,k)){
   const key=appTeamRecordKey(m,team,r.player),disabled=saving.has(key),local=localRows.get(key);
   return '<div class="match-count-cell" data-match-count="'+k+'"><button type="button" data-match-count-step="-1" aria-label="'+esc(r.player+' '+fields[k])+' 1회 줄이기"'+(disabled?' disabled':'')+'>−</button><input type="number" min="0" step="1" inputmode="numeric" value="'+esc(displayedValue(m,team,r,k))+'" placeholder="—" aria-label="'+esc(r.player+' '+fields[k])+' 횟수"'+(disabled?' disabled':'')+'><button type="button" data-match-count-step="1" aria-label="'+esc(r.player+' '+fields[k])+' 1회 늘리기"'+(disabled?' disabled':'')+'>+</button></div><small class="match-record-source">'+(local&&own(local.values,k)?'기기 기록':app?'앱 기록':'미기록')+'</small>';
  }
  return '<span>'+esc(value??'—')+'</span>'+(teamRecordValuePresent(value)?'<small class="match-record-source'+(app?' app':'')+'">'+(app?'앱 기록':'DB')+'</small>':k==='saves'&&!r.keeper?'<small class="match-record-source">골키퍼만</small>':r.recordConflict?'<small class="match-record-source">원본 확인</small>':'');
 }
 function permissionMarkerHtml(){return '<span hidden data-match-record-admin="'+String(signedIn())+'"></span>';}
 function rowElement(key){return [...document.querySelectorAll('[data-match-record-row]')].find(e=>e.dataset.matchRecordRow===key);}
 function updateRowState(key){
  const el=rowElement(key);if(!el)return;
  const dirty=drafts.has(key),busy=saving.has(key),save=el.querySelector('[data-match-record-save]'),cancel=el.querySelector('[data-match-record-cancel]');
  if(save){save.disabled=busy||!dirty&&!(writable()&&localPending(key));save.textContent=busy?'저장 중…':writable()?'공유 저장':'기기 저장';}
  if(cancel){cancel.hidden=!dirty;cancel.disabled=busy;}
  const status=el.querySelector('.match-record-status');if(status)status.textContent=statusFor(key);
  el.querySelectorAll('.match-count-cell button,.match-count-cell input').forEach(e=>e.disabled=busy);
 }
 function change(input,value){
  const el=input.closest('[data-match-record-row]'),key=el?.dataset.matchRecordRow,k=input.closest('[data-match-count]')?.dataset.matchCount,c=context(key);
  if(!c||!fields[k]||!eligible(c.m,c.row)||!allowed(c.row,k)||!editable(c.row,k)||saving.has(key)){toast('출석·골키퍼 지정·DB 기록 상태를 확인해 주세요.');return false;}
  const local=localRows.get(key),d=drafts.get(key)||{values:{},baseValues:{}};
  const baseline=local&&own(local.values,k)?local.values[k]:c.row.recordValues[k]??'';
  if(String(value)===String(baseline)){delete d.values[k];delete d.baseValues[k];}else{d.values[k]=String(value);if(!own(d.baseValues,k))d.baseValues[k]=local&&own(local.baseValues,k)?local.baseValues[k]:metric(c.row.recordValues[k]);}
  if(Object.keys(d.values).length)drafts.set(key,d);else drafts.delete(key);
  input.value=value;statuses.delete(key);updateRowState(key);GGFC.refreshUI();return true;
 }
 async function saveRow(key){
  const local=localRows.get(key),draft=drafts.get(key),d=draft?{values:{...local?.values,...draft.values},baseValues:{...local?.baseValues,...draft.baseValues}}:local,c=context(key);if(!d||!c||saving.has(key))return false;
  if(!draft&&(!writable()||!localPending(key)))return false;
  if(!eligible(c.m,c.row)){toast('출전 명단과 기록 상태를 확인해 주세요.');return false;}
  const values={};
  for(const [k,raw] of Object.entries(d.values)){
   if(!fields[k]||!allowed(c.row,k)||!editable(c.row,k)){toast(k==='saves'&&!c.row.keeper?'선방은 지정된 골키퍼만 기록할 수 있습니다.':'DB 기록이 변경되었습니다. 현재 기록을 확인하세요.');return false;}
   const v=String(raw).trim()===''?null:Number(raw);
   if(v===null||!Number.isSafeInteger(v)||v<0){toast(fields[k]+'는 0 이상의 정수로 입력하세요.');return false;}
   if(writable()&&metric(d.baseValues?.[k])!==metric(c.row.recordValues[k])){toast('카운트 후 DB 값이 변경되었습니다. 기기 기록을 확인하고 다시 입력하세요.');return false;}
   values[k]=v;
  }
  if(!Object.keys(values).length)return false;
  if(!writable())return saveLocal(key,c,d,values);
  const stored=Array.isArray(DB.settings?.appTeamPlayerRecords)?DB.settings.appTeamPlayerRecords:[];
  const same=r=>r.fixtureKey===verifiedFixtureKey(c.m)&&teamRecordTeamKey(r.team)===teamRecordTeamKey(c.team)&&normalizePlayerMatchKey(r.player)===normalizePlayerMatchKey(c.row.player);
  const prior=stored.filter(same),priorValues={};
  for(const r of prior)for(const k of Object.keys(fields))if(r.values?.[k]!==null&&r.values?.[k]!==undefined){
   if(own(priorValues,k)&&priorValues[k]!==r.values[k]){toast('기존 앱 기록에 충돌이 있습니다. JSON 백업 후 관리자에게 확인하세요.');return false;}
   priorValues[k]=r.values[k];
  }
  const record={fixtureKey:verifiedFixtureKey(c.m),date:normDate(c.m.date),comp:c.m.comp,half:matchHalfKey(c.m),round:c.m.round,no:c.m.no,team:c.team,player:c.row.player,values:{...priorValues,...values},updatedAt:new Date().toISOString()};
  DB.settings=DB.settings||{};DB.settings.appTeamPlayerRecords=[...stored.filter(r=>!same(r)),record];
  drafts.delete(key);saving.add(key);statuses.set(key,'공유 저장 중…');save();
  renderAll();refreshMatchDetailRecords();
  let shared=false;
  try{shared=await GGFC.flush();}finally{
   const hadLocal=localRows.has(key);if(shared&&hadLocal){const next=new Map(localRows);next.delete(key);writeLocal(next);}
   saving.delete(key);statuses.set(key,shared?'공유 저장 완료':'기기에 보관 중 · 공유 저장 상태 확인');if(shared&&hadLocal)refreshMatchDetailRecords();updateRowState(key);GGFC.refreshUI();
  }
  if(!shared)toast('보완 기록을 보관했습니다. 공유 저장 상태를 확인해 주세요.');
  return shared;
 }
 function cancel(key){if(saving.has(key))return;drafts.delete(key);statuses.delete(key);refreshMatchDetailRecords();GGFC.refreshUI();}
 function clearLocal(key){if(saving.has(key))return;const next=new Map(localRows);next.delete(key);if(!writeLocal(next)){toast('기기 저장 상태를 확인하세요.');return;}drafts.delete(key);statuses.delete(key);refreshMatchDetailRecords();GGFC.refreshUI();}
 function clearPublishedLocal(key){
  const local=localRows.get(key);if(!local||drafts.has(key)||saving.has(key)||!writable()||GGFC.pending)return false;
  const shared=(DB.settings?.appTeamPlayerRecords||[]).find(r=>storedKey(r)===key&&Object.entries(local.values).every(([k,v])=>r.values?.[k]===v));
  if(!shared)return false;
  const next=new Map(localRows);next.delete(key);writeLocal(next);statuses.set(key,'공유 저장 완료');return true;
 }
 function refreshPermissions(){
  if(!document.querySelector('#ggfcDetailDialog[open].detail-match-fullscreen'))return;
  if(String(signedIn())!==document.querySelector('#ggfcDetailBody [data-match-record-admin]')?.dataset.matchRecordAdmin)refreshMatchDetailRecords();
  let completed=false;
  for(const el of document.querySelectorAll('[data-match-record-row]')){
   const key=el.dataset.matchRecordRow;
   if(clearPublishedLocal(key))completed=true;
   if(!GGFC.pending&&writable()&&statuses.has(key)&&!drafts.has(key)&&!saving.has(key)&&!localRows.has(key))statuses.set(key,'공유 저장 완료');
   updateRowState(key);
  }
  if(completed)refreshMatchDetailRecords();
 }
 document.addEventListener('click',e=>{
  const el=e.target.closest('[data-match-record-row]');
  if(el&&e.target.closest('[data-match-count-step]')){
   const button=e.target.closest('[data-match-count-step]'),input=button.closest('.match-count-cell').querySelector('input'),current=input.value===''?0:Number(input.value),next=Math.max(0,current+Number(button.dataset.matchCountStep));
   if(Number.isSafeInteger(next))change(input,next);return;
  }
  if(el&&e.target.closest('[data-match-record-save]')){saveRow(el.dataset.matchRecordRow).catch(()=>toast('공유 저장 상태를 확인해 주세요.'));return;}
  if(el&&e.target.closest('[data-match-record-cancel]'))cancel(el.dataset.matchRecordRow);
  if(el&&e.target.closest('[data-match-record-clear-local]'))clearLocal(el.dataset.matchRecordRow);
 });
 document.addEventListener('input',e=>{if(e.target.matches('.match-count-cell input'))change(e.target,e.target.value);});
 document.addEventListener('change',e=>{
  if(!e.target.matches('[data-match-video-select]'))return;
  const player=e.target.closest('.match-video-dock').querySelector('.match-youtube-player'),html=matchYoutubeIframeHtml(e.target.value);
  if(player&&html)player.outerHTML=html;
 });
 readLocal();
 return {rowActionsHtml,cellHtml,permissionMarkerHtml,saveRow,refreshPermissions,get dirty(){return drafts.size>0;},get cloudEditing(){return signedIn()&&drafts.size>0;},discard(){drafts.clear();statuses.clear();refreshMatchDetailRecords();},onDatabaseChanged(){refreshMatchDetailRecords();}};
})();
// A cached/read-only detail can open while this deferred file is still loading.
window.GGFCMatchRecords.onDatabaseChanged();
window.addEventListener('pageshow',()=>window.GGFCMatchRecords.refreshPermissions());
document.addEventListener('visibilitychange',()=>{if(!document.hidden)window.GGFCMatchRecords.refreshPermissions();});
