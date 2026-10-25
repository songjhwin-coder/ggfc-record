/* GGFC install/update UX. No business calculations or database writes. */
(() => {
  'use strict';
  if(window.GGFCPWA)return;
  const byId=id=>document.getElementById(id),root=new URL('./',document.baseURI);
  const marker='ggfc-pwa-updating:'+root.pathname;
  let registration=null,promptEvent=null,applying=false,checking=false,lastCheck=0;
  const installed=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  const message=text=>{byId('pwaStatus').textContent=text;};
  const busy=()=>typeof GGFC!=='undefined'&&(GGFC.pending||GGFC.editing)||
    typeof dashboardExportBusy!=='undefined'&&dashboardExportBusy||typeof squadExportBusy!=='undefined'&&squadExportBusy||
    !!document.querySelector('.mask.on,#playerCardMask.on,dialog[open]');
  function notify(){
    if(!registration?.waiting||!navigator.serviceWorker.controller)return;
    byId('pwaUpdateText').textContent='GGFC 새 버전이 있습니다.';
    byId('pwaUpdate').hidden=false;
    message('새 버전 준비 완료 · 업데이트를 선택해 주세요.');
  }
  function rpc(worker,type){
    return new Promise((resolve,reject)=>{
      const channel=new MessageChannel(),timer=setTimeout(()=>{channel.port1.close();reject(Error('업데이트 응답을 받지 못했습니다. 다시 시도해 주세요.'));},10000);
      channel.port1.onmessage=e=>{clearTimeout(timer);channel.port1.close();resolve(e.data);};
      worker.postMessage({type},[channel.port2]);
    });
  }
  async function apply(){
    if(applying)return;
    if(busy()){message('입력·저장·이미지 작업을 마치고 열린 창을 닫은 뒤 업데이트해 주세요.');return;}
    if(!registration?.waiting){await check(true);return;}
    // Activation is explicit, and only the requesting tab may reload.
    const worker=registration.waiting;
    applying=true;byId('pwaApply').disabled=true;
    try{
      const ready=await rpc(worker,'CAN_ACTIVATE');
      if(!ready.ok)throw Error(ready.reason);
      if(busy())throw Error('진행 중인 작업을 마친 뒤 업데이트해 주세요.');
      try{sessionStorage.setItem(marker,String(Date.now()));}catch(e){}
      const result=await rpc(worker,'ACTIVATE_UPDATE');
      if(!result.ok)throw Error(result.reason);
      // controllerchange normally handles it. Activated state covers first-install edge cases.
      const reload=()=>{if(worker.state==='activated'&&applying&&!busy()){applying=false;location.reload();}};
      worker.addEventListener('statechange',reload);reload();
    }catch(e){
      applying=false;byId('pwaApply').disabled=false;message(e.message);
      byId('pwaUpdateText').textContent=e.message;
      try{sessionStorage.removeItem(marker);}catch(ignore){}
    }
  }
  async function check(force=false){
    if(checking||navigator.onLine===false){if(force)message('오프라인입니다. 인터넷 연결 후 확인해 주세요.');return;}
    if(!force&&Date.now()-lastCheck<60000)return;
    checking=true;lastCheck=Date.now();
    try{
      if(!registration)await register();
      if(!registration){message('이 환경에서는 앱 설치·캐시를 사용할 수 없습니다. 일반 화면은 이용할 수 있습니다.');return;}
      if(force)message('앱 새 버전 확인 중…');
      await registration.update();
      if(registration.waiting)notify();
      else if(force)message(registration.installing?'새 버전을 내려받는 중입니다.':'현재 배포된 최신 앱입니다.');
    }catch(e){if(force)message('앱 업데이트를 확인하지 못했습니다. 현재 버전은 계속 이용할 수 있습니다.');}
    finally{checking=false;}
  }
  function watch(worker){
    if(!worker)return;
    worker.addEventListener('statechange',()=>{
      if(worker.state==='installed'){
        if(navigator.serviceWorker.controller)notify();
        else message('앱 저장 완료 · 다음 접속부터 빠르게 열립니다.');
      }
      if(worker.state==='redundant')message('새 버전 파일이 아직 준비되지 않았습니다. 현재 버전을 유지합니다.');
    });
  }
  let registering=null;
  async function register(){
    if(registration||registering)return registration||registering;
    if(!('serviceWorker' in navigator)||!isSecureContext)return null;
    registering=navigator.serviceWorker.register(new URL('service-worker.js',root),{scope:root.pathname,updateViaCache:'none'}).then(reg=>{
      registration=reg;watch(reg.installing);
      reg.addEventListener('updatefound',()=>watch(reg.installing));notify();return reg;
    }).catch(()=>{message('앱 저장을 사용할 수 없어 일반 화면으로 실행 중입니다.');return null;}).finally(()=>{registering=null;});
    return registering;
  }
  function installVisibility(){byId('pwaInstall').hidden=installed()||!promptEvent;}
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();promptEvent=event;installVisibility();});
  window.addEventListener('appinstalled',()=>{promptEvent=null;installVisibility();message('GGFC 앱이 설치되었습니다.');});
  matchMedia('(display-mode: standalone)').addEventListener('change',installVisibility);
  byId('pwaInstall').onclick=async()=>{
    if(!promptEvent||installed())return;
    const event=promptEvent;promptEvent=null;installVisibility();
    await event.prompt();const choice=await event.userChoice;
    message(choice.outcome==='accepted'?'홈 화면에서 GGFC를 실행해 주세요.':'설치는 나중에 브라우저 메뉴에서도 할 수 있습니다.');
  };
  byId('pwaCheck').onclick=()=>check(true);
  byId('pwaApply').onclick=apply;
  byId('pwaLater').onclick=()=>{byId('pwaUpdate').hidden=true;message('새 버전 준비 완료 · 앱 업데이트 확인에서 다시 열 수 있습니다.');};
  if('serviceWorker' in navigator){
    navigator.serviceWorker.addEventListener('controllerchange',()=>{
      if(!applying)return;
      if(busy()){applying=false;byId('pwaApply').disabled=false;message('작업 완료 후 앱을 다시 열면 새 버전이 적용됩니다.');return;}
      applying=false;location.reload();
    });
  }
  try{const stamp=Number(sessionStorage.getItem(marker));if(stamp&&Date.now()-stamp<300000)message('업데이트 완료 · GGFC '+(window.GGFC_VERSION||''));sessionStorage.removeItem(marker);}catch(e){}
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')check();});
  window.addEventListener('online',()=>check());
  setInterval(()=>{if(document.visibilityState==='visible')check();},15*60000);
  const schedule=()=>setTimeout(()=>register(),1000);
  if(document.readyState==='complete')schedule();else window.addEventListener('load',schedule,{once:true});
  window.GGFCPWA=Object.freeze({check:()=>check(true)});
})();
