/* Match counts and corrections use the durable outbox and shared counter channel. */
window.GGFCMatchRecords=(()=>{
 const fields={sot:'유효슛',keyPass:'키패스',defSuccess:'수비성공',saves:'선방'};
 const drafts=new Map(),saving=new Set(),statuses=new Map(),conflicts=new Set(),localRows=new Map(),localKey=KEY+'-viewer-match-counters-v1';
 const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k),signedIn=()=>admin&&GGFC.authorized;
 const eligible=(m,r)=>r.att&&!r.ownGoal&&!r.recordConflict&&!!m.round&&!!m.no&&playerEligibleOn(r.player,m.date);
 const metric=v=>teamRecordValuePresent(v)?Number(v):null;
 const base=(r,k)=>metric(r.sharedRecordValues?.[k]);
 const allowed=(r,k)=>k!=='saves'||r.keeper===true||base(r,k)!==null;
 const storedKey=r=>JSON.stringify([r.fixtureKey,teamRecordTeamKey(r.team),normalizePlayerMatchKey(r.player)]);
 function readLocal(){try{const file=JSON.parse(localStorage.getItem(localKey)||'null');if(file?.version!==1||!Array.isArray(file.records))return;
  for(const row of file.records){if(!row||typeof row.fixtureKey!=='string'||typeof row.team!=='string'||typeof row.player!=='string')continue;const values={},baseValues={};let valid=true;
   for(const k of Object.keys(fields)){if(!own(row.values||{},k))continue;const v=row.values[k];if(typeof v!=='number'||!Number.isSafeInteger(v)||v<0||v>10000){valid=false;break;}values[k]=v;baseValues[k]=metric(row.baseValues?.[k]);}
   if(valid&&Object.keys(values).length)localRows.set(storedKey(row),{...row,values,baseValues,shareStamp:typeof row.shareStamp==='string'?row.shareStamp:null});
  }}catch(e){/* Damaged local data never replaces shared DB. */}}
 function writeLocal(next){try{if(next.size)localStorage.setItem(localKey,JSON.stringify({version:1,records:[...next.values()]}));else localStorage.removeItem(localKey);localRows.clear();next.forEach((v,k)=>localRows.set(k,v));return true;}catch(e){return false;}}
 function context(key){let id;try{id=JSON.parse(key);}catch(e){return null;}const m=verifiedRecords().matches.find(x=>verifiedFixtureKey(x)===id[0]);if(!m)return null;for(const team of matchDetailData(m).teams)for(const row of team.rows)if(appTeamRecordKey(m,team.team,row.player)===key)return {m,team:team.team,row};return null;}
 function statusFor(key){return statuses.get(key)||(drafts.has(key)?'미저장':localRows.has(key)?'기기 저장 · 공유 대기':'');}
 function displayedValue(m,team,r,k){const key=appTeamRecordKey(m,team,r.player),d=drafts.get(key),local=localRows.get(key);return d&&own(d.values,k)?d.values[k]:local&&own(local.values,k)?local.values[k]:r.recordValues[k]??'';}
 function rowActionsHtml(m,team,r){if(!eligible(m,r))return '';const key=appTeamRecordKey(m,team,r.player),dirty=drafts.has(key),busy=saving.has(key),pending=localRows.has(key);
  return '<div class="match-record-row-actions"><button type="button" data-match-record-save'+(busy||!dirty&&!pending?' disabled':'')+' aria-label="'+esc(r.player)+' 보완 기록 기기 저장 및 공유">'+(busy?'저장 중…':'기기 저장')+'</button><button type="button" data-match-record-cancel'+(!dirty?' hidden':'')+(busy?' disabled':'')+'>취소</button><button type="button" data-match-record-clear-local'+(!pending?' hidden':'')+(busy?' disabled':'')+'>기기 초기화</button></div><span class="match-record-status" role="status">'+esc(statusFor(key))+'</span>';}
 function cellHtml(m,team,r,k,editable=true){const value=r.recordValues[k],shared=(r.counterFields||[]).includes(k),app=(r.appFields||[]).includes(k);
  if(editable&&eligible(m,r)&&allowed(r,k)){const key=appTeamRecordKey(m,team,r.player),disabled=saving.has(key),local=localRows.get(key);
   const source=local&&own(local.values,k)?'공유 대기':shared?'공유 기록':app?'앱 기록':teamRecordValuePresent(value)?'DB':'미기록';
   return '<div class="match-count-cell" data-match-count="'+k+'"><button type="button" data-match-count-step="-1" aria-label="'+esc(r.player+' '+fields[k])+' 1회 줄이기"'+(disabled?' disabled':'')+'>−</button><input type="number" min="0" max="10000" step="1" inputmode="numeric" value="'+esc(displayedValue(m,team,r,k))+'" placeholder="—" aria-label="'+esc(r.player+' '+fields[k])+' 횟수"'+(disabled?' disabled':'')+'><button type="button" data-match-count-step="1" aria-label="'+esc(r.player+' '+fields[k])+' 1회 늘리기"'+(disabled?' disabled':'')+'>+</button></div><small class="match-record-source">'+source+'</small>';
  }return '<span>'+esc(value??'—')+'</span>'+(teamRecordValuePresent(value)?'<small class="match-record-source'+(app||shared?' app':'')+'">'+(shared?'공유 기록':app?'앱 기록':'DB')+'</small>':k==='saves'&&!r.keeper?'<small class="match-record-source">골키퍼만</small>':r.recordConflict?'<small class="match-record-source">원본 확인</small>':'');}
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
 function updateRowState(key){const el=[...document.querySelectorAll('[data-match-record-row]')].find(e=>e.dataset.matchRecordRow===key);if(!el)return;const busy=saving.has(key),dirty=drafts.has(key),save=el.querySelector('[data-match-record-save]'),cancel=el.querySelector('[data-match-record-cancel]');if(save){save.disabled=busy||!dirty&&!localRows.has(key);save.textContent=busy?'저장 중…':'기기 저장';}if(cancel){cancel.hidden=!dirty;cancel.disabled=busy;}const status=el.querySelector('.match-record-status');if(status)status.textContent=statusFor(key);el.querySelectorAll('.match-count-cell button,.match-count-cell input').forEach(e=>e.disabled=busy);}
 function change(input,value){const el=input.closest('[data-match-record-row]'),key=el?.dataset.matchRecordRow,k=input.closest('[data-match-count]')?.dataset.matchCount,c=context(key);if(!c||!fields[k]||!eligible(c.m,c.row)||!allowed(c.row,k)||saving.has(key)){toast('출석·골키퍼 지정·DB 기록 상태를 확인해 주세요.');return false;}
  const local=localRows.get(key),d=drafts.get(key)||{values:{},baseValues:{},shareStamp:local?local.shareStamp:window.GGFCPublicCounters?.stamp(key)||''},baseline=local&&own(local.values,k)?local.values[k]:c.row.recordValues[k]??'';
  if(String(value)===String(baseline)){delete d.values[k];delete d.baseValues[k];}else{d.values[k]=String(value);if(!own(d.baseValues,k))d.baseValues[k]=local&&own(local.baseValues,k)?local.baseValues[k]:base(c.row,k);}if(Object.keys(d.values).length)drafts.set(key,d);else drafts.delete(key);input.value=value;statuses.delete(key);updateRowState(key);GGFC.refreshUI();return true;}
 async function publishLocal(key){const local=localRows.get(key),c=context(key);if(!local||!c||saving.has(key)||conflicts.has(key))return false;
  if(!eligible(c.m,c.row)||Object.keys(local.values).some(k=>!allowed(c.row,k)||metric(local.baseValues[k])!==base(c.row,k))){conflicts.add(key);statuses.set(key,'DB·출전 정보 변경 · 기기 초기화 후 확인');updateRowState(key);return false;}
  if(!window.GGFCPublicCounters){statuses.set(key,'기기 저장 · 공유 연결 준비 중');return false;}saving.add(key);statuses.set(key,'기기 저장 · 공유 중…');updateRowState(key);
  try{const result=await GGFCPublicCounters.publish(key,c.m,c.team,c.row.player,local.values,local.baseValues,local.shareStamp);if(result.ok){const next=new Map(localRows);next.delete(key);statuses.set(key,writeLocal(next)?'공유 반영 완료':'공유 완료 · 기기 대기 기록 정리 필요');conflicts.delete(key);}else{statuses.set(key,result.message);if(result.conflict)conflicts.add(key);}return result.ok;}finally{saving.delete(key);refreshMatchDetailRecords();updateRowState(key);}}
 async function saveRow(key){const local=localRows.get(key),draft=drafts.get(key),d=draft?{values:{...local?.values,...draft.values},baseValues:{...local?.baseValues,...draft.baseValues},shareStamp:draft.shareStamp}:local,c=context(key);if(!d||!c||saving.has(key))return false;if(!eligible(c.m,c.row)){toast('출전 명단과 기록 상태를 확인해 주세요.');return false;}const values={};
  for(const [k,raw] of Object.entries(d.values)){if(!fields[k]||!allowed(c.row,k)){toast('새 선방 기록은 골키퍼에게만 입력할 수 있습니다.');return false;}const v=String(raw).trim()===''?null:Number(raw);if(v===null||!Number.isSafeInteger(v)||v<0||v>10000){toast(fields[k]+'는 0~10000의 정수로 입력하세요.');return false;}if(metric(d.baseValues?.[k])!==base(c.row,k)){toast('카운트 후 DB 값이 변경되었습니다. 기기 초기화 후 다시 입력하세요.');return false;}values[k]=v;}
  if(!Object.keys(values).length)return false;const record={fixtureKey:verifiedFixtureKey(c.m),team:c.team,player:c.row.player,values,baseValues:{...d.baseValues},shareStamp:d.shareStamp??null,updatedAt:new Date().toISOString()},next=new Map(localRows);next.set(key,record);
  if(!writeLocal(next)){statuses.set(key,'기기 저장 실패 · 입력은 유지됩니다');updateRowState(key);toast('기기 저장 공간을 확인하세요. 입력한 카운트는 현재 화면에 유지됩니다.');return false;}drafts.delete(key);statuses.set(key,'기기 저장 · 공유 대기');refreshMatchDetailRecords();return publishLocal(key);}
 function cancel(key){if(saving.has(key))return;drafts.delete(key);statuses.delete(key);refreshMatchDetailRecords();GGFC.refreshUI();}
 function clearLocal(key){if(saving.has(key))return;const next=new Map(localRows);next.delete(key);if(!writeLocal(next)){toast('기기 저장 상태를 확인하세요.');return;}drafts.delete(key);statuses.delete(key);conflicts.delete(key);refreshMatchDetailRecords();}
 function reconcile(){for(const [key,local] of localRows){if(drafts.has(key)||saving.has(key))continue;const shared=window.GGFCPublicCounters?.latest(key);if(!window.GGFCPublicCounters?.sameValues(shared,local.values,local.baseValues))continue;const next=new Map(localRows);next.delete(key);if(writeLocal(next)){conflicts.delete(key);statuses.set(key,'공유 반영 완료');}}}
 async function retryPending(){if(!window.GGFCPublicCounters?.ready)return;for(const key of [...localRows.keys()])if(!drafts.has(key))await publishLocal(key);}
 function refreshPermissions(){for(const el of document.querySelectorAll('[data-match-record-row]'))updateRowState(el.dataset.matchRecordRow);}
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
 return {canEdit:eligible,rowActionsHtml,cellHtml,playerEditorHtml,permissionMarkerHtml,saveRow,refreshPermissions,retryPending,get dirty(){return drafts.size>0;},get cloudEditing(){return false;},discard(){drafts.clear();statuses.clear();refreshMatchDetailRecords();},onPublicChanged(){reconcile();refreshMatchDetailRecords();},onDatabaseChanged(){reconcile();refreshMatchDetailRecords();retryPending();}};
})();
window.GGFCMatchRecords.onDatabaseChanged();
window.addEventListener('pageshow',()=>{window.GGFCMatchRecords.refreshPermissions();window.GGFCMatchRecords.retryPending();});
window.addEventListener('online',()=>window.GGFCMatchRecords.retryPending());
document.addEventListener('visibilitychange',()=>{if(!document.hidden){window.GGFCMatchRecords.refreshPermissions();window.GGFCMatchRecords.retryPending();}});
