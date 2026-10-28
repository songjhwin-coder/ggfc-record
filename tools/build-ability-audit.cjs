/* Extract the actual application calculation dependencies and add read-only tracing.
 * Node 22 (the existing Pages workflow) includes Acorn. No network/npm install.
 * Fail closed when a calculation anchor changes; never silently publish stale math.
 */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),box={exports:{},module:{}};box.module.exports=box.exports;
const parserSource=process.binding('natives')['internal/deps/acorn/acorn/dist/acorn'];
if(!parserSource)throw Error('Use Node 22 with the bundled Acorn parser to rebuild the audit worker.');
vm.runInNewContext(parserSource,box);
const parse=s=>box.exports.parse(s,{ecmaVersion:'latest',sourceType:'script'}),map=new Map(),sources=[];
for(const file of ['assets/ggfc-slump.js','assets/ggfc-app.js']){
 const src=fs.readFileSync(path.join(root,file),'utf8');sources.push(src);
 for(const n of parse(src).body){
  if(n.type==='FunctionDeclaration')map.set(n.id.name,{code:src.slice(n.start,n.end),node:n});
  if(n.type==='VariableDeclaration')for(const d of n.declarations)if(d.id.type==='Identifier')map.set(d.id.name,{code:n.kind+' '+src.slice(d.start,d.end)+';',node:d});
 }
}
// Uploaded photo bytes have no effect on the returned ability/position.
const stub="function uploadedPlayerPhoto(){return ''}";
map.set('uploadedPlayerPhoto',{code:stub,node:parse(stub).body[0]});
function refs(node){const out=new Set();function walk(n,p,k){if(!n||typeof n!=='object')return;if(n.type==='Identifier'&&!(p?.type==='MemberExpression'&&k==='property'&&!p.computed)&&!(p?.type==='Property'&&k==='key'&&!p.computed))out.add(n.name);for(const [key,val]of Object.entries(n))if(key!=='start'&&key!=='end'){if(Array.isArray(val))val.forEach(x=>walk(x,n,key));else if(val&&typeof val==='object')walk(val,n,key);}}walk(node);return out;}
const selected=new Set();function add(name){if(!map.has(name)||selected.has(name))return;selected.add(name);for(const ref of refs(map.get(name).node))add(ref);}
['playerAbilityRecordAtDate','abilityLatestContext','abilityHalfForDate','abilityMetricLabel'].forEach(add);
const instrument=require('./ability-audit-trace.js');
const code=[...map].filter(([n])=>selected.has(n)).map(([n,v])=>n==='playerAbilityRecordAtDate'?instrument(v.code):v.code).join('\n');
if(/\b(?:document|localStorage|sessionStorage)\b/.test(code))throw Error('DOM dependency leaked into the audit worker.');
const signature=crypto.createHash('sha256').update([...map].filter(([n])=>selected.has(n)).map(([,v])=>v.code).join('\n')).digest('hex');
fs.writeFileSync(path.join(root,'assets/ggfc-ability-audit-worker.js'),'/* Generated from current core + SLUMP; source SHA256 '+signature+' */\n'+code+'\n'+fs.readFileSync(path.join(__dirname,'ability-audit-worker-runtime.js'),'utf8'));
console.log('Built isolated ability audit worker from '+selected.size+' application declarations.');
