/* Shared BGM settings use the existing administrator save and revision checks. */
window.GGFCMusicSettings=(()=>{
  const panel=document.getElementById('musicSettingsPanel'),form=document.getElementById('musicSettingsForm');
  const fileInput=document.getElementById('musicSettingsFile'),urlInput=document.getElementById('musicSettingsURL');
  const saveButton=document.getElementById('musicSettingsSave'),defaultButton=document.getElementById('musicSettingsDefault');
  const current=document.getElementById('musicSettingsCurrent'),status=document.getElementById('musicSettingsStatus');
  const music=window.GGFCMusic;
  let draft=null,loading=false,saving=false,readId=0;
  const saved=()=>music.normalize(DB.settings?.backgroundMusic);
  const dirty=()=>loading||draft!==null||!!urlInput.value.trim();
  function controls(){
    fileInput.disabled=urlInput.disabled=saving;
    saveButton.disabled=saving||loading||!draft;
    defaultButton.disabled=saving||(!saved().src&&!dirty());
  }
  function render(){
    panel.hidden=!admin||!GGFC.authorized;
    if(panel.hidden)return;
    const track=saved();
    current.textContent='현재 음악 '+(track.src?(track.name||'등록한 MP3'):'기본곡 · cl_anthem.mp3');
    controls();
  }
  function discard(){
    readId++;loading=false;draft=null;fileInput.value='';urlInput.value='';status.textContent='';
    render();
  }
  function change(message){
    status.textContent=message;controls();GGFC.refreshUI();
  }
  async function fileData(file){
    const bytes=new Uint8Array(await file.slice(0,3).arrayBuffer());
    const tag=bytes[0]===73&&bytes[1]===68&&bytes[2]===51;
    const frame=bytes[0]===255&&(bytes[1]&224)===224&&(bytes[1]&6)===2;
    if(!tag&&!frame)throw Error('재생 가능한 MP3 파일을 선택해 주세요.');
    const base64=await new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(String(reader.result).split(',')[1]||'');
      reader.onerror=()=>reject(Error('MP3 파일을 읽을 수 없습니다.'));
      reader.readAsDataURL(file);
    });
    const track=music.normalize({src:music.dataPrefix+base64,name:file.name});
    if(!track.src)throw Error('MP3 파일의 형식을 확인해 주세요.');
    return track;
  }
  fileInput.onchange=async()=>{
    if(!admin||!GGFC.authorized)return;
    const file=fileInput.files[0],id=++readId;
    loading=false;draft=null;urlInput.value='';
    if(!file){change('');return;}
    if(!/\.mp3$/i.test(file.name)||file.size>music.fileLimit){
      fileInput.value='';change('2MB 이하의 MP3 파일을 선택해 주세요.');return;
    }
    loading=true;change('MP3 파일을 읽고 있습니다…');
    try{
      const track=await fileData(file);
      if(id!==readId)return;
      draft=track;loading=false;change(track.name+' · 음악 설정 저장을 눌러 주세요.');
    }catch(error){
      if(id!==readId)return;
      fileInput.value='';loading=false;change(error.message);
    }
  };
  urlInput.oninput=()=>{
    if(!admin||!GGFC.authorized)return;
    readId++;loading=false;fileInput.value='';
    const track=music.normalize({src:urlInput.value,name:'등록한 MP3 주소'});
    draft=track.src&&!track.src.startsWith(music.dataPrefix)?track:null;
    change(draft?'음악 설정 저장을 눌러 주세요.':urlInput.value?'https://로 시작하는 MP3 주소를 입력해 주세요.':'');
  };
  defaultButton.onclick=()=>{
    if(!admin||!GGFC.authorized)return;
    readId++;loading=false;fileInput.value='';urlInput.value='';
    draft={src:'',name:''};change('기본곡 cl_anthem.mp3를 선택했습니다. 음악 설정 저장을 눌러 주세요.');
  };
  form.onsubmit=async event=>{
    event.preventDefault();
    if(!admin||!GGFC.canEdit()){toast('관리자 인증과 서버 연결을 확인해 주세요.');return;}
    if(!draft||loading||saving)return;
    const settings={...DB.settings};
    if(draft.src)settings.backgroundMusic=draft;else delete settings.backgroundMusic;
    const encoded=GGFC.split({...DB,settings},1,'audio-size-check',Date.now());
    if(new TextEncoder().encode(JSON.stringify(encoded)).length>8*1024*1024-1024){
      change('공유 기록 용량 한도에 가까워 MP3 주소로 저장해 주세요.');return;
    }
    DB.settings=settings;
    draft=null;fileInput.value='';urlInput.value='';saving=true;
    render();change('배경 음악을 공유 저장하고 있습니다…');
    music.configure(settings.backgroundMusic);
    save();
    const shared=await GGFC.flush();
    saving=false;render();
    change(shared?'배경 음악 공유 저장 완료.':'상단 공유 저장 상태를 확인해 주세요.');
  };
  return {render,discard,get dirty(){return dirty();},get draft(){return draft;}};
})();
