/* Additive thumbnail editor. Sporting records and existing image exports are read-only inputs. */
window.GGFCThumbnail=(()=>{
 'use strict';
 const W=1280,H=720,MAX_LAYERS=32,MAX_BYTES=1200000;
 let draft=null,dirty=false,busy=false,selected='score',previewId='',model=null,drag=null,paintId=0,frame=0,uploadId=0,previewWarnings=[],draftRevision=0,batchBusy=false,batchCancelled=false,previewBusy=false;
 const cache=new Map(),q=id=>document.getElementById(id),editable=()=>!!window.GGFCOperator?.canEdit(),usable=()=>!!window.GGFCOperator?.canUse();
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),number=(n,f)=>Number.isFinite(Number(n))?Number(n):f;
 const copy=x=>JSON.parse(JSON.stringify(x));
 function imageSource(value){
  if(typeof value!=='string'||value.length>750000)return '';
  const src=value.trim();if(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(src))return src;
  if(/[\u0000-\u001f\u007f]/.test(src))return '';
  try{const url=new URL(src,document.baseURI);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password&&(src.startsWith('http')||src.startsWith('assets/'))?url.href:'';}catch{return '';}
 }
 const color=(s,f='#ffffff')=>/^#[\da-f]{6}$/i.test(s||'')?s:f;
 function teamLayers(side,box){
  const {x,y,w,h}=box,logo=Math.min(w*.44,h*.29),pw=(w-12)/2;
  return [0,1,2,3].map(slot=>({id:side+'Staff'+slot,kind:'staff',field:side,slot,label:(side==='home'?'왼쪽':'오른쪽')+' 감독·코치 '+(slot+1),x:x+6+pw*(slot%2),y:y+h*.355+(slot>1?12:0),w:pw,h:h*.625})).concat([{id:side+'Logo',kind:'teamLogo',field:side,label:(side==='home'?'왼쪽':'오른쪽')+' 팀 로고',x:x+(w-logo)/2,y:y+h*.04,w:logo,h:logo}]);
 }
 function defaults(){return {version:2,enabled:true,background:'',wash:0,layers:[
  ...teamLayers('home',{x:24,y:34,w:272,h:444}),...teamLayers('away',{x:984,y:34,w:272,h:444}),
  {id:'meta',kind:'autoText',field:'meta',label:'경기 날짜·라운드',x:328,y:22,w:624,h:38,font:24},
  {id:'homeName',kind:'autoText',field:'homeName',label:'왼쪽 팀명',x:326,y:76,w:270,h:76,font:52},
  {id:'awayName',kind:'autoText',field:'awayName',label:'오른쪽 팀명',x:684,y:76,w:270,h:76,font:52},
  {id:'score',kind:'autoText',field:'score',label:'경기 결과',x:324,y:163,w:632,h:179,font:178},
  {id:'homeScorers',kind:'autoText',field:'homeScorers',label:'왼쪽 득점자',x:330,y:401,w:270,h:202,font:39},
  {id:'awayScorers',kind:'autoText',field:'awayScorers',label:'오른쪽 득점자',x:680,y:401,w:270,h:202,font:39},
  {id:'clubLogo',kind:'club',field:'clubLogo',label:'하단 기본 헤더 로고',x:563,y:568,w:154,h:138}
 ].map(r=>({...r,visible:true,color:'#ffffff'}))};}
 const autoFields=new Set(['home','away','meta','homeName','awayName','score','homeScorers','awayScorers','clubLogo']);
 function normalize(value){
  const base=defaults(),input=value&&typeof value==='object'?value:base,seen=new Set(),layers=[];
  const original=Array.isArray(input.layers)?input.layers:base.layers,rows=original.flatMap(row=>row?.kind==='team'&&['home','away'].includes(row.field)?teamLayers(row.field,{x:number(row.x,24),y:number(row.y,34),w:clamp(number(row.w,272),24,W),h:clamp(number(row.h,354),24,H)}).map(r=>({...r,visible:row.visible!==false})):row);
  for(const row of rows){
   if(!row||!['staff','teamLogo','autoText','club','text','image'].includes(row.kind)||layers.length>=MAX_LAYERS)continue;
   const id=String(row.id||'');if(!/^[a-z0-9_-]{1,60}$/i.test(id)||seen.has(id))continue;
   const allowed={staff:['home','away'],teamLogo:['home','away'],autoText:['meta','homeName','awayName','score','homeScorers','awayScorers'],club:['clubLogo']};
   if(allowed[row.kind]&&!allowed[row.kind].includes(row.field))continue;
   const w=clamp(number(row.w,200),24,W),h=clamp(number(row.h,100),24,H);
   layers.push({id,kind:row.kind,field:autoFields.has(row.field)?row.field:'',slot:clamp(Math.floor(number(row.slot,0)),0,3),label:String(row.label||'추가 항목').slice(0,50),x:clamp(number(row.x,0),0,W-w),y:clamp(number(row.y,0),0,H-h),w,h,font:clamp(number(row.font,48),8,300),color:color(row.color),visible:row.visible!==false,text:row.kind==='text'?String(row.text||'').slice(0,400):'',image:row.kind==='image'?imageSource(row.image):''});seen.add(id);
  }
  return {version:2,enabled:input.enabled!==false,background:imageSource(input.background),wash:clamp(number(input.wash,0),0,.8),layers:layers.length?layers:base.layers};
 }
 const rawStored=()=>window.GGFCOperator?.template||DB.settings?.youtubeThumbnail,stored=()=>normalize(rawStored()),configured=()=>[1,2].includes(rawStored()?.version)&&rawStored().enabled!==false;
 const totalBytes=value=>(value.background||'').length+value.layers.reduce((sum,r)=>sum+(r.image||'').length,0);
 function status(message,error=false){const el=q('ytStatus');if(el){el.textContent=message;el.classList.toggle('is-error',error);}}
 function changed(){dirty=true;GGFC.refreshUI();status('저장 전 변경 · Overview에는 저장한 배치가 적용됩니다.');}
 function discard(){uploadId++;busy=false;draft=null;dirty=false;drag=null;selected='score';paintId++;}
 function allMatches(){return uniqueRecordMatches(verifiedRecords().matches).filter(m=>m.id).slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(a.no).localeCompare(String(b.no),'ko',{numeric:true})||String(a.round).localeCompare(String(b.round),'ko',{numeric:true}));}
 const getMatch=id=>verifiedRecords().matches.find(m=>String(m.id)===String(id));
 function photoSources(name,year){const row=selectPlayerRoster(name,year),values=[typeof GGFCPlayerPhotos!=='undefined'?GGFCPlayerPhotos.photo(name):'',row?.photoCutout,row?.photo];return [...new Set(values.flatMap(src=>playerPhotoCandidates(src)))];}
 function matchModel(match){
  if(!match)return {sample:true,meta:'미리보기 · 등록 경기를 선택하세요',homeName:'왼쪽 팀',awayName:'오른쪽 팀',score:'0 : 0',homeScorers:'득점자',awayScorers:'득점자',home:{name:'왼쪽 팀',logo:'',staff:[]},away:{name:'오른쪽 팀',logo:'',staff:[]},clubLogo:headerLogo()};
  const detail=matchDetailData(match),side=team=>{
   const data=detail.teams.find(t=>t.team===team),staff=squadStaffAtMatch(match,team),people=[...staff.directors.map(name=>({name,role:'감독'})),...staff.coaches.map(name=>({name,role:'코치'}))];
   const scorers=(data?.rows||[]).filter(r=>r.g>0).sort((a,b)=>b.g-a.g||compareNamesKo(a.player,b.player)).map(r=>r.player+' '+r.g+'골');
   if(!scorers.length)scorers.push(data?.score>0?'득점자 미등록':'득점 없음');
   return {name:teamDisplayName(team),logo:teamLogo(team),staff:people.map(p=>({...p,sources:photoSources(p.name,String(match.date).slice(0,4))})),scorers:scorers.join('\n')};
  },home=side(match.home),away=side(match.away);
  return {id:String(match.id),date:match.date,no:match.no,meta:[String(match.date||'').replaceAll('-','.'),match.no,match.round,forfeitText(match)].filter(Boolean).join(' · '),homeName:home.name,awayName:away.name,score:num(match.hs)+' : '+num(match.as),homeScorers:home.scorers,awayScorers:away.scorers,home,away,clubLogo:headerLogo()};
 }
 function loadImage(src){
  if(!src)return Promise.resolve(null);if(cache.has(src))return cache.get(src);
  const promise=new Promise(resolve=>{const img=new Image();let done=false;const finish=value=>{if(done)return;done=true;clearTimeout(timer);resolve(value);},timer=setTimeout(()=>finish(null),8000);img.crossOrigin='anonymous';img.onload=()=>finish(img.naturalWidth&&img.naturalHeight?img:null);img.onerror=()=>finish(null);img.src=src;});
  cache.set(src,promise);if(cache.size>180)cache.delete(cache.keys().next().value);promise.then(img=>{if(!img)setTimeout(()=>{if(cache.get(src)===promise)cache.delete(src);},30000);});return promise;
 }
 async function firstImage(sources){for(const src of sources){const img=await loadImage(src);if(img)return img;}return null;}
 function contain(ctx,img,x,y,w,h,cover=false){const ratio=cover?Math.max(w/img.width,h/img.height):Math.min(w/img.width,h/img.height),dw=img.width*ratio,dh=img.height*ratio;ctx.drawImage(img,x+(w-dw)/2,y+(h-dh)/2,dw,dh);}
 function textLines(ctx,text,width){const lines=[];for(const paragraph of String(text).split('\n')){let line='';for(const ch of Array.from(paragraph)){if(line&&ctx.measureText(line+ch).width>width){lines.push(line);line=ch;}else line+=ch;}lines.push(line);}return lines;}
 function paintText(ctx,text,box,weight=850){
  if(!text)return;let size=box.font||48,lines;
  do{ctx.font=weight+' '+size+'px GGFCThumbnail, sans-serif';lines=textLines(ctx,text,box.w-6);if(lines.length*size*1.16<=box.h)break;size-=1;}while(size>=8);
  size=Math.max(8,size);ctx.font=weight+' '+size+'px GGFCThumbnail, sans-serif';lines=textLines(ctx,text,box.w-6);const count=Math.max(1,Math.floor(box.h/(size*1.16)));if(lines.length>count){lines=lines.slice(0,count);let last=lines.at(-1);while(last&&ctx.measureText(last+'…').width>box.w-6)last=last.slice(0,-1);lines[lines.length-1]=last+'…';}
  ctx.save();ctx.beginPath();ctx.rect(box.x,box.y,box.w,box.h);ctx.clip();ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=box.color||'#fff';ctx.strokeStyle='#051229';ctx.lineWidth=Math.max(1,size*.045);ctx.lineJoin='round';ctx.shadowColor='#06112288';ctx.shadowBlur=4;ctx.shadowOffsetY=2;
  const top=box.y+(box.h-lines.length*size*1.16)/2+size*.58;lines.forEach((line,i)=>{const y=top+i*size*1.16;ctx.strokeText(line,box.x+box.w/2,y);ctx.fillText(line,box.x+box.w/2,y);});ctx.restore();
 }
 function initials(ctx,text,x,y,w,h){ctx.save();ctx.fillStyle='#1c3654';ctx.beginPath();ctx.ellipse(x+w/2,y+h/2,w*.44,h*.44,0,0,Math.PI*2);ctx.fill();paintText(ctx,String(text).slice(0,3),{x,y,w,h,font:Math.min(w,h)*.3,color:'#fff'},800);ctx.restore();}
 function silhouette(ctx,x,y,w,h){ctx.save();ctx.fillStyle='#a7b2bf';ctx.beginPath();ctx.arc(x+w/2,y+h*.22,Math.min(w*.22,h*.14),0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.ellipse(x+w/2,y+h*.7,w*.38,h*.36,0,0,Math.PI*2);ctx.fill();ctx.restore();}
 async function assetsFor(template,data){
  const warnings=[],assets={background:null,images:new Map(),teams:{},club:null};const jobs=[];
  if(template.background)jobs.push(loadImage(template.background).then(img=>{assets.background=img;if(!img)warnings.push('배경 사진');}));
  for(const layer of template.layers.filter(r=>r.visible)){
   if(layer.kind==='image'&&layer.image)jobs.push(loadImage(layer.image).then(img=>{assets.images.set(layer.id,img);if(!img)warnings.push(layer.label);}));
   if(layer.kind==='club'&&data.clubLogo)jobs.push(loadImage(data.clubLogo).then(img=>{assets.club=img;if(!img)warnings.push('기본 헤더 로고');}));
   if(['staff','teamLogo'].includes(layer.kind)&&!assets.teams[layer.field]){
    const team=data[layer.field];if(!team)continue;const item=assets.teams[layer.field]={logo:null,staff:[]};
    if(team.logo)jobs.push(loadImage(team.logo).then(img=>{item.logo=img;if(!img)warnings.push(team.name+' 로고');}));
    for(const p of team.staff.slice(0,4)){const person={...p,image:null};item.staff.push(person);jobs.push(firstImage(p.sources).then(img=>{person.image=img;if(!img)warnings.push(p.name+' 사진');}));}
   }
  }
  await Promise.all(jobs);return {assets,warnings:[...new Set(warnings)]};
 }
 function paintStaff(ctx,layer,team,assets){
  if(!team)return;const {x,y,w,h}=layer,p=assets?.staff?.[layer.slot];
  if(!p){if(!team.staff.length&&layer.slot===0){silhouette(ctx,x,y,w,h*.88);paintText(ctx,'운영진 미등록',{x,y:y+h*.88,w,h:h*.12,font:18,color:'#ffffff'},700);}return;}
  const ph=h*.89;
  if(p.image){const ratio=Math.min(w/p.image.width,ph/p.image.height),dw=p.image.width*ratio,dh=p.image.height*ratio;ctx.drawImage(p.image,x+(w-dw)/2,y+ph-dh,dw,dh);}else silhouette(ctx,x,y,w,ph);
  paintText(ctx,p.role+' '+p.name+(layer.slot===3&&team.staff.length>4?' · 외 '+(team.staff.length-4)+'명':''),{x,y:y+ph,w,h:h-ph,font:18,color:'#ffffff'},700);
 }
 let fontReady=null;
 async function draw(canvas,template,data){
  fontReady||=document.fonts.load('850 30px GGFCThumbnail').catch(()=>[]);await fontReady;const loaded=await assetsFor(template,data),ctx=canvas.getContext('2d');canvas.width=W;canvas.height=H;
  ctx.clearRect(0,0,W,H);
  if(loaded.assets.background){ctx.save();ctx.beginPath();ctx.rect(0,0,W,H);ctx.clip();contain(ctx,loaded.assets.background,0,0,W,H,true);ctx.restore();if(template.wash){ctx.fillStyle='rgba(255,255,255,'+template.wash+')';ctx.fillRect(0,0,W,H);}}
  for(const layer of template.layers){if(!layer.visible)continue;ctx.save();
   if(layer.kind==='staff')paintStaff(ctx,layer,data[layer.field],loaded.assets.teams[layer.field]);
   else if(layer.kind==='teamLogo'){const img=loaded.assets.teams[layer.field]?.logo;if(img)contain(ctx,img,layer.x,layer.y,layer.w,layer.h);else initials(ctx,data[layer.field]?.name||'',layer.x,layer.y,layer.w,layer.h);}
   else if(layer.kind==='autoText')paintText(ctx,data[layer.field]||'',layer,layer.field==='score'?900:850);
   else if(layer.kind==='text')paintText(ctx,layer.text,layer,850);
   else if(layer.kind==='image'){const img=loaded.assets.images.get(layer.id);if(img)contain(ctx,img,layer.x,layer.y,layer.w,layer.h);else initials(ctx,'이미지',layer.x,layer.y,layer.w,layer.h);}
   else if(layer.kind==='club'){if(loaded.assets.club)contain(ctx,loaded.assets.club,layer.x,layer.y,layer.w,layer.h);else initials(ctx,'GGFC',layer.x,layer.y,layer.w,layer.h);}
   ctx.restore();
  }
  return {canvas,warnings:loaded.warnings};
 }
 function selection(){const layer=draft?.layers.find(r=>r.id===selected),el=q('ytSelection');if(!el)return;el.hidden=!layer||!layer.visible;if(layer)Object.assign(el.style,{left:layer.x/W*100+'%',top:layer.y/H*100+'%',width:layer.w/W*100+'%',height:layer.h/H*100+'%'});}
 function repaint(){
  selection();if(frame)return;frame=requestAnimationFrame(async()=>{frame=0;const canvas=q('ytCanvas');if(!canvas||!draft)return;const token=++paintId,buffer=document.createElement('canvas');try{const result=await draw(buffer,normalize(draft),model||matchModel(null));if(token!==paintId||!canvas.isConnected)return;canvas.getContext('2d').drawImage(buffer,0,0);previewWarnings=result.warnings;const note=q('ytWarnings');if(note){note.hidden=!result.warnings.length;note.textContent='불러오지 못한 사진은 이름 표시로 대체했습니다: '+result.warnings.join(', ')+'. 선수 사진 관리에서 사진을 직접 등록하면 사용할 수 있습니다.';}}catch(e){if(token===paintId)status('미리보기 실패: '+e.message,true);}});
 }
 function currentLayer(){return draft?.layers.find(r=>r.id===selected);}
 function syncInspector(){
  const layer=currentLayer(),box=q('ytInspector');if(!box)return;box.hidden=!layer;q('ytEmptySelection').hidden=!!layer;
  const list=q('ytLayers');list.replaceChildren();draft.layers.forEach(row=>{const b=document.createElement('button');b.type='button';b.className='yt-layer-button'+(row.id===selected?' is-selected':'')+(!row.visible?' is-muted':'');const p=row.kind==='staff'?model?.[row.field]?.staff?.[row.slot]:null;b.textContent=row.label+(row.kind==='staff'?' · '+(p?p.role+' '+p.name:'미등록'):'')+(!row.visible?' · 숨김':'');b.setAttribute('aria-pressed',String(row.id===selected));b.onclick=()=>{selected=row.id;syncInspector();selection();};list.append(b);});
  if(!layer)return;
  q('ytSelectedLabel').textContent=layer.label;q('ytLayerVisible').checked=layer.visible;
  for(const key of ['x','y','w','h','font'])q('ytProp-'+key).value=Math.round(number(layer[key],48));q('ytProp-color').value=layer.color||'#ffffff';
  const isText=['text','autoText'].includes(layer.kind);q('ytTextProps').hidden=!isText;q('ytCustomTextWrap').hidden=layer.kind!=='text';q('ytCustomText').value=layer.text||'';q('ytDelete').disabled=!['text','image'].includes(layer.kind);
 }
 function modify(key,value){if(!editable()||busy)return;const layer=currentLayer();if(!layer)return;layer[key]=value;const fixed=normalize({...draft,layers:[layer]}).layers[0];Object.assign(layer,fixed);changed();repaint();}
 function point(event){const r=q('ytStage').getBoundingClientRect();return {x:(event.clientX-r.left)/r.width*W,y:(event.clientY-r.top)/r.height*H};}
 function bindStage(){
  const stage=q('ytStage');stage.onpointerdown=e=>{if(!editable()||busy||e.button!==0)return;const p=point(e),resizing=!!e.target.closest('[data-yt-resize]');if(!resizing){const hit=draft.layers.slice().reverse().find(r=>r.visible&&(r.kind!=='staff'||model?.[r.field]?.staff?.[r.slot]||(!model?.[r.field]?.staff?.length&&r.slot===0))&&p.x>=r.x&&p.y>=r.y&&p.x<=r.x+r.w&&p.y<=r.y+r.h);selected=hit?.id||'';syncInspector();selection();}const layer=currentLayer();if(!layer)return;stage.focus({preventScroll:true});drag={pointer:e.pointerId,point:p,start:copy(layer),resizing};stage.setPointerCapture(e.pointerId);e.preventDefault();};
  stage.onpointermove=e=>{if(!drag||drag.pointer!==e.pointerId)return;if(!editable()){drag=null;return;}const p=point(e),dx=p.x-drag.point.x,dy=p.y-drag.point.y,layer=currentLayer(),s=drag.start;if(!layer)return;
   if(drag.resizing){layer.w=Math.round(clamp(s.w+dx,24,W-s.x));layer.h=Math.round(clamp(s.h+dy,24,H-s.y));if(['text','autoText'].includes(layer.kind))layer.font=clamp(s.font*Math.sqrt(layer.w/s.w*layer.h/s.h),8,300);}else{layer.x=Math.round(clamp(s.x+dx,0,W-s.w));layer.y=Math.round(clamp(s.y+dy,0,H-s.h));}
   if(Math.abs(dx)+Math.abs(dy)>1)changed();selection();repaint();};
  const end=e=>{if(!drag||drag.pointer!==e.pointerId)return;drag=null;if(stage.hasPointerCapture(e.pointerId))stage.releasePointerCapture(e.pointerId);syncInspector();};stage.onpointerup=end;stage.onpointercancel=end;
  stage.onkeydown=e=>{if(!editable()||busy||!currentLayer()||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const step=e.shiftKey?10:1,key=e.altKey?(e.key==='ArrowLeft'||e.key==='ArrowRight'?'w':'h'):(e.key==='ArrowLeft'||e.key==='ArrowRight'?'x':'y'),sign=e.key==='ArrowLeft'||e.key==='ArrowUp'?-1:1;modify(key,currentLayer()[key]+sign*step);syncInspector();};
 }
 function assetInput(){return draft.layers.reduce((sum,r)=>sum+(r.image||'').length,0);}
 async function compress(file,target,background=false){
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>15*1024*1024)throw Error('PNG·JPG·WebP를 장당 15MB 이하로 선택하세요.');if(target<1500)throw Error('등록 이미지 용량 한도에 도달했습니다.');
  let bitmap,url;try{if(typeof createImageBitmap==='function')bitmap=await createImageBitmap(file);else{url=URL.createObjectURL(file);bitmap=await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('이미지를 읽지 못했습니다.'));image.src=url;});}
   if(!bitmap.width||!bitmap.height||bitmap.width*bitmap.height>40000000)throw Error('사진 크기가 너무 큽니다.');const scale=Math.min(1,1600/bitmap.width,1000/bitmap.height),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);let result=canvas.toDataURL('image/webp',.88);
   for(let pass=0;result.length>target&&pass<7;pass++){canvas.width=Math.max(1,Math.round(canvas.width*.78));canvas.height=Math.max(1,Math.round(canvas.height*.78));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);result=canvas.toDataURL(background?'image/jpeg':'image/webp',.84);}if(result.length>target)throw Error('더 작은 사진을 사용해 주세요.');return {image:result,ratio:bitmap.width/bitmap.height};
  }finally{bitmap?.close?.();if(url)URL.revokeObjectURL(url);}
 }
 async function upload(event,background=false){
  const files=Array.from(event.target.files||[]);event.target.value='';if(!editable()||busy||!files.length)return;if(!background&&files.length+draft.layers.length>MAX_LAYERS){status('자동 항목과 추가 항목은 합계 '+MAX_LAYERS+'개까지 사용할 수 있습니다.',true);return;}
  const token=++uploadId;busy=true;changed();status('이미지를 준비하고 있습니다…');
  try{const available=MAX_BYTES-(background?assetInput():totalBytes(draft)),items=[];for(const file of (background?files.slice(0,1):files)){items.push(await compress(file,Math.min(background?550000:220000,Math.floor(available/(background?1:files.length))),background));if(token!==uploadId||!editable())return;}
   if(background)draft.background=items[0].image;else items.forEach((item,i)=>{const w=clamp(item.ratio*180,24,240),h=clamp(w/item.ratio,24,180),id='image_'+Date.now().toString(36)+'_'+i;draft.layers.push({id,kind:'image',label:files[i].name.slice(0,50),image:item.image,x:W/2-w/2,y:H/2-h/2,w,h,font:48,color:'#ffffff',visible:true});selected=id;});
   if(totalBytes(draft)>MAX_BYTES)throw Error('전체 이미지 용량이 약 1.2MB를 넘습니다.');syncInspector();repaint();status('이미지 추가 완료 · 설정 저장을 눌러 주세요.');
  }catch(e){if(token===uploadId)status(e.message,true);}finally{if(token===uploadId)busy=false;}
 }
 async function saveTemplate(){
  if(!editable())return false;if(busy){status('이미지 처리 완료 후 저장하세요.',true);return false;}const value=normalize(draft);if(totalBytes(value)>MAX_BYTES){status('전체 이미지 용량이 약 1.2MB를 넘습니다.',true);return false;}
  busy=true;q('ytSave').disabled=true;status('썸네일 설정 공유 저장 중…');
  try{draftRevision=await GGFCOperator.saveTemplate(value,draftRevision);draft=copy(value);dirty=false;syncOverview();GGFC.refreshUI();status('썸네일 설정 공유 저장 완료');return true;}catch(e){status(e.message,true);return false;}finally{busy=false;if(q('ytSave'))q('ytSave').disabled=false;GGFC.refreshUI();}
 }
 function sharedChanged(){syncOverview();if(typeof activeView!=='undefined'&&activeView==='thumbnail'&&usable()){if(!dirty&&!busy)render();else if(draftRevision!==GGFCOperator.revision)status('다른 사용자가 썸네일을 변경했습니다. 현재 배치를 PNG로 보관한 뒤 저장값을 다시 불러오세요.',true);}}
 function render(){
  const root=q('youtubeThumbnailEditor');if(!root||!usable())return;if(!dirty){draft=stored();draftRevision=GGFCOperator.revision;}if(!draft)draft=defaults();const list=allMatches();if(!list.some(m=>String(m.id)===previewId))previewId=String(list[0]?.id||'');model=matchModel(getMatch(previewId));
  root.innerHTML=`<div class="yt-editor"><div class="yt-settings"><section class="card"><h3>배경과 추가 항목</h3><p id="ytAccessNotice" class="yt-notice" hidden></p><label class="yt-setting-toggle"><input type="checkbox" id="ytEnabled"> Overview 다운로드 버튼 표시</label><label>배경 이미지 등록<input id="ytBackgroundUpload" type="file" accept="image/png,image/jpeg,image/webp"></label><div class="yt-actions"><button type="button" class="btn" id="ytBackgroundClear">배경 사진 제거</button></div><label style="margin-top:10px">배경 사진 밝게<input id="ytWash" type="range" min="0" max="80" step="1"></label><div class="yt-actions"><button class="btn" type="button" id="ytAddText">문구 추가</button><label class="btn" style="margin:0;cursor:pointer">이미지 추가<input id="ytImageUpload" type="file" accept="image/png,image/jpeg,image/webp" multiple hidden></label></div><p>등록한 배경 이미지만 사용하며 배경이 없으면 투명하게 저장됩니다.</p><p>PNG·JPG·WebP 장당 15MB 이하 · 자동 압축 · 전체 이미지 약 1.2MB 이내</p></section><section class="card"><h3>항목과 배치</h3><div id="ytLayers" class="yt-layer-list"></div><div id="ytEmptySelection" class="yt-empty-selection">항목을 선택하세요.</div><div id="ytInspector"><div id="ytSelectedLabel" class="yt-inspector-title"></div><label class="yt-setting-toggle"><input id="ytLayerVisible" type="checkbox"> 표시</label><label id="ytCustomTextWrap">추가 문구<textarea id="ytCustomText" maxlength="400"></textarea></label><div class="yt-props">${[['x','왼쪽 위치',0,W],['y','위쪽 위치',0,H],['w','너비',24,W],['h','높이',24,H]].map(([k,label,min,max])=>`<label>${label}<input id="ytProp-${k}" type="number" min="${min}" max="${max}" step="1"></label>`).join('')}</div><div class="yt-props" id="ytTextProps" style="margin-top:8px"><label>글자 크기<input id="ytProp-font" type="number" min="8" max="300" step="1"></label><label>글자 색<input id="ytProp-color" type="color"></label></div><div class="yt-actions yt-layer-order"><button type="button" class="btn" id="ytBackward">뒤로</button><button type="button" class="btn" id="ytForward">앞으로</button><button type="button" class="btn" id="ytDelete">추가 항목 삭제</button></div></div><button type="button" class="btn" id="ytLayoutReset">기본 항목 배치 복원</button><p>팀 로고와 감독·코치 사진은 각각 따로 이동·확대할 수 있습니다. 자동 항목은 경기기록을 사용합니다. 추가 문구·사진은 모든 경기 썸네일에 함께 적용됩니다.</p></section></div><div class="yt-workspace"><section class="card"><label class="yt-match-select">미리보기 경기<select id="ytPreviewMatch"></select></label><div id="ytStage" class="yt-stage" tabindex="0" role="group" aria-label="썸네일 배치 편집. 드래그 이동, 오른쪽 아래 손잡이로 크기 조절" data-no-menu-swipe><canvas id="ytCanvas" width="1280" height="720" aria-label="썸네일 미리보기"></canvas><div id="ytSelection" class="yt-selection" hidden><button type="button" class="yt-resize" data-yt-resize aria-label="선택 항목 크기 조절"></button></div></div><p>항목을 클릭해 선택한 뒤 드래그로 이동하고 모서리 손잡이로 크기를 조절하세요. 방향키로 이동 · Shift 10px · Alt 크기 조절</p><p id="ytWarnings" class="yt-notice" hidden></p><div class="yt-save-row"><div class="yt-actions"><button type="button" class="btn primary" id="ytSave">설정 저장</button><button type="button" class="btn" id="ytReload">저장값 다시 불러오기</button></div><button type="button" class="btn" id="ytDownloadPreview">미리보기 PNG 저장</button></div><p id="ytStatus" class="yt-status" role="status" aria-live="polite"></p><p>1280 × 720 PNG · 미리보기는 편집 중인 배치, Overview 다운로드는 저장된 배치입니다.</p></section></div></div>`;
  const select=q('ytPreviewMatch');if(!list.length)select.add(new Option('등록 경기 없음 · 배치 예시',''));list.forEach(m=>select.add(new Option([m.date,m.no,m.round,teamDisplayName(m.home)+' '+num(m.hs)+':'+num(m.as)+' '+teamDisplayName(m.away)].filter(Boolean).join(' · '),String(m.id))));select.value=previewId;select.onchange=()=>{previewId=select.value;model=matchModel(getMatch(previewId));syncInspector();repaint();};
  q('ytEnabled').checked=draft.enabled;q('ytEnabled').onchange=e=>{if(!editable())return;draft.enabled=e.target.checked;changed();};q('ytWash').value=draft.wash*100;q('ytWash').oninput=e=>{if(!editable())return;draft.wash=Number(e.target.value)/100;changed();repaint();};
  q('ytBackgroundUpload').onchange=e=>upload(e,true);q('ytImageUpload').onchange=e=>upload(e,false);q('ytBackgroundClear').onclick=()=>{if(!editable()||busy)return;draft.background='';changed();repaint();};
  q('ytAddText').onclick=()=>{if(!editable()||busy)return;if(draft.layers.length>=MAX_LAYERS){status('항목은 '+MAX_LAYERS+'개까지 사용할 수 있습니다.',true);return;}const id='text_'+Date.now().toString(36)+'_'+draft.layers.length;draft.layers.push({id,kind:'text',label:'추가 문구 '+(draft.layers.filter(r=>r.kind==='text').length+1),text:'추가 문구',x:355,y:621,w:570,h:70,font:48,color:'#ffffff',visible:true});selected=id;changed();syncInspector();repaint();};
  q('ytCustomText').oninput=e=>modify('text',e.target.value);q('ytLayerVisible').onchange=e=>{modify('visible',e.target.checked);syncInspector();};for(const k of ['x','y','w','h','font'])q('ytProp-'+k).onchange=e=>{modify(k,number(e.target.value,currentLayer()?.[k]));syncInspector();};q('ytProp-color').oninput=e=>modify('color',e.target.value);
  for(const [id,step] of [['ytBackward',-1],['ytForward',1]])q(id).onclick=()=>{if(!editable()||busy)return;const i=draft.layers.findIndex(r=>r.id===selected),j=clamp(i+step,0,draft.layers.length-1);if(i<0||i===j)return;[draft.layers[i],draft.layers[j]]=[draft.layers[j],draft.layers[i]];changed();syncInspector();repaint();};
  q('ytDelete').onclick=()=>{if(!editable()||busy||!['image','text'].includes(currentLayer()?.kind))return;draft.layers=draft.layers.filter(r=>r.id!==selected);selected=draft.layers.at(-1)?.id||'';changed();syncInspector();repaint();};
  q('ytLayoutReset').onclick=()=>{if(!editable()||busy)return;draft.layers=[...defaults().layers,...draft.layers.filter(r=>['text','image'].includes(r.kind))].slice(0,MAX_LAYERS);selected='score';changed();syncInspector();repaint();};
  GGFCOperator.renderSettings(q('ytOperatorSettings'));GGFCOperator.refreshUI();q('ytSave').onclick=saveTemplate;q('ytReload').onclick=()=>{if(!editable())return;discard();render();GGFC.refreshUI();};q('ytDownloadPreview').onclick=()=>downloadPreview();bindStage();syncInspector();repaint();status(dirty?'저장 전 변경':'현재 저장된 배치 · 설정 저장 후 Overview에서 다운로드할 수 있습니다.');
 }
 async function png(canvas){return new Promise((resolve,reject)=>{try{canvas.toBlob(blob=>blob?resolve(blob):reject(Error('이미지 저장에 실패했습니다.')),'image/png');}catch(e){reject(e);}});}
 function sendDownload(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').slice(0,170);document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),20000);}
 async function exportMatch(match,template=stored()){
  const data=matchModel(match),canvas=document.createElement('canvas'),result=await draw(canvas,normalize(template),data),blob=await png(canvas);return {...result,blob,model:data};
 }
 async function downloadPreview(){if(!usable()||!draft||busy||previewBusy)return;previewBusy=true;q('ytDownloadPreview').disabled=true;status('PNG를 준비하고 있습니다…');try{const match=getMatch(previewId),r=await exportMatch(match,copy(draft));sendDownload(r.blob,(match?match.date+'_'+match.no+'_':'')+'썸네일_미리보기.png');status('미리보기 저장 완료'+(r.warnings.length?' · 일부 사진은 이름 표시로 대체했습니다.':''));}catch(e){status(e.message,true);}finally{previewBusy=false;if(q('ytDownloadPreview'))q('ytDownloadPreview').disabled=false;}}
 const safeName=name=>name.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').slice(0,170);
 const matchFilename=match=>safeName([match.date,match.no,teamDisplayName(match.home)+'_vs_'+teamDisplayName(match.away),'썸네일.png'].filter(Boolean).join('_'));
 function visibleMatches(){const ids=[...new Set(Array.from(q('v-dash')?.querySelectorAll('.ground-match.fixture-match-card[data-match-detail-id]')||[],c=>c.dataset.matchDetailId))];return ids.map(getMatch).filter(Boolean);}
 // A thumbnail-specific UTF-8 ZIP keeps Korean PNG names readable without changing the existing XLSX ZIP writer.
 function pngArchive(files){const encoder=new TextEncoder(),parts=[],central=[];let offset=0,length=0;
  for(const f of files){const name=encoder.encode(f.name),size=f.data.length,crc=crc32(f.data),head=new DataView(new ArrayBuffer(30));head.setUint32(0,0x04034b50,true);head.setUint16(4,20,true);head.setUint16(6,0x800,true);head.setUint32(14,crc,true);head.setUint32(18,size,true);head.setUint32(22,size,true);head.setUint16(26,name.length,true);parts.push(head.buffer,name,f.data);const dir=new DataView(new ArrayBuffer(46));dir.setUint32(0,0x02014b50,true);dir.setUint16(4,20,true);dir.setUint16(6,20,true);dir.setUint16(8,0x800,true);dir.setUint32(16,crc,true);dir.setUint32(20,size,true);dir.setUint32(24,size,true);dir.setUint16(28,name.length,true);dir.setUint32(42,offset,true);central.push(dir.buffer,name);offset+=30+name.length+size;length+=46+name.length;}
  const end=new DataView(new ArrayBuffer(22));end.setUint32(0,0x06054b50,true);end.setUint16(8,files.length,true);end.setUint16(10,files.length,true);end.setUint32(12,length,true);end.setUint32(16,offset,true);return new Blob([...parts,...central,end.buffer],{type:'application/zip'});
 }
 function batchStatus(text){const el=q('ytBatchStatus');if(el)el.textContent=text;}
 async function downloadAll(){
  if(batchBusy||!usable()||!configured())return;const matches=visibleMatches(),template=stored();if(!matches.length){toast('표시된 경기가 없습니다.');return;}
  batchBusy=true;batchCancelled=false;syncOverview();const files=[],used=new Set();let bytes=0,missing=0;
  try{for(let i=0;i<matches.length;i++){
    if(batchCancelled)throw Error('취소했습니다.');if(!usable())throw Error('운영진 또는 관리자 로그인을 확인하세요.');
    batchStatus('썸네일 생성 '+(i+1)+' / '+matches.length);const r=await exportMatch(matches[i],template);
    if(batchCancelled)throw Error('취소했습니다.');if(!usable())throw Error('로그인이 종료되어 저장을 중단했습니다.');
    missing+=r.warnings.length?1:0;const data=new Uint8Array(await r.blob.arrayBuffer());bytes+=data.length;if(bytes>160*1024*1024)throw Error('전체 이미지가 160MB를 넘습니다. 경기일을 나누어 저장하세요.');
    let name=matchFilename(matches[i]);if(used.has(name))name=name.replace(/\.png$/,'_'+(i+1)+'.png');used.add(name);files.push({name,data});await new Promise(resolve=>setTimeout(resolve,0));
   }
   if(batchCancelled||!usable())throw Error('저장을 중단했습니다.');const dates=[...new Set(matches.map(m=>m.date))].sort();sendDownload(pngArchive(files),'GGFC_썸네일_'+dates[0]+(dates.length>1?'_'+dates.at(-1):'')+'_'+files.length+'경기.zip');batchStatus(files.length+'경기 ZIP 다운로드 요청'+(missing?' · '+missing+'경기는 일부 사진 대체':''));
  }catch(e){batchStatus(e.message);toast(e.message);}finally{batchBusy=false;syncOverview();}
 }
 function syncOverview(){
  const root=q('v-dash');if(!root)return;const on=configured()&&usable();
  if(!on){root.querySelectorAll('.yt-match-action,.yt-batch-action').forEach(e=>e.remove());if(batchBusy)batchCancelled=true;return;}
  const matches=visibleMatches(),heading=q('dashResultHeader')?.closest('.dashboard-block-title')||root.querySelector('.dashboard-main-head');
  let batch=q('ytBatchAction');if(!matches.length){batch?.remove();}else if(heading){
   if(!batch){batch=document.createElement('div');batch.id='ytBatchAction';batch.className='yt-batch-action';batch.setAttribute('data-export-ignore','');batch.innerHTML='<button type="button" class="btn" id="ytDownloadAll">표시된 경기 썸네일 전체 저장 (ZIP)</button><button type="button" class="btn" id="ytCancelAll" hidden>취소</button><span id="ytBatchStatus" role="status" aria-live="polite"></span>';heading.after(batch);q('ytDownloadAll').onclick=downloadAll;q('ytCancelAll').onclick=()=>{batchCancelled=true;batchStatus('현재 이미지 처리 후 취소합니다…');};}
   q('ytDownloadAll').disabled=batchBusy;q('ytDownloadAll').dataset.count=String(matches.length);q('ytCancelAll').hidden=!batchBusy;
  }
  root.querySelectorAll('.ground-match.fixture-match-card[data-match-detail-id]').forEach(card=>{const id=card.dataset.matchDetailId,previous=card.previousElementSibling;if(previous?.classList.contains('yt-match-action')&&previous.dataset.ytMatch===id)return;const bar=document.createElement('div');bar.className='yt-match-action';bar.dataset.ytMatch=id;bar.setAttribute('data-export-ignore','');const button=document.createElement('button');button.type='button';button.className='btn sm';button.textContent='썸네일 이미지 다운로드';button.setAttribute('aria-label',(card.getAttribute('aria-label')||'경기')+' 썸네일 이미지 다운로드');button.onclick=async e=>{e.preventDefault();e.stopPropagation();const match=getMatch(id);if(!match||!configured()||!usable()){toast('경기 기록과 운영진 또는 관리자 로그인을 확인하세요.');return;}button.disabled=true;button.textContent='썸네일 준비 중…';try{const r=await exportMatch(match);if(!usable())throw Error('다시 로그인해 주세요.');sendDownload(r.blob,matchFilename(match));toast(r.warnings.length?'썸네일 다운로드 요청 · 일부 사진은 이름 표시로 대체했습니다.':'썸네일 이미지 다운로드 요청');}catch(error){toast('썸네일 저장 실패: '+error.message);}finally{button.disabled=false;button.textContent='썸네일 이미지 다운로드';}};bar.append(button);card.before(bar);});
 }
 const overview=q('v-dash');if(overview){let queued=false;new MutationObserver(()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;syncOverview();});}).observe(overview,{childList:true,subtree:true});}
 syncOverview();if(typeof activeView!=='undefined'&&activeView==='thumbnail'&&usable())render();
 return {render,discard,normalize,defaults,syncOverview,sharedChanged,matchModel,exportMatch,downloadAll,get dirty(){return dirty||busy;},get draft(){return draft?normalize(draft):null;}};
})();
