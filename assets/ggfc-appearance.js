/* Load before the stylesheets so the last confirmed policy can paint immediately. */
window.GGFCAppearance=(()=>{
  const root=document.documentElement;
  const scope=new URL('.',location.href).pathname;
  const policyKey='ggfc-appearance-policy:'+scope;
  const choiceKey='ggfc-appearance-choice:'+scope;
  const fallback={defaultMode:'light',allowMemberOverride:true};
  const isMode=value=>value==='light'||value==='dark';
  const normalize=value=>isMode(value?.defaultMode)&&typeof value.allowMemberOverride==='boolean'
    ? {defaultMode:value.defaultMode,allowMemberOverride:value.allowMemberOverride}:null;
  const same=(a,b)=>a?.defaultMode===b?.defaultMode&&a?.allowMemberOverride===b?.allowMemberOverride;
  const label=mode=>mode==='dark'?'기존 Dark':'White Hybrid';
  const read=key=>{try{return localStorage.getItem(key);}catch{return null;}};
  const write=(key,value)=>{try{localStorage.setItem(key,value);}catch{}};
  function readPolicy(){
    try{return normalize(JSON.parse(read(policyKey)));}catch{return null;}
  }
  function readChoice(){
    const value=read(choiceKey);
    if(value!==null)return isMode(value)?value:null;
    const legacy=read('ggfc-theme');
    const migrated=isMode(legacy)?legacy:null;
    write(choiceKey,migrated??'default');
    return migrated;
  }
  let cached=readPolicy(),policy=cached??fallback,choice=readChoice();
  let confirmed=false,draft=null,saving=false,ui=null;
  const mode=()=>policy.allowMemberOverride&&choice?choice:policy.defaultMode;

  function apply(){
    const dark=mode()==='dark';
    if(dark)root.dataset.theme='dark';else delete root.dataset.theme;
    if(!ui)return;
    ui.toggle.setAttribute('aria-pressed',String(dark));
    ui.toggle.disabled=!policy.allowMemberOverride;
    if(policy.allowMemberOverride)ui.toggle.removeAttribute('aria-describedby');
    else ui.toggle.setAttribute('aria-describedby',ui.notice.id);
    ui.reset.hidden=!policy.allowMemberOverride||choice===null;
    ui.notice.hidden=policy.allowMemberOverride;
  }
  apply();

  function accept(value,fromCache=false){
    if(fromCache&&(confirmed||cached))return;
    const next=normalize(value);
    if(value!=null&&!next)return;
    policy=next??fallback;
    if(!fromCache||next){
      confirmed=!fromCache;
      cached=policy;
      write(policyKey,JSON.stringify(policy));
    }
    apply();
    render();
  }
  function setChoice(next){
    if(!policy.allowMemberOverride)return;
    const reset=next===null;
    choice=next;
    write(choiceKey,choice??'default');
    apply();
    if(reset&&!ui.toggle.disabled)ui.toggle.focus();
  }
  function render(){
    if(!ui)return;
    const visible=admin&&GGFC.authorized;
    ui.panel.hidden=!visible;
    if(!visible)return;
    const value=draft??policy;
    ui.current.textContent=label(policy.defaultMode)+' · 회원 변경 '+(policy.allowMemberOverride?'허용':'금지')+
      (confirmed?'':cached?' · 마지막 공유값':' · 초기 기본값');
    ui.select.value=value.defaultMode;
    ui.allow.checked=value.allowMemberOverride;
    ui.preview.dataset.mode=value.defaultMode;
    ui.previewLabel.textContent=label(value.defaultMode);
    ui.select.disabled=saving;
    ui.allow.disabled=saving;
    ui.submit.disabled=saving||!draft||!GGFC.canEdit()||GGFC.pending;
    ui.cancel.disabled=saving||!draft;
    ui.form.setAttribute('aria-busy',String(saving));
  }
  function discard(){
    draft=null;
    if(ui)ui.status.textContent='';
    render();
  }
  function change(){
    if(saving||!admin||!GGFC.canEdit())return;
    const next={defaultMode:ui.select.value,allowMemberOverride:ui.allow.checked};
    draft=same(next,policy)?null:next;
    ui.status.textContent=draft?'공유 저장을 누르면 회원 화면에 반영됩니다.':'';
    if(draft)GGFC.refreshUI();
    else GGFC.resumeAfterAppearanceDraft();
  }
  async function submit(event){
    event.preventDefault();
    if(saving||!draft)return;
    if(!admin||!GGFC.canEdit()||GGFC.pending){
      ui.status.textContent='관리자 인증과 서버 연결, 진행 중인 저장 상태를 확인해 주세요.';
      return;
    }
    saving=true;
    ui.status.textContent='앱 테마 설정을 공유 저장하는 중입니다.';
    render();
    try{
      const saved=await GGFC.flush({appearance:draft});
      if(saved)draft=null;
      ui.status.textContent=saved?'앱 테마 설정을 공유 저장했습니다.':'저장하지 못했습니다. 기존 공유값을 적용 중입니다. 연결 또는 상단 공유 저장 상태를 확인해 주세요.';
    }catch(error){
      ui.status.textContent='앱 테마 저장 실패 · '+error.message+' 기존 공유값을 적용 중입니다.';
    }finally{
      saving=false;
      GGFC.refreshUI();
    }
  }
  function bind(){
    const id=name=>document.getElementById(name);
    ui={
      toggle:id('themeToggle'),reset:id('themeUseDefault'),notice:id('themePolicyNotice'),
      panel:id('appearancePanel'),form:id('appearanceForm'),select:id('appearanceDefault'),
      allow:id('appearanceAllowOverride'),current:id('appearanceCurrent'),preview:id('appearancePreview'),
      previewLabel:id('appearancePreviewLabel'),submit:id('appearanceSave'),cancel:id('appearanceCancel'),
      status:id('appearanceStatus')
    };
    ui.toggle.onclick=()=>setChoice(mode()==='dark'?'light':'dark');
    ui.reset.onclick=()=>setChoice(null);
    ui.form.onchange=change;
    ui.form.onsubmit=submit;
    ui.cancel.onclick=()=>{discard();GGFC.resumeAfterAppearanceDraft();};
    window.addEventListener('storage',event=>{
      if(event.key!==choiceKey&&event.key!==null)return;
      choice=readChoice();
      apply();
    });
    apply();
  }
  return {normalize,accept,bind,render,discard,get dirty(){return draft!==null;},get draft(){return draft;}};
})();
