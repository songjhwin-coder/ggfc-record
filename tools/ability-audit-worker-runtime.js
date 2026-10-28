/* Worker-only report collector. Does not write the source database. */
const auditAxes=['pac','sho','pas','dri','def','phy'];
let auditEvents=[],auditCurrent=null,auditReport=null;
function auditBegin(ev,core,state,cfg){
 auditCurrent={date:ev.date,type:ev.type,round:ev.R||null,beforeCore:{...core},beforeBase:GGFCSlump.project(core,state,cfg.scoreMin),cursor:{...core},steps:[],balanceBefore:{...state.balance}};
}
function auditCapture(reason,after,detail){
 const before={...auditCurrent.cursor},delta=Object.fromEntries(auditAxes.map(k=>[k,after[k]-before[k]]));
 // Retain zero steps: absence of a change must also be explainable.
 auditCurrent.steps.push({reason,before,after:{...after},delta,detail});auditCurrent.cursor={...after};
}
function auditFinish(core,state,cfg,checkpoint=null,form=null){
 const a=auditCurrent,base=GGFCSlump.project(core,state,cfg.scoreMin);
 a.afterCore={...core};a.afterBase=base;a.balanceAfter={...state.balance};a.form=form;a.checkpoint=checkpoint;
 a.slumpEvents=state.events.filter(e=>e.date===a.date);
 const delta=Object.fromEntries(auditAxes.map(k=>[k,(a.beforeCore[k]-a.beforeBase[k])-(core[k]-base[k])]));
 a.steps.push({reason:'회복형 SLUMP 잔액 영향',delta,detail:{before:a.balanceBefore,after:a.balanceAfter,events:a.slumpEvents}});
 a.delta=Object.fromEntries(auditAxes.map(k=>[k,base[k]-a.beforeBase[k]]));
 a.reconciled=auditAxes.every(k=>Math.abs(a.beforeBase[k]+a.steps.reduce((s,x)=>s+x.delta[k],0)-base[k])<1e-8);
 delete a.cursor;auditEvents.push(a);auditCurrent=null;
}
function auditRun(player,cutoff){
 const latest=abilityLatestContext(),year=cutoff?cutoff.slice(0,4):latest.year,half=cutoff?abilityHalfForDate(year,cutoff):latest.half;
 const result=playerAbilityRecordAtDate(player,year,half,cutoff||'',true),cfg=abilityConfig(),weights=longFormWeights(playerOvrProfile(player,year,cfg).weights);
 const sums=Object.fromEntries(auditAxes.map(k=>[k,auditEvents.reduce((n,e)=>n+e.delta[k],0)]));
 const reconciled=auditAxes.every(k=>Math.abs(result.start[k]+sums[k]-result.career[k])<1e-8)&&auditEvents.every(e=>e.reconciled);
 if(!reconciled)throw Error('능력치 변동 합계 검증에 실패했습니다. 분석 결과를 표시하지 않습니다.');
 return {player,cutoff:result.cutoffDate,result,events:auditEvents,cfg,weights,slumpWeights:GGFCSlump.weights,reconciled,enabled:DB.settings.ability.enabled!==false,
  issues:verifiedRecords().issues,teamIssues:teamPlayerRecordLinks().issues,
  metricLabels:Object.fromEntries(Object.keys(cfg.soccerbee.criteria).map(k=>[k,abilityMetricLabel(k)]))};
}
self.onmessage=e=>{
 try{
  const m=e.data;
  if(m.type==='init'){DB={settings:{}};auditEvents=[];return;}
  if(m.type==='value'){const root=m.settings?DB.settings:DB;root[m.key]=m.value;return;}
  if(m.type==='rows'){const root=m.settings?DB.settings:DB;(root[m.key]||=([])).push(...m.rows);return;}
  if(m.type==='run'){
   const start=performance.now();auditReport=auditRun(m.player,m.cutoff);
   const {events,result,issues,teamIssues,...meta}=auditReport;
   const axisTotals=Object.fromEntries(auditAxes.map(k=>[k,events.reduce((s,e)=>{for(const row of e.steps){s.up+=Math.max(0,row.delta[k]);s.down+=Math.min(0,row.delta[k]);}return s;},{up:0,down:0})]));
   const {careerRounds,rounds,summary,soccerBeeInitial,longForm,...smallResult}=result;
   const {events:slumpEvents,legacyEvents,recentIds,baselineIds,...smallSlump}=longForm;
   // Event details stay in this idle worker, not in the UI thread.
   self.postMessage({type:'result',report:{...meta,axisTotals,issues:issues.slice(0,50),teamIssues:teamIssues.slice(0,50),issueCount:issues.length+teamIssues.length,result:{...smallResult,soccerBeeInitial:{evaluation:soccerBeeInitial.evaluation},longForm:smallSlump}},workerMs:performance.now()-start});return;
  }
  if(m.type==='page'&&auditReport){
   const rows=auditReport.events.map((e,i)=>({e,i})).filter(({e})=>(!m.eventType||e.type===m.eventType)&&(!m.axis||e.steps.some(s=>Math.abs(s.delta[m.axis])>1e-10))).reverse();
   const pages=Math.max(1,Math.ceil(rows.length/12)),page=Math.max(0,Math.min(pages-1,m.page||0));
   self.postMessage({type:'page',request:m.request,page,pages,total:rows.length,rows:rows.slice(page*12,page*12+12).map(({e,i})=>({i,date:e.date,type:e.type,delta:e.delta}))});return;
  }
  if(m.type==='detail'&&auditReport){
   const event=auditReport.events[m.index];if(event)self.postMessage({type:'detail',request:m.request,event});
  }
 }catch(error){self.postMessage({type:'error',message:error.message});self.close();}
};
