/* GGFC 3.18.4: One password field; server-side Firebase password verification. */
const GGFC = (() => {
  const ADMIN_LOGIN_ID='ggfc-admin@example.com';
  let loginBusy=false;
  const state={ready:false,serverSeen:false,connected:false,authorized:false,user:null,revision:0,dirty:false,saving:false,busy:0,conflict:false,serial:0,latest:null,hasLatest:false,error:'',status:'공유 기록을 확인하고 있습니다…',savedAt:null,authGeneration:0};
  let database=null,auth=null,dataRef=null,readTimer=null,saveTimer=null,editLease=false;
  const hasSettingsDraft=()=>!!((typeof careerFrameSettingsDirty!=='undefined'&&careerFrameSettingsDirty)||(typeof analysisStartSettingsDirty!=='undefined'&&analysisStartSettingsDirty));
  function discardSettingsDraft(){if(typeof careerFrameSettingsDirty!=='undefined')careerFrameSettingsDirty=false;if(typeof analysisStartSettingsDirty!=='undefined')analysisStartSettingsDirty=false;}
  const fields=['matches','attendance','goals','saves','fouls','moms','specials','roster','soccerbee'];
  const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
  const copy=v=>JSON.parse(JSON.stringify(v));
  function safeObject(v){
    if(!v || typeof v!=='object' || Array.isArray(v))return false;
    return true;
  }
  function inspect(v){
    if(!v || typeof v!=='object')return;
    Object.keys(v).forEach(k=>{if(['__proto__','prototype','constructor'].includes(k))throw new Error('허용되지 않는 데이터 키입니다.');inspect(v[k]);});
  }
  function normalizeDB(raw,strict=false){
    if(!safeObject(raw))throw new Error('기록 데이터는 JSON 객체여야 합니다.');
    inspect(raw);
    if(strict && (!own(raw,'matches')||!own(raw,'roster')))throw new Error('GGFC JSON 내보내기 파일을 선택해 주세요.');
    const result={};
    for(const k of fields){
      let v=raw[k];
      if(v==null)v=[];
      if(!Array.isArray(v)){
        if(safeObject(v)&&Object.keys(v).every(x=>/^\d+$/.test(x)))v=Object.keys(v).sort((a,b)=>+a-+b).map(x=>v[x]);
        else throw new Error(k+' 목록 형식이 올바르지 않습니다.');
      }
      if(v.length>100000 || v.some(x=>x!=null&&!safeObject(x)))throw new Error(k+' 목록을 확인해 주세요.');
      result[k]=v.filter(x=>x!=null).map(copy);
    }
    if(raw.settings!=null&&!safeObject(raw.settings))throw new Error('설정 형식이 올바르지 않습니다.');
    result.settings=copy(raw.settings||{});
    return result;
  }
  function transformKeys(value,decode=false){
    if(Array.isArray(value))return value.map(v=>transformKeys(v,decode));
    if(!safeObject(value))return value;
    const result={};
    for(const [key,v] of Object.entries(value)){
      let k=key;
      if(decode && k.startsWith('~')){
        try {const bytes=Uint8Array.from(atob(k.slice(1).replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));k=new TextDecoder().decode(bytes);}catch(e){throw new Error('공유 데이터 키를 읽을 수 없습니다.');}
      } else if(!decode && (k.startsWith('~')||/[.#$\[\]\/\u0000-\u001F\u007F]/.test(k))){
        k='~'+btoa(String.fromCharCode(...new TextEncoder().encode(k))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
      }
      if(['__proto__','prototype','constructor'].includes(k))throw new Error('허용되지 않는 데이터 키입니다.');
      result[k]=transformKeys(v,decode);
    }
    return result;
  }
  function merge(raw){
    if(!raw)return normalizeDB({});
    const value=raw.meta?.keyEncoding==='base64url-v1'?transformKeys(raw,true):raw;
    return normalizeDB({...value.records,...value.players,settings:value.settings||{}});
  }
  function split(data,revision,uid,timestamp){
    const clean=normalizeDB(data),records={},players={};
    fields.forEach(k=>(['roster','soccerbee'].includes(k)?players:records)[k]=clean[k]);
    const encoded=transformKeys({records,players,settings:clean.settings});
    // The reserved Firebase .sv sentinel must reach the SDK unchanged.
    encoded.meta={version:'3.18.4',revision,updatedBy:uid,savedAt:timestamp,keyEncoding:'base64url-v1'};
    return encoded;
  }
  function cacheKey(){return 'ggfc-v318-public:'+String((window.GGFC_CONFIG||{}).databaseURL||'');}
  function canEdit(){return state.authorized && state.ready && state.serverSeen && state.connected && !state.conflict && !state.error;}
  function refreshUI(){
    const box=document.querySelector('#cloudStatus'),line=document.querySelector('#cloudStatusText');
    if(!box||!line)return;
    let message=state.status;
    if(state.error)message=state.error;
    else if(state.conflict)message='다른 관리자의 수정이 있습니다. 미저장 내용을 내려받은 뒤 서버 기록을 다시 받아 주세요.';
    else if(state.saving)message='회원에게 공유 저장 중… 완료 표시 후 닫아 주세요.';
    else if(state.dirty)message='아직 공유되지 않은 변경이 있습니다. 서버 연결 후 저장을 다시 시도해 주세요.';
    else if(state.ready&&!state.connected)message='연결 끊김 · 마지막으로 받은 기록입니다. 다시 연결되면 자동 갱신합니다.';
    box.dataset.state=(state.error||state.conflict)?'error':(state.dirty||!state.connected)?'pending':'ready';
    line.textContent=message;
    const show=(id,v)=>{const el=document.querySelector(id);if(el)el.hidden=!v;};
    show('#cloudRetry',state.dirty && !state.saving && !state.conflict && state.authorized);
    show('#cloudDownload',state.dirty||editLease||hasSettingsDraft());show('#cloudReload',state.conflict||!!state.error);
    const login=document.querySelector('#memberLogin');if(login)login.textContent=state.user?'로그아웃':'관리자 로그인';
    document.querySelectorAll('.member-admin').forEach(el=>el.hidden=!state.authorized);
  }
  function status(text){state.status=text;refreshUI();}
  function applySnapshot(raw,first=false){
    const next=merge(raw);
    DB=Object.assign(blankDB(),next);abilityPriorYearPoolCache=null;if(typeof v319CareerCache!=='undefined')v319CareerCache={key:'',map:null};
    state.revision=Number(raw?.meta?.revision)||0;state.savedAt=raw?.meta?.savedAt||null;
    state.ready=true;state.error='';
    ensureAbilityData();
    if(first){latestDbPeriodSignature='';applyLatestDbPeriodDefaults(true);}
    else applyLatestDbPeriodDefaults(false);
    // receive() defers live updates while a settings form is being edited.
    // Otherwise, stale editor caches must not hide freshly received settings.
    repAdminDrafts={};
    try{localStorage.setItem(cacheKey(),JSON.stringify(raw));}catch(e){/* Cache quota must never stop live rendering. */}
    const date=state.savedAt?new Date(state.savedAt):null;
    const stamp=date&&!isNaN(date.getTime())?date.toLocaleString('ko-KR'):'';
    status(raw?'공유 기록 최신 상태'+(stamp?' · '+stamp:''):'등록된 공유 기록이 없습니다. 관리자에게 기록 등록을 요청해 주세요.');
    renderAll();
    if(typeof playerCardHistoryState!=='undefined' && playerCardHistoryState && document.querySelector('#playerCardMask')?.classList.contains('on')){
      openPlayerCard(playerCardHistoryState.player,playerCardHistoryState.query);
    }
  }
  function receive(raw){
    clearTimeout(readTimer);state.latest=raw;state.hasLatest=true;state.serverSeen=true;
    const rev=Number(raw?.meta?.revision)||0;
    if(state.dirty||state.saving||state.busy||editLease||hasSettingsDraft()){
      if(!state.saving && rev!==state.revision)state.conflict=true;
      refreshUI();return;
    }
    try{applySnapshot(raw,!state.ready);}catch(e){state.error='공유 기록을 읽지 못했습니다: '+e.message;refreshUI();}
  }
  function markChanged(){
    if(!canEdit())return false;
    state.dirty=true;state.serial++;editLease=false;refreshUI();
    clearTimeout(saveTimer);saveTimer=setTimeout(()=>flush(),300);
    return true;
  }
  async function flush(){
    if(state.saving||state.busy||!state.dirty||!canEdit())return false;
    const uid=state.user?.uid;
    if(!uid)return false;
    const serial=state.serial, expected=state.revision;
    let value;
    try{
      value=split(DB,expected+1,uid,firebase.database.ServerValue.TIMESTAMP);
      if(new TextEncoder().encode(JSON.stringify(value)).length>8*1024*1024)throw new Error('기록 크기가 8 MB를 넘습니다. 사진은 이미지 URL로 등록해 주세요.');
    }catch(e){state.error='공유 저장 실패: '+e.message;refreshUI();return false;}
    state.saving=true;refreshUI();
    const slow=setTimeout(()=>{if(state.saving){state.status='서버 응답을 기다리고 있습니다.';document.querySelector('#cloudStatusText').textContent='공유 저장 응답 대기 중 · 창을 닫지 말고 연결을 확인해 주세요.';}},12000);
    try{
      const result=await dataRef.transaction(current=>{
        const actual=Number(current?.meta?.revision)||0;
        if(actual!==expected)return undefined;
        const next=copy(value);
        // Preserve historical metadata not owned by the record editor.
        if(current?.adminLog)next.adminLog=current.adminLog;
        return next;
      },undefined,false);
      if(!result.committed){state.conflict=true;return false;}
      const raw=result.snapshot.val();
      state.revision=Number(raw.meta.revision);state.savedAt=raw.meta.savedAt;
      if(!state.hasLatest || Number(state.latest?.meta?.revision||0)<=state.revision){state.latest=raw;state.hasLatest=true;}
      if(serial===state.serial){
        state.dirty=false;state.error='';
        try{localStorage.removeItem(KEY);}catch(e){}
        status('공유 저장 완료 · 회원 화면에 자동 반영됩니다.');
        toast('공유 저장 완료');
      }
      // A different administrator may commit immediately after our transaction.
      if(state.hasLatest && Number(state.latest?.meta?.revision)>state.revision){
        if(state.dirty)state.conflict=true;else applySnapshot(state.latest);
      }
      return true;
    }catch(e){state.error='공유 저장 실패 · '+(String(e.code||'').includes('PERMISSION')||String(e.code||'').includes('permission')?'관리자 비밀번호로 다시 로그인하고 초기 공유 설정을 확인해 주세요.':e.message);return false;}
    finally{clearTimeout(slow);state.saving=false;refreshUI();if(state.dirty&&canEdit())saveTimer=setTimeout(()=>flush(),300);}
  }
  async function reload(){
    if(state.saving){toast('공유 저장이 끝난 뒤 다시 시도해 주세요.');return;}
    if((state.dirty||editLease||hasSettingsDraft())&&!confirm('미저장 변경을 버리고 서버 기록을 다시 받을까요? 필요한 내용은 먼저 내려받아 주세요.'))return;
    if(!dataRef){location.reload();return;}
    try{
      const snap=await dataRef.get();
      state.dirty=false;state.conflict=false;state.error='';editLease=false;discardSettingsDraft();repAdminDrafts={};
      state.latest=snap.val();state.hasLatest=true;state.serverSeen=true;applySnapshot(snap.val(),true);
    }catch(e){state.error='서버 기록을 받지 못했습니다. 연결과 설정을 확인해 주세요.';refreshUI();}
  }
  function authError(message){const el=document.querySelector('#pwErr');el.textContent=message;el.classList.add('on');}
  function clearPassword(){
    const input=document.querySelector('#adminPassword');
    if(input){input.value='';input.type='password';}
    const show=document.querySelector('#pwShow');
    if(show){show.textContent='보기';show.setAttribute('aria-pressed','false');}
  }
  function closeLogin(){
    if(loginBusy)return;
    clearPassword();document.querySelector('#mask').classList.remove('on');
    document.querySelector('#lockBtn').focus();
  }
  function togglePassword(){
    const input=document.querySelector('#adminPassword'),show=document.querySelector('#pwShow');
    const visible=input.type==='password';input.type=visible?'text':'password';
    show.textContent=visible?'숨기기':'보기';show.setAttribute('aria-pressed',String(visible));input.focus();
  }
  async function signIn(){
    if(loginBusy)return false;
    if(!auth){authError('공유 서버 연결 설정을 먼저 완료해 주세요.');return false;}
    const input=document.querySelector('#adminPassword'),ok=document.querySelector('#pwOk'),cancel=document.querySelector('#pwCancel');
    const password=input.value;
    if(!password){authError('관리자 비밀번호를 입력해 주세요.');input.focus();return false;}
    document.querySelector('#pwErr').classList.remove('on');
    loginBusy=true;clearPassword();input.disabled=true;ok.disabled=true;cancel.disabled=true;ok.textContent='확인 중…';
    document.querySelector('#adminLoginForm').setAttribute('aria-busy','true');
    try{
      // The login ID is fixed internally; only the password is entered on screen.
      // Passwords are checked by Firebase, never stored in HTML or application data.
      await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
      const credential=await auth.signInWithEmailAndPassword(ADMIN_LOGIN_ID,password);
      return await onUser(credential.user);
    }catch(e){
      const messages={
        'auth/invalid-credential':'비밀번호를 확인해 주세요. 처음 사용하는 경우 초기 비밀번호 등록도 확인해 주세요.',
        'auth/invalid-login-credentials':'비밀번호를 확인해 주세요. 처음 사용하는 경우 초기 비밀번호 등록도 확인해 주세요.',
        'auth/wrong-password':'비밀번호가 올바르지 않습니다.',
        'auth/user-not-found':'관리자 비밀번호가 아직 등록되지 않았습니다. 배포 안내의 초기 설정을 확인해 주세요.',
        'auth/user-disabled':'관리자 로그인이 중지되어 있습니다. Firebase의 관리자 계정을 확인해 주세요.',
        'auth/operation-not-allowed':'초기 설정에서 이메일/비밀번호 로그인을 사용 설정해 주세요.',
        'auth/too-many-requests':'로그인 시도가 많습니다. 잠시 후 다시 시도해 주세요.',
        'auth/network-request-failed':'인터넷 연결을 확인하고 다시 시도해 주세요.',
        'auth/unauthorized-domain':'배포 주소를 Firebase 인증의 승인된 도메인에 추가해 주세요.'
      };
      authError(messages[e.code]||'로그인하지 못했습니다. 연결 상태와 초기 설정을 확인해 주세요.');
      return false;
    }finally{
      loginBusy=false;clearPassword();input.disabled=false;ok.disabled=false;cancel.disabled=false;ok.textContent='로그인';
      document.querySelector('#adminLoginForm').setAttribute('aria-busy','false');
      if(document.querySelector('#mask').classList.contains('on'))input.focus();
    }
  }
  async function loginOrLogout(){
    if(loginBusy)return;
    if(state.user){
      if(state.saving){toast('공유 저장 완료 후 로그아웃해 주세요.');return;}
      if((state.dirty||editLease||hasSettingsDraft())&&!confirm('공유하지 않은 변경이 있습니다. 로그아웃하면 서버 기록으로 돌아갑니다. 계속할까요?'))return;
      try{
        await auth.signOut();
        state.user=null;state.authorized=false;state.dirty=false;state.conflict=false;editLease=false;discardSettingsDraft();setAdmin(false);
        if(state.hasLatest)applySnapshot(state.latest,true);
        clearPassword();toast('로그아웃했습니다. 회원 열람 모드입니다.');
      }catch(e){toast('로그아웃하지 못했습니다. 다시 시도해 주세요.');}
    }else{
      clearPassword();document.querySelector('#pwErr').classList.remove('on');document.querySelector('#mask').classList.add('on');
      document.querySelector('#adminPassword').focus();
    }
  }
  async function onUser(user){
    const generation=++state.authGeneration;
    const changed=state.user?.uid!==user?.uid;
    if(!user){state.user=null;state.authorized=false;setAdmin(false);refreshUI();return false;}
    if(changed){state.user=user;state.authorized=false;setAdmin(false);refreshUI();}
    try{
      const token=await user.getIdTokenResult();
      if(generation!==state.authGeneration)return state.authorized;
      const valid=token.claims?.email===ADMIN_LOGIN_ID && token.claims?.firebase?.sign_in_provider==='password';
      if(!valid){
        state.authorized=false;state.user=null;setAdmin(false);refreshUI();
        await auth.signOut();
        if(document.querySelector('#mask').classList.contains('on'))authError('관리자 비밀번호로 다시 로그인해 주세요.');
        return false;
      }
      const first=!state.authorized;
      state.user=user;state.authorized=true;
      if(first)setAdmin(true);
      clearPassword();document.querySelector('#mask').classList.remove('on');
      if(first)toast('관리자 모드로 로그인했습니다.');
      refreshUI();return true;
    }catch(e){
      if(generation!==state.authGeneration)return false;
      state.authorized=false;setAdmin(false);refreshUI();
      authError('관리자 로그인을 확인하지 못했습니다. 비밀번호로 다시 로그인해 주세요.');
      return false;
    }
  }

  function installGuards(){
    const selectors='#v-data,#v-rep,#v-abilitycfg,#seasonPanel,#soccerbeeUpload,#soccerbeeClear,#abilitySystemEnabled,#logoFilepick,#filepick,#soccerbeeFilepick';
    for(const type of ['click','change','input'])document.addEventListener(type,e=>{
      if(e.target.closest?.(selectors) && !canEdit()){
        e.preventDefault();e.stopImmediatePropagation();toast('관리자 인증과 서버 연결을 확인해 주세요.');
      } else if(type==='input' && state.authorized && e.target.id!=='repAdminYear' && e.target.closest?.('#v-rep,#v-abilitycfg,#seasonPanel,#displayNameManagerCard'))editLease=true;
    },true);
    for(const id of ['filepick','soccerbeeFilepick','logoFilepick']){
      const el=document.querySelector('#'+id), handler=el.onchange;
      el.onchange=async e=>{
        if(!canEdit()){e.target.value='';return;}
        state.busy++;
        const backup=copy(DB);
        try{
          await handler(e);
          if(!canEdit() && JSON.stringify(DB)!==JSON.stringify(backup)){
            state.dirty=true;state.serial++;
            if(!state.authorized)state.error='관리자 권한이 변경되었습니다. 불러온 내용은 미저장 파일로 내려받을 수 있습니다.';
          }
        }catch(err){DB=backup;toast('불러오기 실패: '+err.message);}
        finally{
          state.busy--;
          if(state.hasLatest && Number(state.latest?.meta?.revision||0)!==state.revision)state.conflict=true;
          refreshUI();if(state.dirty&&!state.conflict)flush();
        }
      };
    }
    window.addEventListener('beforeunload',e=>{if(state.dirty||state.saving||editLease||hasSettingsDraft()){e.preventDefault();e.returnValue='';}});
  }
  function start(){
    installGuards();
    document.querySelector('#cloudRetry').onclick=()=>{state.error='';refreshUI();flush();};
    document.querySelector('#cloudReload').onclick=reload;
    document.querySelector('#cloudDownload').onclick=()=>{
      const draft=copy(DB);
      if(editLease && document.querySelector('#v-rep')?.classList.contains('on') && repAdminYear){
        const season=captureRepresentativeAdminDraft(repAdminYear);
        if(season){draft.settings.seasons=draft.settings.seasons||{};draft.settings.seasons[repAdminYear]=season;}
      }
      if(editLease && document.querySelector('#v-abilitycfg')?.classList.contains('on')){
        draft.settings.ability={...draft.settings.ability,config:readAbilityConfigForm()};
      }
      if(editLease && document.querySelector('#v-data')?.classList.contains('on')){
        draft.settings.display={brandTitle:document.querySelector('#brandTitleInput').value.trim(),leagueA:document.querySelector('#leagueANameInput').value.trim(),leagueB:document.querySelector('#leagueBNameInput').value.trim()};
      }
      if(typeof careerFrameSettingsDirty!=='undefined'&&careerFrameSettingsDirty){
        const form=readCareerFrameSettingsForm();draft.settings.careerFrameThresholds=form.thresholds;draft.settings.careerFrameRequiredCounts=form.counts;
      }
      if(typeof analysisStartSettingsDirty!=='undefined'&&analysisStartSettingsDirty)draft.settings.analysisStartPlayer=document.getElementById('analysisStartPlayer').value;
      download('GGFC_미저장기록.json',JSON.stringify(draft,null,2),'application/json');
    };
    const config=window.GGFC_CONFIG||{};
    if(!/^https:\/\/[a-z0-9.-]+\.(?:firebaseio\.com|firebasedatabase\.app)\/?$/i.test(config.databaseURL||'')){
      state.error='공유 기록 연결 준비 중입니다. 관리자에게 연결 설정을 요청해 주세요.';
      document.querySelector('#authInfo').textContent='firebase-config.js에 Realtime Database의 databaseURL을 입력해 주세요. 자세한 순서는 배포 안내를 확인해 주세요.';
      refreshUI();return;
    }
    if(typeof firebase==='undefined'||!firebase.auth){state.error='연결 모듈을 불러오지 못했습니다. 인터넷 연결을 확인하고 새로고침해 주세요.';refreshUI();return;}
    try{
      const app=firebase.apps.length?firebase.app():firebase.initializeApp(config);
      database=app.database();auth=app.auth();dataRef=database.ref('ggfc/v3');
      database.ref('.info/connected').on('value',snap=>{state.connected=snap.val()===true;refreshUI();});
      auth.onIdTokenChanged(onUser);
      dataRef.on('value',snap=>receive(snap.val()),e=>{state.error='공유 기록 접근 실패 ('+String(e.code||'오류')+'). 관리자는 Realtime Database 규칙과 주소를 확인해 주세요.';refreshUI();});
      readTimer=setTimeout(()=>{
        if(state.ready)return;
        try{const cached=localStorage.getItem(cacheKey());if(cached){applySnapshot(JSON.parse(cached),true);state.connected=false;state.status='서버 응답 지연 · 마지막으로 받은 기록입니다.';}}
        catch(e){}
        if(!state.ready)state.error='공유 기록을 받지 못했습니다. 인터넷 연결과 Firebase 설정을 확인하고 다시 받아 주세요.';
        refreshUI();
      },12000);
    }catch(e){state.error='Firebase 연결 실패: '+e.message;refreshUI();}
  }
  return {get authorized(){return state.authorized;},get pending(){return state.dirty||state.saving;},canEdit,normalizeDB,split,merge,transformKeys,refreshUI,start,markChanged,flush,receive,reload,signIn,loginOrLogout,closeLogin,togglePassword};
})();
window.GGFC_VERSION='3.18.4';
