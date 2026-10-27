/* GGFC V3.25.47 — recoverable performance penalty. Source records stay immutable. */
const GGFCSlump=(()=>{
 const defaults={enabled:true,startDate:'2026-10-20',recentGames:10,baselineGames:20,minimumBaselineGames:10,formTrigger:-2,performanceTrigger:75,persistenceRounds:4,interval:4,recoveryPerformance:85,recoveryRounds:3,slumpDrop:.20,severeDrop:.35,criticalDrop:.50,seasonCap:1.5,storyEnabled:false};
 Object.assign(defaults,{recoveryStartDate:'2026-10-27',recoveryPercent:25,severePerformance:70,criticalPerformance:60});
 const axes=['pac','sho','pas','dri','def','phy'];
 const weights={PV:{sho:.55,pas:.30,def:.15},AL:{sho:.35,pas:.35,def:.30},FS:{sho:.15,pas:.25,def:.60}};
 const finite=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
 function metric(recent,baseline,inverse=false){
  if(!finite(recent)||!finite(baseline))return null;
  const x=inverse?(recent===0?(baseline===0?100:120):baseline/recent*100):(baseline===0?(recent===0?100:120):recent/baseline*100);
  return Math.max(50,Math.min(120,x));
 }
 function weighted(values,weight){const keys=Object.keys(weight).filter(k=>Number.isFinite(values[k])),den=keys.reduce((s,k)=>s+weight[k],0);return den?keys.reduce((s,k)=>s+values[k]*weight[k],0)/den:null;}
 function stat(rows,key){const known=rows.filter(r=>finite(r[key]));return {sum:known.reduce((s,r)=>s+r[key],0),known:known.length,total:rows.length,rate:known.length===rows.length&&rows.length?known.reduce((s,r)=>s+r[key],0)/rows.length:null};}
 function performance(games,position,cfg,frozenBaseline=null){
  // Deduplicate appearances before selecting windows; a day can contain several matches.
  const seen=new Set(),list=games.filter(g=>!seen.has(g.id)&&seen.add(g.id)),recent=list.slice(-cfg.recentGames),baseline=frozenBaseline||list.slice(Math.max(0,list.length-cfg.recentGames-cfg.baselineGames),Math.max(0,list.length-cfg.recentGames));
  const ready=recent.length===cfg.recentGames&&baseline.length>=cfg.minimumBaselineGames;
  const result={ready,recentGames:recent.length,baselineGames:baseline.length,recentIds:recent.map(g=>g.id),baselineIds:baseline.map(g=>g.id),metrics:{},indices:{sho:null,pas:null,def:null},overall:null,partial:false,position,momBonus:0};
  if(position==='GR'){
   const period=rows=>{const ga=stat(rows,'ga'),minutes=stat(rows,'minutes'),saves=stat(rows,'saves'),paired=rows.length&&rows.every(r=>finite(r.ga)&&finite(r.saves)),shots=paired?ga.sum+saves.sum:0;return {saveRate:paired&&shots>0?saves.sum/shots*100:null,ga15:ga.rate!==null&&minutes.rate!==null&&minutes.sum>0?ga.sum/minutes.sum*15:null,ga,saves,minutes};};
   const r=period(recent),b=period(baseline);result.gk={recent:r,baseline:b};
   for(const key of ['saveRate','ga15'])result.metrics[key]={recent:r[key],baseline:b[key],score:ready?metric(r[key],b[key],key==='ga15'):null};
   result.indices.def=ready?weighted(Object.fromEntries(Object.entries(result.metrics).map(([k,v])=>[k,v.score])),{saveRate:.7,ga15:.3}):null;
   result.overall=result.indices.def;result.partial=Object.values(result.metrics).some(m=>m.score===null);
  }else{
   for(const key of ['g','a','sot','keyPass','defSuccess']){const r=stat(recent,key),b=stat(baseline,key);result.metrics[key]={recent:r.rate,baseline:b.rate,recentCoverage:r.known,baselineCoverage:b.known,score:ready?metric(r.rate,b.rate):null};}
   const m=Object.fromEntries(Object.entries(result.metrics).map(([k,v])=>[k,v.score]));
   result.indices={sho:weighted(m,{g:.6,sot:.4}),pas:weighted(m,{a:.5,keyPass:.5}),def:m.defSuccess};
   result.momBonus=Math.min(6,recent.reduce((s,r)=>s+(finite(r.mom)?r.mom:0),0)*3);
   const overall=weighted(result.indices,weights[position]||{});result.overall=overall===null?null:Math.min(120,overall+result.momBonus);
   result.partial=Object.values(m).some(x=>x===null);
  }
  result.ready=ready&&Number.isFinite(result.overall);
  return result;
 }
 function severity(score){return score>=85?'NORMAL':score>75?'WATCH':score>=70?'SLUMP':score>=60?'SEVERE SLUMP':'CRITICAL SLUMP';}
 function legacyTimeline(rounds,forms,games,gkGames,positionAt,cfg){
  let persistence=0,recovery=0,wasLow=false,recovered=false,lastCheckpoint=-Infinity;const out=[];
  for(let i=0;i<rounds.length;i++){
   const r=rounds[i],position=positionAt(r.date),source=position==='GR'?gkGames:games,available=source.filter(g=>g.date<=r.date),played=available.some(g=>g.date===r.date);
   const p=performance(available,position,cfg),form=forms.get(r.date)?.level??0,active=r.date>=cfg.startDate;
   const low=p.ready&&p.overall<=cfg.performanceTrigger,gate=active&&played&&low&&form<=cfg.formTrigger;
   persistence=gate?persistence+1:0;
   if(active&&played&&low){wasLow=true;recovered=false;}
   recovery=active&&played&&p.ready&&p.overall>=cfg.recoveryPerformance?recovery+1:0;
   if(wasLow&&recovery>=cfg.recoveryRounds){recovered=true;wasLow=false;}
   const confirmed=gate&&persistence>=cfg.persistenceRounds;
   const checkpoint=cfg.enabled&&confirmed&&i-lastCheckpoint>=cfg.interval;
   if(checkpoint)lastCheckpoint=i;
   const status=!cfg.enabled?'OFF':!active?'NOT STARTED':!p.ready?'INSUFFICIENT DATA':!played?'PAUSED':recovered?'RECOVERED':confirmed?'CONFIRMED SLUMP':severity(p.overall);
   out.push({...p,date:r.date,round:i+1,form,played,active,persistence,recovery,recovered,confirmed,checkpoint,status,severity:p.ready?severity(p.overall):'INSUFFICIENT DATA',nextCheck:Number.isFinite(lastCheckpoint)?lastCheckpoint+1+cfg.interval:null});
  }
  return out;
 }
 function legacyApply(career,ovrWeights,state,entry,cfg,scoreMin,player){
  if(!entry?.checkpoint||!cfg.enabled||entry.date<cfg.startDate||!entry.played)return;
  const id=JSON.stringify(['SLUMP-v1',player,entry.date]);if(state.events.some(e=>e.id===id))return;
  const total=axes.reduce((s,k)=>s+Math.max(0,ovrWeights[k]||0),0),w=Object.fromEntries(axes.map(k=>[k,total?Math.max(0,ovrWeights[k]||0)/total:1/6]));
  const year=entry.date.slice(0,4),remaining=Math.max(0,cfg.seasonCap-(state.byYear[year]||0)),losses=Object.fromEntries(axes.map(k=>[k,0]));
  for(const k of ['sho','pas','def']){const n=entry.indices[k];if(!Number.isFinite(n)||n>cfg.performanceTrigger)continue;const drop=n<60?cfg.criticalDrop:n<70?cfg.severeDrop:cfg.slumpDrop;losses[k]=Math.min(drop,Math.max(0,career[k]-scoreMin));}
  const target=axes.reduce((s,k)=>s+losses[k]*w[k],0),scale=target>0?Math.min(1,remaining/target):0;
  for(const k of axes){losses[k]*=scale;career[k]-=losses[k];state.skills[k]+=losses[k];}
  const actual=axes.reduce((s,k)=>s+losses[k]*w[k],0);state.byYear[year]=(state.byYear[year]||0)+actual;
  state.events.push({id,date:entry.date,round:entry.round,score:entry.overall,form:entry.form,indices:{...entry.indices},losses,actual,partial:entry.partial,recentGames:entry.recentGames,baselineGames:entry.baselineGames,reason:remaining<=1e-10?'시즌 조정 한도 도달':actual>0?'최근 경기력이 평소보다 낮은 상태가 지속되고 있습니다.':'조정 대상 능력치 또는 여유 없음'});
 }
 // One frozen personal reference per position/episode; poor rolling baselines cannot
 // manufacture a recovery. All rounds are replayed, so no ledger is persisted to DB.
 function timeline(rounds,forms,games,gkGames,positionAt,cfg){
  const old=legacyTimeline(rounds.filter(r=>r.date<cfg.recoveryStartDate),forms,games,gkGames,positionAt,{...cfg,enabled:cfg.enabled&&cfg.legacyFormEnabled!==false}),out=[],anchors=new Map();
  let persistence=0,lastCheckpoint=-Infinity,lastPosition='';
  for(let i=0;i<rounds.length;i++){
   const r=rounds[i];
   if(r.date<cfg.recoveryStartDate){out.push({...old[i],mode:'legacy'});continue;}
   const position=positionAt(r.date),source=position==='GR'?gkGames:games,seen=new Set();
   const available=source.filter(g=>g.date<=r.date&&!seen.has(g.id)&&seen.add(g.id));
   const played=available.some(g=>g.date===r.date),active=r.date>=cfg.startDate;
   if(lastPosition!==position){persistence=0;for(const a of anchors.values())a.streak={};}lastPosition=position;
   let anchor=anchors.get(position),p=performance(available,position,cfg,anchor?.rows);
   const low=p.ready&&p.overall<=cfg.performanceTrigger;
   if(cfg.enabled&&active&&played&&low&&!anchor){
    anchor={rows:available.filter(g=>p.baselineIds.includes(g.id)),date:r.date,confirmed:false,affected:new Set(),streak:{}};
    anchors.set(position,anchor);
   }
   const gate=cfg.enabled&&active&&played&&low;
   persistence=gate?persistence+1:0;
   const confirmed=gate&&persistence>=cfg.persistenceRounds;
   const checkpoint=confirmed&&i-lastCheckpoint>=cfg.interval;
   if(checkpoint)lastCheckpoint=i;
   if(anchor){
    if(confirmed)anchor.confirmed=true;
    if(checkpoint)for(const k of ['sho','pas','def'])if(Number.isFinite(p.indices[k])&&p.indices[k]<=cfg.performanceTrigger)anchor.affected.add(k);
    for(const k of ['sho','pas','def'])anchor.streak[k]=cfg.enabled&&active&&played&&p.ready&&Number.isFinite(p.indices[k])&&p.indices[k]>=cfg.recoveryPerformance?(anchor.streak[k]||0)+1:0;
   }
   const status=!cfg.enabled?'OFF':!active?'NOT STARTED':!p.ready?'INSUFFICIENT DATA':!played?'PAUSED':confirmed?'CONFIRMED SLUMP':low?'SLUMP WATCH':'NORMAL';
   out.push({...p,date:r.date,round:i+1,form:forms.get(r.date)?.level??0,mode:'recovery',played,active,persistence,confirmed,checkpoint,status,referenceDate:anchor?.date||'',referenceFrozen:!!anchor,recovery:anchor?Math.max(0,...Object.values(anchor.streak)):0,nextCheck:Number.isFinite(lastCheckpoint)?lastCheckpoint+1+cfg.interval:null});
   if(anchor&&(!anchor.confirmed&&!gate||anchor.confirmed&&anchor.affected.size&&[...anchor.affected].every(k=>anchor.streak[k]>=cfg.recoveryRounds+Math.ceil(100/cfg.recoveryPercent)-1)))anchors.delete(position);
  }
  return out;
 }
 function initLedger(state){
  for(const name of ['balance','deducted','restored','recoveryStreak','installment'])if(!state[name])state[name]=Object.fromEntries(axes.map(k=>[k,0]));
  state.recoveryByYear ||= {};state.processed ||= new Set();
 }
 function normalizedWeights(weights){const den=axes.reduce((s,k)=>s+Math.max(0,weights[k]||0),0);return Object.fromEntries(axes.map(k=>[k,den?Math.max(0,weights[k]||0)/den:1/6]));}
 function apply(career,ovrWeights,state,entry,cfg,scoreMin,player){
  initLedger(state);
  if(!entry)return;
  if(entry.mode!=='recovery'){legacyApply(career,ovrWeights,state,entry,{...cfg,enabled:cfg.enabled&&cfg.legacyFormEnabled!==false},scoreMin,player);return;}
  const id=JSON.stringify(['SLUMP-v2',player,entry.date]);if(state.processed.has(id))return;state.processed.add(id);
  const w=normalizedWeights(ovrWeights),year=entry.date.slice(0,4),losses=Object.fromEntries(axes.map(k=>[k,0])),restores={...losses};
  if(state.position&&state.position!==entry.position)for(const k of axes)state.recoveryStreak[k]=0;state.position=entry.position;
  const eligible=cfg.enabled&&entry.active&&entry.played&&entry.ready;
  for(const k of axes){
   const n=entry.indices[k],good=eligible&&Number.isFinite(n)&&n>=cfg.recoveryPerformance;
   state.recoveryStreak[k]=good?state.recoveryStreak[k]+1:0;
   if(state.balance[k]>1e-10&&state.recoveryStreak[k]>=cfg.recoveryRounds){
    if(!state.installment[k])state.installment[k]=state.balance[k]*cfg.recoveryPercent/100;
    restores[k]=Math.min(state.balance[k],state.installment[k]);
    state.balance[k]=Math.max(0,state.balance[k]-restores[k]);state.restored[k]+=restores[k];
    if(state.balance[k]<1e-10){state.balance[k]=0;state.installment[k]=0;}
   }
  }
  const remaining=Math.max(0,cfg.seasonCap-(state.recoveryByYear[year]||0)-(state.byYear[year]||0));
  if(eligible&&entry.checkpoint){
   for(const k of ['sho','pas','def']){
    const n=entry.indices[k];if(!Number.isFinite(n)||n>cfg.performanceTrigger)continue;
    const drop=n<cfg.criticalPerformance?cfg.criticalDrop:n<cfg.severePerformance?cfg.severeDrop:cfg.slumpDrop;
    losses[k]=Math.min(drop,Math.max(0,career[k]-scoreMin-state.balance[k]));
   }
   const target=axes.reduce((s,k)=>s+losses[k]*w[k],0),scale=target>0?Math.min(1,remaining/target):0;
   for(const k of axes){losses[k]*=scale;if(losses[k]>0){state.balance[k]+=losses[k];state.deducted[k]+=losses[k];state.installment[k]=0;state.recoveryStreak[k]=0;}}
  }
  const actual=axes.reduce((s,k)=>s+losses[k]*w[k],0),restored=axes.reduce((s,k)=>s+restores[k]*w[k],0);
  state.recoveryByYear[year]=(state.recoveryByYear[year]||0)+actual;
  if(actual>0||restored>0||entry.checkpoint)state.events.push({id,date:entry.date,round:entry.round,mode:'recovery',type:actual>0&&restored>0?'MIXED':actual>0?'DEDUCTION':restored>0?'RECOVERY':'LIMIT',score:entry.overall,form:entry.form,indices:{...entry.indices},losses,restores,balance:{...state.balance},actual,restored,partial:entry.partial,recentGames:entry.recentGames,baselineGames:entry.baselineGames,referenceDate:entry.referenceDate,reason:actual>0?'회복 가능한 SLUMP 감점':restored>0?'축별 경기력 회복 · 감점 잔액 복구':remaining<=1e-10?'연간 신규 감점 한도 도달':'조정 가능한 능력치 없음'});
 }
 function project(core,state,scoreMin){initLedger(state);return Object.fromEntries(axes.map(k=>[k,Math.max(scoreMin,core[k]-state.balance[k]) ]));}

 function validate(c){
  if(typeof c.enabled!=='boolean'||typeof c.storyEnabled!=='boolean')return 'SLUMP 사용 여부와 Story 설정을 확인하세요.';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(c.startDate)||!Number.isFinite(Date.parse(c.startDate))||new Date(c.startDate).toISOString().slice(0,10)!==c.startDate)return 'SLUMP 적용 시작일을 올바른 날짜로 입력하세요.';
  for(const [k,lo,hi,int] of [['recentGames',10,50,true],['baselineGames',10,100,true],['minimumBaselineGames',10,100,true],['formTrigger',-5,-1,true],['performanceTrigger',50,75,false],['persistenceRounds',4,20,true],['interval',4,20,true],['recoveryPerformance',85,120,false],['recoveryRounds',3,20,true],['slumpDrop',0,2,false],['severeDrop',0,2,false],['criticalDrop',0,2,false],['seasonCap',0,1.5,false]])if(!Number.isFinite(c[k])||c[k]<lo||c[k]>hi||(int&&!Number.isInteger(c[k])))return 'SLUMP '+k+': '+lo+'~'+hi+(int?'의 정수':'')+' 범위로 입력하세요.';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(c.recoveryStartDate)||!Number.isFinite(Date.parse(c.recoveryStartDate))||new Date(c.recoveryStartDate).toISOString().slice(0,10)!==c.recoveryStartDate||c.recoveryStartDate<c.startDate)return '회복형 전환일은 SLUMP 적용 시작일 이후의 유효한 날짜여야 합니다.';
  if(!Number.isFinite(c.recoveryPercent)||c.recoveryPercent<5||c.recoveryPercent>100)return '회복 비율은 5~100% 범위로 입력하세요.';
  if(!Number.isFinite(c.criticalPerformance)||!Number.isFinite(c.severePerformance)||c.criticalPerformance<50||!(c.criticalPerformance<c.severePerformance&&c.severePerformance<=c.performanceTrigger))return 'PI 경계는 50 ≤ 극심 < 심함 ≤ 감점 기준이어야 합니다.';
  if(c.minimumBaselineGames>c.baselineGames)return 'Baseline 최대 경기 수는 최소 경기 수 이상이어야 합니다.';
  if(!(c.slumpDrop<=c.severeDrop&&c.severeDrop<=c.criticalDrop))return '부진 단계가 심할수록 감소량이 작아질 수 없습니다.';
  return '';
 }
 return {defaults,weights,metric,weighted,performance,timeline,apply,project,normalizedWeights,legacyTimeline,legacyApply,validate};
})();

