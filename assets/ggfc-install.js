/* Dedicated install guide. No Firebase, auth, record calculations or data writes. */
(() => {
  'use strict';
  const el=id=>document.getElementById(id);
  const ua=navigator.userAgent;
  const device=/iPad|iPhone|iPod/i.test(ua)||(/Macintosh/i.test(ua)&&navigator.maxTouchPoints>1)?'ios':/Android/i.test(ua)?'android':'desktop';
  const embedded=/KAKAOTALK|NAVER\(|FBAN|FBAV|Instagram|Line\/|; wv\)/i.test(ua);
  const samsung=/SamsungBrowser/i.test(ua);
  const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  let promptEvent=null,prompting=false,installedHere=false,selected=device;
  const status=text=>{el('installStatus').textContent=text;};
  const installed=()=>standalone()||installedHere;
  function showGuide(type){
    selected=type;
    document.querySelectorAll('[data-device]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.device===type)));
    let title,steps,note;
    if(type==='ios'){
      title='아이폰 · 아이패드 설치 방법';
      steps=['이 페이지를 Safari에서 엽니다.','공유 버튼을 누르고 ‘홈 화면에 추가’를 선택합니다.','‘웹 앱으로 열기’가 표시되면 켠 뒤 ‘추가’를 누릅니다.'];
      note='설치 후 홈 화면의 GGFC 아이콘을 눌러 이용하세요. 공유 메뉴에 항목이 없다면 메뉴 아래쪽의 동작 편집을 확인하세요.';
    }else if(type==='android'){
      title='갤럭시 · 안드로이드 설치 방법';
      steps=samsung?['이 페이지를 삼성 인터넷에서 엽니다.','브라우저 메뉴에서 ‘현재 페이지 추가’ 또는 ‘페이지 추가’를 선택합니다.','‘홈 화면’을 선택하고 추가 또는 설치를 확인합니다.']:['이 페이지를 Chrome에서 엽니다.','오른쪽 위 메뉴(점 3개)에서 ‘홈 화면에 추가’ 또는 ‘앱 설치’를 선택합니다.','‘설치’를 누른 뒤 홈 화면의 GGFC 아이콘으로 실행합니다.'];
      note='‘GGFC 설치하기’를 누르면 지원 환경에서는 설치창이 열립니다. 설치창이 준비되지 않았으면 위의 브라우저 메뉴를 이용하세요. 메뉴 이름은 브라우저 버전에 따라 다를 수 있습니다.';
    }else{
      title='PC · 기타 기기 설치 방법';
      steps=['Chrome 또는 Edge에서 이 페이지를 엽니다.','주소창의 설치 아이콘 또는 브라우저 메뉴의 앱 설치를 선택합니다.','설치를 확인합니다. 설치 메뉴가 없으면 일반 웹 화면으로 이용하세요.'];
      note='Mac Safari에서는 지원 버전의 파일 메뉴 → Dock에 추가를 사용할 수 있습니다.';
    }
    el('stepsTitle').textContent=title;el('installSteps').replaceChildren(...steps.map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));el('guideNote').textContent=note;
  }
  function refresh(){
    el('installNow').hidden=false;
    el('installNow').textContent=installed()?'GGFC 이용하기':'GGFC 설치하기';
    el('installHint').textContent=installed()?'아래 버튼으로 기록센터를 이용하세요.':embedded?'설치하려면 Chrome 또는 Safari에서 열어주세요. 버튼을 누르면 여는 방법을 안내합니다.':device==='ios'?'아이폰은 Safari의 공유 메뉴에서 설치합니다. 버튼을 눌러 설치 방법을 확인하세요.':promptEvent?'버튼을 누르면 브라우저의 설치 확인창이 열립니다.':'버튼을 누르면 설치 방법을 안내합니다. 직접 설치가 준비되면 같은 버튼으로 설치창을 열 수 있습니다.';
    el('manualGuide').hidden=installed();
    el('embeddedHelp').hidden=!embedded||installed();
    el('openApp').hidden=installed();
    el('openApp').textContent='설치 없이 GGFC 이용하기';
    el('deviceBadge').textContent=installed()?'GGFC 앱 환경':embedded?'앱 안의 브라우저':device==='ios'?'아이폰 · 아이패드':device==='android'?(samsung?'안드로이드 · 삼성 인터넷':'갤럭시 · 안드로이드'):'PC · 기타 기기';
    el('guideTitle').textContent=installed()?'GGFC를 이용할 준비가 됐습니다':'GGFC 앱 설치하기';
    el('guideIntro').textContent=installed()?'아래 버튼을 눌러 GGFC 기록센터로 이동하세요.':'아래 설치 버튼을 눌러 진행해 주세요.';
  }
  window.addEventListener('beforeinstallprompt',event=>{
    event.preventDefault();promptEvent=event;refresh();
    if(!embedded&&!installed())status('설치 준비 완료 · GGFC 설치하기를 눌러주세요.');
  });
  window.addEventListener('appinstalled',()=>{promptEvent=null;installedHere=true;refresh();status('설치가 완료됐습니다. 홈 화면의 GGFC 아이콘으로 실행하세요.');});
  matchMedia('(display-mode: standalone)').addEventListener('change',refresh);
  function explainInstallation(){
    if(embedded){
      status('이 화면에서는 직접 설치할 수 없습니다. Chrome 또는 Safari에서 다시 열어주세요.');
      el('embeddedHelp').hidden=false;
      el('embeddedHelp').scrollIntoView({block:'center',behavior:'auto'});
      el('copyURL').focus({preventScroll:true});
    }else{
      showGuide(selected);el('manualGuide').hidden=false;
      status(selected==='ios'?'아이폰은 Safari 공유 → 홈 화면에 추가로 설치합니다. 아래 순서대로 진행해 주세요.':'브라우저가 직접 설치창을 제공하지 않아 메뉴 설치 방법을 안내합니다. 아래 순서대로 진행해 주세요.');
      el('stepsTitle').scrollIntoView({block:'center',behavior:'auto'});
      el('stepsTitle').focus({preventScroll:true});
    }
  }
  el('installNow').addEventListener('click',async()=>{
    if(prompting)return;
    if(installed()){location.assign(new URL('index.html',document.baseURI));return;}
    if(!promptEvent||embedded){explainInstallation();return;}
    prompting=true;el('installNow').disabled=true;
    const event=promptEvent;promptEvent=null;
    try{
      await event.prompt();const choice=await event.userChoice;
      status(choice.outcome==='accepted'?'설치를 요청했습니다. 설치 완료 후 홈 화면에서 GGFC를 실행하세요.':'설치를 취소했습니다. 아래 브라우저 메뉴 안내로 나중에 설치할 수 있습니다.');
    }catch(e){status('설치창을 열지 못했습니다. 아래 브라우저 메뉴 안내로 설치해 주세요.');}
    finally{prompting=false;el('installNow').disabled=false;refresh();}
  });
  document.querySelectorAll('[data-device]').forEach(b=>b.addEventListener('click',()=>showGuide(b.dataset.device)));
  el('copyURL').addEventListener('click',async()=>{
    const url=new URL('install.html',document.baseURI).href;
    try{await navigator.clipboard.writeText(url);el('copyStatus').textContent='주소를 복사했습니다. Chrome 또는 Safari 주소창에 붙여넣으세요.';}
    catch(e){el('copyStatus').textContent='주소를 길게 눌러 복사해 주세요: '+url;}
  });
  showGuide(selected);refresh();
  if('serviceWorker' in navigator&&isSecureContext){
    const register=()=>navigator.serviceWorker.register(new URL('service-worker.js',document.baseURI),{scope:new URL('./',document.baseURI).pathname,updateViaCache:'none'}).catch(()=>status('앱 저장을 준비하지 못했습니다. 인터넷 연결 후 다시 열거나 GGFC를 웹으로 이용하세요.'));
    if(document.readyState==='complete')register();else window.addEventListener('load',register,{once:true});
  }
})();
