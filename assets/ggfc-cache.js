/* Static cache is optional: failure must never block records, login or saving. */
(() => {
  if(!('serviceWorker' in navigator)||!window.isSecureContext)return;
  const register=async()=>{
    try{
      const registration=await navigator.serviceWorker.register(new URL('service-worker.js',document.baseURI),{scope:new URL('./',document.baseURI).pathname,updateViaCache:'none'});
      let notified=false;
      const notify=()=>{
        if(notified||!registration.waiting||!navigator.serviceWorker.controller)return;
        notified=true;
        if(typeof toast==='function')toast('새 버전 준비 완료 · 저장 후 GGFC 탭을 모두 닫고 다시 열면 적용됩니다.');
      };
      notify();
      registration.addEventListener('updatefound',()=>registration.installing?.addEventListener('statechange',notify));
      // No skipWaiting, clients.claim or automatic reload during administrator work.
    }catch(e){/* Private mode, quota, unsupported hosts: use ordinary HTTP loading. */}
  };
  const schedule=()=>setTimeout(register,1500);
  if(document.readyState==='complete')schedule();
  else window.addEventListener('load',schedule,{once:true});
})();
