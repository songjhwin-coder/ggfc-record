/* Match counts and corrections use the durable outbox and shared counter channel. */
window.GGFCMatchRecords=(()=>{
 const fields={sot:'유효슛',keyPass:'키패스',defSuccess:'수비성공',saves:'선방'};
 const drafts=new Map(),saving=new Set(),statuses=new Map(),conflicts=new Map(),localRows=new Map(),localKey=KEY+'-viewer-match-counters-v1';
 let pressedPointer=null,refreshPending=false;
 const batch={date:'',running:false,stop:false,preview:null,summary:'',done:0,total:0,result:null};
 const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k),signedIn=()=>admin&&GGFC.authorized;
 const eligible=(m,r)=>r.att&&!r.ownGoal&&!!m.round&&!!m.no&&playerEligibleOn(r.player,m.date);
 const metric=v=>teamRecordValuePresent(v)?Number(v):null;
 const base=(r,k)=>metric(r.sharedRecordValues?.[k]);
 const allowed=(r,k)=>k!=='saves'||r.saveAllowed===true;
 const defaulted=(local,k)=>local?.defaultFields?.includes(k)&&local.values[k]===0;
 const pendingValue=(local,r,k)=>defaulted(local,k)&&metric(r.recordValues[k])!==null?r.recordValues[k]:local.values[k];
 const hasMissing=r=>Object.keys(fields).some(k=>allowed(r,k)&&metric(r.recordValues[k])===null);
 function zerosToConfirm(key,r){const draft=drafts.get(key),local=localRows.get(key);return Object.keys(fields).filter(k=>allowed(r,k)&&metric(r.recordValues[k])===null&&!own(draft?.values||{},k)&&(!own(local?.values||{},k)||defaulted(local,k)));}
 const storedKey=r=>JSON.stringify([r.fixtureKey,teamRecordTeamKey(r.team),normalizePlayerMatchKey(r.player)]);
 function readLocal(){try{const file=JSON.parse(localStorage.getItem(localKey)||'null');if(file?.version!==1||!Array.isArray(file.records))return;
  for(const row of file.records){if(!row||typeof row.fixtureKey!=='string'||typeof row.team!=='string'||typeof row.player!=='string')continue;const values={},baseValues={},seenValues={};let valid=true;
   for(const k of Object.keys(fields)){if(!own(row.values||{},k))continue;const v=row.values[k];if(typeof v!=='number'||!Number.isSafeInteger(v)||v<0||v>10000){valid=false;break;}values[k]=v;baseValues[k]=metric(row.baseValues?.[k]);if(own(row.seenValues||{},k))seenValues[k]=metric(row.seenValues[k]);}
   const defaultFields=Array.isArray(row.defaultFields)?row.defaultFields.filter(k=>own(values,k)&&values[k]===0):[];
   if(valid&&Object.keys(values).length)localRows.set(storedKey(row),{...row,values,baseValues,seenValues,defaultFields,shareStamp:typeof row.shareStamp==='string'?row.shareStamp:null});
  }}catch(e){/* Damaged local data never replaces shared DB. */}}
 function writeLocal(next){try{if(next.size)localStorage.setItem(localKey,JSON.stringify({version:1,records:[...next.values()]}));else localStorage.removeItem(localKey);localRows.clear();next.forEach((v,k)=>localRows.set(k,v));batch.preview=null;return true;}catch(e){return false;}}
 function context(key,cache){if(cache?.has(key))return cache.get(key);let id;try{id=JSON.parse(key);}catch(e){return null;}const m=verifiedRecords().matches.find(x=>verifiedFixtureKey(x)===id[0]);if(!m)return null;let found=null;for(const team of matchDetailData(m).teams)for(const row of team.rows){const rowKey=appTeamRecordKey(m,team.team,row.player),value={m,team:team.team,row};cache?.set(rowKey,value);if(rowKey===key)found=value;}return found;}
 function statusFor(key){
  const review=conflicts.get(key);
  if(review&&!saving.has(key)){
   const local=localRows.get(key),draft=drafts.get(key);
   const items=Object.entries(review).map(([field,value])=>fields[field]+' 서버 '+(value??'미기록')+' / 내 입력 '+(draft?.values[field]??local?.values[field]??'—'));
   return '동시 수정 · '+items.join(' · ')+'\n내 입력으로 바꾸려면 내 값 저장을 누르세요.';
  }
  return statuses.get(key)||(drafts.has(key)?'미저장':localRows.has(key)?'기기 저장 · 공유 대기':'');
 }
 function saveLabel(key){return saving.has(key)?'저장 중…':conflicts.has(key)?'내 값 저장':'공유 저장';}
 function displayedValue(m,team,r,k,empty=0){const key=appTeamRecordKey(m,team,r.player),d=drafts.get(key),local=localRows.get(key);return d&&own(d.values,k)?d.values[k]:local&&own(local.values,k)?pendingValue(local,r,k):r.recordValues[k]??empty;}
 function sourceText(key,r,k){const local=localRows.get(key);return own(drafts.get(key)?.values||{},k)?'미저장':local&&own(local.values,k)&&!(defaulted(local,k)&&metric(r.recordValues[k])!==null)?'공유 대기':(r.counterFields||[]).includes(k)?'공유 기록 · 확정':(r.appFields||[]).includes(k)?'앱 기록 · 확정':metric(r.recordValues[k])!==null?'DB · 확정':'미확정';}
 function rowActionsHtml(m,team,r,confirmMissing=true){if(!eligible(m,r))return '';const key=appTeamRecordKey(m,team,r.player),dirty=drafts.has(key),busy=saving.has(key),pending=localRows.has(key);
  const zeros=confirmMissing?zerosToConfirm(key,r):[];
  return '<div class="match-record-row-actions"><button type="button" data-match-record-save'+(busy||!dirty&&!pending&&(!confirmMissing||!hasMissing(r))?' disabled':'')+'>'+saveLabel(key)+'</button><button type="button" data-match-record-cancel'+(!dirty?' hidden':'')+(busy?' disabled':'')+'>취소</button><button type="button" data-match-record-clear-local'+(!pending?' hidden':'')+(busy?' disabled':'')+'>기기 초기화</button></div><small class="match-zero-hint" data-match-zero-hint'+(zeros.length?'':' hidden')+'>미확정 '+zeros.length+'항목도 0회로 함께 확정</small><span class="match-record-status" role="status">'+esc(statusFor(key))+'</span>';}
 function cellHtml(m,team,r,k,editable=true,empty=0){const value=r.recordValues[k],shared=(r.counterFields||[]).includes(k),app=(r.appFields||[]).includes(k);
  if(editable&&eligible(m,r)&&allowed(r,k)){const key=appTeamRecordKey(m,team,r.player),disabled=saving.has(key),local=localRows.get(key);
   const source=sourceText(key,r,k);
   const sharedValue=window.GGFCPublicCounters?.latest(key)?.values[k]??'';
   return '<div class="match-count-cell" data-match-count="'+k+'"><button type="button" data-match-count-step="-1" aria-label="'+esc(r.player+' '+fields[k])+' 1회 줄이기"'+(disabled?' disabled':'')+'>−</button><input type="number" min="0" max="10000" step="1" inputmode="numeric" data-shared-value="'+esc(sharedValue)+'" value="'+esc(displayedValue(m,team,r,k,empty))+'" placeholder="—" aria-label="'+esc(r.player+' '+fields[k])+' 횟수"'+(disabled?' disabled':'')+'><button type="button" data-match-count-step="1" aria-label="'+esc(r.player+' '+fields[k])+' 1회 늘리기"'+(disabled?' disabled':'')+'>+</button></div><small class="match-record-source">'+source+'</small>';
  }if(eligible(m,r)&&allowed(r,k)){const key=appTeamRecordKey(m,team,r.player);return '<span>'+esc(displayedValue(m,team,r,k))+'</span><small class="match-record-source">'+sourceText(key,r,k)+'</small>';}
  return '<span>'+esc(value??'—')+'</span>'+(teamRecordValuePresent(value)?'<small class="match-record-source'+(app||shared?' app':'')+'">'+(shared?'공유 기록':app?'앱 기록':'DB')+'</small>':k==='saves'&&!r.keeper?'<small class="match-record-source">골키퍼만</small>':'');}
 function playerEditorHtml(m,team,r){
  if(!eligible(m,r))return '';
  const metrics=Object.entries(fields).map(([key,label])=>
   '<div class="match-player-edit-field"><dt>'+label+'</dt><dd>'+cellHtml(m,team,r,key)+'</dd></div>'
  ).join('');
  return '<section class="match-player-editor" tabindex="-1" aria-labelledby="matchPlayerEditorTitle"'+matchRecordRowAttrs(m,team,r)+'>'+
   '<header><button type="button" class="match-detail-back" data-match-player-list>← 선수 목록</button>'+
   '<div><p class="match-player-editor-team">'+esc(teamDisplayName(team))+'</p><h3 id="matchPlayerEditorTitle">'+esc(r.player)+' 기록 수정</h3></div></header>'+
   '<p class="match-zero-guide">미기록은 0부터 시작합니다. 이 선수의 모든 항목을 확인한 뒤 공유 저장하세요. 미확정 항목도 0회로 함께 확정됩니다.</p><dl>'+metrics+'</dl>'+rowActionsHtml(m,team,r)+'</section>';
 }
 function auditEditorHtml(key){
  if(!signedIn())return '';
  const item=context(key);
  if(!item||!eligible(item.m,item.row))return '<p class="aa-empty">이 경기의 출전 명단 또는 경기번호를 확인해 주세요.</p>';
  const {m,team,row}=item;
  const title=[normDate(m.date),m.comp,m.no,m.round,teamDisplayName(team)].filter(Boolean).join(' · ');
  const metrics=Object.entries(fields).map(([field,label])=>
   '<div><dt>'+label+'</dt><dd>'+cellHtml(m,team,row,field,true,'')+'</dd></div>'
  ).join('');
  return '<section class="aa-detail aa-counter-editor" data-match-record-audit'+matchRecordRowAttrs(m,team,row)+'>'+
   '<h4>'+esc(title)+'</h4><dl>'+metrics+'</dl>'+rowActionsHtml(m,team,row,false)+'</section>';
 }
 function permissionMarkerHtml(){return '<span hidden data-match-record-admin="'+String(signedIn())+'"></span>';}
 function updateRowState(key,c=context(key)){const el=[...document.querySelectorAll('[data-match-record-row]')].find(e=>e.dataset.matchRecordRow===key);if(!el||!c)return;const busy=saving.has(key),dirty=drafts.has(key),save=el.querySelector('[data-match-record-save]'),cancel=el.querySelector('[data-match-record-cancel]');if(save){save.disabled=busy||!dirty&&!localRows.has(key)&&(el.hasAttribute('data-match-record-audit')||!hasMissing(c.row));save.textContent=saveLabel(key);}if(cancel){cancel.hidden=!dirty;cancel.disabled=busy;}const status=el.querySelector('.match-record-status');if(status)status.textContent=statusFor(key);const hint=el.querySelector('[data-match-zero-hint]'),zeros=zerosToConfirm(key,c.row);if(hint){hint.hidden=el.hasAttribute('data-match-record-audit')||!zeros.length;hint.textContent='미확정 '+zeros.length+'항목도 0회로 함께 확정';}el.querySelectorAll('.match-count-cell').forEach(cell=>{const field=cell.dataset.matchCount;cell.querySelectorAll('button,input').forEach(e=>e.disabled=busy);const note=cell.nextElementSibling;if(note?.classList.contains('match-record-source'))note.textContent=sourceText(key,c.row,field);const local=localRows.get(key);if(defaulted(local,field)&&metric(c.row.recordValues[field])!==null&&!own(drafts.get(key)?.values||{},field))cell.querySelector('input').value=c.row.recordValues[field];});}
 function change(input,value){
  const row=input.closest('[data-match-record-row]');
  if(row?.hasAttribute('data-match-record-audit')&&!signedIn())return false;
  const key=row?.dataset.matchRecordRow;
  const field=input.closest('[data-match-count]')?.dataset.matchCount,c=context(key);
  if(!c||!own(fields,field)||!eligible(c.m,c.row)||!allowed(c.row,field)||saving.has(key))return false;
  const local=localRows.get(key),draft=drafts.get(key)||{values:{},seenValues:{}};
  const baseline=local&&own(local.values,field)?pendingValue(local,c.row,field):c.row.recordValues[field]??'';
  if(String(value)===String(baseline)){
   delete draft.values[field];delete draft.seenValues[field];
  }else{
   draft.values[field]=String(value);
   // Keep the first observed value for each field across remote changes and offline retries.
   if(!own(draft.seenValues,field)&&!(local&&own(local.values,field)&&!defaulted(local,field)))draft.seenValues[field]=input.dataset.sharedValue===''?null:Number(input.dataset.sharedValue);
  }
  if(Object.keys(draft.values).length)drafts.set(key,draft);else drafts.delete(key);
  input.value=value;statuses.delete(key);batch.preview=null;updateRowState(key);GGFC.refreshUI();return true;
 }
 function flushRecordRefresh(savedKey){
  if(!refreshPending||pressedPointer!==null)return;
  const focused=document.activeElement;
  if(focused?.matches('#matchRecordScroll .match-count-cell input')&&focused.closest('[data-match-record-row]')?.dataset.matchRecordRow!==savedKey)return;
  refreshPending=false;refreshMatchDetailRecords();
 }
 function requestRecordRefresh(savedKey){refreshPending=true;flushRecordRefresh(savedKey);}
 async function publishLocal(key){
  const local=localRows.get(key),c=context(key);
  if(!local||!c||saving.has(key)||conflicts.has(key))return false;
  const values={...local.values},defaultFields=(local.defaultFields||[]).filter(k=>values[k]===0);
  for(const k of defaultFields)if(!allowed(c.row,k)||base(c.row,k)!==null)delete values[k];
  const defaults=defaultFields.filter(k=>own(values,k));
  if(!eligible(c.m,c.row)||Object.keys(values).some(k=>!allowed(c.row,k))){
   statuses.set(key,'출전 명단 또는 골키퍼 지정 확인 필요');updateRowState(key);return false;
  }
  if(!window.GGFCPublicCounters){statuses.set(key,'기기 저장 · 공유 연결 준비 중');return false;}
  saving.add(key);statuses.set(key,'기기 저장 · 공유 중…');updateRowState(key);
  try{
   const result=Object.keys(values).length?await GGFCPublicCounters.publish(key,c.m,c.team,c.row.player,values,local.baseValues,local.seenValues,local.shareStamp,defaults):{ok:true,preserved:true};
   if(result.ok){
    const next=new Map(localRows);next.delete(key);
    statuses.set(key,writeLocal(next)?result.preserved?'기존 확정 기록 유지':'공유 반영 완료':'공유 완료 · 기기 대기 기록 정리 필요');
   }else if(result.conflicts)conflicts.set(key,result.conflicts);
   else statuses.set(key,result.message);
   return result.ok;
  }finally{saving.delete(key);requestRecordRefresh(key);updateRowState(key);if(!batch.running&&document.getElementById('v-data')?.classList.contains('on'))renderBatchControls();}
 }
 async function saveRow(key,{confirmMissing=true}={}){
  if(!confirmMissing&&!signedIn())return false;
  const local=localRows.get(key),draft=drafts.get(key),c=context(key);
  if(!c||saving.has(key)||!draft&&!local&&(!confirmMissing||!hasMissing(c.row)))return false;
  if(!eligible(c.m,c.row)){toast('출전 명단을 확인해 주세요.');return false;}
  const values={},baseValues={...local?.baseValues},defaultFields=new Set((local?.defaultFields||[]).filter(k=>!own(draft?.values||{},k))),seenValues={...local?.seenValues,...draft?.seenValues,...conflicts.get(key)};
  for(const [field,raw] of Object.entries({...local?.values,...draft?.values})){
   if(defaultFields.has(field)&&(!allowed(c.row,field)||base(c.row,field)!==null)){defaultFields.delete(field);continue;}
   if(!allowed(c.row,field)){toast('새 선방 기록은 골키퍼에게만 입력할 수 있습니다.');return false;}
   const value=String(raw).trim()===''?null:Number(raw);
   if(value===null||!Number.isSafeInteger(value)||value<0||value>10000){toast(fields[field]+'는 0~10000의 정수로 입력하세요.');return false;}
   values[field]=value;
   baseValues[field]=base(c.row,field)??baseValues[field]??null;
  }
  if(confirmMissing){
   for(const field of Object.keys(fields))if(allowed(c.row,field)&&metric(c.row.recordValues[field])===null&&!own(values,field)){values[field]=0;baseValues[field]=null;seenValues[field]=null;defaultFields.add(field);}
  }
  if(!Object.keys(values).length)return false;
  const record={fixtureKey:verifiedFixtureKey(c.m),team:c.team,player:c.row.player,values,baseValues,seenValues,defaultFields:[...defaultFields],shareStamp:local?.shareStamp??null};
  const next=new Map(localRows);next.set(key,record);
  if(!writeLocal(next)){statuses.set(key,'기기 저장 실패 · 입력은 유지됩니다');updateRowState(key);toast('기기 저장 공간을 확인하세요. 입력한 카운트는 현재 화면에 유지됩니다.');return false;}
  drafts.delete(key);conflicts.delete(key);statuses.set(key,'기기 저장 · 공유 대기');
  requestRecordRefresh();return publishLocal(key);
 }
 function cancel(key){if(saving.has(key))return;drafts.delete(key);statuses.delete(key);batch.preview=null;refreshMatchDetailRecords();GGFC.refreshUI();}
 function clearLocal(key){if(saving.has(key))return;const next=new Map(localRows);next.delete(key);if(!writeLocal(next)){toast('기기 저장 상태를 확인하세요.');return;}drafts.delete(key);statuses.delete(key);conflicts.delete(key);refreshMatchDetailRecords();GGFC.refreshUI();}
 function reconcile(){for(const [key,local] of localRows){if(drafts.has(key)||saving.has(key))continue;const shared=window.GGFCPublicCounters?.latest(key);if(!window.GGFCPublicCounters?.sameValues(shared,local.values,local.defaultFields))continue;const next=new Map(localRows);next.delete(key);if(writeLocal(next)){conflicts.delete(key);statuses.set(key,'공유 반영 완료');}}}
 async function retryPending(){if(!window.GGFCPublicCounters?.ready)return;for(const key of [...localRows.keys()])if(!drafts.has(key))await publishLocal(key);}
 function batchPlan(date){
  date=normDate(date);const matches=verifiedRecords().matches.filter(m=>normDate(m.date)===date),rows=[],seen=new Set();let count=0,skipped=0;
  for(const m of matches)for(const team of matchDetailData(m).teams)for(const r of team.rows){
   if(!eligible(m,r))continue;const key=appTeamRecordKey(m,team.team,r.player);if(seen.has(key))continue;seen.add(key);
   const missing=Object.keys(fields).filter(k=>allowed(r,k)&&metric(r.recordValues[k])===null);if(!missing.length)continue;
   if(drafts.has(key)||localRows.has(key)||saving.has(key)||conflicts.has(key)){skipped++;continue;}
   rows.push({key,fields:missing});count+=missing.length;
  }
  return {date,matches:matches.length,players:rows.length,fields:count,skipped,rows};
 }
 function renderBatchControls(){
  const root=document.getElementById('matchCounterBatchPanel');if(!root)return;root.hidden=!signedIn();if(root.hidden)return;
  const select=root.querySelector('#matchCounterBatchDate'),button=root.querySelector('#matchCounterBatchSave'),stop=root.querySelector('#matchCounterBatchStop');
  if(!batch.running){
   const dates=[...new Set(verifiedRecords().matches.map(m=>normDate(m.date)).filter(Boolean))].sort().reverse(),signature=dates.join('|');
   if(select.dataset.dates!==signature){select.dataset.dates=signature;select.innerHTML='<option value="">경기일 선택</option>'+dates.map(date=>'<option value="'+esc(date)+'">'+esc(date)+'</option>').join('');}
   if(batch.date&&!dates.includes(batch.date)){batch.date='';batch.preview=null;}select.value=batch.date;
  }
  select.disabled=batch.running||!GGFC.canEdit();
  const plan=batch.running?null:(batch.preview??=batchPlan(batch.date));
  root.querySelector('#matchCounterBatchPreview').textContent=batch.running?'선택한 경기일 '+batch.date+' · 선수 기록 '+batch.done+' / '+batch.total+'건 처리':!batch.date?'일괄 저장할 경기일을 선택하세요.':plan.matches+'경기 · 미확정 '+plan.players+'명·경기 / '+plan.fields+'항목을 0회로 확정'+(plan.skipped?' · 수정 중·공유 대기 '+plan.skipped+'명·경기 제외':'');
  button.disabled=batch.running||!GGFC.canEdit()||!window.GGFCPublicCounters?.ready||!plan?.players;
  button.textContent=batch.running?'공유 저장 중…':'미확정 0회 일괄 공유 저장';stop.hidden=!batch.running;stop.disabled=batch.stop;
  root.querySelector('#matchCounterBatchStatus').textContent=batch.summary||(!window.GGFCPublicCounters?.ready?'공유 연결을 확인한 뒤 저장할 수 있습니다.':'');
  select.onchange=()=>{if(batch.running)return;batch.date=select.value;batch.preview=null;batch.summary='';batch.result=null;renderBatchControls();};
  button.onclick=()=>saveDateZeros(batch.date).catch(()=>{batch.summary='일괄 저장 중 오류가 발생했습니다. 공유 상태와 기기 대기 기록을 확인하세요.';renderBatchControls();});
  stop.onclick=()=>{batch.stop=true;batch.summary='현재 전송의 응답을 받은 뒤 중단합니다.';renderBatchControls();};
 }
 async function saveDateZeros(date){
  if(batch.running||!signedIn()||!GGFC.canEdit()||!window.GGFCPublicCounters?.ready)return {ok:false,message:'관리자 인증과 공유 연결을 확인하세요.'};
  const plan=batchPlan(date);if(!plan.players)return {ok:false,message:'저장할 미확정 항목이 없습니다.'};
  const revision=GGFC.publicCounterContext().revision;
  Object.assign(batch,{date:plan.date,running:true,stop:false,preview:null,summary:'미확정 항목을 선수별로 공유 저장하고 있습니다.',done:0,total:plan.players,result:null});renderBatchControls();
  let saved=0,skipped=plan.skipped,failed=0,reason='';
  try{
   for(const item of plan.rows){
    if(batch.stop){reason='사용자 중단';break;}
    if(!signedIn()||!GGFC.canEdit()||!GGFCPublicCounters.ready){reason='관리자 인증 또는 공유 연결 확인 필요';break;}
    if(GGFC.publicCounterContext().revision!==revision){reason='원본 DB가 변경되어 중단했습니다. 경기일을 다시 확인하세요.';break;}
    const c=context(item.key);
    if(!c||normDate(c.m.date)!==plan.date||!eligible(c.m,c.row)||!hasMissing(c.row)||drafts.has(item.key)||localRows.has(item.key)||saving.has(item.key)||conflicts.has(item.key)){skipped++;batch.done++;renderBatchControls();continue;}
    const ok=await saveRow(item.key);batch.done++;
    if(ok)saved++;
    else{failed++;reason=statusFor(item.key)||'공유 응답을 확인하지 못했습니다.';break;}
    batch.summary='공유 완료 '+saved+'명·경기 · '+batch.done+' / '+batch.total+'건 처리';renderBatchControls();
   }
  }catch(e){failed++;reason='전송 오류 · 기기 대기 기록과 공유 상태를 확인하세요.';}
  finally{
   const remaining=plan.players-batch.done,ok=!reason&&!failed;
   batch.result={ok,date:plan.date,saved,skipped,failed,remaining,reason};batch.running=false;batch.preview=null;
   batch.summary=(ok?'일괄 공유 완료':'일괄 저장 중단')+' · 공유 완료 '+saved+'명·경기 · 제외 '+skipped+'명·경기'+(failed?' · 공유 대기·실패 '+failed+'명·경기':'')+(remaining?' · 미처리 '+remaining+'명·경기':'')+(reason?' · '+reason:'');
   renderBatchControls();window.GGFCPublicCounters?.refreshUI();GGFC.refreshUI();
  }
  return batch.result;
 }
 function refreshPermissions(){const cache=new Map();for(const el of document.querySelectorAll('[data-match-record-row]'))updateRowState(el.dataset.matchRecordRow,context(el.dataset.matchRecordRow,cache));if(document.getElementById('v-data')?.classList.contains('on'))renderBatchControls();}
 document.addEventListener('pointerdown',e=>{if(e.target.closest('#matchRecordScroll'))pressedPointer=e.pointerId;},true);
 function releasePress(e){if(e.pointerId===pressedPointer){pressedPointer=null;setTimeout(flushRecordRefresh,0);}}
 document.addEventListener('pointerup',releasePress,true);
 document.addEventListener('pointercancel',releasePress,true);
 window.addEventListener('blur',()=>{pressedPointer=null;flushRecordRefresh();});
 document.addEventListener('focusout',e=>{if(e.target.matches('#matchRecordScroll .match-count-cell input'))setTimeout(flushRecordRefresh,0);});
 /* Existing video selection and delegated input events follow. */
 document.addEventListener('click',e=>{
  const el=e.target.closest('[data-match-record-row]');
  if(el?.hasAttribute('data-match-record-audit')&&(!signedIn()||!e.target.closest('[data-match-count-step]')))return;
  if(el&&e.target.closest('[data-match-count-step]')){
   const button=e.target.closest('[data-match-count-step]'),input=button.closest('.match-count-cell').querySelector('input'),current=input.value===''?0:Number(input.value),next=Math.max(0,current+Number(button.dataset.matchCountStep));
   if(Number.isSafeInteger(next)&&next<=10000)change(input,next);return;
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
 return {canEdit:eligible,rowActionsHtml,cellHtml,playerEditorHtml,permissionMarkerHtml,auditEditorHtml,saveRow,cancel,clearLocal,hasUnsavedRow:key=>saving.has(key)||drafts.has(key),refreshPermissions,retryPending,batchPlan,renderBatchControls,saveDateZeros,get batchRunning(){return batch.running;},get batchResult(){return batch.result;},get pendingCount(){return localRows.size;},get dirty(){return drafts.size>0;},get cloudEditing(){return false;},discard(){drafts.clear();statuses.clear();batch.preview=null;refreshMatchDetailRecords();},onPublicChanged(){batch.preview=null;reconcile();requestRecordRefresh();if(!batch.running&&document.getElementById('v-data')?.classList.contains('on'))renderBatchControls();},onDatabaseChanged(){batch.preview=null;reconcile();requestRecordRefresh();retryPending();if(document.getElementById('v-data')?.classList.contains('on'))renderBatchControls();}};
})();
window.GGFCMatchRecords.onDatabaseChanged();
window.addEventListener('pageshow',()=>{window.GGFCMatchRecords.refreshPermissions();window.GGFCMatchRecords.retryPending();});
window.addEventListener('online',()=>window.GGFCMatchRecords.retryPending());
document.addEventListener('visibilitychange',()=>{if(!document.hidden){window.GGFCMatchRecords.refreshPermissions();window.GGFCMatchRecords.retryPending();}});
