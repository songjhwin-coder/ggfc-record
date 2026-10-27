/* V3.25.48: paint a startup cover without waiting for its image or changing data calculations. */
window.GGFCStartup=(()=>{
 'use strict';
 const root=document.getElementById('ggfcStartup'),picture=document.getElementById('ggfcStartupImage'),close=document.getElementById('ggfcStartupClose');
 const base=new URL('../',document.currentScript.src).href,defaultImage='assets/ggfc-startup-default.png',key='ggfc-startup-v1:'+base;
 let ready=false,manual=false,previewing=false,dirty=false,draft=null,config={enabled:true,image:''},watchdog=0,fade=0,ticket=0,uploading=false,previousFocus=null;
 const inertState=new Map();
 function safeImage(value){
  if(typeof value!=='string'||value.length>750000)return '';
  const s=value.trim();if(!s)return '';
  if(/^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(s))return s;
  try{const u=new URL(s);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:'';}catch{return '';}
 }
 function normalize(value){return {enabled:value?.enabled!==false,image:safeImage(value?.image)};}
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
  if(preview)previousFocus=document.activeElement;
  clearTimeout(fade);clearTimeout(watchdog);root.classList.remove('is-leaving');root.hidden=false;setPicture(value);previewing=preview;isolate(true);
  document.getElementById('ggfcStartupMessage').textContent=preview?'앱 시작 화면 미리보기':'기록을 불러오고 있습니다…';
  close.textContent=preview?'미리보기 닫기':'바로 열기';
  if(preview){close.focus();}else watchdog=setTimeout(()=>dismiss('timeout'),12000);
 }
 function dismiss(reason='ready'){
  clearTimeout(watchdog);if(root.hidden)return;
  if(reason==='manual')manual=true;
  const wasPreview=previewing;previewing=false;root.classList.add('is-leaving');isolate(false);
  const done=()=>{root.hidden=true;root.classList.remove('is-leaving');if(wasPreview&&previousFocus?.isConnected)previousFocus.focus();};
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)done();else fade=setTimeout(done,180);
 }
 function configure(value){config=normalize(value);cache(config);if(!ready&&!manual&&!previewing){if(config.enabled){if(!root.hidden)setPicture(config);}else dismiss('disabled');}}
 function finish(){ready=true;if(!previewing)requestAnimationFrame(()=>requestAnimationFrame(()=>{if(!previewing)dismiss();}));}
 function fail(){ready=true;if(!previewing)dismiss('error');}
 close.onclick=()=>dismiss('manual');
 root.addEventListener('keydown',e=>{if(e.key==='Escape')dismiss('manual');if(e.key==='Tab'){e.preventDefault();close.focus();}});
 window.addEventListener('pageshow',e=>{if(e.persisted)fail();});
 function readConfig(){return normalize(typeof DB!=='undefined'?DB.settings?.startupScreen:config);}
 const editable=()=>typeof admin!=='undefined'&&admin&&typeof GGFC!=='undefined'&&GGFC.canEdit();
 function status(text){const el=document.getElementById('startupSettingsStatus');if(el)el.textContent=text;}
 function changed(){dirty=true;status('저장 전 변경');if(typeof GGFC!=='undefined')GGFC.refreshUI();}
 function previewImage(){const el=document.getElementById('startupSettingsImage');if(el){el.hidden=false;el.src=source(normalize(draft));el.onerror=()=>{el.hidden=true;status('이미지를 불러오지 못했습니다. 주소 또는 사진을 확인하세요.');};}const info=document.getElementById('startupImageInfo');if(info)info.textContent=draft.image.startsWith('data:')?'직접 등록한 사진':draft.image?'외부 이미지 URL':'기본 GGFC 이미지';}
 function renderSettings(){
  const panel=document.getElementById('startupSettingsPanel');if(!panel)return;panel.hidden=!(typeof admin!=='undefined'&&admin);if(panel.hidden)return;
  if(!dirty)draft=readConfig();
  document.getElementById('startupEnabled').checked=draft.enabled;
  const url=document.getElementById('startupImageURL');url.value=draft.image.startsWith('http')?draft.image:'';
  document.getElementById('startupEnabled').onchange=e=>{if(!editable())return;draft.enabled=e.target.checked;changed();};
  url.oninput=()=>{if(!editable())return;draft.image=url.value.trim();changed();};
  url.onchange=()=>{if(editable())previewImage();};
  document.getElementById('startupImageUpload').onchange=upload;
  document.getElementById('startupUseDefault').onclick=()=>{if(!editable())return;ticket++;uploading=false;draft.image='';url.value='';changed();previewImage();};
  document.getElementById('startupPreview').onclick=()=>{if(!editable())return;const image=safeImage(draft.image);if(draft.image&&!image){status('http(s) 이미지 주소를 확인하세요.');return;}show({...draft,image},true);};
  document.getElementById('startupSave').onclick=()=>{
   if(!editable())return;if(uploading){status('사진 처리 완료 후 저장해 주세요.');return;}
   const image=safeImage(draft.image);if(draft.image&&!image){status('올바른 http(s) 이미지 주소를 입력해 주세요.');return;}
   DB.settings.startupScreen={enabled:draft.enabled,image};dirty=false;configure(DB.settings.startupScreen);save();renderSettings();status('설정 적용 · 공유 저장 상태를 하단에서 확인하세요.');
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
 try{config=normalize(JSON.parse(localStorage.getItem(key)||'null'));}catch{}
 if(config.enabled)show(config);
 document.addEventListener('DOMContentLoaded',()=>{if(!root.hidden)isolate(true);},{once:true});
 return {configure,finish,fail,renderSettings,discard,safeImage,normalize,get dirty(){return dirty;},get draft(){return draft?normalize(draft):null;}};
})();
