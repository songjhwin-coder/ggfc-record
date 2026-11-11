/* Shared visual preset, independent of each member's light or dark mode. */
window.GGFCStadiumTheme=(()=>{
  const root=document.documentElement,panel=document.getElementById('stadiumThemePanel');
  const form=document.getElementById('stadiumThemeForm'),select=document.getElementById('stadiumThemeSelect');
  const preview=document.getElementById('stadiumThemePreview'),button=document.getElementById('stadiumThemeSave');
  const status=document.getElementById('stadiumThemeStatus');
  let saved='stadium',draft=null,saving=false;
  const normalize=value=>value==='champions'||value==='premier'?value:'stadium';
  function configure(value){
    saved=normalize(value);
    if(saved==='stadium')delete root.dataset.stadiumTheme;
    else if(root.dataset.stadiumTheme!==saved)root.dataset.stadiumTheme=saved;
  }
  function render(){
    panel.hidden=!admin||!GGFC.authorized;
    if(panel.hidden)return;
    select.value=draft??saved;
    preview.dataset.style=select.value;
    select.disabled=saving;
    button.disabled=saving||draft===null;
  }
  function discard(){
    draft=null;status.textContent='';render();
  }
  select.onchange=()=>{
    if(!admin||!GGFC.authorized)return;
    const next=normalize(select.value);
    draft=next===saved?null:next;
    status.textContent=draft?'선택한 테마를 공유하려면 테마 저장을 눌러 주세요.':'현재 공유된 테마입니다.';
    render();GGFC.refreshUI();
  };
  form.onsubmit=async event=>{
    event.preventDefault();
    if(!admin||!GGFC.canEdit()){toast('관리자 인증과 서버 연결을 확인해 주세요.');return;}
    if(saving||draft===null)return;
    const next=draft;
    DB.settings={...DB.settings,stadiumTheme:next};
    draft=null;saving=true;
    configure(next);render();
    status.textContent='테마를 공유 저장하고 있습니다…';
    save();
    const shared=await GGFC.flush();
    saving=false;render();
    status.textContent=shared?'테마 공유 저장 완료.':'상단 공유 저장 상태를 확인해 주세요.';
  };
  return {configure,render,discard,get dirty(){return draft!==null;},get draft(){return draft;}};
})();
