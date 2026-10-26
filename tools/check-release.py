#!/usr/bin/env python3
"""Offline build validation. No network access or third-party dependencies."""
import hashlib,json,re,subprocess
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit,unquote
r=Path(__file__).resolve().parents[1]
class Page(HTMLParser):
 def __init__(self):super().__init__();self.ids=[];self.refs=[]
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if a.get('id'):self.ids.append(a['id'])
  for k in ['src','href']:
   if a.get(k):self.refs.append(a[k])
for name in ['index.html','mobile.html','install.html','offline.html']:
 p=Page();p.feed((r/name).read_text());assert len(p.ids)==len(set(p.ids)),f'Duplicate ID: {name}'
 for ref in p.refs:
  u=urlsplit(ref)
  if u.scheme or u.netloc or not u.path:continue
  assert not u.path.startswith('/'),f'Root path: {ref}'
  assert (r/unquote(u.path)).exists(),f'Missing asset: {ref}'
for p in [*r.glob('assets/*.js'),r/'service-worker.js',r/'firebase-config.js']:
 subprocess.run(['node','--check',str(p)],check=True,capture_output=True)
m=json.loads((r/'manifest.webmanifest').read_text());assert m['scope']=='./' and m['start_url']=='./index.html' and m['display']=='standalone'
assert any(i.get('purpose')=='maskable' for i in m['icons'])
for i in m['icons']:assert (r/i['src']).exists()
s=(r/'service-worker.js').read_text();assets=json.loads(re.search(r'const ASSETS = (\[.*?\]);',s,re.S)[1])
for a in assets:
 p=r/a['url'].split('?')[0];assert p.is_file(),a['url'];assert hashlib.sha256(p.read_bytes()).hexdigest()==a['sha256'],'Stale service worker: '+a['url']
v=json.loads((r/'app-version.json').read_text())['version']
for n in ['index.html','mobile.html']:
 assert f'GGFC · V{v}</div>' in (r/n).read_text(),f'Stale footer version: {n}'
for n in ['index.html','mobile.html','assets/ggfc-sync.js','service-worker.js']:assert v in (r/n).read_text(),n
print(f'PASS {v}: JS syntax, duplicate IDs, relative paths, manifest, {len(assets)} hashes')

assert v in (r/"install.html").read_text()
assert "cp index.html mobile.html install.html" in (r/".github/workflows/pages.yml").read_text()
