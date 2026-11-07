/* Public channel for match counts and corrections, stored separately from ggfc/v3. */
window.GGFCPublicCounters=(()=>{
 const fields=['sot','keyPass','defSuccess','saves'],countPattern=/^(0|[1-9][0-9]{0,3}|10000)$/;
 const cacheKey=KEY+'-shared-match-counters-v1',own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
 let tree={},entries=new Map(),channel=null,listeningRef=null,listener=null,loaded=false,error='',signature='',scheduled=false,connectedBefore=false,renderPending=false;
 const active=new Map();
 const keyOf=r=>JSON.stringify([r.fixtureKey,teamRecordTeamKey(r.team),normalizePlayerMatchKey(r.player)]);
 const stamp=r=>r?r.path+':'+r.revision+':'+r.savedAt:'';
 const context=()=>GGFC.publicCounterContext();
 function normalize(raw,path){
  if(!raw||raw.sourceRevision!==Number(path[0])||!Number.isSafeInteger(raw.sourceRevision)||raw.sourceRevision<1||!Number.isSafeInteger(raw.revision)||raw.revision<1||!Number.isFinite(raw.savedAt)||raw.savedAt<0)return null;
  for(const k of ['matchId','date','comp','round','no','home','away','team','player'])if(typeof raw[k]!=='string'||!raw[k]||raw[k].length>200)return null;
  if(![raw.home,raw.away].includes(raw.team))return null;
  const values={},baseValues={};
  for(const [k,v] of Object.entries(raw.values||{})){
   if(!fields.includes(k)||typeof v!=='string'||!countPattern.test(v)||!own(raw.baseValues||{},k))return null;
   const base=raw.baseValues[k];if(base!=='missing'&&(typeof base!=='string'||!/^(0|[1-9][0-9]{0,15})$/.test(base)||!Number.isSafeInteger(Number(base))))return null;
   values[k]=Number(v);baseValues[k]=base==='missing'?null:Number(base);
  }
  if(!Object.keys(values).length||Object.keys(raw.baseValues||{}).some(k=>!own(values,k)))return null;
  return {...raw,fixtureKey:verifiedFixtureKey({...raw,id:raw.matchId}),values,baseValues,path:path.join('/')};
 }
 function notify(){
  if(scheduled)return;scheduled=true;
  queueMicrotask(()=>{
   scheduled=false;invalidateVerifiedRecords();
   if(GGFC.editing||GGFC.pending)renderPending=true;
   else{
    renderPending=false;renderAll();
    if(typeof playerCardHistoryState!=='undefined'&&playerCardHistoryState&&document.querySelector('#playerCardMask')?.classList.contains('on'))openPlayerCard(playerCardHistoryState.player,playerCardHistoryState.query);
   }
   window.GGFCMatchRecords?.onPublicChanged();refreshPanel();
  });
 }
 function accept(value,fromCache=false){
  const first=!loaded;tree=value&&typeof value==='object'?value:{};const next=new Map();
  for(const [s,matches] of Object.entries(tree))for(const [m,people] of Object.entries(matches||{}))for(const [a,raw] of Object.entries(people||{})){
   if(![s,m,a].every(v=>/^(0|[1-9][0-9]*)$/.test(v)))continue;
   const row=normalize(raw,[s,m,a]);if(!row)continue;
   const key=keyOf(row),prior=next.get(key);
   if(!prior||row.sourceRevision>prior.sourceRevision||row.sourceRevision===prior.sourceRevision&&(row.savedAt>prior.savedAt||row.savedAt===prior.savedAt&&(row.revision>prior.revision||row.revision===prior.revision&&row.path>prior.path)))next.set(key,row);
  }
  entries=next;const rows=[...entries.values()].sort((a,b)=>keyOf(a).localeCompare(keyOf(b))),text=JSON.stringify(rows);
  if(!fromCache){loaded=true;error='';try{localStorage.setItem(cacheKey,JSON.stringify({version:1,records:tree}));}catch(e){/* Live data remains usable when cache is full. */}}
  if(text!==signature){signature=text;liveCounterTeamPlayerRecords=rows;notify();}
  else {window.GGFCMatchRecords?.onPublicChanged();refreshPanel();}
  if(first&&!fromCache)queueMicrotask(()=>window.GGFCMatchRecords?.retryPending());
 }
 function refreshUI(){
  const c=context();
  if(c.ref&&channel!==c.ref.toString()){
   listeningRef?.off?.('value',listener);listeningRef=c.ref;listener=snap=>accept(snap.val());
   channel=c.ref.toString();loaded=false;
   c.ref.on('value',listener,e=>{loaded=false;error=String(e.code||'접근 오류');window.GGFCMatchRecords?.onPublicChanged();refreshPanel();});
  }
  const connected=!!c.ready;if(connected&&!connectedBefore)queueMicrotask(()=>window.GGFCMatchRecords?.retryPending());connectedBefore=connected;
  if(renderPending&&!GGFC.editing&&!GGFC.pending)notify();
  refreshPanel();
 }
 function sourceFor(m,team,player){
  const fixture=verifiedFixtureKey(m);
  for(let ai=0;ai<DB.attendance.length;ai++){
   const a=DB.attendance[ai];if(teamRecordTeamKey(a.team)!==teamRecordTeamKey(team)||normalizePlayerMatchKey(a.player)!==normalizePlayerMatchKey(player))continue;
   const mi=DB.matches.findIndex(x=>String(x.id)===String(a.id)&&verifiedFixtureKey(x)===fixture);
   if(mi>=0)return {a,m:DB.matches[mi],mi,ai};
  }
  return null;
 }
 function sameValues(row,values,bases){return row&&Object.entries(values).every(([k,v])=>row.values[k]===v&&(row.baseValues[k]??null)===(bases[k]??null));}
 async function publish(key,m,team,player,values,bases,expected){
  const c=context();
  if(c.ready&&!loaded){
   try{const snapshot=await c.ref.get();if(error){channel=null;refreshUI();}accept(snapshot.val());}
   catch(e){error=String(e.code||'접근 오류');refreshPanel();return {ok:false,message:'기기 저장 · Firebase 카운트 규칙·연결 확인'};}
  }
  const current=entries.get(key);
  if(sameValues(current,values,bases))return {ok:true};
  if((expected??'')!==stamp(current))return {ok:false,conflict:true,message:'다른 기기에서 변경됨 · 기기 초기화 후 다시 확인'};
  if(!c.ready||!loaded)return {ok:false,message:error?'공유 대기 · Firebase 카운트 규칙 확인':'기기 저장 · 연결 후 공유 대기'};
  if(active.has(key))return {ok:false,message:'공유 응답 대기 중'};
  const source=sourceFor(m,team,player);if(!source)return {ok:false,conflict:true,message:'출석 DB가 변경됨 · 다시 확인'};
  const raw=source.m,path=[c.revision,source.mi,source.ai].join('/'),ref=c.ref.child(path);
  const row={sourceRevision:c.revision,matchId:String(raw.id),date:String(raw.date),comp:String(raw.comp),round:String(raw.round),no:String(raw.no),home:String(raw.home),away:String(raw.away),team:String(source.a.team),player:String(source.a.player)};
  const mergedValues={...current?.values,...values},mergedBases={...current?.baseValues,...bases};
  row.values=Object.fromEntries(Object.entries(mergedValues).map(([k,v])=>[k,String(v)]));row.baseValues=Object.fromEntries(Object.keys(row.values).map(k=>[k,mergedBases[k]===null||mergedBases[k]===undefined?'missing':String(mergedBases[k])]));
  const task=(async()=>{
   try{
    const initial=(await ref.get()).val(),revision=Number(initial?.revision)||0;
    if((current?.path===path?current.revision:0)!==revision)return {ok:false,conflict:true,message:'다른 기기에서 변경됨 · 기기 초기화 후 다시 확인'};
    const result=await ref.transaction(value=>{
     if((Number(value?.revision)||0)!==revision||stamp(entries.get(key))!==(expected??'')||!context().ready||context().revision!==c.revision)return;
     return {...row,revision:revision+1,savedAt:firebase.database.ServerValue.TIMESTAMP};
    },undefined,false);
    if(!result.committed)return {ok:false,conflict:true,message:'공유 기록 또는 DB가 변경됨 · 다시 확인'};
    // Normally the value listener arrives first; also handle a delayed listener.
    const accepted=result.snapshot.val(),seen=tree[c.revision]?.[source.mi]?.[source.ai];
    if(!seen||Number(seen.revision)<Number(accepted.revision)){
     const next=JSON.parse(JSON.stringify(tree));next[c.revision]??={};next[c.revision][source.mi]??={};next[c.revision][source.mi][source.ai]=accepted;accept(next);
    }
    return {ok:true};
   }catch(e){error=String(e.code||'연결 오류');refreshPanel();return {ok:false,message:/permission/i.test(error)?'기기 저장 · Firebase 카운트 규칙 게시 필요':'기기 저장 · 공유 실패, 다시 저장하세요'};}
   finally{active.delete(key);}
  })();active.set(key,task);
  let timer;try{return await Promise.race([task,new Promise(resolve=>timer=setTimeout(()=>resolve({ok:false,message:'기기 저장 · 공유 응답 대기 중'}),12000))]);}finally{clearTimeout(timer);}
 }
 function refreshPanel(){
  const el=document.getElementById('publicCounterStatus');if(!el)return;
  el.textContent=(loaded?'공유 카운트 '+entries.size+'건':error?'카운트 경로 접근 실패 · 규칙 게시 필요':'공유 카운트 연결 대기')+(context().ready?'':' · 오프라인 또는 DB 동기화 중');
 }
 function backup(){const blob=new Blob([JSON.stringify({version:1,path:'ggfc/teamCounterRecords/v1',records:tree},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='GGFC_공유카운트_'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 document.getElementById('publicCounterBackup')?.addEventListener('click',backup);
 document.getElementById('publicCounterRetry')?.addEventListener('click',()=>{const c=context();if(error){channel=null;refreshUI();}if(c.ref)c.ref.get().then(s=>{accept(s.val());window.GGFCMatchRecords?.retryPending();}).catch(e=>{error=String(e.code||'접근 오류');refreshPanel();});});
 window.addEventListener('online',()=>{if(error){channel=null;refreshUI();}});
 try{const cached=JSON.parse(localStorage.getItem(cacheKey)||'null');if(cached?.version===1)accept(cached.records,true);}catch(e){}
 return {refreshUI,publish,latest:key=>entries.get(key),stamp:key=>stamp(entries.get(key)),sameValues,get ready(){return loaded&&context().ready;}};
})();
window.GGFCPublicCounters.refreshUI();
