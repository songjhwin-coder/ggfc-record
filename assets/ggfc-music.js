/* One optional audio element stays alive as the app changes views. */
(()=>{
  const audio=document.getElementById('ggfcMusic'),toggle=document.getElementById('ggfcMusicToggle');
  const status=document.getElementById('ggfcMusicStatus'),detail=document.getElementById('ggfcDetailDialog');
  const detailBody=document.getElementById('ggfcDetailBody');
  const track=new URL('cl_anthem.mp3',document.currentScript.src).href;
  const key='ggfc-background-music';
  let enabled=false,pageActive=true,starting=false,attempt=0,playbackMessage='';
  try{enabled=localStorage.getItem(key)==='1';}catch{}

  const hasVideo=()=>detail.open&&!!detailBody.querySelector('.match-youtube-frame');
  function updateControls(){
    const on=enabled&&!playbackMessage;
    toggle.setAttribute('aria-pressed',String(on));
    toggle.title=on?'배경 음악 끄기':'배경 음악 켜기';
    const message=playbackMessage||(enabled&&hasVideo()?'유튜브 영상 화면에서 배경 음악 일시정지':starting?'음악을 불러오고 있습니다…':'');
    status.textContent=message;
    status.hidden=!message;
  }
  function syncPlayback(){
    if(!enabled||!pageActive||document.hidden||hasVideo()){
      if(starting){attempt++;starting=false;}
      if(!audio.paused)audio.pause();
      updateControls();
      return;
    }
    if(starting||!audio.paused||playbackMessage){updateControls();return;}
    if(!audio.getAttribute('src'))audio.src=track;
    const token=++attempt;
    starting=true;updateControls();
    audio.play().then(()=>{
      if(token!==attempt)return;
      starting=false;updateControls();
    }).catch(error=>{
      if(token!==attempt)return;
      starting=false;
      playbackMessage=error.name==='NotAllowedError'
        ?'배경 음악 버튼을 눌러 재생해 주세요.'
        :'음악을 재생할 수 없습니다. 버튼을 눌러 다시 시도해 주세요.';
      updateControls();
    });
  }

  toggle.onclick=()=>{
    enabled=!enabled||!!playbackMessage;
    playbackMessage='';
    try{localStorage.setItem(key,enabled?'1':'0');}catch{}
    if(enabled&&audio.error)audio.load();
    syncPlayback();
  };
  audio.addEventListener('error',()=>{
    if(!enabled||starting)return;
    playbackMessage='음악을 재생할 수 없습니다. 버튼을 눌러 다시 시도해 주세요.';
    updateControls();
  });
  document.addEventListener('visibilitychange',syncPlayback);
  window.addEventListener('pagehide',()=>{pageActive=false;syncPlayback();});
  window.addEventListener('pageshow',()=>{pageActive=true;syncPlayback();});

  // Pause as soon as the embedded player is open, including before its first click or ad.
  const videoObserver=new MutationObserver(syncPlayback);
  videoObserver.observe(detail,{attributes:true,attributeFilter:['open']});
  videoObserver.observe(detailBody,{childList:true});
  toggle.hidden=false;
  syncPlayback();
})();
