/* Match counts and corrections use the durable outbox and shared counter channel. */
window.GGFCMatchRecords=(()=>{
 const fields={sot:'유효슛',keyPass:'키패스',defSuccess:'수비성공',saves:'선방'};
 const drafts=new Map(),saving=new Set(),statuses=new Map(),conflicts=new Map(),localRows=new Map(),localKey=KEY+'-viewer-match-counters-v1';
 let pressedPointer=null,refreshPending=false;
 const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k),signedIn=()=>admin&&GGFC.authorized;
 const eligible=(m,r)=>r.att&&!r.ownGoal&&!!m.round&&!!m.no&&playerEligibleOn(r.player,m.date);
 const metric=v=>teamRecordValuePresent(v)?Number(v):null;
 const base=(r,k)=>metric(r.sharedRecordValues?.[k]);
 const allowed=(r,k)=>k!=='saves'||r.keeper===true||metric(r.recordValues.saves)!==null;
 const storedKey=r=>JSON.stringify([r.fixtureKey,teamRecordTeamKey(r.team),normalizePlayerMatchKey(r.player)]);
 function readLocal(){try{const file=JSON.parse(localStorage.getItem(localKey)||'null');if(file?.version!==1||!Array.isArray(file.records))return;
  for(const row of file.records){if(!row||typeof row.fixtureKey!=='string'||typeof row.team!=='string'||typeof row.player!=='string')continue;const values={},baseValues={},seenValues={};let valid=true;
   for(const k of Object.keys(fields)){if(!own(row.values||{},k))continue;const v=row.values[k];if(typeof v!=='number'||!Number.isSafeInteger(v)||v<0||v>10000){valid=false;break;}values[k]=v;baseValues[k]=metric(row.baseValues?.[k]);if(own(row.seenValues||{},k))seenValues[k]=metric(row.seenValues[k]);}
   if(valid&&Object.keys(values).length)localRows.set(storedKey(row),{...row,values,baseValues,seenValues,shareStamp:typeof row.shareStamp==='string'?row.shareStamp:null});
  }}catch(e){/* Damaged local data never replaces shared DB. */}}
 function writeLocal(next){try{if(next.size)localStorage.setItem(localKey,JSON.stringify({version:1,records:[...next.values()]}));else localStorage.removeItem(localKey);localRows.clear();next.forEach((v,k)=>localRows.set(k,v));return true;}catch(e){return false;}}
 function context(key){let id;try{id=JSON.parse(key);}catch(e){return null;}const m=verifiedRecords().matches.find(x=>verifiedFixtureKey(x)===id[0]);if(!m)return null;for(const team of matchDetailData(m).teams)for(const row of team.rows)if(appTeamRecordKey(m,team.team,row.player)===key)return {m,team:team.team,row};return null;}
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
 function displayedValue(m,team,r,k){const key=appTeamRecordKey(m,team,r.player),d=drafts.get(key),local=localRows.get(key);return d&&own(d.values,k)?d.values[k]:local&&own(local.values,k)?local.values[k]:r.recordValues[k]??'';}
 function rowActionsHtml(m,team,r){if(!eligible(m,r))return '';const key=appTeamRecordKey(m,team,r.player),dirty=drafts.has(key),busy=saving.has(key),pending=localRows.has(key);
  return '<div class="match-record-row-actions"><button type="button" data-match-record-save'+(busy||!dirty&&!pending?' disabled':'')+'>'+saveLabel(key)+'</button><button type="button" data-match-record-cancel'+(!dirty?' hidden':'')+(busy?' disabled':'')+'>취소</button><button type="button" data-match-record-clear-local'+(!pending?' hidden':'')+(busy?' disabled':'')+'>기기 초기화</button></div><span class="match-record-status" role="status">'+esc(statusFor(key))+'</span>';}
 function cellHtml(m,team,r,k,editable=true){const value=r.recordValues[k],shared=(r.counterFields||[]).includes(k),app=(r.appFields||[]).includes(k);
  if(editable&&eligible(m,r)&&allowed(r,k)){const key=appTeamRecordKey(m,team,r.player),disabled=saving.has(key),local=localRows.get(key);
   const source=local&&own(local.values,k)?'공유 대기':shared?'공유 기록':app?'앱 기록':teamRecordValuePresent(value)?'DB':'미기록';
   const sharedValue=window.GGFCPublicCounters?.latest(key)?.values[k]??'';
   return '<div class="match-count-cell" data-match-count="'+k+'"><button type="button" data-match-count-step="-1" aria-label="'+esc(r.player+' '+fields[k])+' 1회 줄이기"'+(disabled?' disabled':'')+'>−</button><input type="number" min="0" max="10000" step="1" inputmode="numeric" data-shared-value="'+esc(sharedValue)+'" value="'+esc(displayedValue(m,team,r,k))+'" placeholder="—" aria-label="'+esc(r.player+' '+fields[k])+' 횟수"'+(disabled?' disabled':'')+'><button type="button" data-match-count-step="1" aria-label="'+esc(r.player+' '+fields[k])+' 1회 늘리기"'+(disabled?' disabled':'')+'>+</button></div><small class="match-record-source">'+source+'</small>';
  }return '<span>'+esc(value??'—')+'</span>'+(teamRecordValuePresent(value)?'<small class="match-record-source'+(app||shared?' app':'')+'">'+(shared?'공유 기록':app?'앱 기록':'DB')+'</small>':k==='saves'&&!r.keeper?'<small class="match-record-source">골키퍼만</small>':'');}
 function playerEditorHtml(m,team,r){
  if(!eligible(m,r))return '';
  const metrics=Object.entries(fields).map(([key,label])=>
   '<div class="match-player-edit-field"><dt>'+label+'</dt><dd>'+cellHtml(m,team,r,key)+'</dd></div>'
  ).join('');
  return '<section class="match-player-editor" tabindex="-1" aria-labelledby="matchPlayerEditorTitle"'+matchRecordRowAttrs(m,team,r)+'>'+
   '<header><button type="button" class="match-detail-back" data-match-player-list>← 선수 목록</button>'+
   '<div><p class="match-player-editor-team">'+esc(teamDisplayName(team))+'</p><h3 id="matchPlayerEditorTitle">'+esc(r.player)+' 기록 수정</h3></div></header>'+
   '<dl>'+metrics+'</dl>'+rowActionsHtml(m,team,r)+'</section>';
 }
 function permissionMarkerHtml(){return '<span hidden data-match-record-admin="'+String(signedIn())+'"></span>';}
 function updateRowState(key){const el=[...document.querySelectorAll('[data-match-record-row]')].find(e=>e.dataset.matchRecordRow===key);if(!el)return;const busy=saving.has(key),dirty=drafts.has(key),save=el.querySelector('[data-match-record-save]'),cancel=el.querySelector('[data-match-record-cancel]');if(save){save.disabled=busy||!dirty&&!localRows.has(key);save.textContent=saveLabel(key);}if(cancel){cancel.hidden=!dirty;cancel.disabled=busy;}const status=el.querySelector('.match-record-status');if(status)status.textContent=statusFor(key);el.querySelectorAll('.match-count-cell button,.match-count-cell input').forEach(e=>e.disabled=busy);}
 function change(input,value){
  const key=input.closest('[data-match-record-row]')?.dataset.matchRecordRow;
  const field=input.closest('[data-match-count]')?.dataset.matchCount,c=context(key);
  if(!c||!own(fields,field)||!eligible(c.m,c.row)||!allowed(c.row,field)||saving.has(key))return false;
  const local=localRows.get(key),draft=drafts.get(key)||{values:{},seenValues:{}};
  const baseline=local&&own(local.values,field)?local.values[field]:c.row.recordValues[field]??'';
  if(String(value)===String(baseline)){
   delete draft.values[field];delete draft.seenValues[field];
  }else{
   draft.values[field]=String(value);
   // Keep the first observed value for each field across remote changes and offline retries.
   if(!own(draft.seenValues,field)&&!(local&&own(local.values,field)))draft.seenValues[field]=input.dataset.sharedValue===''?null:Number(input.dataset.sharedValue);
  }
  if(Object.keys(draft.values).length)drafts.set(key,draft);else drafts.delete(key);
  input.value=value;statuses.delete(key);updateRowState(key);GGFC.refreshUI();return true;
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
  if(!eligible(c.m,c.row)||Object.keys(local.values).some(k=>!allowed(c.row,k))){
   statuses.set(key,'출전 명단 또는 골키퍼 지정 확인 필요');updateRowState(key);return false;
  }
  if(!window.GGFCPublicCounters){statuses.set(key,'기기 저장 · 공유 연결 준비 중');return false;}
  saving.add(key);statuses.set(key,'기기 저장 · 공유 중…');updateRowState(key);
  try{
   const result=await GGFCPublicCounters.publish(key,c.m,c.team,c.row.player,local.values,local.baseValues,local.seenValues,local.shareStamp);
   if(result.ok){
    const next=new Map(localRows);next.delete(key);
    statuses.set(key,writeLocal(next)?'공유 반영 완료':'공유 완료 · 기기 대기 기록 정리 필요');
   }else if(result.conflicts)conflicts.set(key,result.conflicts);
   else statuses.set(key,result.message);
   return result.ok;
  }finally{saving.delete(key);requestRecordRefresh(key);updateRowState(key);}
 }
 async function saveRow(key){
  const local=localRows.get(key),draft=drafts.get(key),c=context(key);
  if((!draft&&!local)||!c||saving.has(key))return false;
  if(!eligible(c.m,c.row)){toast('출전 명단을 확인해 주세요.');return false;}
  const values={},baseValues={...local?.baseValues};
  for(const [field,raw] of Object.entries({...local?.values,...draft?.values})){
   if(!allowed(c.row,field)){toast('새 선방 기록은 골키퍼에게만 입력할 수 있습니다.');return false;}
   const value=String(raw).trim()===''?null:Number(raw);
   if(value===null||!Number.isSafeInteger(value)||value<0||value>10000){toast(fields[field]+'는 0~10000의 정수로 입력하세요.');return false;}
   values[field]=value;
   baseValues[field]=base(c.row,field)??baseValues[field]??null;
  }
  const seenValues={...local?.seenValues,...draft?.seenValues,...conflicts.get(key)};
  const record={fixtureKey:verifiedFixtureKey(c.m),team:c.team,player:c.row.player,values,baseValues,seenValues,shareStamp:local?.shareStamp??null};
  const next=new Map(localRows);next.set(key,record);
  if(!writeLocal(next)){statuses.set(key,'기기 저장 실패 · 입력은 유지됩니다');updateRowState(key);toast('기기 저장 공간을 확인하세요. 입력한 카운트는 현재 화면에 유지됩니다.');return false;}
  drafts.delete(key);conflicts.delete(key);statuses.set(key,'기기 저장 · 공유 대기');
  requestRecordRefresh();return publishLocal(key);
 }
 function cancel(key){if(saving.has(key))return;drafts.delete(key);statuses.delete(key);refreshMatchDetailRecords();GGFC.refreshUI();}
 function clearLocal(key){if(saving.has(key))return;const next=new Map(localRows);next.delete(key);if(!writeLocal(next)){toast('기기 저장 상태를 확인하세요.');return;}drafts.delete(key);statuses.delete(key);conflicts.delete(key);refreshMatchDetailRecords();}
 function reconcile(){for(const [key,local] of localRows){if(drafts.has(key)||saving.has(key))continue;const shared=window.GGFCPublicCounters?.latest(key);if(!window.GGFCPublicCounters?.sameValues(shared,local.values))continue;const next=new Map(localRows);next.delete(key);if(writeLocal(next)){conflicts.delete(key);statuses.set(key,'공유 반영 완료');}}}
 async function retryPending(){if(!window.GGFCPublicCounters?.ready)return;for(const key of [...localRows.keys()])if(!drafts.has(key))await publishLocal(key);}
 function refreshPermissions(){for(const el of document.querySelectorAll('[data-match-record-row]'))updateRowState(el.dataset.matchRecordRow);}
 document.addEventListener('pointerdown',e=>{if(e.target.closest('#matchRecordScroll'))pressedPointer=e.pointerId;},true);
 function releasePress(e){if(e.pointerId===pressedPointer){pressedPointer=null;setTimeout(flushRecordRefresh,0);}}
 document.addEventListener('pointerup',releasePress,true);
 document.addEventListener('pointercancel',releasePress,true);
 window.addEventListener('blur',()=>{pressedPointer=null;flushRecordRefresh();});
 document.addEventListener('focusout',e=>{if(e.target.matches('#matchRecordScroll .match-count-cell input'))setTimeout(flushRecordRefresh,0);});
 /* Existing video selection and delegated input events follow. */
 document.addEventListener('click',e=>{
  const el=e.target.closest('[data-match-record-row]');
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
 return {canEdit:eligible,rowActionsHtml,cellHtml,playerEditorHtml,permissionMarkerHtml,saveRow,refreshPermissions,retryPending,get dirty(){return drafts.size>0;},get cloudEditing(){return false;},discard(){drafts.clear();statuses.clear();refreshMatchDetailRecords();},onPublicChanged(){reconcile();requestRecordRefresh();},onDatabaseChanged(){reconcile();requestRecordRefresh();retryPending();}};
})();
window.GGFCMatchRecords.onDatabaseChanged();
window.addEventListener('pageshow',()=>{window.GGFCMatchRecords.refreshPermissions();window.GGFCMatchRecords.retryPending();});
window.addEventListener('online',()=>window.GGFCMatchRecords.retryPending());
document.addEventListener('visibilitychange',()=>{if(!document.hidden){window.GGFCMatchRecords.refreshPermissions();window.GGFCMatchRecords.retryPending();}});
