/* Thumbnail-only authentication. The original administrator session and record writer are unchanged. */
window.GGFCOperator=(()=>{
 'use strict';
 const q=id=>document.getElementById(id),copy=v=>JSON.parse(JSON.stringify(v));
 let account=null,accountReady=false,template=null,templateReady=false,revision=0,connected=false,error='',accountError='',templateError='',user=null,verified=false,opAuth=null,opDB=null,mainDB=null,accountRef=null,templateRef=null,working=false,saving=false,loginBusy=false,signature='',started=false;
 const isAdmin=()=>typeof admin!=='undefined'&&admin&&GGFC.authorized&&window.GGFC_MEMBER_PREVIEW!==true;
 const active=()=>window.GGFC_MEMBER_PREVIEW!==true&&verified&&!!user&&account?.enabled===true&&account.uid===user.uid&&account.email===user.email;
 const canUse=()=>isAdmin()||active();
 const canEdit=()=>canUse()&&connected&&accountReady&&templateReady&&!error&&!saving&&navigator.onLine!==false&&(isAdmin()?GGFC.canEdit():true);
 const setupMessage='운영자 권한 규칙을 적용한 뒤 앱을 새로고침하세요. 적용 안내의 Firebase 규칙 설정을 확인하세요.';
 function message(text,bad=false){const el=q('ytOperatorStatus');if(el){el.textContent=text;el.classList.toggle('is-error',bad);}}
 function notifyTemplate(){window.GGFCThumbnail?.sharedChanged();}
 function refreshUI(){
  if(!started&&window.firebase?.apps?.length){start();return;}
  const op=active(),allowed=canUse(),btn=q('operatorLoginBtn');
  if(btn){btn.textContent=op?'운영자 로그아웃':'운영자 로그인';btn.hidden=isAdmin();}
  const badge=q('operatorModeBadge');if(badge)badge.hidden=!op||isAdmin();
  const next=JSON.stringify([op,isAdmin(),allowed,accountReady,templateReady,connected,error,account?.uid,account?.enabled,working,saving]);
  if(next===signature)return;signature=next;
  if(typeof syncMenuNavigation==='function'){
   syncMenuNavigation();
   if(typeof activeView!=='undefined'&&activeView==='thumbnail'&&!allowed){window.GGFCThumbnail?.discard();goTab(menuFallbackView());}
  }
  window.GGFCThumbnail?.syncOverview();
  const panel=q('ytOperatorSettings');if(panel&&isAdmin())renderSettings(panel);
  const notice=q('ytAccessNotice');if(notice){notice.hidden=!error&&!(!connected||!templateReady);notice.textContent=error||'썸네일 공유 서버에 연결하고 있습니다. 연결 후 설정을 저장할 수 있습니다.';}
 }
 async function onOperator(next){
  const was=active();user=next;verified=false;
  if(next){try{const token=await next.getIdTokenResult();if(user===next)verified=token.claims?.firebase?.sign_in_provider==='password';}catch{verified=false;}}
  if(was&&!active()&&!isAdmin()){window.GGFCThumbnail?.discard();toast('운영자 권한이 종료되었습니다.');}
  refreshUI();
 }
 function start(){
  if(started)return true;const config=window.GGFC_CONFIG||{};
  if(!window.firebase?.apps?.length||!firebase.auth||!firebase.database)return false;
  started=true;
  try{
   const primary=firebase.app();mainDB=primary.database();
   const secondary=firebase.apps.find(a=>a.name==='GGFCThumbnailOperator')||firebase.initializeApp(config,'GGFCThumbnailOperator');opAuth=secondary.auth();opDB=secondary.database();
   opAuth.onIdTokenChanged(onOperator);
   mainDB.ref('.info/connected').on('value',snap=>{connected=snap.val()===true;refreshUI();});
   accountRef=mainDB.ref('ggfc/thumbnailAccess');templateRef=mainDB.ref('ggfc/thumbnailTemplate');
   accountRef.on('value',snap=>{
    const was=active();account=snap.val();accountReady=true;accountError='';error=templateError;
    if(was&&!active()){if(!isAdmin())window.GGFCThumbnail?.discard();opAuth.signOut().catch(()=>{});toast('운영자 비밀번호 또는 권한이 변경되어 로그아웃했습니다.');}
    refreshUI();
   },()=>{accountReady=false;accountError=setupMessage;error=setupMessage;refreshUI();});
   templateRef.on('value',snap=>{const value=snap.val();template=value?.template||null;revision=Number(value?.revision)||0;templateReady=true;templateError='';error=accountError;notifyTemplate();refreshUI();},()=>{templateReady=false;templateError=setupMessage;error=setupMessage;refreshUI();});
   return true;
  }catch{error='썸네일 서버 연결을 확인해 주세요.';refreshUI();return false;}
 }
 function clearLogin(){const input=q('operatorPassword');if(input){input.value='';input.type='password';}const err=q('operatorLoginError');if(err)err.textContent='';}
 async function login(){
  if(loginBusy)return;if(!start()&&!opAuth){q('operatorLoginError').textContent='공유 서버 연결 후 다시 시도해 주세요.';return;}
  const field=q('operatorPassword'),password=field.value;field.value='';
  if(!accountReady||!account?.enabled||!account.email){q('operatorLoginError').textContent=error||'관리자가 운영자 비밀번호를 먼저 설정해야 합니다.';return;}
  if(!password){q('operatorLoginError').textContent='운영자 비밀번호를 입력해 주세요.';return;}
  loginBusy=true;q('operatorLoginOk').disabled=true;q('operatorLoginCancel').disabled=true;q('operatorLoginError').textContent='확인 중…';
  try{
   await opAuth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
   const result=await opAuth.signInWithEmailAndPassword(account.email,password);await onOperator(result.user);
   if(!active()){await opAuth.signOut();throw Error('권한을 확인하지 못했습니다. 관리자에게 운영자 설정을 확인해 주세요.');}
   q('operatorLoginDialog').close();clearLogin();goTab('thumbnail');toast('운영자 로그인 · 썸네일 편집과 다운로드를 사용할 수 있습니다.');
  }catch(e){const code=String(e.code||'');q('operatorLoginError').textContent=code.includes('too-many')?'로그인 시도가 많습니다. 잠시 후 다시 시도하세요.':code.includes('network')?'인터넷 연결을 확인하세요.':code.startsWith('auth/')?'운영자 비밀번호를 확인해 주세요.':e.message;}
  finally{loginBusy=false;q('operatorLoginOk').disabled=false;q('operatorLoginCancel').disabled=false;}
 }
 async function logout(){
  if(saving){toast('썸네일 저장 완료 후 로그아웃하세요.');return;}
  if(window.GGFCThumbnail?.dirty&&!confirm('저장하지 않은 썸네일 배치를 버리고 로그아웃할까요?'))return;
  window.GGFCThumbnail?.discard();await opAuth?.signOut();user=null;verified=false;refreshUI();GGFC.refreshUI();toast('운영자 로그아웃');
 }
 function bind(){
  q('operatorLoginBtn').onclick=()=>{if(active()){logout().catch(()=>toast('다시 시도해 주세요.'));return;}clearLogin();q('operatorLoginDialog').showModal();q('operatorPassword').focus();};
  q('operatorLoginForm').onsubmit=e=>{e.preventDefault();login();};
  q('operatorLoginCancel').onclick=()=>{if(!loginBusy){q('operatorLoginDialog').close();clearLogin();}};
  q('operatorLoginDialog').addEventListener('cancel',e=>{if(loginBusy)e.preventDefault();else clearLogin();});
  window.addEventListener('online',refreshUI);window.addEventListener('offline',refreshUI);
 }
 function renderSettings(root){
  if(!root||!isAdmin())return;const focused=root.contains(document.activeElement);if(focused)return;
  root.innerHTML=`<section class="card yt-operator-card"><h3>운영자 로그인 설정 · 관리자 전용</h3><p>운영자는 썸네일 편집·저장과 개별·전체 다운로드만 사용할 수 있습니다. 경기 기록과 다른 관리자 메뉴는 수정할 수 없습니다.</p><p>${error||(!accountReady?'연결 확인 중…':account?.enabled?'운영자 로그인 사용 중':'운영자 로그인 미설정 또는 중지')}</p><form id="ytOperatorForm"><label>새 운영자 비밀번호<input id="ytOperatorNewPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" placeholder="8자 이상"></label><label>비밀번호 확인<input id="ytOperatorConfirmPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128"></label><div class="yt-actions"><button type="submit" class="btn primary" id="ytOperatorSet">비밀번호 설정·변경</button><button type="button" class="btn" id="ytOperatorDisable">운영자 로그인 중지</button></div></form><p>변경한 비밀번호는 공유한 운영자에게 별도로 알려주세요. 변경·중지 시 이전 운영자 권한은 종료됩니다. 비밀번호는 기록 DB에 저장하지 않습니다.</p><p id="ytOperatorStatus" class="yt-status" role="status"></p></section>`;
  q('ytOperatorSet').disabled=working||!connected||!accountReady||!!error;q('ytOperatorDisable').disabled=working||!account?.enabled||!connected||!!error;
  q('ytOperatorForm').onsubmit=e=>{e.preventDefault();provision();};q('ytOperatorDisable').onclick=disable;
 }
 async function provision(){
  if(working||!isAdmin()||!GGFC.canEdit()||!connected||!accountReady||error)return;
  const p=q('ytOperatorNewPassword'),c=q('ytOperatorConfirmPassword'),password=p.value;
  if(password.length<8||password.length>128){message('비밀번호는 8~128자로 입력하세요.',true);return;}
  if(password!==c.value){message('비밀번호 확인이 일치하지 않습니다.',true);return;}
  p.value='';c.value='';working=true;message('운영자 비밀번호를 설정하고 있습니다…');
  let created=null,committed=false,provisionApp=null,failure='';
  const expected=Number(account?.revision)||0;
  try{
   if(!(await accountRef.get()).exists()&&account?.uid)throw Error('운영자 설정이 변경되었습니다. 새로 불러온 후 다시 시도하세요.');
   const bytes=crypto.getRandomValues(new Uint8Array(16)),email='ggfc-thumbnail-'+Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')+'@example.com';
   provisionApp=firebase.initializeApp(window.GGFC_CONFIG,'GGFCThumbnailProvision-'+Date.now());const auth=provisionApp.auth();await auth.setPersistence(firebase.auth.Auth.Persistence.NONE);
   created=(await auth.createUserWithEmailAndPassword(email,password)).user;
   if(!isAdmin()||!GGFC.canEdit())throw Error('관리자 연결을 확인한 뒤 다시 설정하세요.');
   const result=await accountRef.transaction(current=>(Number(current?.revision)||0)!==expected?undefined:{enabled:true,uid:created.uid,email,revision:expected+1,changedAt:firebase.database.ServerValue.TIMESTAMP},undefined,false);
   if(!result.committed)throw Error('다른 관리자가 운영자 설정을 변경했습니다. 다시 시도하세요.');
   committed=true;account=result.snapshot.val();message('운영자 비밀번호 설정 완료 · 이전 비밀번호의 권한은 종료되었습니다.');
  }catch(e){failure=String(e.code||'').toLowerCase().includes('permission')?setupMessage:e.code==='auth/operation-not-allowed'?'Firebase 이메일/비밀번호 로그인의 계정 만들기 허용 설정을 확인하세요.':e.code==='auth/too-many-requests'?'요청이 많습니다. 잠시 후 다시 시도하세요.':e.message;}
  finally{if(created&&!committed)await created.delete().catch(()=>{});if(provisionApp){await provisionApp.auth().signOut().catch(()=>{});await provisionApp.delete().catch(()=>{});}working=false;signature='';refreshUI();message(committed?'운영자 비밀번호 설정 완료 · 이전 비밀번호의 권한은 종료되었습니다.':failure,!committed);}
 }
 async function disable(){
  if(working||!isAdmin()||!GGFC.canEdit()||!account?.enabled)return;
  working=true;const expected=Number(account.revision)||0;let failure='';
  try{const r=await accountRef.transaction(current=>!current||(Number(current.revision)||0)!==expected?undefined:{...current,enabled:false,revision:expected+1,changedAt:firebase.database.ServerValue.TIMESTAMP},undefined,false);if(!r.committed)throw Error('운영자 설정이 변경되었습니다. 다시 시도하세요.');account=r.snapshot.val();message('운영자 로그인을 중지했습니다.');}
  catch(e){failure=e.message;}finally{working=false;signature='';refreshUI();message(failure||'운영자 로그인을 중지했습니다.',!!failure);}
 }
 async function saveTemplate(value,expected){
  if(!canEdit())throw Error(error||'로그인과 서버 연결을 확인해 주세요.');saving=true;refreshUI();
  try{
   const auth=isAdmin()?firebase.app().auth():opAuth,uid=auth.currentUser?.uid;if(!uid)throw Error('다시 로그인해 주세요.');
   const ref=(isAdmin()?mainDB:opDB).ref('ggfc/thumbnailTemplate');
   // A secondary Firebase app has its own local cache; load it before comparing revisions in a transaction.
   await ref.get();
   const result=await ref.transaction(current=>{
    if((Number(current?.revision)||0)!==expected)return undefined;
    return {template:copy(value),revision:expected+1,updatedBy:uid,savedAt:firebase.database.ServerValue.TIMESTAMP};
   },undefined,false);
   if(!result.committed)throw Error('다른 사용자가 썸네일을 저장했습니다. 미리보기 PNG를 보관한 뒤 저장값을 다시 불러와 편집하세요.');
   const resultValue=result.snapshot.val();template=resultValue.template;revision=Number(resultValue.revision)||0;return revision;
  }catch(e){if(String(e.code||'').toLowerCase().includes('permission'))throw Error(setupMessage);throw e;}
  finally{saving=false;refreshUI();}
 }
 bind();let attempts=0;const boot=()=>{if(start()||++attempts>=90)return;setTimeout(boot,500);};boot();refreshUI();
 return {start,refreshUI,renderSettings,saveTemplate,canUse,canEdit,logout,get active(){return active();},get template(){return template?copy(template):null;},get revision(){return revision;},get ready(){return templateReady;},get pending(){return saving||working;}};
})();
