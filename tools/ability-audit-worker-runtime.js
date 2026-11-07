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
function auditFormDiagnostics(player,result,cfg){
 const f=result.form,p=cfg.growthPolicy,win=Math.max(1,Math.floor(num(cfg.form.window)||5)),maxBase=Math.max(0,num(p.baselineGames)),minBase=num(p.minimumBaseline),coverage=num(p.coverage),end=result.careerRounds.at(-1)?.date||'';
 const finite=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0,source=slumpAppearanceData(),key=normalizePlayerMatchKey(player),position=f.position||'AL';
 const seen=new Set(),games=((position==='GR'?source.gkByPlayer:source.byPlayer).get(key)||[]).filter(g=>g.date>=abilityCareerStartDate()&&g.date<=end&&!seen.has(g.id)&&seen.add(g.id));
 const recent=games.slice(-win),baseline=games.slice(Math.max(0,games.length-win-maxBase),Math.max(0,games.length-win));
 const definitions=position==='GR'?[['def','골키퍼 수비',['ga','saves','minutes']]]:[['sho','슈팅',['g','sot']],['pas','패스',['a','keyPass']],['def','수비',['defSuccess']]];
 const role=position==='GR'?{def:1}:(GGFCSlump.weights[position]||GGFCSlump.weights.AL),needed=(n,min=0)=>Math.max(min,Math.ceil(n*coverage-1e-10));
 const groups=definitions.map(([axis,label,fields])=>{
  const known=list=>list.filter(g=>fields.every(k=>finite(g[k]))),r=known(recent),b=known(baseline),requiredRecent=needed(recent.length),requiredBaseline=needed(baseline.length,minBase);
  return {axis,label,fields,weight:role[axis]||0,recentKnown:r.length,baselineKnown:b.length,requiredRecent,requiredBaseline,recentMissing:Math.max(0,requiredRecent-r.length),baselineMissing:Math.max(0,requiredBaseline-b.length),ready:recent.length>0&&baseline.length>0&&r.length/recent.length>=coverage&&b.length/baseline.length>=coverage&&b.length>=minBase};
 });
 const flags=games.map(g=>Object.fromEntries(definitions.map(([axis,,fields])=>[axis,fields.every(k=>finite(g[k]))])));
 const projectedReady=list=>{
  const r=list.slice(-win),b=list.slice(Math.max(0,list.length-win-maxBase),Math.max(0,list.length-win));
  if(list.length<num(p.minimumMatches)||r.length<win||b.length<minBase)return false;
  const known=Object.keys(role).reduce((s,axis)=>{const nr=r.filter(x=>x[axis]).length,nb=b.filter(x=>x[axis]).length;return s+(nr/r.length>=coverage&&nb/b.length>=coverage&&nb>=minBase?role[axis]:0);},0);
  return known>=num(p.roleCoverage);
 };
 const cutoffPlayed=!recent.length||recent.at(-1).date===end;
 let additionalCompleteGames=null;
 const hypothetical=flags.slice(),horizon=Math.min(512,Math.max(num(p.minimumMatches),win+maxBase)+win+minBase);
 for(let n=0;n<=horizon;n++){if(projectedReady(hypothetical)&&(n>0||cutoffPlayed)){additionalCompleteGames=n;break;}hypothetical.push(Object.fromEntries(definitions.map(([axis])=>[axis,true])));}
 const allKeys=[...new Set(definitions.flatMap(d=>d[2]))];let completeStreak=0;for(let i=games.length-1;i>=0&&allKeys.every(k=>finite(games[i][k]));i--)completeStreak++;
 const matches=new Map(verifiedRecords().matches.map(m=>[verifiedFixtureKey(m),m])),links=teamPlayerRecordLinks().matched,extras=new Map(links.map(r=>[JSON.stringify([String(r.id),teamRecordTeamKey(r.team),normalizePlayerMatchKey(r.player)]),r]));
 const allAppearances=(source.byPlayer.get(key)||[]).filter(g=>g.date>=abilityCareerStartDate()&&g.date<=end),linkedIds=new Set(games.map(g=>g.id)),unlinked=position==='GR'?allAppearances.filter(g=>!linkedIds.has(g.id)):[];
 const saveInputs=position==='GR'?new Map(playerSaveRows().filter(r=>normalizePlayerMatchKey(r.player)===key&&teamRecordValuePresent(r.saves)).map(r=>[JSON.stringify([String(r.id),teamRecordTeamKey(r.team),key]),Number(r.saves)])):new Map();
 const inspected=new Set([...recent,...baseline].map(g=>g.id)),keeper=position==='GR'?goalkeeperRecordData([...matches].filter(([id])=>inspected.has(id)).map(([,m])=>m)):{rows:[]},keeperWarnings=new Map(keeper.rows.filter(r=>r.warning).map(r=>[JSON.stringify([String(r.id),teamRecordTeamKey(r.team),normalizePlayerMatchKey(r.player)]),r]));
 const describe=(g,i,period)=>{
  const m=matches.get(g.id),id=m?.id||'',appearance=JSON.stringify([String(id),teamRecordTeamKey(g.team),key]),extra=extras.get(appearance),warning=keeperWarnings.get(appearance),origins={},inputValues={};
  for(const metric of ['sot','keyPass','defSuccess','saves']){origins[metric]=extra?.counterFields?.includes(metric)?'공유':extra?.appFields?.includes(metric)?'앱':finite(g[metric])?'DB':'미기록';if(finite(extra?.[metric]))inputValues[metric]=extra[metric];}
  if(!finite(inputValues.saves)&&saveInputs.has(appearance)){inputValues.saves=saveInputs.get(appearance);origins.saves='DB';}
  if(warning)for(const metric of ['ga','minutes'])inputValues[metric]=warning[metric];
  const notes=[];if(position!=='GR'&&g.g===null)notes.push('득점자 합계와 팀 점수 확인');if(position!=='GR'&&g.a===null)notes.push('도움 0회 여부 확인');if(warning)notes.push(warning.warning);if(period==='unlinked')notes.push('키퍼실점·수행시간이 FORM 경기로 연결되지 않음');
  return {period,index:i+1,id,fixtureKey:g.id,date:g.date,no:g.no,round:g.round,team:g.team,values:Object.fromEntries([...allKeys,'mom'].map(k=>[k,finite(g[k])?g[k]:null])),inputValues,origins,notes,recentWeight:period==='recent'?Math.max(0,num((cfg.form.recency||[.35,.25,.2,.12,.08])[recent.length-1-i])):null};
 };
 const shared=links.filter(r=>normalizePlayerMatchKey(r.player)===key&&r.date>=abilityCareerStartDate()&&r.date<=end&&r.counterFields?.some(k=>allKeys.includes(k)));
 const aggregate=list=>{const valid=list.filter(g=>['ga','saves','minutes'].every(k=>finite(g[k])));return {shots:valid.reduce((s,g)=>s+g.ga+g.saves,0),saves:valid.reduce((s,g)=>s+g.saves,0),ga:valid.reduce((s,g)=>s+g.ga,0),minutes:valid.reduce((s,g)=>s+g.minutes,0),known:valid.length};};
 const gk=position==='GR'?{recent:aggregate(recent),baseline:aggregate(baseline)}:null;
 if(gk){gk.shotsRequired=num(p.minimumKeeperShots);gk.shotsMissing=Math.max(0,gk.shotsRequired-gk.recent.shots-gk.baseline.shots);gk.sampleReady=gk.shotsMissing===0&&gk.recent.shots>0&&gk.baseline.shots>0&&gk.recent.minutes>0&&gk.baseline.minutes>0;}
 const momCount=recent.reduce((s,g)=>s+Math.max(0,num(g.mom)),0),momBonus=Math.min(1,momCount*num(p.formMom));
 return {position,roleFallback:position!=='GR'&&!GGFCSlump.weights[f.position],cutoff:end,totalGames:games.length,totalAppearances:allAppearances.length,unlinkedKeeperCount:unlinked.length,unlinkedKeeperGames:unlinked.slice(-(win+maxBase)).map((g,i)=>describe(g,i,'unlinked')),window:win,maxBaseline:maxBase,minimumMatches:num(p.minimumMatches),minimumBaseline:minBase,coverage,roleCoverage:num(p.roleCoverage),role,groups,recent:recent.map((g,i)=>describe(g,i,'recent')),baseline:baseline.map((g,i)=>describe(g,i,'baseline')),enoughGames:games.length>=num(p.minimumMatches)&&recent.length>=win&&baseline.length>=minBase,cutoffPlayed,additionalCompleteGames,projectionHorizon:horizon,completeStreak,sharedGames:shared.length,lastSharedMatchDate:shared.map(r=>r.date).sort().pop()||'',gk,momCount,momBonus,formEnabled:cfg.form.enabled!==false,smoothingMatches:num(p.smoothingMatches),formLimit:num(p.formLimit),fullFormChange:num(p.fullFormChange)};
}
function auditRun(player,cutoff){
 const latest=abilityLatestContext(),year=cutoff?cutoff.slice(0,4):latest.year,half=cutoff?abilityHalfForDate(year,cutoff):latest.half;
 const result=playerAbilityRecordAtDate(player,year,half,cutoff||'',true),cfg=abilityConfig(),weights=longFormWeights(playerOvrProfile(player,year,cfg).weights);
 const sums=Object.fromEntries(auditAxes.map(k=>[k,auditEvents.reduce((n,e)=>n+e.delta[k],0)]));
 const reconciled=auditAxes.every(k=>Math.abs(result.start[k]+sums[k]-result.career[k])<1e-8)&&auditEvents.every(e=>e.reconciled);
 if(!reconciled)throw Error('능력치 변동 합계 검증에 실패했습니다. 분석 결과를 표시하지 않습니다.');
 auditDays=auditDailyRows(auditEvents,result,weights,cfg);
 return {player,cutoff:result.cutoffDate,result,events:auditEvents,cfg,weights,formDiagnostics:auditFormDiagnostics(player,result,cfg),slumpWeights:GGFCSlump.weights,reconciled,enabled:DB.settings.ability.enabled!==false,
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
