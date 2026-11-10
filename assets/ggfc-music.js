/* Background music and the player-card reveal effect have separate playback lifecycles. */
window.GGFCMusic=(()=>{
  const audio=document.getElementById('ggfcMusic'),toggle=document.getElementById('ggfcMusicToggle');
  const status=document.getElementById('ggfcMusicStatus'),detail=document.getElementById('ggfcDetailDialog');
  const detailBody=document.getElementById('ggfcDetailBody'),startup=document.getElementById('ggfcStartup');
  const base=document.currentScript.src,defaultTrack=new URL('cl_anthem.mp3',base).href;
  const revealTrack=new URL('sfx_reveal.mp3',base).href,key='ggfc-background-music';
  const fileLimit=2*1024*1024,dataPrefix='data:audio/mpeg;base64,';
  let enabled=true,pageActive=true,ready=false,startupPending=!startup.hidden;
  let starting=false,attempt=0,playbackMessage='',needsGesture=false,track=defaultTrack,rawSource,objectURL='',usingDefaultFallback=false;
  try{enabled=localStorage.getItem(key)!=='0';}catch{}

  function normalize(raw){
    const src=typeof raw?.src==='string'?raw.src.trim():'';
    const name=typeof raw?.name==='string'?raw.name.trim().slice(0,100):'';
    if(src.startsWith(dataPrefix)&&src.length<=dataPrefix.length+4*Math.ceil(fileLimit/3)){
      const encoded=src.slice(dataPrefix.length);
      if(encoded.length%4===0&&/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))return {src,name};
    }
    if(src&&src.length<=2048){
      try{
        const url=new URL(src);
        if(url.protocol==='https:'&&!url.username&&!url.password)return {src:url.href,name};
      }catch{}
    }
    return {src:'',name:''};
  }
  const hasVideo=()=>detail.open&&!!detailBody.querySelector('.match-youtube-frame');
  const suspended=()=>!ready||startupPending||!pageActive||document.hidden||hasVideo();
  function updateControls(){
    toggle.setAttribute('aria-pressed',String(enabled));
    toggle.title=enabled?'배경 음악 끄기':'배경 음악 켜기';
    const message=enabled&&(hasVideo()?'유튜브 영상 화면에서 배경 음악 일시정지':playbackMessage||(usingDefaultFallback?'등록한 음악을 재생할 수 없어 기본곡을 사용합니다.':starting?'음악을 불러오고 있습니다…':''));
    status.textContent=message||'';
    status.hidden=!message;
  }
  function pause(){
    if(starting){attempt++;starting=false;}
    if(!audio.paused)audio.pause();
  }
  function resetMediaSource(){
    pause();audio.removeAttribute('src');audio.load();
    if(objectURL){URL.revokeObjectURL(objectURL);objectURL='';}
  }
  function playbackError(error){
    needsGesture=error?.name==='NotAllowedError';
    if(!needsGesture&&track!==defaultTrack&&!usingDefaultFallback){
      usingDefaultFallback=true;
      resetMediaSource();syncPlayback();
      return;
    }
    playbackMessage=needsGesture?'화면을 한 번 누르면 배경 음악이 시작됩니다.':'배경 음악을 재생할 수 없습니다. 설정이나 연결을 확인해 주세요.';
  }
  function syncPlayback(){
    if(!enabled||suspended()){
      pause();updateControls();return;
    }
    if(starting||!audio.paused||playbackMessage){updateControls();return;}
    // Keep the shared upload portable and expose it to the media decoder as a Blob.
    const selected=usingDefaultFallback?defaultTrack:track;
    if(selected.startsWith(dataPrefix)&&!objectURL){
      const bytes=Uint8Array.from(atob(selected.slice(dataPrefix.length)),c=>c.charCodeAt(0));
      objectURL=URL.createObjectURL(new Blob([bytes],{type:'audio/mpeg'}));
    }
    const src=objectURL||selected;
    if(audio.getAttribute('src')!==src)audio.src=src;
    const token=++attempt;
    starting=true;updateControls();
    audio.play().then(()=>{
      if(token!==attempt)return;
      starting=false;updateControls();
    }).catch(error=>{
      if(token!==attempt)return;
      starting=false;playbackError(error);updateControls();
    });
  }
  function configure(raw){
    if(raw?.src===rawSource)return;
    rawSource=raw?.src;
    const next=normalize(raw).src||defaultTrack;
    if(track===next)return;
    resetMediaSource();
    track=next;usingDefaultFallback=false;playbackMessage='';needsGesture=false;
    syncPlayback();
  }
  toggle.onclick=()=>{
    enabled=!enabled;playbackMessage='';needsGesture=false;
    try{localStorage.setItem(key,enabled?'1':'0');}catch{}
    if(enabled&&(usingDefaultFallback||audio.error)){usingDefaultFallback=false;resetMediaSource();}
    syncPlayback();
  };
  audio.addEventListener('error',()=>{
    if(!enabled||starting)return;
    playbackError(audio.error);updateControls();
  });
  document.addEventListener('click',event=>{
    if(!event.isTrusted||!enabled||!needsGesture||suspended()||toggle.contains(event.target))return;
    needsGesture=false;playbackMessage='';syncPlayback();
  },true);

  const AudioEngine=window.AudioContext||window.webkitAudioContext;
  let context,bytesRequest,bufferRequest,source,revealAudio,revealToken=0;
  function getRevealBytes(){
    if(!bytesRequest)bytesRequest=fetch(revealTrack,{priority:'low'}).then(response=>{
      if(!response.ok)throw Error('Player reveal sound unavailable');
      return response.arrayBuffer();
    }).catch(()=>{bytesRequest=null;return null;});
    return bytesRequest;
  }
  function warmReveal(){
    if(AudioEngine){getRevealBytes();return;}
    if(!revealAudio){
      revealAudio=new Audio(revealTrack);
      revealAudio.preload='auto';
    }
  }
  function stopReveal(){
    revealToken++;
    if(source){source.stop();source=null;}
    if(revealAudio&&!revealAudio.paused)revealAudio.pause();
  }
  function prepareReveal(){
    stopReveal();
    if(suspended())return null;
    if(!AudioEngine){
      // Keep HTML audio in the player's original click when Web Audio is unavailable.
      warmReveal();
      revealAudio.currentTime=0;
      revealAudio.play().catch(()=>{});
      return null;
    }
    try{
      context??=new AudioEngine();
      const running=context.state==='running'?Promise.resolve(true):context.resume().then(()=>context.state==='running',()=>false);
      if(!bufferRequest)bufferRequest=getRevealBytes().then(bytes=>bytes?context.decodeAudioData(bytes.slice(0)):null).catch(()=>null).then(buffer=>{
        if(!buffer)bufferRequest=null;
        return buffer;
      });
      return {token:revealToken,prepared:Promise.all([running,bufferRequest])};
    }catch{return null;}
  }
  function playReveal(effect){
    if(!effect)return;
    const deadline=performance.now()+650;
    effect.prepared.then(([running,buffer])=>{
      if(!running||!buffer||effect.token!==revealToken||suspended()||performance.now()>deadline)return;
      const node=context.createBufferSource();
      node.buffer=buffer;node.connect(context.destination);
      source=node;node.onended=()=>{if(source===node)source=null;};
      node.start();
    });
  }
  function refreshPlayback(){
    if(suspended())stopReveal();
    syncPlayback();
  }

  document.addEventListener('visibilitychange',refreshPlayback);
  window.addEventListener('pagehide',()=>{pageActive=false;refreshPlayback();});
  window.addEventListener('pageshow',()=>{pageActive=true;refreshPlayback();});
  const videoObserver=new MutationObserver(refreshPlayback);
  videoObserver.observe(detail,{attributes:true,attributeFilter:['open']});
  videoObserver.observe(detailBody,{childList:true});
  if(startupPending){
    const introObserver=new MutationObserver(()=>{
      if(!startup.hidden)return;
      introObserver.disconnect();startupPending=false;
      warmReveal();
      refreshPlayback();
    });
    introObserver.observe(startup,{attributes:true,attributeFilter:['hidden']});
  }
  document.addEventListener('DOMContentLoaded',()=>setTimeout(()=>{
    ready=true;toggle.hidden=false;
    if(!startupPending)warmReveal();
    refreshPlayback();
  },0),{once:true});
  return {configure,normalize,fileLimit,dataPrefix,prepareReveal,playReveal,stopReveal};
})();
