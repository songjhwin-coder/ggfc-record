/* Background music and the player-card reveal effect have separate playback lifecycles. */
window.GGFCMusic=(()=>{
  const nativeAudio=document.getElementById('ggfcMusic'),toggle=document.getElementById('ggfcMusicToggle');
  const muteToggle=document.getElementById('ggfcMobileMute'),root=document.documentElement;
  const status=document.getElementById('ggfcMusicStatus'),detail=document.getElementById('ggfcDetailDialog');
  const detailBody=document.getElementById('ggfcDetailBody'),startup=document.getElementById('ggfcStartup');
  const base=document.currentScript.src,defaultTrack=new URL('cl_anthem.mp3',base).href;
  const revealTrack=new URL('sfx_reveal.mp3',base).href,key='ggfc-background-music';
  const fileLimit=2*1024*1024,dataPrefix='data:audio/mpeg;base64,';
  const muteKey='ggfc-mobile-silence';
  let enabled=true,muted=false,pageActive=true,ready=false,startupPending=!startup.hidden;
  let previousSessionType=null;
  let starting=false,attempt=0,playbackMessage='',needsGesture=false,track=defaultTrack,rawSource,objectURL='',usingDefaultFallback=false;
  const AudioEngine=window.AudioContext||window.webkitAudioContext;
  let audio=nativeAudio,context,mixAudio,mixGain,revealGain,mixUnavailable=false,volumeLimited=false,resumeAt=0;
  let volumes=normalizeVolumes();
  try{
    enabled=localStorage.getItem(key)!=='0';
    muted=localStorage.getItem(muteKey)==='1';
  }catch{}

  function normalizeVolumes(raw){
    const percent=value=>Number.isFinite(value)?Math.max(0,Math.min(100,Math.round(value))):100;
    return {background:percent(raw?.background),reveal:percent(raw?.reveal)};
  }
  function setMediaVolume(element,value){
    try{element.volume=value;}catch{}
    return Math.abs(element.volume-value)<0.001;
  }
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
  const isMobile=()=>root.classList.contains('ggfc-mobile');
  const mobileMuted=()=>isMobile()&&muted;
  const suspended=()=>!ready||startupPending||!pageActive||document.hidden||hasVideo()||mobileMuted();
  function syncAudioSession(){
    const session=navigator.audioSession;
    if(!session)return;
    try{
      // Where supported, ambient follows the device's mute policy. Yield the session to video.
      if(isMobile()&&pageActive&&!document.hidden&&!hasVideo()){
        const current=session.type;
        if(current!=='ambient'){
          session.type='ambient';
          previousSessionType??=current;
        }
      }else if(previousSessionType!==null){
        session.type=previousSessionType;
        previousSessionType=null;
      }
    }catch{}
  }
  function updateControls(){
    toggle.setAttribute('aria-pressed',String(enabled));
    toggle.title=enabled?'배경 음악 끄기':'배경 음악 켜기';
    muteToggle.setAttribute('aria-pressed',String(muted));
    let message='';
    if(mobileMuted())message='이 기기의 앱 소리가 꺼져 있습니다.';
    else if(enabled){
      if(hasVideo())message='유튜브 영상 화면에서 배경 음악 일시정지';
      else if(volumes.background===0)message='관리자 설정 · 배경 음악 볼륨 0%';
      else if(playbackMessage)message=playbackMessage;
      else if(audio===mixAudio&&context.state!=='running')message='화면을 한 번 누르면 배경 음악이 시작됩니다.';
      else if(usingDefaultFallback)message='등록한 음악을 재생할 수 없어 기본곡을 사용합니다.';
      else if(volumeLimited)message='이 브라우저나 음악 주소에서는 배경 음악 볼륨 조절이 제한됩니다.';
      else if(starting)message='음악을 불러오고 있습니다…';
    }
    status.textContent=message;
    status.hidden=!message;
  }
  function pause(){
    if(starting){attempt++;starting=false;}
    if(!audio.paused)audio.pause();
  }
  function clearAudio(){
    pause();
    if(audio.hasAttribute('src')){audio.removeAttribute('src');audio.load();}
  }
  function resetMediaSource(){
    clearAudio();resumeAt=0;
    if(objectURL){URL.revokeObjectURL(objectURL);objectURL='';}
  }
  function switchAudio(output){
    if(audio===output)return;
    resumeAt=audio.currentTime||0;
    clearAudio();audio=output;
  }
  function volumeOutput(){
    const level=volumes.background/100;
    volumeLimited=false;
    if(setMediaVolume(nativeAudio,level))return nativeAudio;
    if(AudioEngine&&!mixUnavailable){
      try{
        context??=new AudioEngine();
        if(!mixAudio){
          const stream=new Audio();
          stream.loop=true;stream.preload='none';stream.crossOrigin='anonymous';
          mixGain=context.createGain();
          context.createMediaElementSource(stream).connect(mixGain).connect(context.destination);
          stream.addEventListener('error',mediaError);
          mixAudio=stream;
        }
        mixGain.gain.value=level;
        return mixAudio;
      }catch{mixUnavailable=true;}
    }
    volumeLimited=true;
    return nativeAudio;
  }
  function resumeMixer(){
    if(audio===mixAudio&&context.state!=='running')context.resume().then(updateControls,()=>{});
  }
  function playbackError(error){
    needsGesture=error?.name==='NotAllowedError';
    if(!needsGesture&&audio===mixAudio){
      // Cross-origin media may be playable directly even when its host blocks a Web Audio stream.
      mixUnavailable=true;
      switchAudio(nativeAudio);syncPlayback();return;
    }
    if(!needsGesture&&track!==defaultTrack&&!usingDefaultFallback){
      usingDefaultFallback=true;mixUnavailable=false;
      resetMediaSource();syncPlayback();
      return;
    }
    playbackMessage=needsGesture?'화면을 한 번 누르면 배경 음악이 시작됩니다.':'배경 음악을 재생할 수 없습니다. 설정이나 연결을 확인해 주세요.';
  }
  function syncPlayback(){
    if(!enabled||volumes.background===0||suspended()){
      pause();syncAudioSession();updateControls();return;
    }
    syncAudioSession();
    switchAudio(volumeOutput());resumeMixer();
    if(starting||!audio.paused||playbackMessage){updateControls();return;}
    // Keep the shared upload portable and expose it to the media decoder as a Blob.
    const selected=usingDefaultFallback?defaultTrack:track;
    if(selected.startsWith(dataPrefix)&&!objectURL){
      const bytes=Uint8Array.from(atob(selected.slice(dataPrefix.length)),c=>c.charCodeAt(0));
      objectURL=URL.createObjectURL(new Blob([bytes],{type:'audio/mpeg'}));
    }
    const src=objectURL||selected;
    if(audio.getAttribute('src')!==src){
      audio.src=src;
      if(resumeAt){audio.currentTime=resumeAt;resumeAt=0;}
    }
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
  function configure(raw,settings){
    const nextVolumes=normalizeVolumes(settings);
    const levelsChanged=nextVolumes.background!==volumes.background||nextVolumes.reveal!==volumes.reveal;
    volumes=nextVolumes;
    let trackChanged=false;
    if(raw?.src!==rawSource){
      rawSource=raw?.src;
      const next=normalize(raw).src||defaultTrack;
      if(track!==next){
        resetMediaSource();
        track=next;trackChanged=true;usingDefaultFallback=false;mixUnavailable=false;playbackMessage='';needsGesture=false;
      }
    }
    if(!levelsChanged&&!trackChanged)return;
    if(volumes.reveal===0)stopReveal();
    if(revealGain)revealGain.gain.value=volumes.reveal/100;
    if(revealAudio)setMediaVolume(revealAudio,volumes.reveal/100);
    syncPlayback();
  }
  toggle.onclick=()=>{
    enabled=!enabled;playbackMessage='';needsGesture=false;
    try{localStorage.setItem(key,enabled?'1':'0');}catch{}
    if(enabled&&(usingDefaultFallback||audio.error)){usingDefaultFallback=false;resetMediaSource();}
    syncPlayback();
  };
  muteToggle.onclick=()=>{
    if(!isMobile())return;
    muted=!muted;
    try{localStorage.setItem(muteKey,muted?'1':'0');}catch{}
    if(!muted&&needsGesture){needsGesture=false;playbackMessage='';}
    refreshPlayback();
  };
  function mediaError(event){
    if(event.currentTarget!==audio||!enabled||starting)return;
    playbackError(audio.error);updateControls();
  }
  nativeAudio.addEventListener('error',mediaError);
  document.addEventListener('click',event=>{
    if(!event.isTrusted||!enabled||volumes.background===0||suspended()||toggle.contains(event.target)||muteToggle.contains(event.target))return;
    if(needsGesture){needsGesture=false;playbackMessage='';syncPlayback();}
    else resumeMixer();
  },true);

  let bytesRequest,bufferRequest,source,revealAudio,revealToken=0;
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
    if(volumes.reveal===0||suspended())return null;
    if(!AudioEngine){
      // Keep HTML audio in the player's original click when Web Audio is unavailable.
      warmReveal();
      revealAudio.currentTime=0;setMediaVolume(revealAudio,volumes.reveal/100);
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
      if(!running||!buffer||effect.token!==revealToken||volumes.reveal===0||suspended()||performance.now()>deadline)return;
      const node=context.createBufferSource();
      if(!revealGain){
        revealGain=context.createGain();
        revealGain.connect(context.destination);
      }
      revealGain.gain.value=volumes.reveal/100;
      node.buffer=buffer;node.connect(revealGain);
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
  new MutationObserver(refreshPlayback).observe(root,{attributes:true,attributeFilter:['class']});
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
    ready=true;toggle.hidden=false;muteToggle.hidden=false;
    if(!startupPending)warmReveal();
    refreshPlayback();
  },0),{once:true});
  return {configure,normalize,normalizeVolumes,fileLimit,dataPrefix,prepareReveal,playReveal,stopReveal};
})();
