/* Thumbnail-only authentication. Existing Firebase account IDs and data paths remain compatible. */
window.GGFCOperator=(()=>{
 'use strict';
 const q=id=>document.getElementById(id),copy=v=>JSON.parse(JSON.stringify(v));
 let account=null,accountReady=false,template=null,templateReady=false,revision=0,connected=false,accountError='',templateError='',user=null,verified=false,opAuth=null,opDB=null,mainDB=null,accountRef=null,templateRef=null,working=false,saving=false,loginBusy=false,signature='',started=false,checking=false,checkPromise=null,messageText='',messageBad=false;
 const listeners={};
 const isAdmin=()=>typeof admin!=='undefined'&&admin&&GGFC.authorized&&window.GGFC_MEMBER_PREVIEW!==true;
 const active=()=>window.GGFC_MEMBER_PREVIEW!==true&&verified&&!!user&&account?.enabled===true&&account.uid===user.uid&&account.email===user.email;
 const canUse=()=>isAdmin()||active();
 const canEdit=()=>canUse()&&connected&&templateReady&&!templateError&&!saving&&navigator.onLine!==false&&(isAdmin()?GGFC.canEdit():accountReady&&!accountError);
 const setupMessage='Firebase 운영진 권한 규칙이 없거나 접근이 거절되었습니다. 아래 ‘권한 규칙 안내’에 따라 게시한 뒤 ‘연결 다시 확인’을 누르세요.';
 const permissionError=e=>/permission|unauthorized/i.test(String(e?.code||'')+' '+String(e?.message||''));
 const connectionError=e=>permissionError(e)?setupMessage:e?.code==='ggfc/timeout'?'서버 응답이 늦습니다. 인터넷 연결을 확인한 뒤 연결 다시 확인을 누르세요.':'서버 연결을 확인한 뒤 연결 다시 확인을 누르세요.';
 function message(text,bad=false){messageText=text;messageBad=bad;const el=q('ytOperatorStatus');if(el){el.textContent=text;el.classList.toggle('is-error',bad);}}
 function notifyTemplate(){window.GGFCThumbnail?.sharedChanged();}
 function acceptAccount(value){const was=active();account=value;accountReady=true;accountError='';if(was&&!active()){if(!isAdmin())window.GGFCThumbnail?.discard();opAuth?.signOut().catch(()=>{});toast('운영진 비밀번호 또는 권한이 변경되어 로그아웃했습니다.');}}
 function acceptTemplate(value){const next=value?.template||null,nextRevision=Number(value?.revision)||0,changed=JSON.stringify(template)!==JSON.stringify(next)||revision!==nextRevision;template=next;revision=nextRevision;templateReady=true;templateError='';if(changed)notifyTemplate();}
 function watch(kind,ref){
  if(listeners[kind])ref.off?.('value',listeners[kind]);
  const callback=snap=>{if(kind==='account')acceptAccount(snap.val());else acceptTemplate(snap.val());refreshUI();};listeners[kind]=callback;
  ref.on('value',callback,e=>{if(kind==='account'){accountReady=false;accountError=connectionError(e);}else{templateReady=false;templateError=connectionError(e);}refreshUI();});
 }
 function syncSettings(root){
  if(!root?.querySelector('#ytOperatorForm'))return;
  q('ytOperatorState').textContent=!accountReady?'운영진 계정 연결 확인 필요':account?.enabled?'운영진 로그인 사용 중':'운영진 로그인 미설정 또는 중지';
  q('ytOperatorConnection').textContent=checking?'연결과 권한을 확인하고 있습니다…':!connected?'공유 서버 연결을 확인하세요.':accountError||(accountReady?'운영진 계정 연결 정상':'운영진 계정 연결 확인 중…');
  q('ytOperatorTemplateConnection').textContent=templateError?'썸네일 연결 확인 필요: '+templateError:templateReady?'썸네일 연결 정상':'썸네일 연결 확인 중…';
  // Refresh controls in place, including while either password field has focus.
  q('ytOperatorSet').disabled=working||!isAdmin();q('ytOperatorDisable').disabled=working||!isAdmin()||(accountReady&&!account?.enabled);
  q('ytOperatorRetry').disabled=working||checking||!isAdmin();
  for(const id of ['ytOperatorNewPassword','ytOperatorConfirmPassword'])q(id).disabled=working;
  q('ytOperatorForm').setAttribute('aria-busy',String(working));message(messageText,messageBad);
 }
 function refreshUI(){
  if(!started&&window.firebase?.apps?.length){start();return;}
  const op=active(),allowed=canUse(),btn=q('operatorLoginBtn');if(btn){btn.textContent=op?'운영진 로그아웃':'운영진 로그인';btn.hidden=isAdmin();}
  const badge=q('operatorModeBadge');if(badge)badge.hidden=!op||isAdmin();
  const next=JSON.stringify([op,isAdmin(),allowed,accountReady,templateReady,connected,accountError,templateError,account?.uid,account?.enabled,working,saving,checking]);
  const changed=next!==signature;signature=next;
  if(changed&&typeof syncMenuNavigation==='function'){
   syncMenuNavigation();if(typeof activeView!=='undefined'&&activeView==='thumbnail'&&!allowed){window.GGFCThumbnail?.discard();goTab(menuFallbackView());}
  }
  if(changed)window.GGFCThumbnail?.syncOverview();
  const panel=q('ytOperatorSettings');if(panel){panel.hidden=!isAdmin();if(isAdmin())renderSettings(panel);else for(const id of ['ytOperatorNewPassword','ytOperatorConfirmPassword'])if(q(id))q(id).value='';}
  const notice=q('ytAccessNotice');if(notice){notice.hidden=!!(connected&&templateReady&&!templateError);notice.textContent=templateError||'썸네일 공유 서버에 연결하고 있습니다. 연결 후 설정을 저장할 수 있습니다.';}
 }
 async function onOperator(next){
  const was=active();user=next;verified=false;
  if(next){try{const token=await next.getIdTokenResult();if(user===next)verified=token.claims?.firebase?.sign_in_provider==='password';}catch{verified=false;}}
  if(was&&!active()&&!isAdmin()){window.GGFCThumbnail?.discard();toast('운영진 권한이 종료되었습니다.');}refreshUI();
 }
 function start(){
  if(started)return true;if(!window.firebase?.apps?.length||!firebase.auth||!firebase.database)return false;
  try{
   started=true;const primary=firebase.app();mainDB=primary.database();
   const secondary=firebase.apps.find(a=>a.name==='GGFCThumbnailOperator')||firebase.initializeApp(window.GGFC_CONFIG||{},'GGFCThumbnailOperator');opAuth=secondary.auth();opDB=secondary.database();opAuth.onIdTokenChanged(onOperator);
   mainDB.ref('.info/connected').on('value',snap=>{connected=snap.val()===true;refreshUI();});
   accountRef=mainDB.ref('ggfc/thumbnailAccess');templateRef=mainDB.ref('ggfc/thumbnailTemplate');watch('account',accountRef);watch('template',templateRef);return true;
  }catch{started=false;accountError='운영진 서버 연결을 확인하세요.';templateError=accountError;return false;}
 }
 async function timedRead(ref){let timer;try{return await Promise.race([ref.get(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(Error('timeout'),{code:'ggfc/timeout'})),10000);})]);}finally{clearTimeout(timer);}}
 async function checkConnection(){
  if(checkPromise)return checkPromise;
  if(navigator.onLine===false){accountReady=false;accountError='오프라인입니다. 인터넷 연결 후 다시 확인하세요.';refreshUI();return {account:false,template:false};}
  if(!start()||!accountRef||!templateRef){message('공유 서버 초기화 후 다시 시도하세요.',true);return {account:false,template:false};}
  checking=true;refreshUI();
  checkPromise=(async()=>{
   try{const results=await Promise.allSettled([timedRead(accountRef),timedRead(templateRef)]);
    if(results[0].status==='fulfilled')acceptAccount(results[0].value.val());else{accountReady=false;accountError=connectionError(results[0].reason);}
    if(results[1].status==='fulfilled')acceptTemplate(results[1].value.val());else{templateReady=false;templateError=connectionError(results[1].reason);}
    // A denied Firebase listener is cancelled. Explicitly attach fresh listeners after a rules update.
    watch('account',accountRef);watch('template',templateRef);return {account:accountReady,template:templateReady};
   }finally{checking=false;checkPromise=null;refreshUI();}
  })();return checkPromise;
 }
 function clearLogin(){const input=q('operatorPassword');if(input){input.value='';input.type='password';}const err=q('operatorLoginError');if(err)err.textContent='';}
 async function login(){
  if(loginBusy)return;const password=q('operatorPassword').value;q('operatorPassword').value='';if(!password){q('operatorLoginError').textContent='운영진 비밀번호를 입력하세요.';return;}
  loginBusy=true;q('operatorLoginOk').disabled=true;q('operatorLoginCancel').disabled=true;q('operatorLoginError').textContent='확인 중…';
  try{
   if(!start()||!opAuth)throw Error('공유 서버 연결 후 다시 시도하세요.');if(!accountReady||accountError)await checkConnection();
   if(!accountReady||accountError)throw Error(accountError||'운영진 권한 연결을 확인하세요.');if(!account?.enabled||!account.email)throw Error('관리자가 운영진 비밀번호를 먼저 설정해야 합니다.');
   await opAuth.setPersistence(firebase.auth.Auth.Persistence.SESSION);const result=await opAuth.signInWithEmailAndPassword(account.email,password);await onOperator(result.user);
   if(!active()){await opAuth.signOut();throw Error('권한을 확인하지 못했습니다. 관리자에게 운영진 설정을 확인해 주세요.');}
   q('operatorLoginDialog').close();clearLogin();goTab('thumbnail');toast('운영진 로그인 · 썸네일 편집과 다운로드를 사용할 수 있습니다.');
  }catch(e){const code=String(e.code||'');q('operatorLoginError').textContent=code.includes('too-many')?'로그인 시도가 많습니다. 잠시 후 다시 시도하세요.':code.includes('network')?'인터넷 연결을 확인하세요.':code.startsWith('auth/')?'운영진 비밀번호를 확인하세요.':e.message;}
  finally{loginBusy=false;q('operatorLoginOk').disabled=false;q('operatorLoginCancel').disabled=false;}
 }
 async function logout(){if(saving){toast('썸네일 저장 완료 후 로그아웃하세요.');return;}if(window.GGFCThumbnail?.dirty&&!confirm('저장하지 않은 썸네일 배치를 버리고 로그아웃할까요?'))return;window.GGFCThumbnail?.discard();await opAuth?.signOut();user=null;verified=false;refreshUI();GGFC.refreshUI();toast('운영진 로그아웃');}
 function renderSettings(root){
  if(!root||!isAdmin())return;root.hidden=false;
  if(!root.querySelector('#ytOperatorForm')){
   root.innerHTML=`<section class="card yt-operator-card"><h3>운영진 로그인 설정 · 관리자 전용</h3><p>운영진은 썸네일 편집·저장과 개별·전체 다운로드를 사용할 수 있습니다. 경기 기록과 다른 관리자 메뉴는 수정할 수 없습니다.</p><p id="ytOperatorState"></p><p id="ytOperatorConnection" role="status"></p><p id="ytOperatorTemplateConnection"></p><form id="ytOperatorForm" aria-busy="false"><label>새 운영진 비밀번호<input id="ytOperatorNewPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" placeholder="8자 이상" required></label><label>비밀번호 확인<input id="ytOperatorConfirmPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></label><div class="yt-actions"><button type="submit" class="btn primary" id="ytOperatorSet">비밀번호 설정·변경</button><button type="button" class="btn" id="ytOperatorDisable">운영진 로그인 중지</button></div></form><div class="yt-actions" style="margin-top:10px"><button type="button" class="btn" id="ytOperatorRetry">연결 다시 확인</button><button type="button" class="btn" id="ytOperatorSetup">권한 규칙 안내</button></div><p>비밀번호 변경·중지 시 이전 운영진 권한은 종료됩니다. 비밀번호는 기록 DB에 저장하지 않습니다.</p><p id="ytOperatorStatus" class="yt-status" role="status" aria-live="polite"></p></section>`;
   q('ytOperatorForm').onsubmit=e=>{e.preventDefault();provision();};q('ytOperatorDisable').onclick=disable;
   q('ytOperatorRetry').onclick=async()=>{message('연결을 확인하고 있습니다…');const r=await checkConnection();message(r.account?(r.template?'운영진·썸네일 연결 정상':'운영진 계정 연결 정상 · 썸네일 권한도 확인하세요.'):accountError||'연결을 확인하세요.',!r.account);};
   q('ytOperatorSetup').onclick=()=>{if(isAdmin())q('operatorSetupDialog')?.showModal();};
  }
  syncSettings(root);
 }
 async function provision(){
  if(working)return;if(!isAdmin()||!GGFC.canEdit()){message('관리자 인증과 공유 서버 연결을 확인하세요.',true);return;}
  const password=q('ytOperatorNewPassword').value,confirmation=q('ytOperatorConfirmPassword').value;
  if(password.length<8||password.length>128){message('비밀번호는 8~128자로 입력하세요.',true);return;}if(password!==confirmation){message('비밀번호 확인이 일치하지 않습니다.',true);return;}
  working=true;refreshUI();message('연결 확인 및 운영진 비밀번호 설정 중…');let created=null,committed=false,provisionApp=null,failure='';
  try{
   await checkConnection();if(!accountReady||accountError)throw Error(accountError||'운영진 계정 연결을 확인하세요.');if(!connected||navigator.onLine===false)throw Error('공유 서버에 연결한 뒤 다시 시도하세요.');
   // Template permission failures must not block an otherwise-authorized account/password change.
   const expected=Number(account?.revision)||0,bytes=crypto.getRandomValues(new Uint8Array(16)),email='ggfc-thumbnail-'+Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')+'@example.com';
   if(!isAdmin()||!GGFC.canEdit())throw Error('관리자 연결을 확인하세요.');
   provisionApp=firebase.initializeApp(window.GGFC_CONFIG,'GGFCThumbnailProvision-'+Date.now()+'-'+email.slice(15,23));const auth=provisionApp.auth();await auth.setPersistence(firebase.auth.Auth.Persistence.NONE);
   created=(await auth.createUserWithEmailAndPassword(email,password)).user;
   if(!isAdmin()||!GGFC.canEdit())throw Error('관리자 인증이 변경되었습니다. 다시 로그인하세요.');
   const result=await accountRef.transaction(current=>(Number(current?.revision)||0)!==expected?undefined:{enabled:true,uid:created.uid,email,revision:expected+1,changedAt:firebase.database.ServerValue.TIMESTAMP},undefined,false);
   if(!result.committed)throw Error('다른 관리자가 운영진 설정을 변경했습니다. 다시 확인 후 저장하세요.');committed=true;acceptAccount(result.snapshot.val());
  }catch(e){failure=permissionError(e)?setupMessage:e.code==='auth/operation-not-allowed'?'Firebase Authentication의 이메일/비밀번호 사용 설정과 계정 생성 허용을 확인하세요.':e.code==='auth/too-many-requests'?'요청이 많습니다. 잠시 후 다시 시도하세요.':['auth/weak-password','auth/password-does-not-meet-requirements'].includes(e.code)?'Firebase 비밀번호 정책을 충족하는 비밀번호로 다시 시도하세요.':e.code==='auth/network-request-failed'?'인터넷 연결을 확인한 뒤 다시 시도하세요.':e.message;}
  finally{
   if(created&&!committed)await created.delete().catch(()=>{});if(provisionApp){await provisionApp.auth().signOut().catch(()=>{});await provisionApp.delete().catch(()=>{});}
   working=false;refreshUI();GGFC.refreshUI();if(committed){q('ytOperatorNewPassword')&&(q('ytOperatorNewPassword').value='');q('ytOperatorConfirmPassword')&&(q('ytOperatorConfirmPassword').value='');}
   message(committed?'운영진 비밀번호 공유 저장 완료 · 이전 비밀번호의 권한은 종료되었습니다.':failure,!committed);
  }
 }
 async function disable(){
  if(working)return;if(!isAdmin()||!GGFC.canEdit()){message('관리자 인증과 서버 연결을 확인하세요.',true);return;}
  working=true;refreshUI();let failure='';
  try{await checkConnection();if(!accountReady||accountError)throw Error(accountError||'운영진 계정 연결을 확인하세요.');if(!account?.enabled)throw Error('현재 운영진 로그인이 사용 중이 아닙니다.');const expected=Number(account.revision)||0;
   const r=await accountRef.transaction(current=>!current||(Number(current.revision)||0)!==expected?undefined:{...current,enabled:false,revision:expected+1,changedAt:firebase.database.ServerValue.TIMESTAMP},undefined,false);if(!r.committed)throw Error('운영진 설정이 변경되었습니다. 다시 시도하세요.');acceptAccount(r.snapshot.val());
  }catch(e){failure=permissionError(e)?setupMessage:e.message;}finally{working=false;refreshUI();GGFC.refreshUI();message(failure||'운영진 로그인을 중지했습니다.',!!failure);}
 }
 async function saveTemplate(value,expected){
  if(!canEdit())throw Error(templateError||'로그인과 썸네일 서버 연결을 확인하세요.');saving=true;refreshUI();
  try{const auth=isAdmin()?firebase.app().auth():opAuth,uid=auth.currentUser?.uid;if(!uid)throw Error('다시 로그인하세요.');const ref=(isAdmin()?mainDB:opDB).ref('ggfc/thumbnailTemplate');await ref.get();
   const result=await ref.transaction(current=>(Number(current?.revision)||0)!==expected?undefined:{template:copy(value),revision:expected+1,updatedBy:uid,savedAt:firebase.database.ServerValue.TIMESTAMP},undefined,false);
   if(!result.committed)throw Error('다른 사용자가 썸네일을 저장했습니다. 미리보기 PNG를 보관한 뒤 저장값을 다시 불러와 편집하세요.');const v=result.snapshot.val();template=v.template;revision=Number(v.revision)||0;return revision;
  }catch(e){if(permissionError(e))throw Error(setupMessage);throw e;}finally{saving=false;refreshUI();}
 }
 q('operatorLoginBtn').onclick=()=>{if(active()){logout().catch(()=>toast('다시 시도하세요.'));return;}clearLogin();q('operatorLoginDialog').showModal();q('operatorPassword').focus();};
 q('operatorLoginForm').onsubmit=e=>{e.preventDefault();login();};q('operatorLoginCancel').onclick=()=>{if(!loginBusy){q('operatorLoginDialog').close();clearLogin();}};
 q('operatorLoginDialog').addEventListener('cancel',e=>{if(loginBusy)e.preventDefault();else clearLogin();});q('operatorSetupClose')?.addEventListener('click',()=>q('operatorSetupDialog').close());
 window.addEventListener('online',()=>{refreshUI();if(started)checkConnection();});window.addEventListener('offline',refreshUI);
 window.addEventListener('pagehide',()=>{for(const id of ['ytOperatorNewPassword','ytOperatorConfirmPassword'])if(q(id))q(id).value='';});
 let attempts=0;const boot=()=>{if(start()||++attempts>=90)return;setTimeout(boot,500);};boot();refreshUI();
 return {start,refreshUI,renderSettings,saveTemplate,canUse,canEdit,logout,checkConnection,get active(){return active();},get template(){return template?copy(template):null;},get revision(){return revision;},get ready(){return templateReady;},get pending(){return saving||working;}};
})();