// App adapter: validated per-match records, separate from per-day growth/FORM rounds.
let slumpAppearanceCache=null;
function slumpAppearanceData(){
 const v=verifiedRecords(),links=teamPlayerRecordLinks(),refs=[v,links,DB.settings?.goalkeeperEntries,DB.roster,DB.settings?.teamSquads];
 if(slumpAppearanceCache&&refs.every((r,i)=>r===slumpAppearanceCache.refs[i]))return slumpAppearanceCache;
 const byPlayer=new Map(),byFixture=new Map(),key=r=>JSON.stringify([String(r.id),r.team,normalizePlayerMatchKey(r.player)]),teamKey=(id,t)=>JSON.stringify([String(id),t]);
 const matches=new Map(v.matches.map(m=>[String(m.id),m])),goals=new Map(),mom=new Map(),extras=new Map(),saves=new Map(),teamGoals=new Map(),teamAssists=new Map();
 for(const r of v.goals){const k=key(r),t=teamKey(r.id,r.team);goals.set(k,{g:num(r.g),a:num(r.a)});teamGoals.set(t,(teamGoals.get(t)||0)+num(r.g));teamAssists.set(t,(teamAssists.get(t)||0)+num(r.a));}
 for(const r of v.moms)mom.set(key(r),num(r.mom));
 for(const r of links.matched)extras.set(key(r),r);
 for(const r of playerSaveRows())if(r.saves!==null&&r.saves!==undefined)saves.set(key(r),num(r.saves));
 const people=new Map();
 const include=r=>{const m=matches.get(String(r.id));if(!m||isOwnGoalPlayer(r.player)||!playerEligibleOn(r.player,m.date)||forfeitTeamNames(m).length)return;people.set(key(r),r);};
 v.attendance.forEach(include);
 // Positive events prove an appearance, but never award official attendance here.
 for(const r of v.goals)if(num(r.g)>0||num(r.a)>0)include(r);
 for(const r of v.moms)if(num(r.mom)>0)include(r);
 for(const r of links.matched)if(['sot','keyPass','defSuccess','saves'].some(k=>num(r[k])>0))include(r);
 const playerTeams=new Map();for(const r of people.values()){const k=String(r.id)+'|'+normalizePlayerMatchKey(r.player);if(!playerTeams.has(k))playerTeams.set(k,new Set());playerTeams.get(k).add(r.team);}
 for(const r of people.values()){
  if(playerTeams.get(String(r.id)+'|'+normalizePlayerMatchKey(r.player)).size!==1)continue;
  const m=matches.get(String(r.id)),k=key(r),t=teamKey(r.id,r.team),gf=num(r.team===m.home?m.hs:m.as),g=goals.get(k),extra=extras.get(k),completeGoals=(teamGoals.get(t)||0)===gf;
  const row={id:verifiedFixtureKey(m),date:normDate(m.date),no:String(m.no||''),round:String(m.round||''),team:r.team,player:r.player,g:completeGoals?(g?.g||0):null,a:(teamAssists.get(t)>0||gf===0)?(g?.a||0):null,mom:mom.get(k)||0,sot:extra?.sot??null,keyPass:extra?.keyPass??null,defSuccess:extra?.defSuccess??null};
  const p=normalizePlayerMatchKey(r.player);if(!byPlayer.has(p))byPlayer.set(p,[]);byPlayer.get(p).push(row);byFixture.set(k,row);
 }
 const gkByPlayer=new Map(),keeper=goalkeeperRecordData();
 for(const r of keeper.rows){const base=byFixture.get(key(r));if(!base)continue;const p=normalizePlayerMatchKey(r.player);if(!gkByPlayer.has(p))gkByPlayer.set(p,[]);gkByPlayer.get(p).push({...base,ga:r.warning?null:r.ga,minutes:r.warning?null:r.minutes,saves:r.warning?null:saves.get(key(r))??null});}
 const sort=(a,b)=>a.date.localeCompare(b.date)||a.no.localeCompare(b.no,undefined,{numeric:true})||a.round.localeCompare(b.round,undefined,{numeric:true})||a.id.localeCompare(b.id);
 for(const rows of [...byPlayer.values(),...gkByPlayer.values()])rows.sort(sort);
 return slumpAppearanceCache={refs,byPlayer,gkByPlayer,issues:links.issues.length+keeper.issues.length};
}
function playerSlumpTimeline(player,rounds,forms,cfg){
 const source=slumpAppearanceData(),key=normalizePlayerMatchKey(player),start=abilityCareerStartDate(),games=(source.byPlayer.get(key)||[]).filter(g=>g.date>=start),gk=(source.gkByPlayer.get(key)||[]).filter(g=>g.date>=start);
 return GGFCSlump.timeline(rounds,forms,games,gk,date=>playerOvrProfile(player,date.slice(0,4),cfg).position,{...cfg.slump,legacyFormEnabled:cfg.form.enabled!==false});
}
function slumpResult(timeline,state,legacy,cfg,cutoff,weights,core,applied){
 const last=timeline.at(-1)||{status:'INSUFFICIENT DATA',overall:null,ready:false,indices:{},metrics:{},recentGames:0,baselineGames:0,persistence:0,recovery:0,form:0};
 const w=GGFCSlump.normalizedWeights(weights),sum=o=>Object.entries(w).reduce((s,[k,v])=>s+(o?.[k]||0)*v,0),balance=state.balance||{},gross=sum(state.deducted),restored=sum(state.restored),pending=sum(balance),impact=sum(Object.fromEntries(Object.keys(w).map(k=>[k,core[k]-applied[k]])));
 const recovering=pending>1e-10&&Object.keys(balance).some(k=>balance[k]>0&&state.recoveryStreak[k]>=cfg.slump.recoveryRounds);
 const status=!cfg.slump.enabled?'OFF':!last.active||!last.played||!last.ready?last.status:pending>1e-10?(recovering?'RECOVERING':last.confirmed?'CONFIRMED SLUMP':'RECOVERY WAIT'):gross>0?'RECOVERED':last.status;
 return {...last,status,enabled:cfg.slump.enabled,score:last.overall,events:state.events,byYear:state.byYear,skills:state.skills,yearLoss:(state.byYear[cutoff.slice(0,4)]||0)+(state.recoveryByYear?.[cutoff.slice(0,4)]||0),seasonCap:cfg.slump.seasonCap,startDate:cfg.slump.startDate,recoveryStartDate:cfg.slump.recoveryStartDate,legacyEvents:legacy.events.filter(e=>e.actual>0),legacyYearLoss:legacy.byYear[cutoff.slice(0,4)]||0,balance:{...balance},deducted:{...state.deducted},restored:{...state.restored},recoveryStreak:{...state.recoveryStreak},pendingOvr:pending,effectivePenalty:impact,restoredOvr:restored,totalPenaltyOvr:gross,recoveryProgress:gross>0?Math.min(100,restored/gross*100):0,coreOvr:sum(core),recoveries:state.events.filter(e=>e.mode==='recovery'&&e.restored>0&&Object.values(e.balance).every(v=>v<1e-10)).map(e=>e.date)};
}
function longFormStatus(record){const l=record.longForm;return !l?.enabled?'OFF':l.status;}
function longFormBadge(record){
 const l=record?.longForm;if(!l)return '';return '<span class="lf-badge '+(l.pendingOvr>0||l.confirmed?'risk':'')+'">SLUMP <b>'+esc(longFormStatus(record))+'</b> · PI '+(l.ready?l.overall.toFixed(1):'—')+(l.pendingOvr>0?' · 잔액 −'+l.pendingOvr.toFixed(2):'')+'</span>';
}
function longFormMethodHtml(){
 const c=abilityConfig().slump;
 return '<details class="lf-method"><summary>회복형 SLUMP · 계산·복구 기준</summary><p><b>CORE − 남은 SLUMP 감점 = 적용 BASE.</b> CORE에는 기존 성장·SoccerBee·파울·결석 계산을 유지합니다. 성장 요율은 감점 전 CORE로 판정하며, FORM은 별도로 CURRENT에만 적용합니다. 회복으로 반환하는 것은 회복형 SLUMP에서 실제 차감한 축별 잔액뿐입니다.</p><p>최근 실제 출전 '+c.recentGames+'경기 / 직전 최대 '+c.baselineGames+'경기(최소 '+c.minimumBaselineGames+'경기)를 비교합니다. PI = 최근 경기당 평균 ÷ 과거 경기당 평균 × 100 (50~120). 둘 다 0이면 100, 과거만 0이면 120. 한 경기라도 미확인인 지표는 제외하고 유효 지표 가중치를 재분배합니다. 결석은 0경기로 넣지 않습니다.</p><p>SHO = 골 60% + 유효슛 40%, PAS = 도움 50% + 키패스 50%, DEF = 수비성공. 종합 SHO/PAS/DEF 가중치: PV 55/30/15%, AL 35/35/30%, FS 15/25/60%. MOM 1회 +3, 최대 +6은 종합 PI에만 적용. GR은 선방률 최근/과거 70% + GA/15 과거/최근 역비교 30%로 DEF를 평가합니다. 선방률 = 선방/(선방+실점), GA/15 = 실점/GR 시간×15. 분모 0·누락은 N/A입니다.</p><p><b>감점:</b> FORM 조건 없이, 충분한 표본과 종합 PI ≤ '+c.performanceTrigger+'가 실제 출전 '+c.persistenceRounds+'R 연속이면 확정합니다. 첫 확정일에 감점, 이후 최소 '+c.interval+'R 간격. 1R은 소속팀 경기일입니다. SHO/PAS/DEF 중 개별 PI도 기준 이하인 축만 대상, GR은 DEF만 대상입니다. PAC/DRI/PHY는 SLUMP로 차감하지 않습니다.</p><p>축별 PI '+c.severePerformance+'~'+c.performanceTrigger+': −'+c.slumpDrop+', '+c.criticalPerformance+' 이상 '+c.severePerformance+' 미만: −'+c.severeDrop+', '+c.criticalPerformance+' 미만: −'+c.criticalDrop+' <b>능력치 점수</b>. 연간(1~12월) 신규 감점은 최대 '+c.seasonCap+' OVR이며, 복구해도 해당 연도의 사용 한도는 되돌리지 않습니다.</p><p><b>복구:</b> 감점된 축의 PI ≥ '+c.recoveryPerformance+'가 '+c.recoveryRounds+'R 연속이면 그날부터 복구합니다. 회복 시작 잔액의 '+c.recoveryPercent+'%를 고정 분할액으로 잡아, 이후 조건을 만족한 출전 R마다 같은 양을 반환합니다. 마지막에는 잔액까지만 반환합니다. 조건 미달·결석·자료 누락은 연속 횟수를 초기화하고 복구를 잠시 멈춥니다. 새 감점이 생긴 축은 분할액을 다시 계산합니다.</p><p>첫 부진 후보일의 과거 비교 표본을 해당 포지션의 회복 완료까지 고정합니다. 부진 기록이 과거 표본으로 밀려가 생기는 가짜 회복을 막습니다. 감점 전 후보가 해제되면 표본을 다시 선택합니다. 포지션 변경 시 축별 잔액은 보존하고 회복 연속 횟수는 초기화합니다. 연도가 바뀌어도 남은 잔액은 유지됩니다.</p><p>기존 SLUMP 시작일 '+esc(c.startDate)+', 회복형 전환일 <b>'+esc(c.recoveryStartDate)+'</b>. 전환일 이전은 기존 FORM ≤ '+c.formTrigger+' 조건·영구 감점 방식, 그 이전 LONG FORM은 기존 산식입니다. 과거 감점은 소급 환급하지 않습니다. OFF는 회복형 신규 감점·복구를 모두 중단하며 과거 잔액은 날짜순 재계산 결과를 따릅니다.</p><p>설정·시작일·원본 기록을 변경하면 전체 조회 결과가 다시 계산됩니다. OFF를 포함한 설정 변경은 과거 결과에도 영향을 줄 수 있습니다. 별도 이력을 DB에 중복 저장하지 않으므로 새로고침·동기화로 중복 감점되지 않습니다.</p></details>';
}
function longFormCardHtml(record){
 const l=record?.longForm;if(!l)return '';const c=abilityConfig().slump,fmt=v=>Number.isFinite(v)?v.toFixed(3):'—',progress=l.recoveryProgress||0;
 const metrics={g:'골 / 경기',a:'도움 / 경기',sot:'유효슛 / 경기',keyPass:'키패스 / 경기',defSuccess:'수비성공 / 경기',saveRate:'선방률 %',ga15:'GA / 15분'};
 const axes=['sho','pas','def'];
 const ledger='<div class="slump-recovery-grid"><div><small>SLUMP 감점 잔액</small><b>−'+fmt(l.pendingOvr)+' <small>OVR</small></b></div><div><small>누적 복구</small><b>+'+fmt(l.restoredOvr)+' <small>OVR</small></b></div><div><small>회복 진행률</small><b>'+(l.totalPenaltyOvr>0?Math.round(progress)+'%':'감점 없음')+'</b></div></div><progress class="slump-recovery-progress" max="100" value="'+progress+'" aria-label="SLUMP 누적 회복 진행률"></progress><p class="note">현재 포지션 가중치 환산 · 누적 복구 / 누적 감점. 새 감점이 생기면 진행률이 내려갈 수 있습니다. 적용 BASE '+fmt(record.baseOvrRaw)+' = CORE '+fmt(l.coreOvr)+' − 현재 영향 '+fmt(l.effectivePenalty)+'</p>';
 const detail='<details class="slump-axis-details"><summary>능력치별 감점·복구 내역</summary><div class="tablewrap">'+tbl(['능력치','누적 감점','복구','잔액','회복 연속 R'].map(t=>({t})),axes.map(k=>[k.toUpperCase(),fmt(l.deducted[k]||0),fmt(l.restored[k]||0),fmt(l.balance[k]||0),(l.recoveryStreak[k]||0)+' / '+c.recoveryRounds]))+'</div><p class="note">이전 방식의 영구 감점과 결석·파울·측정값 하락은 복구 대상에 포함되지 않습니다.</p></details>';
 const details=admin?'<details class="slump-admin-details"><summary>관리자 · 경기력 비교 및 이벤트</summary><p>Recent '+l.recentGames+'/'+c.recentGames+' · Baseline '+l.baselineGames+'/'+c.baselineGames+' (최소 '+c.minimumBaselineGames+') · 기준 고정일 '+esc(l.referenceDate||'없음')+' · '+esc(l.position||'포지션 미확인')+'</p><div class="tablewrap">'+tbl(['기록','최근 평균','과거 평균','PI'].map(t=>({t})),Object.entries(l.metrics||{}).map(([k,m])=>[metrics[k],fmt(m.recent),fmt(m.baseline),fmt(m.score)]))+'</div><p>SHO '+fmt(l.indices?.sho)+' · PAS '+fmt(l.indices?.pas)+' · DEF '+fmt(l.indices?.def)+' · 감점 지속 '+l.persistence+'/'+c.persistenceRounds+'R · 연간 신규 감점 '+fmt(l.yearLoss)+' / '+c.seasonCap+' OVR</p><div class="tablewrap">'+tbl(['날짜','종류','축별 감점','축별 복구','OVR − / +'].map(t=>({t})),l.events.slice().reverse().map(e=>[esc(e.date),esc(e.reason),esc(Object.entries(e.losses||{}).filter(([,v])=>v>0).map(([k,v])=>k.toUpperCase()+' −'+v.toFixed(3)).join(' · ')||'—'),esc(Object.entries(e.restores||{}).filter(([,v])=>v>0).map(([k,v])=>k.toUpperCase()+' +'+v.toFixed(3)).join(' · ')||'—'),fmt(e.actual)+' / '+fmt(e.restored||0)]))+'</div><p>이전 LONG FORM '+l.legacyEvents.length+'회 · 해당 연도 −'+fmt(l.legacyYearLoss)+' OVR</p></details>':'';
 return '<div class="lf-panel slump-panel">'+longFormBadge(record)+'<div class="slump-summary"><span>BASE <b>'+fmt(record.baseOvrRaw)+'</b></span><span>CURRENT <b>'+record.currentOvr+'</b></span><span>FORM <b>'+record.form.level+'</b></span><span>PI <b>'+fmt(l.overall)+'</b></span></div>'+ledger+detail+(l.partial?'<p class="note">부분 데이터 기반 · 미확인 지표 제외</p>':'')+details+longFormMethodHtml()+'</div>';
}
function renderLongFormStories(date){
 const root=document.getElementById('longFormStories');if(!root)return;const c=abilityConfig().slump;root.hidden=!c.storyEnabled;root.innerHTML='';if(!c.storyEnabled||!c.enabled)return;
 const year=String(date||'').slice(0,4);if(!/^\d{4}$/.test(year))return;
 const half=abilityHalfForDate(year,date),info=abilityHalfInfo(year,half),rows=abilitySystemEnabled()?abilityPlayers(info).map(player=>({player,r:playerAbilityRecordAtDate(player,year,half,date,true)})).filter(x=>x.r.longForm.recoveries.includes(date)):[];
 if(!rows.length){root.hidden=true;return;}
 root.innerHTML='<div class="sec-t">PERFORMANCE RECOVERY · '+esc(date)+'</div><div class="lf-stories">'+rows.map(x=>'<article><strong>'+playerCardLink(x.player,esc(x.player),{asOf:date,allCompetitions:true})+'</strong><p>최근 경기력이 평소 수준으로 회복되고 있습니다.</p></article>').join('')+'</div>';
}
function slumpConfigHtml(c){
 const s=c.slump,select=(key,label)=>'<label>'+label+'<select data-ability-cfg="slump.'+key+'"><option value="1"'+(s[key]?' selected':'')+'>ON</option><option value="0"'+(!s[key]?' selected':'')+'>OFF</option></select></label>';
 return '<div class="ability-config-card full" id="slumpConfig"><h3>회복형 SLUMP · 감점·복구 설정</h3><p>필드 선수는 출전 경기당 기록을 사용합니다. 결석으로 신규 SLUMP 감점하지 않습니다. 시작일 이전 기존 LONG FORM 이력은 보존합니다.</p><div class="ability-config-fields">'+select('enabled','SLUMP SYSTEM')+select('storyEnabled','회복 Story 공개')+'<label>적용 시작일<input type="date" data-ability-cfg="slump.startDate" value="'+esc(s.startDate)+'"></label>'+[
 ['Recent 출전 경기 수','recentGames',10,50,1],['Baseline 최대 경기 수','baselineGames',10,100,1],['Baseline 최소 경기 수','minimumBaselineGames',10,100,1],['전환일 이전 FORM 기준','formTrigger',-5,-1,1],['Performance 기준 이하','performanceTrigger',50,75,1],['연속 지속 R','persistenceRounds',4,20,1],['추가 감소 간격 R','interval',4,20,1],['회복 Performance 이상','recoveryPerformance',85,120,1],['연속 회복 R','recoveryRounds',3,20,1],['SLUMP 능력치 감소','slumpDrop',0,2,.01],['SEVERE 능력치 감소','severeDrop',0,2,.01],['CRITICAL 능력치 감소','criticalDrop',0,2,.01],['연간 신규 감점 OVR 한도','seasonCap',0,1.5,.1],['SEVERE PI 미만','severePerformance',51,75,1],['CRITICAL PI 미만','criticalPerformance',50,74,1],['회복 시작 잔액의 반환 비율 %','recoveryPercent',5,100,1]
 ].map(([label,key,min,max,step])=>abilityCfgField(label,'slump.'+key,s[key],String(step),String(min),String(max))).join('')+'<label>회복형 전환일<input type="date" data-ability-cfg="slump.recoveryStartDate" value="'+esc(s.recoveryStartDate)+'"></label></div><p>10경기 표본, 4R 지속/간격, 3R 회복, 시즌 1.5 OVR 한도는 안전 범위입니다. 더 신중한 기준으로 조정할 수 있습니다. 시작일을 과거로 옮기거나 설정을 바꾸면 결과도 재계산됩니다.</p>'+longFormMethodHtml()+'</div>';
}
