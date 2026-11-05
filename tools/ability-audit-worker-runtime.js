/* Worker-only report collector. Does not write the source database. */
const auditAxes=['pac','sho','pas','dri','def','phy'];
let auditEvents=[],auditCurrent=null,auditReport=null,auditDays=[];
const auditSlumpReasons=new Set(['지속 부진 BASE 보정','이전 LONG FORM','이전 SLUMP 영구 감점','회복형 SLUMP 잔액 영향']);
const auditZero=()=>Object.fromEntries(auditAxes.map(k=>[k,0]));
const auditWeighted=(values,weights)=>auditAxes.reduce((sum,k)=>sum+(values[k]||0)*weights[k],0);
// One chronological pass over collected events; never replay the engine per date.
function auditDailyRows(events,result,weights,cfg){
 const days=[];let priorForm={modifier:0,ready:false,reason:'초기 평가 전'},runningSlump=auditZero();
 for(const e of events){
  let day=days.at(-1);
  if(!day||day.date!==e.date){
   day={date:e.date,beforeBase:{...e.beforeBase},afterBase:{...e.afterBase},formBefore:{...priorForm},formAfter:{...priorForm},down:auditZero(),slump:auditZero(),reasons:[],events:[],types:[]};days.push(day);
  }
  day.events.push(e);if(!day.types.includes(e.type))day.types.push(e.type);day.afterBase={...e.afterBase};
  if(e.form){priorForm={modifier:e.form.modifier,ready:e.form.ready===true,reason:e.form.reason||'',level:e.form.level};day.formAfter={...priorForm};}
  for(const step of e.steps){
   let negative=false;
   for(const k of auditAxes){const value=step.delta[k]||0;day.down[k]+=Math.min(0,value);if(value< -1e-10)negative=true;if(auditSlumpReasons.has(step.reason))day.slump[k]+=value;}
   if(negative&&!day.reasons.includes(step.reason))day.reasons.push(step.reason);
  }
 }
 const current=(base,form)=>Math.max(cfg.scoreMin,Math.min(cfg.scoreMax,base+form));
 for(const day of days){
  for(const k of auditAxes)runningSlump[k]+=day.slump[k];
  day.baseBefore=auditWeighted(day.beforeBase,weights);day.baseAfter=auditWeighted(day.afterBase,weights);day.baseDelta=day.baseAfter-day.baseBefore;
  day.formDelta=day.formAfter.modifier-day.formBefore.modifier;day.formDown=Math.min(0,day.formDelta);
  day.slumpDelta=auditWeighted(day.slump,weights);day.slumpTotal=auditWeighted(runningSlump,weights);day.baseDown=auditWeighted(day.down,weights);
  day.currentBefore=current(day.baseBefore,day.formBefore.modifier);day.currentAfter=current(day.baseAfter,day.formAfter.modifier);day.currentDelta=day.currentAfter-day.currentBefore;
  day.hasLoss=auditAxes.some(k=>day.down[k]< -1e-10)||day.formDown< -1e-10;
  if(day.formDown< -1e-10)day.reasons.push('FORM 보정 하락');
 }
 const last=days.at(-1);
 if(last&&(Math.abs(last.baseAfter-result.baseOvrRaw)>1e-8||Math.abs(last.formAfter.modifier-result.form.modifier)>1e-8||Math.abs(last.currentAfter-result.currentOvrRaw)>1e-8))throw Error('날짜별 BASE·FORM 합계 검증에 실패했습니다.');
 return days;
}
function auditDailyMetric(day,metric){
 if(metric==='form')return [day.formDelta];if(metric==='slump')return [day.slumpDelta];if(metric==='base')return [day.baseDelta];if(metric==='current')return [day.currentDelta];
 return [day.formDelta,day.slumpDelta,day.baseDelta,day.currentDelta];
}
function auditDailyPage(m){
 const mode=m.mode==='loss'?'loss':'trend',axis=auditAxes.includes(m.axis)?m.axis:'';
 const rows=auditDays.filter(day=>{
  if(mode==='loss'){if(m.axis==='form')return day.formDown< -1e-10;if(m.axis==='base')return auditAxes.some(k=>day.down[k]< -1e-10);return axis?day.down[axis]< -1e-10:day.hasLoss;}
  const values=auditDailyMetric(day,m.metric);
  return m.direction==='up'?values.some(v=>v>1e-10):m.direction==='down'?values.some(v=>v< -1e-10):m.direction==='changed'?values.some(v=>Math.abs(v)>1e-10):true;
 }).slice().reverse();
 const pages=Math.max(1,Math.ceil(rows.length/12)),page=Math.max(0,Math.min(pages-1,Math.floor(Number(m.page)||0)));
 return {type:'dailyPage',mode,request:m.request,page,pages,total:rows.length,rows:rows.slice(page*12,page*12+12).map(day=>{
  const {events,beforeBase,afterBase,slump,...small}=day;return small;
 })};
}
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
 auditDays=auditDailyRows(auditEvents,result,weights,cfg);
 return {player,cutoff:result.cutoffDate,result,events:auditEvents,cfg,weights,slumpWeights:GGFCSlump.weights,reconciled,enabled:DB.settings.ability.enabled!==false,
  issues:verifiedRecords().issues,teamIssues:teamPlayerRecordLinks().issues,
  metricLabels:Object.fromEntries(Object.keys(cfg.soccerbee.criteria).map(k=>[k,abilityMetricLabel(k)]))};
}
self.onmessage=e=>{
 try{
  const m=e.data;
  if(m.type==='init'){DB={settings:{}};liveCounterTeamPlayerRecords=[];auditEvents=[];auditDays=[];auditReport=null;auditCurrent=null;return;}
  if(m.type==='value'){if(m.key==='liveCounterTeamPlayerRecords'){liveCounterTeamPlayerRecords=m.value;return;}const root=m.settings?DB.settings:DB;root[m.key]=m.value;return;}
  if(m.type==='rows'){if(m.key==='liveCounterTeamPlayerRecords'){liveCounterTeamPlayerRecords.push(...m.rows);return;}const root=m.settings?DB.settings:DB;(root[m.key]||=([])).push(...m.rows);return;}
  if(m.type==='run'){
   auditEvents=[];auditDays=[];const start=performance.now();auditReport=auditRun(m.player,m.cutoff);
   const {events,result,issues,teamIssues,...meta}=auditReport;
   const axisTotals=Object.fromEntries(auditAxes.map(k=>[k,events.reduce((s,e)=>{for(const row of e.steps){s.up+=Math.max(0,row.delta[k]);s.down+=Math.min(0,row.delta[k]);}return s;},{up:0,down:0})]));
   const {careerRounds,rounds,summary,soccerBeeInitial,longForm,...smallResult}=result;
   const {events:slumpEvents,legacyEvents,recentIds,baselineIds,...smallSlump}=longForm;
   // Event details stay in this idle worker, not in the UI thread.
   self.postMessage({type:'result',report:{...meta,axisTotals,dailySummary:{days:auditDays.length,lossDays:auditDays.filter(d=>d.hasLoss).length,formUp:auditDays.filter(d=>d.formDelta>1e-10).length,formDown:auditDays.filter(d=>d.formDelta< -1e-10).length,slumpUp:auditDays.filter(d=>d.slumpDelta>1e-10).length,slumpDown:auditDays.filter(d=>d.slumpDelta< -1e-10).length},issues:issues.slice(0,50),teamIssues:teamIssues.slice(0,50),issueCount:issues.length+teamIssues.length,result:{...smallResult,soccerBeeInitial:{evaluation:soccerBeeInitial.evaluation},longForm:smallSlump}},workerMs:performance.now()-start});return;
  }
  if(m.type==='page'&&auditReport){
   const rows=auditReport.events.map((e,i)=>({e,i})).filter(({e})=>(!m.eventType||e.type===m.eventType)&&(!m.axis||e.steps.some(s=>Math.abs(s.delta[m.axis])>1e-10))).reverse();
   const pages=Math.max(1,Math.ceil(rows.length/12)),page=Math.max(0,Math.min(pages-1,m.page||0));
   self.postMessage({type:'page',request:m.request,page,pages,total:rows.length,rows:rows.slice(page*12,page*12+12).map(({e,i})=>({i,date:e.date,type:e.type,delta:e.delta}))});return;
  }
  if(m.type==='detail'&&auditReport){
   const event=auditReport.events[m.index];if(event)self.postMessage({type:'detail',request:m.request,event});
  }
  if(m.type==='dailyPage'&&auditReport){self.postMessage(auditDailyPage(m));return;}
  if(m.type==='dayDetail'&&auditReport){
   const day=auditDays.find(d=>d.date===m.date);if(day)self.postMessage({type:'dayDetail',mode:m.mode==='loss'?'loss':'trend',request:m.request,day});
  }
 }catch(error){self.postMessage({type:'error',message:error.message});self.close();}
};
