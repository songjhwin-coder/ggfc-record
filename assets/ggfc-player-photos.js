/* V3.25.51 — one shared, administrator-uploaded photo per named player.
   Raw Excel roster and all sporting calculations remain unchanged. */
const GGFCPlayerPhotos=(()=>{
 const MAX_IMAGE=96*1024,MAX_TOTAL=4*1024*1024,PAGE_SIZE=24;
 let selected='',draft=null,dirty=false,busy=false,ticket=0,query='',filter='all',page=0;
 const key=name=>'p_'+encodeURIComponent(String(name||'').normalize('NFKC').trim());
 const entries=()=>DB.settings?.playerPhotos?.entries||{};
 const valid=src=>typeof src==='string'&&src.length<=MAX_IMAGE&&/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(src);
 const validated=new WeakMap();
 const get=name=>{const item=entries()[key(name)];if(!item||typeof item!=='object')return null;let check=validated.get(item);if(!check||check.image!==item.image){check={image:item.image,ok:valid(item.image)};validated.set(item,check);}return check.ok?item:null;};
 const photo=name=>get(name)?.image||'';
 const editable=()=>typeof admin!=='undefined'&&admin&&GGFC.canEdit();
 function bytes(map=entries()){return Object.values(map).reduce((n,r)=>n+(typeof r?.image==='string'?r.image.length:0),0);}
 function names(){
  const found=new Map(),add=name=>{name=String(name||'').normalize('NFKC').trim();if(name&&!isOwnGoalPlayer(name)&&!found.has(key(name)))found.set(key(name),name);};
  (DB.roster||[]).forEach(r=>add(r.player));
  (DB.settings?.allTimeRecords?.rows||[]).forEach(r=>add(r.player));
  for(const row of [...(DB.settings?.teamSquads||[]),...(DB.settings?.leadershipHistory?.rows||[])]) (row.members||[]).forEach(m=>add(m.player));
  Object.values(entries()).forEach(r=>add(r?.name));
  return [...found.values()].sort(compareNamesKo);
 }
 function rawPhoto(name){
  const roster=(DB.roster||[]).filter(r=>key(r.player)===key(name)).sort((a,b)=>String(b.year||'').localeCompare(String(a.year||'')));
  const archive=(DB.settings?.allTimeRecords?.rows||[]).find(r=>key(r.player)===key(name));
  return [...roster,archive].filter(Boolean).flatMap(r=>[r.photoCutout,r.photo]).map(normalizePlayerPhotoUrl).find(Boolean)||'';
 }
 function message(text){const el=document.getElementById('playerPhotosStatus');if(el)el.textContent=text;}
 function changed(){dirty=true;GGFC.refreshUI();}
 function discard(){ticket++;busy=false;dirty=false;draft=null;}
 function select(name){if(!editable()||dirty||busy)return;selected=name;draft=null;renderEditor();}
 function preview(src,alt){const box=document.createElement('div');box.className='player-photo-preview';const fallback=document.createElement('span');fallback.textContent=String(alt).slice(0,1)||'GGFC';box.append(fallback);if(src){const img=document.createElement('img');img.src=src;img.alt=alt+' 사진';img.decoding='async';img.loading='lazy';img.referrerPolicy='no-referrer';img.onerror=()=>{img.remove();};box.append(img);}return box;}
 function renderList(){
  const root=document.getElementById('playerPhotosList');if(!root)return;root.replaceChildren();
  const all=names(),q=query.normalize('NFKC').replace(/\s/g,'').toLocaleLowerCase();
  const rows=all.filter(n=>(!q||n.replace(/\s/g,'').toLocaleLowerCase().includes(q))&&(filter==='all'||(filter==='uploaded'?!!get(n):!get(n))));
  page=Math.max(0,Math.min(page,Math.ceil(rows.length/PAGE_SIZE)-1));
  for(const name of rows.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE)){
   const item=get(name),button=document.createElement('button');button.type='button';button.className='player-photo-tile';button.dataset.photoPlayer=name;button.setAttribute('aria-pressed',String(selected===name));button.disabled=dirty||busy;
   button.append(preview(item?.image||rawPhoto(name),name));const label=document.createElement('strong');label.textContent=name;button.append(label);const badge=document.createElement('small');badge.textContent=item?'업로드 사진 적용 중':'기존 엑셀 사진';button.append(badge);button.onclick=()=>{select(name);renderList();};root.append(button);
  }
  if(!rows.length){const empty=document.createElement('p');empty.textContent='검색 결과가 없습니다. 선수명단·역대기록·팀스쿼드·역대 운영진에 등록된 이름을 확인하세요.';root.append(empty);}
  document.getElementById('playerPhotosCount').textContent=`업로드 ${all.filter(n=>get(n)).length} / 전체 ${all.length}명 · 사진 용량 ${(bytes()/1024/1024).toFixed(2)} / 4 MB`;
  document.getElementById('playerPhotosPage').textContent=`${rows.length? page+1:0} / ${Math.ceil(rows.length/PAGE_SIZE)} · 검색 ${rows.length}명`;
  document.getElementById('playerPhotosPrev').disabled=page===0;document.getElementById('playerPhotosNext').disabled=(page+1)*PAGE_SIZE>=rows.length;
 }
 function renderEditor(){
  const panel=document.getElementById('playerPhotosEditor');if(!panel)return;panel.replaceChildren();
  if(!selected){const p=document.createElement('p');p.textContent='선수를 선택한 뒤 사진을 업로드하세요.';panel.append(p);return;}
  const title=document.createElement('h3');title.textContent=selected;panel.append(title);
  const current=get(selected),item=dirty?draft:current,src=item?.image||rawPhoto(selected);panel.append(preview(src,selected));
  const note=document.createElement('p');note.className='note';note.textContent=item?`공통 업로드 사진 · ${item.width} × ${item.height}px · ${Math.ceil(item.image.length/1024)} KB`:'업로드 사진 없음 · 각 화면의 기존 엑셀 사진을 사용합니다.';panel.append(note);
  const uploadLabel=document.createElement('label');uploadLabel.textContent='사진 선택 (PNG · JPG · WebP)';uploadLabel.className='player-photo-upload';
  const input=document.createElement('input');input.id='playerPhotoUpload';input.type='file';input.accept='image/png,image/jpeg,image/webp';input.disabled=busy||!editable();input.onchange=upload;uploadLabel.append(input);panel.append(uploadLabel);
  const actions=document.createElement('div');actions.className='player-photo-actions';
  const button=(id,text,action,disabled,primary=false)=>{const b=document.createElement('button');b.id=id;b.type='button';b.className='btn'+(primary?' primary':'');b.textContent=text;b.disabled=disabled||!editable();b.onclick=action;actions.append(b);};
  button('playerPhotoSave','사진 저장',commit,!dirty||busy,true);
  button('playerPhotoCancel','변경 취소',()=>{if(!editable())return;discard();renderEditor();renderList();GGFC.refreshUI();message('변경을 취소했습니다.');},!dirty&&!busy);
  button('playerPhotoRemove','업로드 사진 삭제',()=>{if(!editable())return;ticket++;draft=null;busy=false;changed();renderEditor();renderList();message('삭제 예정 · 사진 저장을 누르면 기존 엑셀 사진으로 돌아갑니다.');},busy||!item);
  panel.append(actions);
 }
 async function encode(file){
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>15*1024*1024)throw Error('PNG·JPG·WebP 파일을 15MB 이하로 선택하세요.');
  let image,url;
  try{
   if(typeof createImageBitmap==='function')image=await createImageBitmap(file);
   else {url=URL.createObjectURL(file);image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('이미지를 읽지 못했습니다.'));img.src=url;});}
   if(!image.width||!image.height||image.width*image.height>40000000)throw Error('4천만 화소 이하의 사진을 선택하세요.');
   const canvas=document.createElement('canvas');
   for(const edge of [640,512,400,320,256]){
    const ratio=Math.min(1,edge/image.width,edge/image.height);canvas.width=Math.max(1,Math.round(image.width*ratio));canvas.height=Math.max(1,Math.round(image.height*ratio));
    canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
    for(const quality of [.86,.76,.66]){
     // WebP preserves transparency. Older browsers fall back to PNG, never JPEG.
     const data=canvas.toDataURL('image/webp',quality);
     if(valid(data))return {image:data,width:canvas.width,height:canvas.height};
    }
   }
   throw Error('사진을 충분히 압축하지 못했습니다. 배경이나 크기가 작은 사진을 선택하세요.');
  }finally{image?.close?.();if(url)URL.revokeObjectURL(url);}
 }
 async function upload(event){
  const file=event.target.files?.[0];event.target.value='';if(!editable()||!selected||!file)return;
  const run=++ticket,name=selected,previous=draft,wasDirty=dirty;if(!wasDirty)draft=get(name);busy=true;changed();renderEditor();renderList();message('사진을 최적화하고 있습니다…');
  try{
   const item=await encode(file);if(run!==ticket)return;if(!editable()||selected!==name)throw Error('관리자 연결을 확인하고 다시 선택하세요.');
   const projected={...entries(),[key(name)]:item};if(bytes(projected)>MAX_TOTAL)throw Error('사진 전체 용량이 4 MB를 넘습니다. 사용하지 않는 업로드 사진을 삭제해 주세요.');
   draft={...item,name,updatedAt:new Date().toISOString()};message('사진 준비 완료 · 미리보기를 확인한 뒤 사진 저장을 누르세요.');
  }catch(e){if(run===ticket){draft=previous;dirty=wasDirty;message('업로드 실패: '+e.message);}}
  finally{if(run===ticket){busy=false;renderEditor();renderList();GGFC.refreshUI();}}
 }
 function mergedSettings(){const next={...entries()};if(draft)next[key(selected)]={...draft};else delete next[key(selected)];return {version:1,entries:next};}
 function commit(){
  if(!editable()||!dirty||busy)return false;
  const next=mergedSettings();if(bytes(next.entries)>MAX_TOTAL||(draft&&!valid(draft.image))){message('사진 용량 또는 형식을 확인하세요.');return false;}
  const old=DB.settings.playerPhotos;DB.settings.playerPhotos=next;
  try{if(new TextEncoder().encode(JSON.stringify(GGFC.split(DB,1,'photo-size-check',0))).length>8*1024*1024)throw Error('전체 공유 기록이 8 MB를 넘습니다. 사용하지 않는 업로드 사진을 삭제하거나 더 작은 사진을 선택하세요.');const result=save();if(!result?.cloudPending)throw result?.error||Error('저장 실패');}
  catch(e){if(old===undefined)delete DB.settings.playerPhotos;else DB.settings.playerPhotos=old;message('저장 실패 · '+e.message);return false;}
  discard();renderAll();message('사진 적용 · 페이지 하단의 공유 저장 완료를 확인한 뒤 닫아 주세요.');return true;
 }
 function render(){
  const root=document.getElementById('playerPhotosManager');if(!root)return;if(!admin){root.replaceChildren();return;}
  root.innerHTML='<div class="player-photo-intro"><b>모든 화면에 같은 선수 사진을 적용합니다.</b><p>선수카드 · Team Squad · 랭킹 · Weekly Best 5 · 선수 분석 · Team Maker · 역대기록 · 운영진 · 이미지 저장에 공통 적용됩니다. 업로드하지 않은 선수는 기존 엑셀 사진을 유지합니다.</p><small>사진은 최대 640px로 최적화됩니다. 투명 배경은 유지하며 배경을 자동 제거하지는 않습니다. 엑셀 재업로드로 사진이 지워지지 않으며, JSON 백업에는 포함됩니다.</small></div><div class="player-photo-toolbar"><label>선수 이름 검색<input id="playerPhotosSearch" type="search" placeholder="이름을 입력하세요" autocomplete="off"></label><label>사진 상태<select id="playerPhotosFilter"><option value="all">전체</option><option value="uploaded">업로드 완료</option><option value="missing">업로드 필요</option></select></label></div><p id="playerPhotosCount" class="note"></p><div class="player-photo-workspace"><div><div id="playerPhotosList" class="player-photo-grid"></div><div class="player-photo-pager"><button type="button" class="btn" id="playerPhotosPrev">이전</button><span id="playerPhotosPage"></span><button type="button" class="btn" id="playerPhotosNext">다음</button></div></div><aside id="playerPhotosEditor" class="player-photo-editor"></aside></div><p id="playerPhotosStatus" class="note" role="status" aria-live="polite"></p>';
  const search=document.getElementById('playerPhotosSearch');search.value=query;search.oninput=()=>{query=search.value;page=0;renderList();};
  const select=document.getElementById('playerPhotosFilter');select.value=filter;select.onchange=()=>{filter=select.value;page=0;renderList();};
  document.getElementById('playerPhotosPrev').onclick=()=>{page--;renderList();};document.getElementById('playerPhotosNext').onclick=()=>{page++;renderList();};
  if(!selected||!names().includes(selected))selected=names()[0]||'';
  renderList();renderEditor();if(dirty)message('저장 전 변경 · 저장 또는 취소 후 다른 선수를 선택하세요.');
 }
 return {photo,get,key,render,discard,encode,get dirty(){return dirty||busy;},get draft(){return dirty?mergedSettings():null;}};
})();
function uploadedPlayerPhoto(name){return GGFCPlayerPhotos.photo(name);}
function renderPlayerPhotoManager(){GGFCPlayerPhotos.render();}
