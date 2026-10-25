// Compiled with a verified asset list by build-static-cache.py.
const BASE=new URL('./',self.location.href);
const PREFIX='ggfc-static:'+BASE.pathname+':',CACHE=PREFIX+RELEASE;
const RUNTIME='ggfc-config:'+BASE.pathname;
const absolute=value=>new URL(value,BASE).href;
const entries=new Map(ASSETS.map(item=>[absolute(item.url),item]));
const configURL=absolute('firebase-config.js');
async function hash(response){
 const value=await crypto.subtle.digest('SHA-256',await response.clone().arrayBuffer());
 return Array.from(new Uint8Array(value),b=>b.toString(16).padStart(2,'0')).join('');
}
async function verifiedFetch(item){
 const response=await fetch(absolute(item.url),{cache:'reload'});
 if(!response.ok||await hash(response)!==item.sha256)throw Error('Incomplete GGFC release: '+item.url);
 return response;
}
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(CACHE),older=(await caches.keys()).filter(k=>k.startsWith(PREFIX)&&k!==CACHE);
 try{
  let next=0;
  async function fill(){
   while(next<ASSETS.length){
    const item=ASSETS[next++],url=absolute(item.url);let response=await cache.match(url);
    if(response&&await hash(response)!==item.sha256)response=null;
    for(const key of older){
     if(response)break;
     const old=await caches.open(key);
     // Reuse by content hash even when a manually edited URL version changes.
     const candidates=await old.matchAll(url,{ignoreSearch:true});
     for(const candidate of candidates)if(await hash(candidate)===item.sha256){response=candidate;break;}
    }
    if(!response)response=await verifiedFetch(item);
    await cache.put(url,response);
   }
  }
  const results=await Promise.allSettled([fill(),fill(),fill(),fill()]);
  if(results.some(r=>r.status==='rejected'))throw Error('Incomplete release');
 }catch(e){await caches.delete(CACHE);throw e;}
 // Configuration has its own refresh policy, is optional, and never contains Firebase records.
 try{await refreshConfig();}catch(e){}
 // No automatic skipWaiting. An open user session is never forcibly replaced.
})()));
async function appClients(){
 return (await self.clients.matchAll({type:'window',includeUncontrolled:true})).filter(c=>{
  const u=new URL(c.url);return u.origin===BASE.origin&&u.pathname.startsWith(BASE.pathname);
 });
}
self.addEventListener('message',event=>{
 if(!['CAN_ACTIVATE','ACTIVATE_UPDATE'].includes(event.data?.type))return;
 event.waitUntil((async()=>{
  const clients=await appClients(),source=event.source?.id;
  const allowed=source&&clients.some(c=>c.id===source)&&clients.every(c=>c.id===source);
  const result={ok:!!allowed,reason:'다른 GGFC 탭이나 앱 창을 닫은 뒤 업데이트를 눌러 주세요.'};
  event.ports[0]?.postMessage(result);
  if(allowed&&event.data.type==='ACTIVATE_UPDATE')await self.skipWaiting();
 })());
});
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 const older=(await caches.keys()).filter(k=>k.startsWith(PREFIX)&&k!==CACHE);
 // Retain at most one prior verified release for late requests from an already open tab.
 const keep=(await appClients()).length?older.at(-1):null;
 for(const key of older)if(key!==keep)await caches.delete(key);
 // No clients.claim(): unrelated or older pages are not captured without navigation.
})()));
async function refreshConfig(){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),3000);
 try{
  const response=await fetch(configURL,{cache:'no-cache',signal:controller.signal});
  if(!response.ok)throw Error('Configuration unavailable');
  try{await(await caches.open(RUNTIME)).put(configURL,response.clone());}catch(e){}
  return response;
 }finally{clearTimeout(timer);}
}
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==BASE.origin)return; // Firebase/CDN/auth/photos never enter this cache.
 if(url.href===configURL){
  const update=refreshConfig();event.waitUntil(update.catch(()=>{}));
  event.respondWith((async()=>{
   const cached=await(await caches.open(RUNTIME)).match(configURL);
   if(cached)return cached;
   try{return await update;}catch(e){return Response.error();}
  })());return;
 }
 let key=url.href;
 if(request.mode==='navigate'){
  if(url.pathname===BASE.pathname||url.pathname===new URL('index.html',BASE).pathname)key=absolute('index.html');
  else if(url.pathname===new URL('mobile.html',BASE).pathname)key=absolute('mobile.html');
  else if(url.pathname===new URL('offline.html',BASE).pathname)key=absolute('offline.html');
  else return; // Do not turn missing assets or foreign routes into HTML.
 }
 const item=entries.get(key);
 if(!item)return;
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE),cached=await cache.match(key);if(cached)return cached;
  try{const response=await verifiedFetch(item);try{await cache.put(key,response.clone());}catch(e){}return response;}
  catch(e){if(request.mode==='navigate')return(await cache.match(absolute('offline.html')))||Response.error();return Response.error();}
 })());
});
