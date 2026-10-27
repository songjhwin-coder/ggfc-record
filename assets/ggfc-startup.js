/* V3.25.50: launch-only intro; browser/app reload and history navigation skip it. */
window.GGFCStartup=(()=>{
 'use strict';
 const root=document.getElementById('ggfcStartup'),picture=document.getElementById('ggfcStartupImage'),close=document.getElementById('ggfcStartupClose');
 const base=new URL('../',document.currentScript.src).href,defaultImage='assets/ggfc-startup-default.png',key='ggfc-startup-v1:'+base;
 let previewing=false,dirty=false,draft=null,config={enabled:true,image:'',durationSeconds:3},timer=0,fade=0,ticket=0,uploading=false,previousFocus=null,showId=0,deadline=0;
 const inertState=new Map();
 function safeImage(value){
  if(typeof value!=='string'||value.length>750000)return '';
  const s=value.trim();if(!s)return '';
  if(/^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(s))return s;
  try{const u=new URL(s);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:'';}catch{return '';}
 }
 function validDuration(value){const n=Number(value);return value!==null&&value!==''&&Number.isFinite(n)&&n>=.5&&n<=15&&Number.isInteger(n*2);}
 function normalize(value){return {enabled:value?.enabled!==false,image:safeImage(value?.image),durationSeconds:validDuration(value?.durationSeconds)?Number(value.durationSeconds):3};}
 function source(value){return value.image||new URL(defaultImage,base).href;}
 function cache(value){try{const s=JSON.stringify(value);if(localStorage.getItem(key)!==s)localStorage.setItem(key,s);}catch{}}
 function isolate(on){
  for(const id of ['mainContent','ggfcTopbar','ggfcSidebar']){const el=document.getElementById(id);if(!el)continue;if(on){if(!inertState.has(el))inertState.set(el,el.inert);el.inert=true;}else if(inertState.has(el)){el.inert=inertState.get(el);inertState.delete(el);}}
 }
 function setPicture(value){
  picture.hidden=false;picture.parentElement.classList.remove('is-missing');
  const url=source(value);if(picture.getAttribute('src')!==url)picture.src=url;
 }
 picture.onerror=()=>{picture.hidden=true;picture.parentElement.classList.add('is-missing');};
 function show(value,preview=false){
  const current=++showId,settings=normalize(value);if(preview)previousFocus=document.activeElement;
  clearTimeout(fade);clearTimeout(timer);deadline=0;root.classList.remove('is-leaving');root.hidden=false;setPicture(settings);previewing=preview;isolate(true);
  document.getElementById('ggfcStartupMessage').textContent=preview?'앱 시작 화면 · '+settings.durationSeconds+'초 미리보기':'WELCOME TO GGFC';
  close.textContent=preview?'미리보기 닫기':'건너뛰기';
  if(preview)close.focus();
  // Start from the first display frame, never from a DB loading/completion event.
  requestAnimationFrame(()=>{if(current!==showId||root.hidden)return;deadline=performance.now()+settings.durationSeconds*1000;timer=setTimeout(()=>dismiss('duration'),settings.durationSeconds*1000);});
 }
 function dismiss(reason='duration'){
  ++showId;clearTimeout(timer);deadline=0;if(root.hidden)return;
  const wasPreview=previewing;previewing=false;root.classList.add('is-leaving');isolate(false);
  const done=()=>{root.hidden=true;root.classList.remove('is-leaving');if(wasPreview&&previousFocus?.isConnected)previousFocus.focus();};
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)done();else fade=setTimeout(done,180);
 }
 // Shared changes become the next launch's settings; never replace/restart a running intro.
 function configure(value){config=normalize(value);cache(config);}
 close.onclick=()=>dismiss('manual');
 root.addEventListener('keydown',e=>{if(e.key==='Escape')dismiss('manual');if(e.key==='Tab'){e.preventDefault();close.focus();}});
 window.addEventListener('pageshow',e=>{if(e.persisted)dismiss('history');});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&deadline&&performance.now()>=deadline)dismiss('elapsed');});
 function readConfig(){return normalize(typeof DB!=='undefined'?DB.settings?.startupScreen:config);}
 const editable=()=>typeof admin!=='undefined'&&admin&&typeof GGFC!=='undefined'&&GGFC.canEdit();
 function status(text){const el=document.getElementById('startupSettingsStatus');if(el)el.textContent=text;}
 function changed(){dirty=true;status('저장 전 변경');if(typeof GGFC!=='undefined')GGFC.refreshUI();}
 function previewImage(){const el=document.getElementById('startupSettingsImage');if(el){el.hidden=false;el.src=source(normalize(draft));el.onerror=()=>{el.hidden=true;status('이미지를 불러오지 못했습니다. 주소 또는 사진을 확인하세요.');};}const info=document.getElementById('startupImageInfo');if(info)info.textContent=draft.image.startsWith('data:')?'직접 등록한 사진':draft.image?'외부 이미지 URL':'기본 GGFC 이미지';}
 function renderSettings(){
  const panel=document.getElementById('startupSettingsPanel');if(!panel)return;panel.hidden=!(typeof admin!=='undefined'&&admin);if(panel.hidden)return;
  if(!dirty)draft=readConfig();
  document.getElementById('startupEnabled').checked=draft.enabled;
  const duration=document.getElementById('startupDuration');duration.value=draft.durationSeconds;duration.oninput=()=>{if(!editable())return;draft.durationSeconds=duration.value;changed();};
  const url=document.getElementById('startupImageURL');url.value=draft.image.startsWith('http')?draft.image:'';
  document.getElementById('startupEnabled').onchange=e=>{if(!editable())return;draft.enabled=e.target.checked;changed();};
  url.oninput=()=>{if(!editable())return;draft.image=url.value.trim();changed();};
  url.onchange=()=>{if(editable())previewImage();};
  document.getElementById('startupImageUpload').onchange=upload;
  document.getElementById('startupUseDefault').onclick=()=>{if(!editable())return;ticket++;uploading=false;draft.image='';url.value='';changed();previewImage();};
  document.getElementById('startupPreview').onclick=()=>{if(!editable())return;const image=safeImage(draft.image);if(draft.image&&!image){status('http(s) 이미지 주소를 확인하세요.');return;}if(!validDuration(draft.durationSeconds)){status('표시 시간은 0.5~15초, 0.5초 단위로 입력하세요.');return;}show({...draft,image},true);};
  document.getElementById('startupSave').onclick=()=>{
   if(!editable())return;if(uploading){status('사진 처리 완료 후 저장해 주세요.');return;}
   const image=safeImage(draft.image);if(draft.image&&!image){status('올바른 http(s) 이미지 주소를 입력해 주세요.');return;}
   if(!validDuration(draft.durationSeconds)){status('표시 시간은 0.5~15초, 0.5초 단위로 입력하세요.');return;}
   DB.settings.startupScreen={enabled:draft.enabled,image,durationSeconds:Number(draft.durationSeconds)};dirty=false;configure(DB.settings.startupScreen);save();renderSettings();status('설정 적용 · 공유 저장 상태를 하단에서 확인하세요.');
  };
  document.getElementById('startupReload').onclick=()=>{if(!editable())return;discard();renderSettings();GGFC.refreshUI();};
  previewImage();status(dirty?'저장 전 변경':'현재 저장된 설정');
 }
 async function upload(event){
  const input=event.target,file=input.files?.[0];input.value='';if(!editable()||!file)return;
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>15*1024*1024){status('PNG·JPG·WebP 사진을 15MB 이하로 선택하세요.');return;}
  const current=++ticket;uploading=true;changed();status('사진을 준비하고 있습니다…');let bitmap,objectURL;
  try{
   // Re-encode uploaded images to a bounded size before storing shared settings.
   if(typeof createImageBitmap==='function')bitmap=await createImageBitmap(file);
   else{objectURL=URL.createObjectURL(file);bitmap=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('사진을 읽지 못했습니다.'));img.src=objectURL;});}
   if(bitmap.width*bitmap.height>40000000)throw Error('이미지 크기가 너무 큽니다.');
   const ratio=Math.min(1,1600/bitmap.width,1600/bitmap.height),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
   let data=canvas.toDataURL('image/webp',.86);if(data.length>700000)data=canvas.toDataURL('image/jpeg',.76);if(data.length>700000)throw Error('더 작은 사진 또는 이미지 URL을 사용해 주세요.');
   if(current!==ticket)return;if(!editable()){status('관리자 연결을 확인하고 사진을 다시 선택하세요.');return;}
   draft.image=data;document.getElementById('startupImageURL').value='';previewImage();status('사진 준비 완료 · 설정 저장을 눌러 주세요.');
  }catch(e){if(current===ticket)status('사진 준비 실패: '+e.message);}finally{bitmap?.close?.();if(objectURL)URL.revokeObjectURL(objectURL);if(current===ticket)uploading=false;}
 }
 function discard(){ticket++;uploading=false;dirty=false;draft=null;}
 // A reload is not an app launch. Do not use a persistent "already shown"
 // flag: that would incorrectly suppress a later, genuinely new app window.
 function launchAllowed(){
  let seen=false,sessionAvailable=false;
  try{const sessionKey='ggfc-startup-window-v1:'+base;seen=sessionStorage.getItem(sessionKey)==='1';sessionStorage.setItem(sessionKey,'1');sessionAvailable=true;}catch{}
  let internal=false;
  try{const ref=new URL(document.referrer),app=new URL(base);internal=ref.origin===app.origin&&['index.html','mobile.html',''].some(name=>ref.pathname===new URL(name,base).pathname);}catch{}
  try{const type=performance.getEntriesByType('navigation')[0]?.type;if(type)return type==='navigate'&&!internal;}catch{}
  try{const type=performance.navigation?.type;if(type===1||type===2)return false;if(type===0)return !internal;}catch{}
  // Older browsers: once per tab/window; storage failure fails open to the app.
  return sessionAvailable&&!seen&&!internal;
 }
 try{config=normalize(JSON.parse(localStorage.getItem(key)||'null'));}catch{}
 const isLaunch=launchAllowed();
 if(config.enabled&&isLaunch)show(config);
 document.addEventListener('DOMContentLoaded',()=>{if(!root.hidden)isolate(true);},{once:true});
 return {configure,renderSettings,discard,safeImage,normalize,get dirty(){return dirty;},get draft(){return draft?normalize(draft):null;}};
})();
