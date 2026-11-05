/* Missing-only counters; Excel arrays remain untouched. Shared writes use the existing revision guard. */
window.GGFCMatchRecords=(()=>{
 const fields={sot:'유효슛',keyPass:'키패스',defSuccess:'수비성공',saves:'선방'};
 const drafts=new Map(),saving=new Set(),statuses=new Map();
 const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
 const signedIn=()=>admin&&GGFC.authorized&&window.GGFC_MEMBER_PREVIEW!==true;
 const writable=()=>signedIn()&&GGFC.canEdit();
 const eligible=(m,r)=>r.att&&!r.ownGoal&&!r.recordConflict&&!!m.round&&!!m.no&&playerEligibleOn(r.player,m.date);
 const editable=(r,k)=>(r.appFields||[]).includes(k)||!teamRecordValuePresent(r.recordValues[k]);
 function context(key){
  if(ggfcDetailState?.kind!=='match')return null;
  const m=verifiedRecords().matches.find(x=>verifiedFixtureKey(x)===ggfcDetailState.fixtureKey);if(!m)return null;
  for(const team of matchDetailData(m).teams)for(const row of team.rows)if(appTeamRecordKey(m,team.team,row.player)===key)return {m,team:team.team,row};
  return null;
 }
 function displayedValue(m,team,r,k){const d=drafts.get(appTeamRecordKey(m,team,r.player));return d&&own(d.values,k)?d.values[k]:r.recordValues[k]??'';}
 function rowActionsHtml(m,team,r){
  if(!signedIn()||!eligible(m,r)||!Object.keys(fields).some(k=>editable(r,k)))return '';
  const key=appTeamRecordKey(m,team,r.player),dirty=drafts.has(key),busy=saving.has(key),disabled=!writable()||busy;
  return '<div class="match-record-row-actions"><button type="button" data-match-record-save'+(disabled||!dirty?' disabled':'')+' aria-label="'+esc(r.player)+' 보완 기록 저장">'+(busy?'저장 중…':'저장')+'</button><button type="button" data-match-record-cancel'+(!dirty?' hidden':'')+(busy?' disabled':'')+'>취소</button></div><span class="match-record-status" role="status">'+esc(statuses.get(key)||(!writable()?'관리자 연결 확인':dirty?'미저장':''))+'</span>';
 }
 function cellHtml(m,team,r,k){
  const value=r.recordValues[k],app=(r.appFields||[]).includes(k);
  if(signedIn()&&eligible(m,r)&&editable(r,k)){
   const disabled=!writable()||saving.has(appTeamRecordKey(m,team,r.player));
   return '<div class="match-count-cell" data-match-count="'+k+'"><button type="button" data-match-count-step="-1" aria-label="'+esc(r.player+' '+fields[k])+' 1회 줄이기"'+(disabled?' disabled':'')+'>−</button><input type="number" min="0" step="1" inputmode="numeric" value="'+esc(displayedValue(m,team,r,k))+'" placeholder="—" aria-label="'+esc(r.player+' '+fields[k])+' 횟수"'+(disabled?' disabled':'')+'><button type="button" data-match-count-step="1" aria-label="'+esc(r.player+' '+fields[k])+' 1회 늘리기"'+(disabled?' disabled':'')+'>+</button></div><small class="match-record-source">'+(app?'앱 기록':'미기록')+'</small>';
  }
  return '<span>'+esc(value??'—')+'</span>'+(teamRecordValuePresent(value)?'<small class="match-record-source'+(app?' app':'')+'">'+(app?'앱 기록':'DB')+'</small>':r.recordConflict?'<small class="match-record-source">원본 확인</small>':'');
 }
 function permissionMarkerHtml(){return '<span hidden data-match-record-admin="'+String(signedIn())+'"></span>';}
 function rowElement(key){return [...document.querySelectorAll('[data-match-record-row]')].find(e=>e.dataset.matchRecordRow===key);}
 function updateRowState(key){
  const el=rowElement(key);if(!el)return;
  const dirty=drafts.has(key),busy=saving.has(key),save=el.querySelector('[data-match-record-save]'),cancel=el.querySelector('[data-match-record-cancel]');
  if(save){save.disabled=!writable()||busy||!dirty;save.textContent=busy?'저장 중…':'저장';}
  if(cancel){cancel.hidden=!dirty;cancel.disabled=busy;}
  const status=el.querySelector('.match-record-status');if(status)status.textContent=statuses.get(key)||(!writable()?'관리자 연결 확인':dirty?'미저장':'');
  el.querySelectorAll('.match-count-cell button,.match-count-cell input').forEach(e=>e.disabled=!writable()||busy);
 }
 function change(input,value){
  const el=input.closest('[data-match-record-row]'),key=el?.dataset.matchRecordRow,k=input.closest('[data-match-count]')?.dataset.matchCount,c=context(key);
  if(!c||!fields[k]||!writable()||!eligible(c.m,c.row)||!editable(c.row,k)||saving.has(key)){toast('관리자 연결과 기록 상태를 확인해 주세요.');return false;}
  const d=drafts.get(key)||{values:{}};
  const baseline=c.row.recordValues[k]??'';
  if(String(value)===String(baseline))delete d.values[k];else d.values[k]=String(value);
  if(Object.keys(d.values).length)drafts.set(key,d);else drafts.delete(key);
  input.value=value;statuses.delete(key);updateRowState(key);GGFC.refreshUI();return true;
 }
 async function saveRow(key){
  const d=drafts.get(key),c=context(key);if(!d||!c||saving.has(key))return false;
  if(!writable()||!eligible(c.m,c.row)){toast('관리자 인증·연결·출전 명단을 확인해 주세요.');return false;}
  const values={};
  for(const [k,raw] of Object.entries(d.values)){
   if(!fields[k]||!editable(c.row,k)){toast('DB 기록이 변경되었습니다. 취소 후 현재 기록을 확인하세요.');return false;}
   const v=raw.trim()===''?null:Number(raw);
   if(v===null||!Number.isSafeInteger(v)||v<0){toast(fields[k]+'는 0 이상의 정수로 입력하세요.');return false;}
   values[k]=v;
  }
  if(!Object.keys(values).length)return false;
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
   saving.delete(key);statuses.set(key,shared?'공유 저장 완료':'기기에 보관 중 · 공유 저장 상태 확인');updateRowState(key);GGFC.refreshUI();
  }
  if(!shared)toast('보완 기록을 보관했습니다. 공유 저장 상태를 확인해 주세요.');
  return shared;
 }
 function cancel(key){if(saving.has(key))return;drafts.delete(key);statuses.delete(key);refreshMatchDetailRecords();GGFC.refreshUI();}
 function refreshPermissions(){
  if(!document.querySelector('#ggfcDetailDialog[open].detail-match-fullscreen'))return;
  if(String(signedIn())!==document.querySelector('#ggfcDetailBody [data-match-record-admin]')?.dataset.matchRecordAdmin)refreshMatchDetailRecords();
  for(const el of document.querySelectorAll('[data-match-record-row]')){
   const key=el.dataset.matchRecordRow;
   if(!GGFC.pending&&writable()&&statuses.has(key)&&!drafts.has(key)&&!saving.has(key))statuses.set(key,'공유 저장 완료');
   updateRowState(key);
  }
 }
 document.addEventListener('click',e=>{
  const el=e.target.closest('[data-match-record-row]');
  if(el&&e.target.closest('[data-match-count-step]')){
   const button=e.target.closest('[data-match-count-step]'),input=button.closest('.match-count-cell').querySelector('input'),current=input.value===''?0:Number(input.value),next=Math.max(0,current+Number(button.dataset.matchCountStep));
   if(Number.isSafeInteger(next))change(input,next);return;
  }
  if(el&&e.target.closest('[data-match-record-save]')){saveRow(el.dataset.matchRecordRow).catch(()=>toast('공유 저장 상태를 확인해 주세요.'));return;}
  if(el&&e.target.closest('[data-match-record-cancel]'))cancel(el.dataset.matchRecordRow);
 });
 document.addEventListener('input',e=>{if(e.target.matches('.match-count-cell input'))change(e.target,e.target.value);});
 document.addEventListener('change',e=>{
  if(!e.target.matches('[data-match-video-select]'))return;
  const player=e.target.closest('.match-video-dock').querySelector('.match-youtube-player'),html=matchYoutubeIframeHtml(e.target.value);
  if(player&&html)player.outerHTML=html;
 });
 return {rowActionsHtml,cellHtml,permissionMarkerHtml,saveRow,refreshPermissions,get dirty(){return drafts.size>0;},discard(){drafts.clear();statuses.clear();refreshMatchDetailRecords();},onDatabaseChanged(){refreshMatchDetailRecords();}};
})();
