#!/usr/bin/env python3
"""Run after edits: python3 tools/build-static-cache.py --version 3.25.33
Preserves unchanged file URLs; changes only edited script/style versions.
Generates a verified, atomic static release cache for GitHub Pages subpaths.
"""
import argparse,hashlib,json,re
from pathlib import Path
root=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--version',required=True);args=parser.parse_args()
if not re.fullmatch(r'\d+\.\d+\.\d+',args.version):parser.error('version must be x.y.z')
worker=root/'service-worker.js'
previous={}
if worker.exists():
 m=re.search(r'const ASSETS = (\[.*?\]);',worker.read_text(),re.S)
 if m:previous={x['url'].split('?')[0]:x for x in json.loads(m[1])}
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def update_ref(m):
 filename,old=m.group(1),m.group(2)
 old_asset=previous.get(filename)
 version=(args.version if old_asset and old_asset['sha256']!=digest(root/filename) else old)
 return filename+'?v='+version
# Dynamic export CSS uses the same per-file version rule.
p=root/'assets/ggfc-app.js';old=p.read_text();new=re.sub(r'(assets/ggfc-export\.css)\?v=([\d.]+)',update_ref,old)
if new!=old:p.write_text(new)
for name in ['index.html','mobile.html']:
 p=root/name;s=p.read_text()
 s=re.sub(r'(assets/[\w.-]+\.(?:js|css))\?v=([\d.]+)',update_ref,s)
 s=re.sub(r'(?<![?=\d.])3\.\d+\.\d+(?![\"\'])',args.version,s)
 p.write_text(s)
urls={}
for name in ['index.html','mobile.html','assets/ggfc-app.js']:
 for m in re.finditer(r'(assets/[\w./-]+\.(?:js|css))\?v=([\d.]+)',(root/name).read_text()):urls[m[1]]=m[0]
for p in sorted((root/'assets').rglob('*')):
 if p.suffix in ['.js','.css','.svg','.woff']:urls.setdefault(p.relative_to(root).as_posix(),p.relative_to(root).as_posix())
for name in ['index.html','mobile.html']:urls[name]=name
assets=[{'url':url,'sha256':digest(root/name)} for name,url in sorted(urls.items())]
body=r'''
const BASE = new URL('./', self.location.href);
const PREFIX = 'ggfc-static:' + BASE.pathname + ':';
const CACHE = PREFIX + RELEASE;
const absolute = value => new URL(value, BASE).href;
const allowed = new Set(ASSETS.map(item => absolute(item.url)));
const configURL = absolute('firebase-config.js');
async function hash(response) {
  const bytes = await response.clone().arrayBuffer();
  const value = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(value), b => b.toString(16).padStart(2, '0')).join('');
}
self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  const older = (await caches.keys()).filter(key => key.startsWith(PREFIX) && key !== CACHE);
  try {
    // Limit concurrent downloads; complete and verify the entire release before activating.
    let next = 0;
    async function fill() {
      while(next < ASSETS.length) {
        const item = ASSETS[next++], url = absolute(item.url);
        let response = await cache.match(url);
        if(response && await hash(response) !== item.sha256)response = null;
        for(const key of older) {
          if(response)break;
          const candidate = await (await caches.open(key)).match(url);
          if(candidate && await hash(candidate) === item.sha256)response = candidate;
        }
        if(!response) {
          response = await fetch(url, {cache: item.url.includes('?v=') ? 'force-cache' : 'no-cache'});
          if(!response.ok || await hash(response) !== item.sha256) {
            response = await fetch(url, {cache:'reload'});
            if(!response.ok || await hash(response) !== item.sha256)throw Error('Incomplete GGFC release: '+item.url);
          }
        }
        await cache.put(url, response);
      }
    }
    const results = await Promise.allSettled([fill(),fill(),fill(),fill()]);
    if(results.some(result => result.status === 'rejected'))throw Error('Incomplete GGFC release');
  } catch(error) {
    await caches.delete(CACHE);
    throw error;
  }
  // Wait for all older GGFC tabs to close. Never replace a running editing session.
})()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  for(const key of await caches.keys())if(key.startsWith(PREFIX) && key !== CACHE)await caches.delete(key);
})()));
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if(request.method !== 'GET' || url.origin !== BASE.origin)return;
  if(url.href === configURL) {
    // Configuration may be edited independently. Always try the server; fallback only on failure.
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const controller = new AbortController(), timer = setTimeout(()=>controller.abort(),3000);
      try {
        const response = await fetch(request,{cache:'no-cache',signal:controller.signal});
        if(!response.ok)throw Error('Configuration unavailable');
        try {await cache.put(configURL,response.clone());} catch(error) {/* Cache quota must not hide valid configuration. */}
        return response;
      } catch(error) {
        const cached = await cache.match(configURL);
        if(cached)return cached;
        return Response.error();
      } finally {clearTimeout(timer);}
    })());
    return;
  }
  let key = request.url;
  if(request.mode === 'navigate') {
    if(url.pathname === BASE.pathname || url.pathname === new URL('index.html',BASE).pathname)key = absolute('index.html');
    else if(url.pathname === new URL('mobile.html',BASE).pathname)key = absolute('mobile.html');
    else return;
  }
  if(!allowed.has(key))return; // Firebase, auth, remote photos, external libraries and unknown files bypass the cache.
  event.respondWith((async () => (await (await caches.open(CACHE)).match(key)) || fetch(request))());
});
'''
fingerprint=hashlib.sha256((json.dumps(assets)+body).encode()).hexdigest()[:16]
worker.write_text('/* Generated by tools/build-static-cache.py; do not edit by hand. */\nconst RELEASE = '+json.dumps(args.version+'-'+fingerprint)+';\nconst ASSETS = '+json.dumps(assets,indent=2)+';\n'+body)
print(f'Generated {worker.name}: {len(assets)} verified static assets; release {args.version}')
