/* V3.25.63: one random gallery image per app launch; reload/history skip it. */
window.GGFCStartup=(()=>{
 'use strict';
 const root=document.getElementById('ggfcStartup'),picture=document.getElementById('ggfcStartupImage'),close=document.getElementById('ggfcStartupClose');
 const base=new URL('../',document.currentScript.src).href,defaultImage='assets/ggfc-startup-default.png',key='ggfc-startup-v1:'+base;
 const MAX_IMAGES=10,MAX_TOTAL=1500000;
 let selected=0,pendingURL='';
 let previewing=false,dirty=false,draft=null,config={enabled:true,images:[],image:'',durationSeconds:3},timer=0,fade=0,fadeEnd=null,ticket=0,uploading=false,previousFocus=null,showId=0,deadline=0;
 const inertState=new Map();
 function safeImage(value){
  if(typeof value!=='string'||value.length>750000)return '';
  const s=value.trim();if(!s)return '';
  if(/^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(s))return s;
  try{const u=new URL(s);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:'';}catch{return '';}
 }
 function validDuration(value){const n=Number(value);return value!==null&&value!==''&&Number.isFinite(n)&&n>=.5&&n<=15&&Number.isInteger(n*2);}
 function normalize(value){
  const candidates=Array.isArray(value?.images)?value.images:[value?.image],images=[];let size=0;
  for(const item of candidates){const image=safeImage(item);if(!image||images.includes(image)||images.length>=MAX_IMAGES||size+image.length>MAX_TOTAL)continue;images.push(image);size+=image.length;}
  return {enabled:value?.enabled!==false,images,image:images[0]||'',durationSeconds:validDuration(value?.durationSeconds)?Number(value.durationSeconds):3};
 }
 function source(value,random=false){const images=value.images||[];return images.length?images[random?Math.min(images.length-1,Math.floor(Math.random()*images.length)):Math.min(selected,images.length-1)]:new URL(defaultImage,base).href;}
 function cache(value){try{const s=JSON.stringify({enabled:value.enabled,images:value.images,durationSeconds:value.durationSeconds});if(localStorage.getItem(key)!==s)localStorage.setItem(key,s);}catch{}}
 function isolate(on){
  for(const id of ['mainContent','ggfcTopbar','ggfcSidebar']){const el=document.getElementById(id);if(!el)continue;if(on){if(!inertState.has(el))inertState.set(el,el.inert);el.inert=true;}else if(inertState.has(el)){el.inert=inertState.get(el);inertState.delete(el);}}
 }
 function setPicture(value){
  picture.hidden=false;picture.parentElement.classList.remove('is-missing');
  const url=source(value,true);if(picture.getAttribute('src')!==url)picture.src=url;
 }
 picture.onerror=()=>{const fallback=new URL(defaultImage,base).href;if(picture.src!==fallback){picture.src=fallback;return;}picture.hidden=true;picture.parentElement.classList.add('is-missing');};
 function cancelFade(){
  clearTimeout(fade);fade=0;if(fadeEnd){root.removeEventListener('transitionend',fadeEnd);fadeEnd=null;}
 }
 function show(value,preview=false){
  const current=++showId,settings=normalize(value);if(preview&&!root.contains(document.activeElement))previousFocus=document.activeElement;
  cancelFade();clearTimeout(timer);deadline=0;root.classList.remove('is-leaving');root.hidden=false;setPicture(settings);previewing=preview;isolate(true);
  document.getElementById('ggfcStartupMessage').textContent=preview?'앱 시작 화면 · '+settings.durationSeconds+'초 미리보기':'WELCOME TO GGFC';
  close.textContent=preview?'미리보기 닫기':'건너뛰기';
  if(preview)close.focus();
  // Start from the first display frame, never from a DB loading/completion event.
  requestAnimationFrame(()=>{if(current!==showId||root.hidden)return;deadline=performance.now()+settings.durationSeconds*1000;timer=setTimeout(()=>dismiss('duration'),settings.durationSeconds*1000);});
 }
 function dismiss(reason='duration'){
  if(root.hidden||(root.classList.contains('is-leaving')&&reason!=='history'))return;
  const current=++showId;clearTimeout(timer);deadline=0;cancelFade();
  const wasPreview=previewing;previewing=false;
  const done=()=>{
   if(current!==showId)return;cancelFade();root.hidden=true;root.classList.remove('is-leaving');isolate(false);
   if(wasPreview&&previousFocus?.isConnected)previousFocus.focus({preventScroll:true});previousFocus=null;
  };
  if(reason==='history'||matchMedia('(prefers-reduced-motion: reduce)').matches){done();return;}
  // Keep background controls inert until the overlay has actually disappeared.
  fadeEnd=event=>{if(event.target===root&&event.propertyName==='opacity')done();};
  root.addEventListener('transitionend',fadeEnd);root.classList.add('is-leaving');
  // Event-based cleanup with a fallback for interrupted/missing transitions.
  fade=setTimeout(done,750);
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
 function previewImage(){
  selected=Math.max(0,Math.min(selected,draft.images.length-1));
  const el=document.getElementById('startupSettingsImage');
  if(el){el.hidden=false;el.src=source(draft);el.onerror=()=>{el.hidden=true;status('이미지를 불러오지 못했습니다. 주소 또는 사진을 확인하세요.');};}
  const info=document.getElementById('startupImageInfo');if(info)info.textContent=draft.images.length?'등록 사진 '+draft.images.length+' / '+MAX_IMAGES+'장 · 실행마다 한 장을 무작위 표시':'등록 사진 없음 · 기본 GGFC 이미지';
  const gallery=document.getElementById('startupImageGallery');if(!gallery)return;gallery.replaceChildren();
  draft.images.forEach((image,index)=>{
   const card=document.createElement('div');card.className='startup-image-card'+(index===selected?' is-selected':'');
   const pick=document.createElement('button');pick.type='button';pick.className='startup-image-pick';pick.setAttribute('aria-label','사진 '+(index+1)+' 보기');pick.setAttribute('aria-pressed',String(index===selected));
   const img=document.createElement('img');img.src=image;img.alt='등록 사진 '+(index+1);img.loading='lazy';
   const text=document.createElement('span');text.textContent='사진 '+(index+1);pick.append(img,text);pick.onclick=()=>{if(!editable())return;selected=index;previewImage();};
   const remove=document.createElement('button');remove.type='button';remove.className='btn';remove.textContent='삭제';remove.setAttribute('aria-label','사진 '+(index+1)+' 삭제');remove.onclick=()=>{if(!editable()||uploading)return;draft.images.splice(index,1);selected=Math.min(selected,draft.images.length-1);changed();previewImage();};
   card.append(pick,remove);gallery.append(card);
  });
 }
 function addImage(image){
  if(draft.images.includes(image)){status('이미 등록한 사진입니다.');return false;}
  if(draft.images.length>=MAX_IMAGES){status('사진은 최대 '+MAX_IMAGES+'장까지 등록할 수 있습니다.');return false;}
  if(draft.images.reduce((sum,item)=>sum+item.length,0)+image.length>MAX_TOTAL){status('전체 사진 용량이 약 1.5MB를 넘습니다. 사진을 삭제하거나 더 작은 사진을 선택하세요.');return false;}
  draft.images.push(image);selected=draft.images.length-1;return true;
 }
 function appendURL(){
  if(!pendingURL.trim())return true;
  const image=safeImage(pendingURL);if(!/^https?:/.test(image)){status('올바른 http(s) 이미지 주소를 입력하세요.');return false;}
  if(!addImage(image))return false;pendingURL='';document.getElementById('startupImageURL').value='';changed();previewImage();return true;
 }
 function renderSettings(){
  const panel=document.getElementById('startupSettingsPanel');if(!panel)return;panel.hidden=!(typeof admin!=='undefined'&&admin);if(panel.hidden)return;
  if(!dirty){draft=readConfig();pendingURL='';}
  document.getElementById('startupEnabled').checked=draft.enabled;
  const duration=document.getElementById('startupDuration');duration.value=draft.durationSeconds;duration.oninput=()=>{if(!editable())return;draft.durationSeconds=duration.value;changed();};
  const url=document.getElementById('startupImageURL');url.value=pendingURL;
  document.getElementById('startupEnabled').onchange=e=>{if(!editable())return;draft.enabled=e.target.checked;changed();};
  url.oninput=()=>{if(!editable())return;pendingURL=url.value.trim();changed();};
  document.getElementById('startupAddURL').onclick=()=>{if(!editable()||uploading)return;if(appendURL())status(dirty?'사진 추가 완료 · 설정 저장을 눌러 주세요.':'이미지 URL을 입력하세요.');};
  document.getElementById('startupImageUpload').onchange=upload;
  document.getElementById('startupUseDefault').onclick=()=>{if(!editable())return;ticket++;uploading=false;draft.images=[];pendingURL='';url.value='';selected=0;changed();previewImage();};
  document.getElementById('startupPreview').onclick=()=>{if(!editable())return;if(uploading){status('사진 처리 완료 후 미리보기를 눌러 주세요.');return;}if(!validDuration(draft.durationSeconds)){status('표시 시간은 0.5~15초, 0.5초 단위로 입력하세요.');return;}if(appendURL())show(draft,true);};
  document.getElementById('startupSave').onclick=()=>{
   if(!editable())return;if(uploading){status('사진 처리 완료 후 저장해 주세요.');return;}
   if(!validDuration(draft.durationSeconds)){status('표시 시간은 0.5~15초, 0.5초 단위로 입력하세요.');return;}
   if(!appendURL())return;
   DB.settings.startupScreen=normalize(draft);dirty=false;configure(DB.settings.startupScreen);save();renderSettings();status('설정 적용 · 공유 저장 상태를 하단에서 확인하세요.');
  };
  document.getElementById('startupReload').onclick=()=>{if(!editable())return;discard();renderSettings();GGFC.refreshUI();};
  previewImage();status(dirty?'저장 전 변경':'현재 저장된 설정');
 }
 async function compressImage(file,target=700000){
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>15*1024*1024)throw Error('PNG·JPG·WebP 사진을 장당 15MB 이하로 선택하세요.');
  let bitmap,objectURL;
  try{
   if(typeof createImageBitmap==='function')bitmap=await createImageBitmap(file);
   else{objectURL=URL.createObjectURL(file);bitmap=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('사진을 읽지 못했습니다.'));img.src=objectURL;});}
   if(!bitmap.width||!bitmap.height||bitmap.width*bitmap.height>40000000)throw Error('이미지 크기가 너무 큽니다.');
   const ratio=Math.min(1,1600/bitmap.width,1600/bitmap.height),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
   const encode=()=>{let data=canvas.toDataURL('image/webp',.86);if(data.length>target)data=canvas.toDataURL('image/jpeg',.76);return data;};
   let data=encode();
   for(let pass=0;data.length>target&&pass<6;pass++){canvas.width=Math.max(1,Math.round(canvas.width*.78));canvas.height=Math.max(1,Math.round(canvas.height*.78));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);data=encode();}
   if(data.length>target)throw Error('더 작은 사진 또는 이미지 URL을 사용해 주세요.');return data;
  }finally{bitmap?.close?.();if(objectURL)URL.revokeObjectURL(objectURL);}
 }
 async function upload(event){
  const input=event.target,files=Array.from(input.files||[]);input.value='';if(!editable()||!files.length||uploading)return;
  if(files.length+draft.images.length>MAX_IMAGES){status('사진은 최대 '+MAX_IMAGES+'장까지 등록할 수 있습니다.');return;}
  const current=++ticket;uploading=true;changed();let added=0;const failures=[];
  try{
   for(let i=0;i<files.length;i++){
    if(current!==ticket)return;status('사진 준비 중 '+(i+1)+' / '+files.length+'…');
    try{const remaining=MAX_TOTAL-draft.images.reduce((sum,item)=>sum+item.length,0),target=Math.min(700000,Math.floor(remaining/(files.length-i)));if(target<1000)throw Error('전체 등록 용량 한도에 도달했습니다.');const data=await compressImage(files[i],target);if(current!==ticket)return;if(!editable()){status('관리자 연결을 확인하고 사진을 다시 선택하세요.');return;}if(addImage(data))added++;else failures.push(files[i].name+' (중복 또는 등록 한도)');}
    catch(e){failures.push(files[i].name+': '+e.message);}
   }
   if(current===ticket){previewImage();status(added+'장 추가 · '+(failures.length?'추가하지 못한 사진 '+failures.join(', ')+' · ':'')+'설정 저장을 눌러 주세요.');}
  }finally{if(current===ticket)uploading=false;}
 }
 function discard(){ticket++;uploading=false;dirty=false;draft=null;pendingURL='';selected=0;}
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
 return {configure,renderSettings,discard,safeImage,normalize,get dirty(){return dirty;},get draft(){if(!draft)return null;const value=normalize(draft),image=safeImage(pendingURL);if(image&&!value.images.includes(image)&&value.images.length<MAX_IMAGES&&value.images.join('').length+image.length<=MAX_TOTAL){value.images.push(image);value.image=value.images[0];}return value;}};
})();
