/* Best-effort external browser handoff for KakaoTalk. No records/auth/data access. */
(() => {
  'use strict';
  if(window.GGFCBrowserHandoff)return;
  const ua=navigator.userAgent;
  const ios=/iPad|iPhone|iPod/i.test(ua)||(/Macintosh/i.test(ua)&&navigator.maxTouchPoints>1);
  const android=/Android/i.test(ua);
  const enabled=/KAKAOTALK/i.test(ua)&&(ios||android)&&
    !matchMedia('(display-mode: standalone)').matches&&navigator.standalone!==true;
  const root=new URL('./',document.baseURI);
  const page=location.pathname.endsWith('install.html')?'install.html':location.pathname.endsWith('mobile.html')?'mobile.html':'index.html';
  // Only a local GGFC entry page; never accept a destination from query parameters.
  const target=new URL(page,root),fallback=new URL(target);
  fallback.searchParams.set('ggfc_browser','1');
  const defaultURI='kakaotalk://web/openExternal?url='+encodeURIComponent(fallback.href);
  const chromeURI='intent://'+target.host+target.pathname+'#Intent;scheme='+target.protocol.slice(0,-1)+
    ';package=com.android.chrome;S.browser_fallback_url='+encodeURIComponent(fallback.href)+';end';
  const label=android?'Chrome으로 열기':'외부 브라우저로 열기';
  const key='ggfc-browser-handoff:'+root.pathname;
  let tried=false,notice=null;
  function inform(text){const output=notice?.querySelector('[data-browser-status]');if(output)output.textContent=text;}
  function remember(){try{sessionStorage.setItem(key,String(Date.now()));}catch(e){}}
  function openPreferred(useDefault=false){
    if(!enabled)return false;
    tried=true;remember();
    inform('브라우저 열기를 요청했습니다. 전환되지 않으면 다시 누르거나 주소를 복사해 주세요.');
    try{location.href=android&&!useDefault?chromeURI:defaultURI;}
    catch(e){inform('자동으로 열지 못했습니다. 카카오톡 메뉴에서 다른 브라우저로 열거나 주소를 복사해 주세요.');}
    return true; // A request was sent, not a claim that the other app actually opened.
  }
  window.GGFCBrowserHandoff=Object.freeze({available:enabled,label,openPreferred:()=>openPreferred(false)});
  if(!enabled)return;
  function start(){
    notice=document.createElement('aside');notice.id='ggfcBrowserNotice';notice.className='ggfc-browser-notice';
    notice.setAttribute('aria-label','카카오톡 외부 브라우저 안내');
    notice.innerHTML='<button type="button" class="browser-dismiss" aria-label="브라우저 안내 닫기">×</button><strong>설치는 외부 브라우저에서 진행해 주세요.</strong><p data-browser-status role="status" aria-live="polite">외부 브라우저 열기를 준비하고 있습니다.</p><div class="browser-actions"><button type="button" data-browser-preferred></button><button type="button" data-browser-default>기본 브라우저로 열기</button><button type="button" data-browser-copy>주소 복사</button></div>';
    document.body.append(notice);
    notice.querySelector('.browser-dismiss').onclick=()=>{notice.hidden=true;};
    const preferred=notice.querySelector('[data-browser-preferred]');preferred.textContent=label;preferred.onclick=()=>openPreferred(false);
    const def=notice.querySelector('[data-browser-default]');def.hidden=!android;def.onclick=()=>openPreferred(true);
    notice.querySelector('[data-browser-copy]').onclick=async()=>{
      try{await navigator.clipboard.writeText(target.href);inform('주소를 복사했습니다. Chrome 또는 Safari 주소창에 붙여넣으세요.');}
      catch(e){inform('주소를 길게 눌러 복사해 주세요: '+target.href);}
    };
    document.querySelectorAll('[data-open-browser]').forEach(button=>{
      button.hidden=false;button.textContent=label;button.onclick=()=>openPreferred(false);
    });
    let recent=false;
    try{const time=Number(sessionStorage.getItem(key));recent=time>0&&Date.now()-time>=0&&Date.now()-time<300000;}catch(e){}
    const returned=new URL(location.href).searchParams.get('ggfc_browser')==='1';
    if(!tried&&!recent&&!returned)openPreferred(false);
    else inform('바로 전환되지 않으면 아래 버튼을 눌러주세요. 아이폰은 설정된 기본 브라우저가 열릴 수 있습니다.');
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
