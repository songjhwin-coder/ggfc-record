/* Generated from current core + SLUMP; source SHA256 4e1e2d045186edb55abfeab2f30eb91635fc180b2288a74d989b749b19b7ad74 */
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
const DEF_DB = { matches:[], attendance:[], goals:[], saves:[], fouls:[], moms:[], soccerbee:[], specials:[], roster:[], settings:{seasons:{},teamLogos:{},teamNames:{},leagueLogos:{A:"",B:""},headerLogo:"",display:{brandTitle:"GGFC",leagueA:"슈퍼리그",leagueB:"챌린지리그"},ability:{enabled:true}} };
const blankDB = () => JSON.parse(JSON.stringify(DEF_DB));
let DB = blankDB();
let comp = "ALL";
let seasonYear = "ALL";
let half = "ALL";
const NAME_COLLATOR_KO = new Intl.Collator("ko", {numeric:true, sensitivity:"variant"});
let verifiedRecordCache=null;
function verifiedFixtureKey(m){
 const round=String(m.round||'').trim(),no=String(m.no||'').trim();
 return JSON.stringify([normDate(m.date),isLeagueFamilyComp(m.comp)?'LEAGUE':compCompact(m.comp),round,no,[String(m.home||'').trim(),String(m.away||'').trim()].sort(),round||no?'':String(m.id)]);
}
function verifiedRecords(){
 const fields=['matches','attendance','goals','saves','fouls','moms'],refs=fields.map(k=>DB[k]),sizes=refs.map(r=>r?.length||0);
 if(verifiedRecordCache&&verifiedRecordCache.db===DB&&refs.every((r,i)=>r===verifiedRecordCache.refs[i]&&sizes[i]===verifiedRecordCache.sizes[i]))return verifiedRecordCache;
 const out={db:DB,refs,sizes,issues:[],aliases:new Map(),matches:[],attendance:[],goals:[],saves:[],fouls:[],moms:[]},groups=new Map(),idKeys=new Map();
 const text=v=>String(v??'').trim(),present=v=>v!==null&&v!==undefined&&text(v)!=='';
 for(const raw of DB.matches||[]){const m={...raw,id:text(raw.id)},key=verifiedFixtureKey(m);if(!idKeys.has(m.id))idKeys.set(m.id,new Set());idKeys.get(m.id).add(key);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(m);}
 const metrics={attendance:[],goals:['g','a'],saves:['saves'],fouls:['fouls'],moms:['mom']};
 // Index once rather than repeatedly scanning a season for every fixture.
 const index={};for(const f of fields.slice(1)){index[f]=new Map();for(const r of DB[f]||[]){const id=text(r.id);if(!index[f].has(id))index[f].set(id,[]);index[f].get(id).push(r);}}
 for(const group of groups.values()){
  const first={...group[0]},ids=new Set(group.map(m=>m.id)),reasons=[];
  if([...ids].some(id=>!id||idKeys.get(id).size>1))reasons.push('경기 ID가 여러 대진에 연결됨');
  const aligned=group.map(m=>m.home===first.home?m:{...m,home:m.away,away:m.home,hs:m.as,as:m.hs,hf:m.af,af:m.hf,hExtraFouls:m.aExtraFouls,aExtraFouls:m.hExtraFouls,hPointDeduction:m.aPointDeduction,aPointDeduction:m.hPointDeduction,homeGroup:m.awayGroup,awayGroup:m.homeGroup});
  for(const key of ['hs','as','hf','af','hExtraFouls','aExtraFouls','hPointDeduction','aPointDeduction','homeGroup','awayGroup','half']){const values=aligned.map(m=>m[key]).filter(present);if(new Set(values.map(text)).size>1)reasons.push('경기 값 충돌: '+key);else if(values.length)first[key]=values[0];}
  if(new Set(group.map(m=>forfeitTeamNames(m).slice().sort().join('|'))).size>1)reasons.push('몰수패 값 충돌');
  const pending={};
  for(const f of fields.slice(1)){
   const players=new Map();
   for(const id of ids)for(const r of index[f].get(id)||[]){
    const team=text(r.team),name=text(r.player);if(!name||![first.home,first.away].includes(team)){out.issues.push({date:first.date,id,reason:f+' 경기·팀·선수 연결 불가',team,player:name});continue;}
    const key=JSON.stringify([team,normalizePlayerMatchKey(name)]);if(!players.has(key))players.set(key,{sample:r,byId:new Map()});const p=players.get(key);if(!p.byId.has(id))p.byId.set(id,[]);p.byId.get(id).push(r);
   }
   pending[f]=[];
   for(const p of players.values()){
    const row={...p.sample,id:first.id};
    for(const metric of metrics[f]){
     const totals=[...p.byId.values()].map(rows=>{const values=rows.map(r=>r[metric]).filter(present);return values.length?values.reduce((s,v)=>s+num(v),0):null;}).filter(v=>v!==null);
     if(new Set(totals).size>1)reasons.push(f+' '+row.player+' '+metric+' 중복값 충돌');
     row[metric]=totals.length?totals[0]:null;
    }
    pending[f].push(row);
   }
  }
  const teamsByPlayer=new Map();for(const r of pending.attendance){const k=normalizePlayerMatchKey(r.player);if(!teamsByPlayer.has(k))teamsByPlayer.set(k,new Set());teamsByPlayer.get(k).add(r.team);}
  if([...teamsByPlayer.values()].some(s=>s.size>1))reasons.push('같은 선수가 양 팀 출석에 중복 등록됨');
  if(reasons.length){out.issues.push({date:first.date,id:[...ids].join(', '),team:first.home+' / '+first.away,reason:[...new Set(reasons)].join(' · '),blocked:true});continue;}
  out.matches.push(first);for(const id of ids)out.aliases.set(id,first.id);for(const f of fields.slice(1))out[f].push(...pending[f]);
 }
 return verifiedRecordCache=out;
}
function verifiedMatchId(id){return verifiedRecords().aliases.get(String(id))||'';}
function verifiedKeeperEntries(){
 const seen=new Set();return (DB.settings?.goalkeeperEntries||[]).map(r=>({...r,id:verifiedMatchId(r.id)})).filter(r=>{if(!r.id)return false;const key=JSON.stringify([r.id,r.team,r.text]);if(seen.has(key))return false;seen.add(key);return true;});
}
const num = v => { const n = parseFloat(String(v??"").replace(/[^0-9.\-]/g,"")); return isNaN(n)?0:n; };
const pct = (a,b) => b? Math.round(a/b*1000)/10 : 0;
function compareNamesKo(a,b){
  const left=String(a??"").normalize("NFKC").trim(), right=String(b??"").normalize("NFKC").trim();
  return NAME_COLLATOR_KO.compare(left,right) || (left<right?-1:left>right?1:0);
}
function serialToDate(n){
  // Excel serial (1900 system, with the 1900 leap-year bug baked in)
  const ms = Math.round((n - 25569) * 86400000);
  const d = new Date(ms);
  if(isNaN(d.getTime())) return "";
  return d.toISOString().slice(0,10);
}
function normDate(s){
  if(s instanceof Date && !isNaN(s.getTime())){
    return s.getFullYear()+"-"+String(s.getMonth()+1).padStart(2,"0")+"-"+String(s.getDate()).padStart(2,"0");
  }
  s = String(s??"").trim();
  if(!s) return "";
  // Excel date-formatted cell exported as a serial number
  if(/^\d{4,5}(\.\d+)?$/.test(s)){
    const n=parseFloat(s);
    if(n>=20000 && n<=80000) return serialToDate(n);
  }
  // 2026-03-07T00:00:00 / 2026-03-07 00:00
  let m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:[T\s]|$)/);
  if(m) return m[1]+"-"+m[2].padStart(2,"0")+"-"+m[3].padStart(2,"0");
  // 2026년3월7일 / 2026. 3. 7
  m = s.match(/(\d{4})[-./년\s]*(\d{1,2})[-./월\s]*(\d{1,2})/);
  if(m) return m[1]+"-"+m[2].padStart(2,"0")+"-"+m[3].padStart(2,"0");
  // 3/7/2026 또는 7-3-2026 (월/일/연)
  m = s.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{4})$/);
  if(m) return m[3]+"-"+m[1].padStart(2,"0")+"-"+m[2].padStart(2,"0");
  // 그 외: Date 파서에 맡김 (예: "Mar 7, 2026")
  const d=new Date(s);
  if(!isNaN(d.getTime()) && /\d{4}/.test(s)){
    return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
  }
  return s;
}
function isOwnGoalPlayer(name){
  const key=String(name??'').normalize('NFKC').toUpperCase().replace(/[\s._-]/g,'');
  return ['자책','자책골','OG','OWNGOAL','베네핏','베네핏골','BENEFIT','어드밴티지'].includes(key);
}
const xe = s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
function normalizeLeagueGroup(v){
  const raw=String(v||"").trim();
  if(!raw) return "";
  const n=raw.toLowerCase().replace(/[\s_.\-]/g,"");
  if(n==="a" || n==="1" || n.includes("a그룹") || n.includes("슈퍼리그") || n==="슈퍼" || n.includes("superleague") || n==="super") return "A";
  if(n==="b" || n==="2" || n.includes("b그룹") || n.includes("챌린지리그") || n==="챌린지" || n.includes("challengeleague") || n==="challenge") return "B";
  return "";
}
function legacyMatchTeamGroup(m,team){
  if(team===m.home)return normalizeLeagueGroup(m.homeGroup||(m.groups&&m.groups[team]));
  if(team===m.away)return normalizeLeagueGroup(m.awayGroup||(m.groups&&m.groups[team]));
  return normalizeLeagueGroup(m.groups&&m.groups[team]);
}
function matchTeamGroup(m,team){
  if(!m||!team)return '';
  const squad=squadAtMatch(m,team);
  return squad?normalizeLeagueGroup(squad.group):legacyMatchTeamGroup(m,team);
}
function matchSquadHalf(m){
  const squads=[m.home,m.away].filter(Boolean).map(t=>squadAtMatch(m,t));
  if(!squads.some(Boolean))return null; // old files without squad metadata remain readable
  const halves=squads.map(r=>normHalf(r?.half));
  return halves.length===2&&halves.every(Boolean)&&halves[0]===halves[1]?halves[0]:'';
}
function teamRecordTeamKey(value){return String(value||'').normalize('NFKC').replace(/\s/g,'').toUpperCase();}
let teamPlayerRecordCache=null;
function teamPlayerRecordLinks(){
  const raw=DB.settings?.teamPlayerRecords||[],refs=[raw,verifiedRecords().matches,verifiedRecords().attendance,DB.roster,DB.settings?.teamSquads];
  if(teamPlayerRecordCache&&refs.every((x,i)=>teamPlayerRecordCache.refs[i]===x)&&teamPlayerRecordCache.size===raw.length)return teamPlayerRecordCache;
  const canon=soccerBeeCanonicalPlayerMap(),matched=[],issues=[];
  const clean=v=>String(v||'').normalize('NFKC').replace(/\s/g,'').toUpperCase();
  const attendees=new Map();
  for(const a of verifiedRecords().attendance||[]){const k=String(a.id)+'|'+normalizePlayerMatchKey(a.player);if(!attendees.has(k))attendees.set(k,new Set());attendees.get(k).add(a.team);}
  for(const row of raw){
    const player=canon[normalizePlayerMatchKey(row.player)];let reason='';
    const fixtures=(verifiedRecords().matches||[]).filter(m=>normDate(m.date)===row.date&&clean(m.no)===clean(row.no)&&clean(m.round)===clean(row.round)&&(isLeagueFamilyComp(row.comp)?isLeagueFamilyComp(m.comp):compCompact(row.comp)===compCompact(m.comp)));
    if(!player||isOwnGoalPlayer(player))reason='선수명단·경기기록에서 선수 확인 불가';
    else if(!fixtures.length)reason='일치 경기 없음: 날짜·라운드·경기번호 확인';
    const found=fixtures.flatMap(m=>[...(attendees.get(String(m.id)+'|'+normalizePlayerMatchKey(player))||[])].filter(t=>t===m.home||t===m.away).map(team=>({m,team})));
    const specified=teamRecordTeamKey(row.team);
    let linked=specified?found.filter(x=>teamRecordTeamKey(x.team)===specified):found;
    let attendanceConfirmed=true;
    if(!reason&&!found.length&&!linked.length&&specified&&['sot','keyPass','defSuccess','saves'].some(k=>num(row[k])>0)){
      const candidates=fixtures.flatMap(m=>[m.home,m.away].filter(team=>teamRecordTeamKey(team)===specified).map(team=>({m,team})));
      if(candidates.length===1){const hit=candidates[0],assigned=squadPlayerTeams(hit.m,player);
        if(!assigned.length||assigned.includes(hit.team)){linked=candidates;attendanceConfirmed=false;}
      }
    }
    if(!reason&&specified&&!fixtures.some(m=>[m.home,m.away].some(t=>teamRecordTeamKey(t)===specified)))reason='입력 팀명이 해당 경기의 팀과 다릅니다';
    if(!reason&&linked.length!==1)reason=linked.length?'경기·팀 연결이 여러 건입니다':specified?'입력 팀의 선수1~15에 출전 기록 없음':'해당 경기의 선수1~15에 출전 기록 없음';
    if(!reason&&!playerEligibleOn(player,row.date))reason='선수 참가 시작일 이전 기록';
    if(reason){issues.push({...row,reason});continue;}
    matched.push({...row,player,attendanceConfirmed,id:linked[0].m.id,inputTeam:row.team||'',team:linked[0].team});
  }
  // Legacy and named-team rows may resolve to the same appearance. Never double count.
  const groups=new Map();
  matched.forEach(r=>{const k=JSON.stringify([r.id,r.team,r.player]);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r);});
  const unique=[];
  for(const rows of groups.values()){
    const values=r=>JSON.stringify(['sot','keyPass','defSuccess','saves'].map(k=>r[k]??null));
    if(rows.some(r=>values(r)!==values(rows[0])))rows.forEach(r=>issues.push({...r,reason:'동일 경기·팀·선수 기록의 값이 충돌합니다'}));
    else unique.push(rows[0]);
  }
  return teamPlayerRecordCache={refs,size:raw.length,matched:unique,issues};
}
function playerSaveRows(){
  const saveKey=r=>JSON.stringify([String(r.id),r.team,normalizePlayerMatchKey(r.player)]),extra=teamPlayerRecordLinks().matched.filter(r=>r.saves!==null&&r.saves!==undefined),keys=new Set(extra.map(saveKey));
  return (verifiedRecords().saves||[]).filter(r=>!keys.has(saveKey(r))).concat(extra.map(r=>({id:r.id,team:r.team,player:r.player,saves:r.saves,source:'TEAM_RECORD'})));
}
function parseKeeperCell(text){
  const rows=[],issues=[];
  String(text||'').normalize('NFKC').split(/[,;\n]+/).map(s=>s.trim()).filter(Boolean).forEach(token=>{
    const m=token.match(/^(.+?)\s*[-:：]?\s*(\d+)\s*(?:골)?\s*\(\s*(\d+(?:\.\d+)?(?::\d{1,2})?)\s*(?:분)?\s*\)$/);
    if(!m){issues.push('입력 형식 확인: '+token);return;}
    const player=m[1].trim().replace(/[-:：]\s*$/,''),parts=m[3].split(':'),minutes=parts.length===2?Number(parts[0])+Number(parts[1])/60:Number(parts[0]);
    if(!player||!Number.isFinite(minutes)||minutes<=0||(parts.length===2&&Number(parts[1])>=60)){issues.push('선수명·수행시간 확인: '+token);return;}
    const existing=rows.find(r=>normalizePlayerMatchKey(r.player)===normalizePlayerMatchKey(player));
    if(existing){existing.ga+=Number(m[2]);existing.minutes+=minutes;}else rows.push({player,ga:Number(m[2]),minutes});
  });
  return {rows,issues};
}
function goalkeeperRecordData(list=verifiedRecords().matches){
  const byId=new Map(list.map(m=>[String(m.id),m])),canonical=soccerBeeCanonicalPlayerMap(),rows=[],issues=[];
  const seen=new Map(),cellTexts=new Map();
  for(const cell of verifiedKeeperEntries()){const key=String(cell.id)+'|'+cell.team;if(!cellTexts.has(key))cellTexts.set(key,new Set());cellTexts.get(key).add(String(cell.text||'').trim());}
  for(const cell of verifiedKeeperEntries()){
    const m=byId.get(String(cell.id));if(!m)continue;
    const fail=reason=>issues.push({...cell,reason});
    if(normDate(m.date)!==cell.date||String(m.no)!==String(cell.no)||String(m.round)!==String(cell.round)||![m.home,m.away].includes(cell.team)){fail('경기 연결을 확인하세요. 통합 엑셀을 다시 업로드하세요.');continue;}
    const key=String(m.id)+'|'+cell.team;
    if(cellTexts.get(key)?.size>1){fail('동일 경기·팀의 키퍼실점 값이 충돌하여 분석에서 제외합니다');continue;}
    if(seen.has(key)){if(seen.get(key)!==cell.text)fail('동일 경기·팀의 키퍼실점 입력이 중복됩니다');continue;}seen.set(key,cell.text);
    const parsed=parseKeeperCell(cell.text);parsed.issues.forEach(fail);
    // A malformed cell is retained for correction; partial values never enter analysis.
    if(parsed.issues.length)continue;
    const valid=[];
    for(const item of parsed.rows){
      const player=canonical[normalizePlayerMatchKey(item.player)];
      if(!player||!verifiedRecords().attendance.some(a=>String(a.id)===String(m.id)&&a.team===cell.team&&normalizePlayerMatchKey(a.player)===normalizePlayerMatchKey(player))){fail(item.player+': 해당 팀 출전 명단에 없습니다');continue;}
      if(!playerEligibleOn(player,m.date)){fail(player+': 참가 시작일 이전 기록');continue;}
      valid.push({...item,player,id:m.id,team:cell.team,date:m.date,no:m.no,round:m.round,warning:''});
    }
    const conceded=cell.team===m.home?num(m.as):num(m.hs),entered=valid.reduce((sum,r)=>sum+r.ga,0);
    if(entered!==conceded){const reason='팀 실점 '+conceded+'골 / 입력 키퍼실점 '+entered+'골 · 배정 확인';fail(reason);valid.forEach(r=>r.warning=reason);}
    rows.push(...valid);
  }
  return {rows,issues};
}
function teamRecordGrowth(value,key){const c=abilityConfig().teamRecords[key];return Math.min(Math.max(0,num(c.cap)),Math.max(0,num(value))*Math.max(0,num(c.rate)));}
function matchCompetition(m){
  if(!isLeagueFamilyComp(m?.comp))return m?.comp||'정규리그';
  const a=matchTeamGroup(m,m.home),b=matchTeamGroup(m,m.away);
  return a&&b?(a!==b?'인터리그':a==='A'?'슈퍼리그':'챌린지리그'):(m.comp||'정규리그');
}
function normHalf(v){
  const t=String(v||"").trim().toLowerCase();
  if(!t) return "";
  if(/^(h1|1|1h)$/.test(t) || /\uc0c1\ubc18|\uc804\ubc18/.test(t)) return "H1";
  if(/^(h2|2|2h)$/.test(t) || /\ud558\ubc18|\ud6c4\ubc18/.test(t)) return "H2";
  return "";
}
function dateAddDays(dateStr,days){
  const d=new Date(String(dateStr||"")+"T00:00:00Z");
  if(isNaN(d.getTime())) return dateStr||"";
  d.setUTCDate(d.getUTCDate()+days);
  return d.toISOString().slice(0,10);
}
function splitRangeIntoCount(start,end,count){
  count=Math.max(1,Math.min(4,parseInt(count,10)||1));
  const a=new Date(String(start||"")+"T00:00:00Z"), b=new Date(String(end||"")+"T00:00:00Z");
  if(isNaN(a.getTime())||isNaN(b.getTime())||b<a) return Array.from({length:count},()=>({s:start,e:end,complete:false,mode:'REP'}));
  const total=Math.floor((b-a)/86400000)+1;
  return Array.from({length:count},(_,i)=>{
    const so=Math.floor(total*i/count), next=Math.floor(total*(i+1)/count);
    return {s:dateAddDays(start,so),e:dateAddDays(start,Math.max(so,next-1)),complete:false,mode:'REP'};
  });
}
function seasonCfg(y){
  DB.settings = DB.settings || {seasons:{}};
  DB.settings.seasons = DB.settings.seasons || {};
  const d=DB.settings.seasons[y]||{};
  const h1s=d.h1s||y+"-01-01", h1e=d.h1e||y+"-06-30", h2s=d.h2s||y+"-07-01", h2e=d.h2e||y+"-12-31";

  /* 대표승점은 시즌을 상반기/하반기로 분리하고 각 반기마다 구간 수와 날짜를 따로 관리한다. */
  const stored=d.repSegments||{};
  const oldWhole=Array.isArray(d.repList)?d.repList.slice():[];
  const normalizeList=(arr)=>Array.isArray(arr)?arr.map(x=>({s:normDate(x&&x.s),e:normDate(x&&x.e),complete:x&&x.complete===true,mode:String(x&&x.mode||'REP').toUpperCase()==='IND'?'IND':'REP',finalPoints:(x&&x.finalPoints&&typeof x.finalPoints==='object')?Object.assign({},x.finalPoints):null,finalStandings:(x&&x.finalStandings&&typeof x.finalStandings==='object')?JSON.parse(JSON.stringify(x.finalStandings)):null,finalGames:Number(x&&x.finalGames||0),finalizedAt:String(x&&x.finalizedAt||'')})).filter(x=>x.s&&x.e):[];
  let rawH1=normalizeList(stored.H1), rawH2=normalizeList(stored.H2);

  /* 직전 버전의 연간 repList가 있으면 날짜 위치를 기준으로 상·하반기에 안전하게 이관한다. */
  if(!rawH1.length && !rawH2.length && oldWhole.length){
    normalizeList(oldWhole).forEach(x=>{
      if(x.e<=h1e) rawH1.push(x);
      else if(x.s>=h2s) rawH2.push(x);
      else {
        if(x.s<=h1e) rawH1.push({s:x.s,e:h1e,complete:false,mode:x.mode||'REP'});
        if(x.e>=h2s) rawH2.push({s:h2s,e:x.e,complete:false,mode:x.mode||'REP'});
      }
    });
  }

  const storedCounts=d.repCounts||{};
  const makeHalf=(half,raw,start,end)=>{
    const explicit=parseInt(storedCounts[half],10);
    const count=Math.max(1,Math.min(4,explicit||raw.length||3));
    const defaults=splitRangeIntoCount(start,end,count);

    /* 읽기 단계에서는 한 구간의 오류 때문에 다른 정상 구간을 자동분할로 덮어쓰지 않는다.
       사용자가 저장한 각 구간의 날짜/방식/완료 상태를 가능한 그대로 유지하고,
       누락되었거나 반기 범위를 완전히 벗어난 구간만 기본값으로 보완한다. */
    const list=Array.from({length:count},(_,i)=>{
      const x=(raw.slice(0,4)[i]||{}), xs=normDate(x.s), xe=normDate(x.e);
      const valid=!!xs&&!!xe&&xs<=xe&&xs>=start&&xe<=end;
      const base=valid?x:defaults[i];
      return {
        s:normDate(base.s)||defaults[i].s,
        e:normDate(base.e)||defaults[i].e,
        complete:valid && x.complete===true,
        mode:String(x.mode||base.mode||'REP').toUpperCase()==='IND'?'IND':'REP',
        finalPoints:valid && x.finalPoints&&typeof x.finalPoints==='object'?Object.assign({},x.finalPoints):null,
        finalStandings:valid && x.finalStandings&&typeof x.finalStandings==='object'?JSON.parse(JSON.stringify(x.finalStandings)):null,
        finalGames:valid?Number(x.finalGames||0):0,
        finalizedAt:valid?String(x.finalizedAt||''):''
      };
    });
    return {count,list};
  };
  const H1=makeHalf("H1",rawH1,h1s,h1e), H2=makeHalf("H2",rawH2,h2s,h2e);
  /* 구간완료/개별승점 설정 자체를 운영 확정 신호로 취급한다.
     과거 버전에서 repEnabled=false가 남아 있어도 관리자가 이미 구간완료를 했는데
     팀순위가 0점으로 보이는 문제를 방지한다. 현재 저장 화면도 활성 구간이 있으면
     repEnabled를 자동으로 켜므로 이 값은 다음 저장 때 정상 상태로 영구 저장된다. */
  const allConfigured=H1.list.concat(H2.list);
  const hasActiveConfiguredSegment=allConfigured.some(x=>x && (x.complete===true || String(x.mode||'REP').toUpperCase()==='IND'));
  const repEnabled=d.repEnabled===true || hasActiveConfiguredSegment;
  return {h1s,h1e,h2s,h2e,repEnabled,repCounts:{H1:H1.count,H2:H2.count},repSegments:{H1:H1.list,H2:H2.list},repCount:H1.count+H2.count,repList:H1.list.concat(H2.list)};
}
function inSeason(m){
  if(seasonYear==="ALL") return true;
  const d=String(m.date||"");
  if(d.slice(0,4)!==seasonYear) return false;
  if(half==="ALL") return true;
  const hv=matchHalfKey(m);
  if(hv) return hv===half;
  const c=seasonCfg(seasonYear);
  if(half==="H1") return d>=c.h1s && d<=c.h1e;
  return d>=c.h2s && d<=c.h2e;
}
function matches(){ return verifiedRecords().matches.filter(m=> (comp==="ALL" || matchCompetition(m)===comp) && inSeason(m) ); }
function result(hs,as_){ return hs>as_?"W":hs<as_?"L":"D"; }
function forfeitTeamNames(m){
  const a=[];
  if(Array.isArray(m&&m.forfeitTeams)) m.forfeitTeams.forEach(t=>{ if(t&&!a.includes(t)) a.push(t); });
  if(m&&m.forfeitTeam&&!a.includes(m.forfeitTeam)) a.push(m.forfeitTeam);
  return a;
}
function matchResult(m,team){
  if(!m || (team!==m.home && team!==m.away)) return null;
  const ff=forfeitTeamNames(m).filter(t=>t===m.home||t===m.away);
  if(ff.length===1) return ff[0]===team?"L":"W";
  return team===m.home?result(num(m.hs),num(m.as)):result(num(m.as),num(m.hs));
}
function squadRows(){return Array.isArray(DB.settings?.teamSquads)?DB.settings.teamSquads:[];}
let squadLookupCache={source:null,length:0,scopes:new Map(),teams:new Map(),players:new Map()};
function squadCache(){
  const source=DB.settings?.teamSquads;
  if(squadLookupCache.source!==source||squadLookupCache.length!==(source?.length||0))squadLookupCache={source,length:source?.length||0,scopes:new Map(),teams:new Map(),players:new Map()};
  return squadLookupCache;
}
function squadQueryContext(info={}){
  const date=normDate(info.asOf)||normDate(info.date)||normDate(info.end)||new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'});
  return {date,comp:info.comp||((typeof comp!=='undefined'&&comp!=='ALL')?comp:'정규리그')};
}
function squadScope(m){
  const cache=squadCache(),context=squadQueryContext(m),key=JSON.stringify([context.date,context.comp]);
  if(cache.scopes.has(key))return cache.scopes.get(key);
  const all=squadRows().filter(r=>r.date&&r.date<=context.date);
  const competition=context.comp==='ALL'?'정규리그':context.comp;
  const family=all.filter(r=>isLeagueFamilyComp(r.comp));
  const exact=all.filter(r=>compCompact(r.comp)===compCompact(competition)),exactTeams=new Set(exact.map(r=>r.team));
  const scope=isLeagueFamilyComp(competition)?family:exact.concat(family.filter(r=>!exactTeams.has(r.team)));
  cache.scopes.set(key,scope);return scope;
}
function squadAtMatch(m,team){
  const context=squadQueryContext(m),cache=squadCache(),key=JSON.stringify([context.date,context.comp,team]);
  if(!cache.teams.has(key))cache.teams.set(key,squadScope(context).filter(r=>r.team===team).sort((a,b)=>b.date.localeCompare(a.date))[0]||null);
  return cache.teams.get(key);
}
function squadSnapshot(info={}){
  const context=squadQueryContext(info),teams=[...new Set(squadScope(context).map(r=>r.team))];
  return teams.map(team=>squadAtMatch(context,team)).filter(Boolean);
}
function squadPlayerTeams(m,player){
  const context=squadQueryContext(m),cache=squadCache(),key=normalizePlayerMatchKey(player),id=JSON.stringify([context.date,context.comp,key]);
  if(cache.players.has(id))return cache.players.get(id);
  const result=squadSnapshot(context).filter(r=>(r.members||[]).some(x=>normalizePlayerMatchKey(x.player)===key)).map(r=>r.team).sort(compareNamesKo);
  cache.players.set(id,result);return result;
}
let participationStartCache={source:null,length:0,dates:new Map()};
function playerParticipationStart(player){
  const rows=DB.roster||[];
  if(participationStartCache.source!==rows||participationStartCache.length!==rows.length){
    const dates=new Map();rows.forEach(r=>{const key=normalizePlayerMatchKey(r.player),date=normDate(r.startDate);if(r.source!=='MATCH_ONLY'&&date&&(!dates.has(key)||date<dates.get(key)))dates.set(key,date);});
    participationStartCache={source:rows,length:rows.length,dates};
  }
  return participationStartCache.dates.get(normalizePlayerMatchKey(player))||'';
}
function playerEligibleOn(player,date){const start=playerParticipationStart(player);return !start||normDate(date)>=start;}
let renderCalculationCache=null;
function selectPlayerRoster(player,year){
  const name=String(player||'').trim(),y=String(year||'').trim();
  const rows=DB.roster.filter(r=>String(r.player||'').trim()===name);
  if(!rows.length)return null;
  const richness=r=>[r.engName,r.photo,r.pos,r.memo,r.team,r.no].filter(v=>String(v??'').trim()).length;
  const exact=rows.filter(r=>y&&String(r.year||'').trim()===y).sort((a,b)=>richness(b)-richness(a));
  const draft=rows.find(r=>!String(r.year||'').trim()&&r.source!=='MATCH_ONLY');
  const latest=rows.slice().sort((a,b)=>String(b.year||'').localeCompare(String(a.year||''),undefined,{numeric:true})||richness(b)-richness(a))[0];
  const selected=(exact[0]?.source!=='MATCH_ONLY'&&exact[0])||draft||exact[0]||latest;
  const photo=selected.photo||rows.find(r=>String(r.photo||'').trim())?.photo||'';
  const photoCutout=selected.photoCutout||rows.find(r=>String(r.photoCutout||'').trim())?.photoCutout||'';
  const uploaded=uploadedPlayerPhoto(name);
  return {...selected,photo:uploaded||photo,photoCutout:uploaded||photoCutout,photoUploaded:!!uploaded};
}
function normalizeAbilityPosition(value){
  const raw=String(value||'').normalize('NFKC').trim().toUpperCase();
  if(!raw)return '';
  const aliases={PV:['PV','PIVO','피보'],AL:['AL','ALA','아라'],FS:['FS','FIXO','FIX','픽소'],GR:['GR','GK','GOLEIRO','골레이로']};
  const tokens=raw.split(/[\/,·|\s]+/).filter(Boolean);
  for(const [code,list] of Object.entries(aliases)){
    if(list.some(x=>raw===String(x).toUpperCase() || tokens.includes(String(x).toUpperCase())))return code;
  }
  return '';
}
function playerAbilityRoster(player,year){return selectPlayerRoster(player,year);}
function playerOvrProfile(player,year,cfg){
  cfg=cfg||abilityConfig();
  const roster=playerAbilityRoster(player,year), rawPos=roster?String(roster.pos||'').trim():'', pos=normalizeAbilityPosition(rawPos);
  const map=cfg.positionOvrWeights||{}, weights=(pos&&map[pos])?map[pos]:(cfg.ovrWeights||{});
  return {position:pos,rawPosition:rawPos,weights,source:pos?'POSITION':'FALLBACK'};
}
const ABILITY_DEFAULTS={
  version:240,
  unassessed:{pac:68,dri:68,def:68,phy:68},
  /* V3.24 초기 능력치: 미측정 SoccerBee 항목은 68P(Provisional), 측정 시 68~87 절대평가로 교체 */
  initialSkills:{careerStartYear:2026,reliabilityRounds:5,scoreMin:60,scoreMid:70,scoreMax:86,fallbackSho:70,fallbackPas:70},
  skillBase:{sho:70,pas:70},
  maxRounds:0,
  scoreMin:0,
  scoreMax:99,
  /* V3.24 성장 요율: 출석 x2 */
  attendance:{pac:0,sho:0,pas:.08,dri:.10,def:.04,phy:.12},
  /* 득점 x2.5 */
  teamRecords:{sot:{rate:.03,cap:.12},keyPass:{rate:.04,cap:.16},defSuccess:{rate:.03,cap:.18}},
  goalPerGoal:.15,
  goalSteps:[{min:1,value:.20},{min:2,value:.35},{min:3,value:.50},{min:4,value:.65},{min:5,value:.80}],
  /* 도움 x2.5 */
  assistSteps:[{min:1,value:.20},{min:2,value:.35},{min:3,value:.50},{min:4,value:.65},{min:5,value:.80}],
  /* 선방 x2.5 */
  saveSteps:[{min:5,value:.125},{min:10,value:.25},{min:15,value:.375},{min:20,value:.50},{min:25,value:.625}],
  /* 파울 Career 감점 x0.5 */
  foulPenaltySteps:[{min:1,value:-.01},{min:2,value:-.025},{min:3,value:-.04},{min:4,value:-.05}],
  /* MOM x3 */
  mom:{firstSeasonBonus:{pac:0,sho:.09,pas:.09,dri:.09,def:.09,phy:.09}},
  pointMultipliers:[{min:0,value:1},{min:4,value:1.03},{min:7,value:1.06},{min:10,value:1.08},{min:12,value:1.10}],
  /* V3.24 Growth Curve V2 — 상위권에서도 꾸준히 성장하되 90+부터 강한 Soft Cap */
  growthRates:[{min:95,value:.25},{min:90,value:.50},{min:85,value:.80},{min:80,value:1.00},{min:70,value:1.20},{min:60,value:1.30},{min:0,value:1.35}],
  caps:{pac:5,sho:8,pas:8,dri:6,def:6,phy:6},
  ovrWeights:{pac:1,sho:1,pas:1,dri:1,def:1,phy:1},
  positionOvrWeights:{
    PV:{pac:.10,sho:.25,pas:.10,dri:.20,def:.10,phy:.25},
    AL:{pac:.25,sho:.20,pas:.15,dri:.25,def:.10,phy:.05},
    FS:{pac:.10,sho:.05,pas:.15,dri:.10,def:.35,phy:.25},
    GR:{pac:.05,sho:.05,pas:.25,dri:.05,def:.45,phy:.15}
  },
  /* 결석 Career 감점은 기존의 20%만 유지. 주된 하락은 FORM에서 처리 */
  absence:{pac:0,sho:-.004,pas:-.006,dri:-.008,def:-.006,phy:-.010},
  slump:GGFCSlump.defaults,
  longForm:{enabled:true,window:10,interval:4,warningThreshold:-1.5,slumpThreshold:-2.5,severeThreshold:-3.5,extremeThreshold:-4.5,slumpDrop:.20,severeDrop:.35,extremeDrop:.50,seasonCap:1.5,absenceFactor:.25,axisCap:.75,recoveryLevel:-1},
  form:{
    enabled:true,
    window:5,
    recency:[.35,.25,.20,.12,.08],
    attendance:{5:1.5,4:.8,3:0,2:-1,1:-2,0:-3},
    consecutiveAbsence:{2:-.3,3:-.6,4:-1},
    events:{goal:.55,assist:.45,savePer5:.25,saveMax:.75,mom:.90,foul:-.30,win:.20,draw:0,loss:-.15,roundMax:2.50,roundMin:-1.50},
    ovrModifier:{5:3.0,4:2.5,3:2.0,2:1.2,1:.6,0:0,"-1":-.7,"-2":-1.5,"-3":-2.5,"-4":-3.5,"-5":-5.0},
    growthMultiplier:{5:1.10,4:1.08,3:1.06,2:1.04,1:1.02,0:1,"-1":.98,"-2":.95,"-3":.92,"-4":.88,"-5":.85}
  },
  soccerbee:{
    sprintVersion:1,
    scorePoints:[0,25,50,75,100],
    abilityMin:68,
    abilityMax:87,
    retestMultiplier:.50,
    criteria:{
      spm:[0,.1,.2,.4,.6],sprintPer10:[0,1,2,4,6],sprintMetersPer10:[0,10,25,50,90],
      maxSpeed:[16.1,18.125,22.2,22.6,24.7],
      hpm:[0,.025,.15,.275,.30],
      hsrRatio:[0,.30,1.95,3.075,3.60],
      hapm:[.20,.325,.50,.75,.80],
      apm:[1.10,1.225,1.60,1.975,2.50],
      accel:[7,8.25,10,12.5,15],
      activityRange:[31.9,44.55,50.95,64.25,69.4],
      avgSpeed:[2.9,4.125,4.4,4.675,4.8],
      action:[16,17.5,19,25.75,37],
      highAccel:[1,3,3.5,4,6],
      decel:[8,9,9.5,13.75,22],
      highDecel:[0,2.25,3.5,4.75,5],
      dpm:[49.1,68.925,73.25,78.475,80.9],
      energy:[6.0,6.1,6.15,6.275,6.6]
    },
    weights:{
      pac:{maxSpeed:.24,hpm:.16,hsrRatio:.12,hapm:.20,highAccel:.08,spm:.10,sprintPer10:.05,sprintMetersPer10:.05},
      dri:{apm:.3325,hapm:.2375,accel:.19,activityRange:.095,action:.095,spm:.05},
      def:{decel:.30,highDecel:.30,hapm:.20,dpm:.20},
      phy:{dpm:.2975,energy:.17,hapm:.17,activityRange:.1275,avgSpeed:.085,spm:.05,sprintPer10:.05,sprintMetersPer10:.05}
    }
  }
};
function deepClone(v){return JSON.parse(JSON.stringify(v));}
function deepMergeAbility(base,custom){
  if(Array.isArray(base)) return Array.isArray(custom)?custom.map(x=>typeof x==='object'?Object.assign({},x):x):deepClone(base);
  if(base&&typeof base==='object'){
    const out={}; Object.keys(base).forEach(k=>out[k]=deepMergeAbility(base[k],custom&&custom[k]));
    if(custom&&typeof custom==='object') Object.keys(custom).forEach(k=>{if(!(k in out))out[k]=deepClone(custom[k]);});
    return out;
  }
  return custom===undefined?base:custom;
}
function abilityConfig(){
  if(renderCalculationCache?.config)return renderCalculationCache.config;
  const a=ensureAbilityData(),config=deepMergeAbility(ABILITY_DEFAULTS,a.config||{});
  // Existing custom start dates later than the rollout must remain valid.
  if(a.config?.slump?.recoveryStartDate===undefined&&config.slump.recoveryStartDate<config.slump.startDate)config.slump.recoveryStartDate=config.slump.startDate;
  if(renderCalculationCache)renderCalculationCache.config=config;
  return config;
}
function ensureAbilityData(){
  if(renderCalculationCache?.ability)return renderCalculationCache.ability;
  DB.saves=Array.isArray(DB.saves)?DB.saves:[];
  DB.fouls=Array.isArray(DB.fouls)?DB.fouls:[];
  DB.moms=Array.isArray(DB.moms)?DB.moms:[];
  DB.soccerbee=Array.isArray(DB.soccerbee)?DB.soccerbee:[];
  DB.settings=DB.settings||{}; DB.settings.ability=DB.settings.ability||{};
  if(typeof DB.settings.ability.enabled!=="boolean") DB.settings.ability.enabled=true;
  if(!DB.settings.ability.config || typeof DB.settings.ability.config!=="object") DB.settings.ability.config=deepClone(ABILITY_DEFAULTS);
  /* V3.24: 기존 DB는 기록을 바꾸지 않고 계산 설정만 새 Ability Engine 기본값으로 자동 마이그레이션한다.
     포지션 OVR, SoccerBee 기준표/가중치, 초기 SHO/PAS 등 사용자가 조정했을 수 있는 구조값은 보존하고
     이번 버전에서 합의한 성장·FORM·Provisional 요율은 V3.24 기본값으로 갱신한다. */
  else if(num(DB.settings.ability.config.version)!==240){
    const old=DB.settings.ability.config||{};
    const migrated=deepMergeAbility(ABILITY_DEFAULTS,old);
    migrated.version=240;
    migrated.unassessed=deepClone(ABILITY_DEFAULTS.unassessed);
    migrated.attendance=deepClone(ABILITY_DEFAULTS.attendance);
    migrated.goalPerGoal=ABILITY_DEFAULTS.goalPerGoal;
    migrated.goalSteps=deepClone(ABILITY_DEFAULTS.goalSteps);
    migrated.assistSteps=deepClone(ABILITY_DEFAULTS.assistSteps);
    migrated.saveSteps=deepClone(ABILITY_DEFAULTS.saveSteps);
    migrated.foulPenaltySteps=deepClone(ABILITY_DEFAULTS.foulPenaltySteps);
    migrated.mom=deepClone(ABILITY_DEFAULTS.mom);
    migrated.growthRates=deepClone(ABILITY_DEFAULTS.growthRates);
    migrated.absence=deepClone(ABILITY_DEFAULTS.absence);
    migrated.form=deepClone(ABILITY_DEFAULTS.form);
    migrated.soccerbee=deepMergeAbility(ABILITY_DEFAULTS.soccerbee,old.soccerbee||{});
    if(!old.soccerbee?.sprintVersion && old.soccerbee?.weights){
      delete migrated.soccerbee.sprintVersion;
      for(const key of ["pac","dri","phy"]){
        if(old.soccerbee.weights[key])migrated.soccerbee.weights[key]=deepClone(old.soccerbee.weights[key]);
      }
    }
    migrated.soccerbee.abilityMin=ABILITY_DEFAULTS.soccerbee.abilityMin;
    migrated.soccerbee.abilityMax=ABILITY_DEFAULTS.soccerbee.abilityMax;
    migrated.initialSkills=deepMergeAbility(ABILITY_DEFAULTS.initialSkills,old.initialSkills||{});
    if(!old.initialSkills && old.skillBase){
      if(Number.isFinite(Number(old.skillBase.sho))) migrated.initialSkills.fallbackSho=num(old.skillBase.sho);
      if(Number.isFinite(Number(old.skillBase.pas))) migrated.initialSkills.fallbackPas=num(old.skillBase.pas);
    }
    DB.settings.ability.config=migrated;
    DB.settings.ability.enabled=true;
  }
  DB.settings.ability.config.teamRecords=deepMergeAbility(ABILITY_DEFAULTS.teamRecords,DB.settings.ability.config.teamRecords||{});
  const sc=DB.settings.ability.config.soccerbee;
  if(sc.sprintVersion!==1){
    const additions={pac:{spm:.10,sprintPer10:.05,sprintMetersPer10:.05},dri:{spm:.05},phy:{spm:.05,sprintPer10:.05,sprintMetersPer10:.05}};
    Object.entries(additions).forEach(([ability,extra])=>{
      const old=sc.weights[ability]||{},total=Object.values(old).reduce((a,b)=>a+Math.max(0,num(b)),0),share=Object.values(extra).reduce((a,b)=>a+b,0);
      if(!Object.keys(extra).some(k=>Object.hasOwn(old,k)))sc.weights[ability]=Object.fromEntries([...Object.entries(old).map(([k,v])=>[k,total?Math.max(0,num(v))/total*(1-share):0]),...Object.entries(extra)]);
    });
    sc.criteria={...sc.criteria,spm:sc.criteria.spm||[0,.1,.2,.4,.6],sprintPer10:sc.criteria.sprintPer10||[0,1,2,4,6],sprintMetersPer10:sc.criteria.sprintMetersPer10||[0,10,25,50,90]};sc.sprintVersion=1;
  }
  if(renderCalculationCache)renderCalculationCache.ability=DB.settings.ability;
  return DB.settings.ability;
}
function abilityYearList(){
  ensureAbilityData(); const ys=new Set(), startYear=abilityCareerStartYear();
  verifiedRecords().matches.forEach(m=>{const y=normDate(m.date).slice(0,4);if(/^\d{4}$/.test(y)&&num(y)>=startYear)ys.add(y);});
  DB.roster.forEach(r=>{const y=String(r.year||"").match(/20\d{2}/);if(y&&num(y[0])>=startYear)ys.add(y[0]);});
  DB.soccerbee.forEach(r=>{const y=normDate(r.date).slice(0,4);if(/^\d{4}$/.test(y)&&num(y)>=startYear)ys.add(y);});
  if(!ys.size) ys.add(String(startYear));
  return [...ys].sort().reverse();
}
function abilityHalfInfo(year,half){
  const c=seasonCfg(String(year)),h=half==='H2'?'H2':'H1';
  const dates=(verifiedRecords().matches||[]).filter(m=>normDate(m.date).slice(0,4)===String(year)&&matchHalfKey(m)===h).map(m=>normDate(m.date));
  const start=[h==='H2'?c.h2s:c.h1s,...dates].filter(Boolean).sort()[0];
  const end=[h==='H2'?c.h2e:c.h1e,...dates].filter(Boolean).sort().pop();
  return {year:String(year),half:h,label:h==='H2'?'하반기':'상반기',start,end};
}
function abilityLatestContext(){
  const ds=(verifiedRecords().matches||[]).map(m=>normDate(m.date)).filter(Boolean).sort();
  const d=ds[ds.length-1]||""; const y=d.slice(0,4)||abilityYearList()[0]; const c=seasonCfg(y);
  const h=dateHalfKey(d)||(d&&d>=c.h2s&&d<=c.h2e?"H2":"H1");
  return abilityHalfInfo(y,h);
}
function abilityMatches(info){
  return (verifiedRecords().matches||[]).filter(m=>{const d=normDate(m.date);return d && d>=info.start && d<=info.end && (!/^(H1|H2)$/.test(info.half)||matchHalfKey(m)===info.half);});
}
function normalizePlayerMatchKey(v){
  return String(v??"").normalize("NFKC").trim().toLowerCase().replace(/\s+/g,"");
}
function soccerBeeCanonicalPlayerMap(){
  const out={}, duplicated=new Set();
  const add=name=>{
    name=String(name||"").trim(); const k=normalizePlayerMatchKey(name); if(!name||!k)return;
    if(out[k] && out[k]!==name) duplicated.add(k);
    else if(!out[k]) out[k]=name;
  };
  /* 선수명단가 기준 DB. 구버전/누락 보완을 위해 출석 DB 이름도 보조 키로만 사용한다. */
  (DB.roster||[]).forEach(r=>add(r.player));
  (verifiedRecords().attendance||[]).forEach(r=>add(r.player));
  duplicated.forEach(k=>delete out[k]);
  return out;
}
function soccerBeeDayRows(rows){
  const groups=new Map(),counts=['hsr','hsrDistance','sprint','sprintDistance','action','accel','decel','highAction','highAccel','highDecel'];
  for(const r of rows){const key=normalizePlayerMatchKey(r.player)+'|'+normDate(r.date);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}
  return [...groups.values()].map(rs=>{
    const available=v=>v!==null&&v!==undefined&&String(v).trim()!==''&&Number.isFinite(Number(v));
    const allMinutes=rs.every(r=>available(r.minutes)&&Number(r.minutes)>0),o={...rs[0],sessions:rs.length,matchSeq:rs.length===1?rs[0].matchSeq:rs.map(r=>r.matchSeq||'기존').join(', '),minutes:allMinutes?rs.reduce((a,r)=>a+Number(r.minutes),0):null};
    const fields=new Set(rs.flatMap(r=>Object.keys(r)));
    for(const k of fields){if(['player','date','sourcePlayer','matchSeq','minutes','sessions'].includes(k))continue;const present=rs.filter(r=>available(r[k]));if(!present.length){o[k]=null;continue;}
      if(k==='distanceKm'||counts.includes(k)){o[k]=present.length===rs.length?present.reduce((a,r)=>a+Number(r[k]),0):null;continue;}
      if(k==='maxSpeed'){o[k]=Math.max(...present.map(r=>Number(r[k])));continue;}
      const weight=r=>allMinutes?Number(r.minutes):1;o[k]=present.reduce((a,r)=>a+Number(r[k])*weight(r),0)/present.reduce((a,r)=>a+weight(r),0);
    }
    o.sprintPer10=o.minutes>0&&available(o.sprint)?o.sprint/o.minutes*10:null;
    o.sprintMetersPer10=o.minutes>0&&available(o.sprintDistance)?o.sprintDistance/o.minutes*10:null;
    if(!available(o.spm)&&o.minutes>0&&available(o.sprint))o.spm=o.sprint/o.minutes;
    if(!available(o.dpm)&&o.minutes>0&&available(o.distanceKm))o.dpm=o.distanceKm*1000/o.minutes;
    return o;
  }).sort((a,b)=>normDate(a.date).localeCompare(normDate(b.date)));
}
function soccerBeeMetricAbsoluteScore(value,metric){
  const c=abilityConfig().soccerbee||{}, xs=(c.criteria&&c.criteria[metric])||[], ys=(c.scorePoints||[0,25,50,75,100]).map(num);
  const raw=(value===null||value===undefined||String(value).trim()==='')?NaN:Number(value);
  if(!Number.isFinite(raw)||xs.length<2||ys.length!==xs.length) return null;
  const xv=xs.map(num);
  if(raw<=xv[0]) return ys[0];
  if(raw>=xv[xv.length-1]) return ys[ys.length-1];
  for(let i=1;i<xv.length;i++){
    if(raw<=xv[i]){
      const x0=xv[i-1],x1=xv[i],y0=ys[i-1],y1=ys[i];
      if(Math.abs(x1-x0)<1e-12) return y1;
      const t=(raw-x0)/(x1-x0); return y0+(y1-y0)*t;
    }
  }
  return ys[ys.length-1];
}
function soccerBeeIndexToAbility(index){
  const c=abilityConfig().soccerbee||{}, lo=num(c.abilityMin), hi=num(c.abilityMax), p=Math.max(0,Math.min(100,num(index)));
  return lo+(hi-lo)*(p/100);
}
function soccerBeeRelativePercentiles(out,key){
  const rows=Object.values(out).map(r=>({player:r.player,v:num(r.index&&r.index[key])})).filter(x=>Number.isFinite(x.v));
  const sorted=rows.map(x=>x.v).sort((a,b)=>a-b), pct={};
  rows.forEach(x=>{
    if(sorted.length<=1){pct[x.player]=50;return;}
    const less=sorted.filter(v=>v<x.v).length, equal=sorted.filter(v=>Math.abs(v-x.v)<1e-9).length;
    pct[x.player]=(less+(equal-1)/2)/(sorted.length-1)*100;
  });
  return pct;
}
function soccerBeeAbilityBaseMap(cutoff){
 const cfg=abilityConfig().soccerbee||{},weightCfg=cfg.weights||{},canonical=soccerBeeCanonicalPlayerMap(),out={},keys=['pac','dri','def','phy'];
 for(const raw of soccerBeeDayRows(DB.soccerbee||[])){
  const name=canonical[normalizePlayerMatchKey(raw.player)],date=normDate(raw.date);if(!name||!date||(cutoff&&date>normDate(cutoff)))continue;
  const r=out[name]||(out[name]={player:name,date:'',measured:false,index:{},metricScores:{},measurementDates:{},coverage:{},raw,relativePercentile:{},pac:null,dri:null,def:null,phy:null});
  for(const key of keys){let sum=0,den=0,total=0;const detail={};
   for(const [metric,w0] of Object.entries(weightCfg[key]||{})){const w=Math.max(0,num(w0));total+=w;if(!w)continue;const score=soccerBeeMetricAbsoluteScore(raw[metric],metric);if(score===null)continue;sum+=score*w;den+=w;detail[metric]=score;}
   if(!den)continue;
   r.index[key]=sum/den;r[key]=soccerBeeIndexToAbility(r.index[key]);r.metricScores[key]=detail;r.measurementDates[key]=date;r.coverage[key]=total?den/total:0;r.date=date;r.measured=true;
  }
  r.raw=raw;r.partial=keys.some(k=>!Number.isFinite(r[k]));
 }
 for(const k of keys){const valid=Object.fromEntries(Object.entries(out).filter(([,r])=>Number.isFinite(r[k])));const p=soccerBeeRelativePercentiles(valid,k);for(const n of Object.keys(valid))out[n].relativePercentile[k]=p[n]??null;}
 return out;
}
let abilityPriorYearPoolCache=null;
function abilityCareerStartYear(){
  const init=(abilityConfig().initialSkills||{}), y=Math.floor(num(init.careerStartYear)||2026);
  return Math.max(2000,Math.min(2100,y));
}
function abilityCareerStartDate(){return abilityCareerStartYear()+'-01-01';}
function abilityReferenceYear(){return abilityCareerStartYear()-1;}
function abilityCalendarYearInfo(year){year=String(year);return {start:year+'-01-01',end:year+'-12-31'};}
function abilityYearPlayerNames(year){
  const info=abilityCalendarYearInfo(year), list=abilityMatches(info), ids=new Set(list.map(m=>m.id)), names=new Set();
  (verifiedRecords().attendance||[]).forEach(r=>{if(ids.has(r.id)&&String(r.player||'').trim())names.add(String(r.player).trim());});
  (verifiedRecords().goals||[]).forEach(r=>{if(ids.has(r.id)&&String(r.player||'').trim())names.add(String(r.player).trim());});
  playerSaveRows().forEach(r=>{if(ids.has(r.id)&&String(r.player||'').trim())names.add(String(r.player).trim());});
  (verifiedRecords().fouls||[]).forEach(r=>{if(ids.has(r.id)&&String(r.player||'').trim())names.add(String(r.player).trim());});
  (verifiedRecords().moms||[]).forEach(r=>{if(ids.has(r.id)&&String(r.player||'').trim())names.add(String(r.player).trim());});
  return [...names].filter(p=>p&&!isOwnGoalPlayer(p));
}
function abilityPercentileRank(entries,key,value){
  const vals=(entries||[]).map(x=>num(x[key])).filter(Number.isFinite).sort((a,b)=>a-b);
  if(!vals.length)return 50;
  if(vals.length===1)return 50;
  const v=num(value), less=vals.filter(x=>x<v).length, equal=vals.filter(x=>x===v).length;
  return Math.max(0,Math.min(100,(less+(equal-1)/2)/(vals.length-1)*100));
}
function abilityPercentileToSkill(percentile){
  const init=abilityConfig().initialSkills||{}, p=Math.max(0,Math.min(100,num(percentile)));
  const lo=num(init.scoreMin), mid=num(init.scoreMid), hi=num(init.scoreMax);
  return p<=50?lo+(mid-lo)*(p/50):mid+(hi-mid)*((p-50)/50);
}
function abilityPriorYearSkillPool(){
  const year=abilityReferenceYear(), info=abilityCalendarYearInfo(year), init=abilityConfig().initialSkills||{}, reliabilityRounds=Math.max(1,num(init.reliabilityRounds)||5);
  if(abilityPriorYearPoolCache && abilityPriorYearPoolCache.year===year && abilityPriorYearPoolCache.reliabilityRounds===reliabilityRounds) return abilityPriorYearPoolCache;
  const entries=abilityYearPlayerNames(year).map(player=>({player,stats:abilitySeasonStats(playerAbilityRoundRows(player,info))})).filter(x=>x.stats.att>0);
  const total=entries.reduce((a,x)=>({att:a.att+x.stats.att,g:a.g+x.stats.g,a:a.a+x.stats.a}),{att:0,g:0,a:0});
  const leagueGpr=total.att?total.g/total.att:0, leagueApr=total.att?total.a/total.att:0;
  entries.forEach(x=>{
    x.reliability=Math.min(1,x.stats.att/reliabilityRounds);
    x.adjustedGpr=x.stats.gpr*x.reliability+leagueGpr*(1-x.reliability);
    x.adjustedApr=x.stats.apr*x.reliability+leagueApr*(1-x.reliability);
  });
  abilityPriorYearPoolCache={year,info,reliabilityRounds,leagueGpr,leagueApr,entries};
  return abilityPriorYearPoolCache;
}
function abilityInitialSkillProfile(player){
  player=String(player||'').trim(); const init=abilityConfig().initialSkills||{}, pool=abilityPriorYearSkillPool();
  const row=pool.entries.find(x=>x.player===player);
  if(!row){
    return {source:'NO_HISTORY',year:pool.year,att:0,g:0,a:0,gpr:0,apr:0,reliability:0,leagueGpr:pool.leagueGpr,leagueApr:pool.leagueApr,adjustedGpr:pool.leagueGpr,adjustedApr:pool.leagueApr,shoPercentile:null,pasPercentile:null,sho:num(init.fallbackSho),pas:num(init.fallbackPas)};
  }
  const shoPct=abilityPercentileRank(pool.entries,'adjustedGpr',row.adjustedGpr), pasPct=abilityPercentileRank(pool.entries,'adjustedApr',row.adjustedApr);
  return {source:'PREVIOUS_YEAR',year:pool.year,att:row.stats.att,g:row.stats.g,a:row.stats.a,gpr:row.stats.gpr,apr:row.stats.apr,reliability:row.reliability,leagueGpr:pool.leagueGpr,leagueApr:pool.leagueApr,adjustedGpr:row.adjustedGpr,adjustedApr:row.adjustedApr,shoPercentile:shoPct,pasPercentile:pasPct,sho:abilityPercentileToSkill(shoPct),pas:abilityPercentileToSkill(pasPct)};
}
function soccerBeeInitialProfile(player,cutoff){
  const rows=soccerBeePlayerRows(player,cutoff), start=[abilityCareerStartDate(),playerParticipationStart(player)].sort().pop();
  if(!rows.length)return {row:null,evaluation:null,retests:[]};
  /* V3.17 수정:
     - Career 시작일 이전/당일의 최신 SoccerBee 측정이 있으면 시작 능력치로 사용
     - 첫 측정이 Career 시작 이후라면 그 측정값을 과거에 소급 적용하지 않고 실제 측정일 이벤트로 처리 */
  const baselineRows=rows.filter(r=>normDate(r.date)<=start);
  const row=baselineRows.length?baselineRows[baselineRows.length-1]:null;
  const evaluation=row?((soccerBeeAbilityBaseMap(normDate(row.date))||{})[player]||null):null;
  const retests=row
    ? rows.filter(r=>normDate(r.date)>normDate(row.date))
    : rows.filter(r=>normDate(r.date)>=start);
  return {row,evaluation,retests};
}
function stepValue(n,steps,mode){n=num(n);const arr=(steps||[]).slice().sort((a,b)=>num(b.min)-num(a.min));for(const x of arr)if(n>=num(x.min))return num(x.value);return mode==='multiplier'?1:0;}
function goalGrowth(n){return Math.max(0,num(n))*Math.max(0,num(abilityConfig().goalPerGoal));}
function assistGrowth(n){return stepValue(n,abilityConfig().assistSteps);}
function saveGrowth(n){return stepValue(n,abilityConfig().saveSteps);}
function foulPenalty(n){return stepValue(n,abilityConfig().foulPenaltySteps);}
function pointMultiplier(pts){return stepValue(pts,abilityConfig().pointMultipliers,'multiplier');}
function abilityGrowthRate(v){
  v=num(v);
  const arr=(abilityConfig().growthRates||[]).slice().sort((a,b)=>num(b.min)-num(a.min));
  for(const x of arr) if(v>=num(x.min)) return num(x.value);
  /* 설정에 0구간이 없을 때도 V3.24 저능력 성장률을 사용한다. */
  return 1.35;
}
function abilityFormStatus(level){
  const map={5:['SUPER HOT','🔥🔥'],4:['HOT','🔥'],3:['GREAT','🔥'],2:['GOOD','↑'],1:['UP','↗'],0:['NORMAL','—'],[-1]:['LOW','↘'],[-2]:['POOR','↓'],[-3]:['COLD','🧊'],[-4]:['BAD','🧊'],[-5]:['SLUMP','❄️']};
  const hit=map[Math.max(-5,Math.min(5,Math.round(num(level))))]||map[0];
  return {label:hit[0],icon:hit[1]};
}
function abilityFormModifier(level){
  const map=(abilityConfig().form||{}).ovrModifier||{};
  return num(map[String(Math.max(-5,Math.min(5,Math.round(num(level)))))]);
}
function abilityFormGrowthMultiplier(level){
  const map=(abilityConfig().form||{}).growthMultiplier||{};
  const key=String(Math.max(-5,Math.min(5,Math.round(num(level)))));
  return Number.isFinite(Number(map[key]))?Math.max(0,num(map[key])):1;
}
function abilityFormFromRounds(rounds){
  const cfg=abilityConfig().form||{};
  if(cfg.enabled===false)return {level:0,raw:0,modifier:0,growthMultiplier:1,status:abilityFormStatus(0),attendanceBase:0,streakPenalty:0,performance:0,recent:[]};
  const win=Math.max(1,Math.floor(num(cfg.window)||5)), recent=(rounds||[]).filter(r=>r&&r.date).slice(-win);
  if(!recent.length)return {level:0,raw:0,modifier:0,growthMultiplier:1,status:abilityFormStatus(0),attendanceBase:0,streakPenalty:0,performance:0,recent:[]};
  const played=recent.filter(abilityRoundPlayed).length, equivalent=Math.max(0,Math.min(5,Math.round((played/recent.length)*5)));
  const attendanceMap=cfg.attendance||{}, attendanceBase=num(attendanceMap[String(equivalent)]);
  let consecutive=0; for(let i=recent.length-1;i>=0;i--){if(abilityRoundPlayed(recent[i]))break;consecutive++;}
  const streakMap=cfg.consecutiveAbsence||{}; let streakPenalty=0;
  if(consecutive>=4)streakPenalty=num(streakMap['4']);else if(consecutive>=3)streakPenalty=num(streakMap['3']);else if(consecutive>=2)streakPenalty=num(streakMap['2']);
  const ec=cfg.events||{}, baseWeights=(cfg.recency||[.35,.25,.20,.12,.08]).slice(0,recent.length), weights=baseWeights.slice(0,recent.length);
  while(weights.length<recent.length)weights.push(0);
  const sumW=weights.reduce((a,b)=>a+Math.max(0,num(b)),0)||1;
  let performance=0;
  recent.forEach((R,i)=>{
    const rev=recent.length-1-i, w=Math.max(0,num(weights[rev]!==undefined?weights[rev]:0))/sumW;
    let s=Math.max(0,num(R.g))*num(ec.goal)+Math.max(0,num(R.a))*num(ec.assist);
    s+=Math.min(Math.max(0,num(ec.saveMax)),Math.floor(Math.max(0,num(R.sv))/5)*Math.max(0,num(ec.savePer5)));
    s+=Math.min(1,Math.max(0,num(R.mom)))*Math.max(0,num(ec.mom));
    s+=Math.max(0,num(R.f))*Math.min(0,num(ec.foul));
    const games=Math.max(0,num(R.w)+num(R.d)+num(R.l));
    if(games){const ppg=num(R.pts)/games;s+=ppg>=2?num(ec.win):(ppg<1?num(ec.loss):num(ec.draw));}
    s=Math.max(num(ec.roundMin),Math.min(num(ec.roundMax),s)); performance+=s*w;
  });
  const raw=attendanceBase+streakPenalty+performance, level=Math.max(-5,Math.min(5,Math.round(raw))), status=abilityFormStatus(level);
  return {level,raw,modifier:abilityFormModifier(level),growthMultiplier:abilityFormGrowthMultiplier(level),status,attendanceBase,streakPenalty,performance,recent,played,consecutive};
}
function longFormTimeline(rounds,forms,cfg){
 const lf=cfg.longForm,window=lf.window,interval=lf.interval;
 return rounds.map((r,i)=>{const recent=rounds.slice(Math.max(0,i-window+1),i+1),ready=recent.length===window;
  const score=recent.reduce((s,x)=>s+Math.max(-5,Math.min(5,forms.get(x.date).raw)),0)/recent.length;
  const known=recent.every(x=>!!x.expectedTeam),checkpoint=ready&&(i+1-window)%interval===0;
  const rate=score<=lf.extremeThreshold?lf.extremeDrop:score<=lf.severeThreshold?lf.severeDrop:score<=lf.slumpThreshold?lf.slumpDrop:0;
  const recovered=forms.get(r.date).level>=lf.recoveryLevel;
  return {date:r.date,round:i+1,score,ready,known,checkpoint,rate,recovered,recent,nextCheck:!ready?window:(i+1-window)%interval===0?i+1+interval:i+1+interval-(i+1-window)%interval};
 });
}
function longFormWeights(weights){
 const out={},sum=Object.values(weights||{}).reduce((s,v)=>s+Math.max(0,num(v)),0);
 for(const k of ['pac','sho','pas','dri','def','phy'])out[k]=sum?Math.max(0,num(weights[k]))/sum:1/6;return out;
}
function longFormDistribute(career,weights,scores,target,losses,cfg){
 const keys=['sho','pas','dri','def','phy'],w=longFormWeights(weights);let remaining=Math.max(0,target),applied=0;
 for(let pass=0;pass<6&&remaining>1e-10;pass++){
  const eligible=keys.filter(k=>scores[k]>0&&w[k]>0&&career[k]>cfg.scoreMin+1e-10&&losses[k]<cfg.longForm.axisCap-1e-10);
  const denom=eligible.reduce((s,k)=>s+w[k]*scores[k],0);if(!denom)break;
  const proposed=remaining;let used=0;
  for(const k of eligible){const delta=Math.min(proposed*scores[k]/denom,career[k]-cfg.scoreMin,cfg.longForm.axisCap-losses[k]);career[k]-=delta;losses[k]+=delta;used+=delta*w[k];}
  applied+=used;remaining=Math.max(0,remaining-used);if(used<1e-10)break;
 }
 return applied;
}
function applyLongFormCheckpoint(career,weights,state,entry,rounds,index,cfg,absenceLedger){
 const lf=cfg.longForm,year=entry.date.slice(0,4),zero={pac:0,sho:0,pas:0,dri:0,def:0,phy:0};
 if(!lf.enabled||cfg.form.enabled===false||!entry.checkpoint)return;
 const event={date:entry.date,round:entry.round,score:entry.score,requested:entry.rate,actual:0,losses:{...zero},absenceCredit:0,performanceTarget:0,absenceTarget:0,reason:''};
 const remaining=Math.max(0,lf.seasonCap-(state.byYear[year]||0));
 if(!entry.known)event.reason='소속팀 확인 필요';
 else if(entry.recovered)event.reason='단기 FORM 회복 · 감점 중단';
 else if(!entry.rate)event.reason=entry.score<=lf.warningThreshold?'경고 · 감점 기준 미달':'정상 · 감점 없음';
 else if(remaining<=1e-10)event.reason='시즌 LONG FORM 한도 도달';
 else{
  const recent=entry.recent,absent=recent.filter(r=>!abilityRoundPlayed(r)),bad=recent.filter(r=>abilityRoundPlayed(r)&&abilityFormFromRounds([r]).performance<0);
  const scores={sho:0,pas:0,dri:0,def:0,phy:0};
  // Only existing negative outcomes are evidence. Positive new records protect their axis.
  bad.forEach(r=>{if(r.l>r.w&&r.g===0&&!(r.sot>0))scores.sho++;if(r.l>r.w&&r.a===0&&!(r.keyPass>0))scores.pas++;if(r.f>0&&!(r.defSuccess>0)&&!(r.sv>0))scores.def+=r.f;});
  event.performanceTarget=entry.rate*bad.length/lf.window;
  event.absenceTarget=entry.rate*absent.length/lf.window*lf.absenceFactor;
  event.absenceCredit=rounds.slice(Math.max(0,index-lf.interval+1),index+1).reduce((s,r)=>s+(absenceLedger[r.date]||0),0);
  const attendanceBudget=Math.max(0,event.absenceTarget-event.absenceCredit);
  const perf=longFormDistribute(career,weights,scores,Math.min(remaining,event.performanceTarget),event.losses,cfg);
  const abs=longFormDistribute(career,weights,{sho:.5,pas:.5,dri:.5,def:.5,phy:1},Math.min(Math.max(0,remaining-perf),attendanceBudget),event.losses,cfg);
  event.actual=perf+abs;state.byYear[year]=(state.byYear[year]||0)+event.actual;
  event.reason=event.actual>1e-10?(perf>0?'장기 부진 조정':'장기 결석 완화 조정'):'중복 감점 공제 또는 조정 근거 부족';
  for(const k of Object.keys(zero))state.skills[k]+=event.losses[k];
 }
 state.events.push(event);
}
function playerAbilityRoundRows(player,info){
  const cacheKey=renderCalculationCache?JSON.stringify([player,info]):null;
  if(cacheKey!==null&&renderCalculationCache.rounds.has(cacheKey))return renderCalculationCache.rounds.get(cacheKey).slice();
  const list=abilityMatches(info).filter(m=>normDate(m.date)<abilityCareerStartDate()||playerEligibleOn(player,m.date)), ids=new Set(list.map(m=>m.id)), M={}; list.forEach(m=>M[m.id]=m); const rounds={};
  const get=(d)=>rounds[d]||(rounds[d]={date:d,att:false,g:0,a:0,sv:0,sot:0,keyPass:0,defSuccess:0,f:0,mom:0,w:0,d:0,l:0,pts:0,games:new Set(),expectedTeam:''});
  const pName=String(player||'').trim();

  /* V3.17 수정: 결석은 '리그에 경기가 있었는가'가 아니라 '그 선수의 소속팀이 실제로 경기한 날인가'를 기준으로 한다.
     이전 출전의 팀을 우선 사용하고, 출전 이력이 없을 때만 해당 연도 선수명단 팀을 fallback으로 사용한다. */
  const attEvents=(verifiedRecords().attendance||[]).filter(r=>String(r.player||'').trim()===pName&&ids.has(r.id)).map(r=>{
    const m=M[r.id]; return m?{date:normDate(m.date),team:String(r.team||'').trim(),id:r.id}:null;
  }).filter(Boolean).sort((a,b)=>a.date.localeCompare(b.date));
  const rosterTeamForYear=y=>{
    const rr=(DB.roster||[]).filter(r=>String(r.player||'').trim()===pName&&String(r.year||'').trim()===String(y)&&String(r.team||'').trim());
    return rr.length?String(rr[rr.length-1].team||'').trim():'';
  };
  const dates=[...new Set(list.map(m=>normDate(m.date)).filter(Boolean))].sort();
  /* V3.17: 소속팀을 아직 추적하지 못한 선수도 R1부터 결석 판정이 가능하도록
     선택 기간의 모든 실제 Round 날짜를 먼저 생성한다. 강동훈처럼 첫 출전이 R5인 선수도 R1~R4가 누락되지 않는다. */
  // Create expected rounds below only when the player's team actually plays.
  // If neither squad nor team history is known, retain the legacy league-day fallback.
  dates.forEach(d=>{
    const day=list.filter(m=>normDate(m.date)===d);
    const same=attEvents.find(x=>x.date===d&&x.team);
    const assigned=[...new Set(day.flatMap(m=>squadPlayerTeams(m,pName)))];
    let expected=same?same.team:assigned[0]||'';
    if(!expected&&!squadScope(day[0]).length){
      const prior=attEvents.filter(x=>x.date<d&&x.team).slice(-1)[0];
      if(prior) expected=prior.team;
    }
    if(!expected&&!squadScope(day[0]).length) expected=rosterTeamForYear(d.slice(0,4));
    if(!expected&&!squadScope(day[0]).length)get(d);
    if(expected && day.some(m=>m.home===expected||m.away===expected)){
      const R=get(d); R.expectedTeam=expected;
    }
  });

  (verifiedRecords().attendance||[]).forEach(r=>{
    if(String(r.player||'').trim()!==pName||!ids.has(r.id)) return; const m=M[r.id]; if(!m)return; const d=normDate(m.date),R=get(d); R.att=true; R.expectedTeam=String(r.team||R.expectedTeam||'').trim();
    if(R.games.has(r.id)) return; R.games.add(r.id); const res=matchResult(m,r.team); if(res==='W'){R.w++;R.pts+=3;}else if(res==='D'){R.d++;R.pts++;}else if(res==='L')R.l++;
  });
  (verifiedRecords().goals||[]).forEach(r=>{if(String(r.player||'').trim()!==pName||!ids.has(r.id))return;const m=M[r.id];if(!m)return;const R=get(normDate(m.date));R.g+=num(r.g);R.a+=num(r.a);if(!R.expectedTeam)R.expectedTeam=String(r.team||'').trim();});
  playerSaveRows().forEach(r=>{if(String(r.player||'').trim()!==pName||!ids.has(r.id))return;const m=M[r.id];if(!m)return;get(normDate(m.date)).sv+=num(r.saves);});
  (verifiedRecords().fouls||[]).forEach(r=>{if(String(r.player||'').trim()!==pName||!ids.has(r.id))return;const m=M[r.id];if(!m)return;get(normDate(m.date)).f+=num(r.fouls);});
  (verifiedRecords().moms||[]).forEach(r=>{if(String(r.player||'').trim()!==pName||!ids.has(r.id))return;const m=M[r.id];if(!m)return;get(normDate(m.date)).mom+=num(r.mom);});
  teamPlayerRecordLinks().matched.forEach(r=>{if(r.player!==pName||!ids.has(r.id))return;const R=get(normDate(M[r.id].date));['sot','keyPass','defSuccess'].forEach(k=>R[k]+=num(r[k]));});
  const result=Object.values(rounds).sort((a,b)=>a.date.localeCompare(b.date));
  if(cacheKey!==null)renderCalculationCache.rounds.set(cacheKey,result);
  return result.slice();
}
function playerAbilityAllRoundRows(player,cutoff){
  const end=normDate(cutoff)||'9999-12-31';
  /* V3.17: Career 시작일 이후 선수 소속팀이 실제 경기한 모든 Round를 사용한다.
     따라서 선수의 첫 실제 출전 여부와 관계없이 소속팀 첫 경기 Round부터 미출전 시 결석으로 카운트한다. */
  return playerAbilityRoundRows(player,{start:abilityCareerStartDate(),end});
}
function abilityRoundPlayed(r){return !!(r&&(r.att||r.g||r.a||r.sv||r.f||r.mom||r.sot>0||r.keyPass>0||r.defSuccess>0));}
function abilitySeasonStats(rounds,basisRound){
  /* V3.17: 선수 능력치의 출석R은 명단 출석 플래그만 보지 않고 해당 Round에서 실제 활동(출석/득점/도움/선방/개인파울/MOM)이 있으면 출석으로 본다.
     따라서 해당 반기/기준일까지 모든 소속팀 Round는 반드시 출석 또는 결석 중 하나로 분류되어 출석R + 누적결석R = 진행 Round가 된다. */
  const r=(rounds||[]), total=r.reduce((a,x)=>({att:a.att+(abilityRoundPlayed(x)?1:0),rawAtt:a.rawAtt+(x.att?1:0),g:a.g+x.g,a:a.a+x.a,sv:a.sv+x.sv,f:a.f+x.f,mom:a.mom+x.mom,w:a.w+x.w,d:a.d+x.d,l:a.l+x.l,pts:a.pts+x.pts}),{att:0,rawAtt:0,g:0,a:0,sv:0,f:0,mom:0,w:0,d:0,l:0,pts:0});
  /* V3.17: progress는 선수별 생성 Round 수가 아니라 선택 기간의 최종 Round 번호를 사용한다. */
  const games=total.w+total.d+total.l, fallbackProgress=r.length, requested=Math.max(0,Math.floor(num(basisRound))), progress=Math.max(total.att,requested||fallbackProgress), absence=Math.max(0,progress-total.att);
  return Object.assign(total,{games,progress,absence,gpr:total.att?total.g/total.att:0,apr:total.att?total.a/total.att:0,svpr:total.att?total.sv/total.att:0,fpr:total.att?total.f/total.att:0,mompr:total.att?total.mom/total.att:0,attRate:progress?total.att/progress:0,ppg:games?total.pts/games:0});
}
function soccerBeeDeltaValue(diff){
  const mult=Math.max(0,num((abilityConfig().soccerbee||{}).retestMultiplier));
  return num(diff)*mult;
}
function soccerBeePlayerRows(player,cutoff){
  const key=normalizePlayerMatchKey(player), limit=cutoff?normDate(cutoff):'';
  return soccerBeeDayRows((DB.soccerbee||[]).filter(r=>normalizePlayerMatchKey(r.player)===key&&(!limit||normDate(r.date)<=limit)));
}
function playerAbilityRecordAtDate(player,year,half,cutoffDate,includeCarry=true){
  player=String(player||'').trim();
  const info=abilityHalfInfo(year,half), cfg=abilityConfig(), halfDates=playerAbilityRoundRows(player,info).map(r=>r.date), effectiveCutoff=normDate(cutoffDate||halfDates[halfDates.length-1]||info.end);
  const keys=['pac','sho','pas','dri','def','phy'], ovrProfile=playerOvrProfile(player,year,cfg), ow=ovrProfile.weights||{};
  const initialSkills=abilityInitialSkillProfile(player), sbInitial=soccerBeeInitialProfile(player,effectiveCutoff), sbBase=sbInitial.evaluation;
  const start={pac:Number.isFinite(sbBase?.pac)?sbBase.pac:num(cfg.unassessed.pac),sho:num(initialSkills.sho),pas:num(initialSkills.pas),dri:Number.isFinite(sbBase?.dri)?sbBase.dri:num(cfg.unassessed.dri),def:Number.isFinite(sbBase?.def)?sbBase.def:num(cfg.unassessed.def),phy:Number.isFinite(sbBase?.phy)?sbBase.phy:num(cfg.unassessed.phy)};
  const measurementBase={...start},matchGrowth=Object.fromEntries(keys.map(k=>[k,0])),retestGrowth={...matchGrowth},clampAdjustment={...matchGrowth};
  const career=Object.assign({},start), careerGrowth={pac:0,sho:0,pas:0,dri:0,def:0,phy:0};
  const allRounds=playerAbilityAllRoundRows(player,effectiveCutoff), sbRows=sbInitial.retests||[];
  const roundForms=new Map(allRounds.map((r,i)=>[r.date,abilityFormFromRounds(allRounds.slice(0,i+1))]));
  const slumpTimeline=playerSlumpTimeline(player,allRounds,roundForms,cfg),slumpByDate=new Map(slumpTimeline.map(x=>[x.date,x])),slumpState={byYear:{},events:[],skills:Object.fromEntries(keys.map(k=>[k,0]))};
  const longTimeline=longFormTimeline(allRounds,roundForms,cfg),longByDate=new Map(longTimeline.map(x=>[x.date,x])),longState={byYear:{},events:[],skills:Object.fromEntries(keys.map(k=>[k,0]))},absenceLedger={};

  const events=[];
  allRounds.forEach(R=>events.push({date:R.date,type:'round',R}));
  sbRows.forEach((r,i)=>events.push({date:normDate(r.date),type:'sb',row:r,index:i}));
  events.sort((a,b)=>a.date.localeCompare(b.date)||(a.type==='sb'?-1:1));
  const sbKeys=['pac','dri','def','phy'],lastMeasured=Object.fromEntries(sbKeys.filter(k=>Number.isFinite(sbBase?.[k])).map(k=>[k,sbBase[k]]));
  const measurementDates={...(sbBase?.measurementDates||{})};
  let measured=Object.keys(lastMeasured).length>0,sbDate=measured?normDate(sbBase.date):'';
  events.forEach(ev=>{
    const beforeEvent={...career};
 auditBegin(ev,career,slumpState,cfg);
    if(ev.type==='sb'){
      const cur=(soccerBeeAbilityBaseMap(ev.date)||{})[player];if(!cur)return;
      for(const k of sbKeys){
        if(!Number.isFinite(cur[k])||cur.measurementDates[k]!==ev.date)continue;
        let delta; const auditOldMeasured=lastMeasured[k],auditOldBase=measurementBase[k];
        if(Number.isFinite(lastMeasured[k])){delta=soccerBeeDeltaValue(cur[k]-lastMeasured[k]);retestGrowth[k]+=delta;}
        else{delta=cur[k]-measurementBase[k];measurementBase[k]=cur[k];}
        career[k]+=delta;careerGrowth[k]+=delta;lastMeasured[k]=cur[k];measurementDates[k]=ev.date;
 auditCapture(Number.isFinite(auditOldMeasured)?'SoccerBee 재측정':'SoccerBee 첫 측정',career,{axis:k,previous:Number.isFinite(auditOldMeasured)?auditOldMeasured:auditOldBase,measured:cur[k],multiplier:Number.isFinite(auditOldMeasured)?cfg.soccerbee.retestMultiplier:1,index:cur.index[k],metrics:cur.metricScores[k],raw:cur.raw,coverage:cur.coverage[k]});
      }
      keys.forEach(k=>{const raw=career[k];career[k]=Math.max(num(cfg.scoreMin),Math.min(num(cfg.scoreMax),raw));clampAdjustment[k]+=career[k]-raw;});
      auditCapture('상·하한 보정',career,{min:cfg.scoreMin,max:cfg.scoreMax});auditFinish(career,slumpState,cfg);measured=Object.keys(lastMeasured).length>0;sbDate=Object.values(measurementDates).sort().pop()||'';return;
    }
    const R=ev.R, att=cfg.attendance||{}, add={
      pac:R.att?num(att.pac):0,
      sho:goalGrowth(R.g)+teamRecordGrowth(R.sot,'sot')+(R.att?num(att.sho):0),
      pas:assistGrowth(R.a)+teamRecordGrowth(R.keyPass,'keyPass')+(R.att?num(att.pas):0),
      dri:R.att?num(att.dri):0,
      def:saveGrowth(R.sv)+teamRecordGrowth(R.defSuccess,'defSuccess')+(R.att?num(att.def):0),
      phy:R.att?num(att.phy):0
    }, pm=pointMultiplier(R.pts), roundForm=roundForms.get(R.date), fm=roundForm.growthMultiplier;
    const auditRates=Object.fromEntries(keys.map(k=>[k,abilityGrowthRate(career[k])]));
 keys.forEach(k=>{const inc=add[k]*pm*abilityGrowthRate(career[k])*fm;career[k]+=inc;careerGrowth[k]+=inc;});
 auditCapture('경기 성장',career,{R,add,pm,fm,rates:auditRates,form:roundForm,parts:{
 pac:{attendance:R.att?num(att.pac):0},sho:{goal:goalGrowth(R.g),sot:teamRecordGrowth(R.sot,'sot'),attendance:R.att?num(att.sho):0},
 pas:{assist:assistGrowth(R.a),keyPass:teamRecordGrowth(R.keyPass,'keyPass'),attendance:R.att?num(att.pas):0},dri:{attendance:R.att?num(att.dri):0},
 def:{save:saveGrowth(R.sv),defSuccess:teamRecordGrowth(R.defSuccess,'defSuccess'),attendance:R.att?num(att.def):0},phy:{attendance:R.att?num(att.phy):0}}});
    /* MOM은 희소 이벤트 보상(+0.09)이며 FORM 성장배율도 함께 적용한다. */
    const mb=(cfg.mom&&cfg.mom.firstSeasonBonus)||{};
    ['sho','pas','dri','def','phy'].forEach(k=>{const inc=Math.max(0,num(R.mom))*Math.max(0,num(mb[k]))*fm;career[k]+=inc;careerGrowth[k]+=inc;});
    /* 개인파울 역시 해당 Round에서 1회만 DEF 감점 이벤트로 반영한다. */
    auditCapture('MOM 보너스',career,{count:R.mom,rates:mb,fm});
 const fp=foulPenalty(R.f); if(fp){career.def+=fp;careerGrowth.def+=fp;}
    /* V3.17 결석 감점: Career 시작일 이후 소속팀이 실제 경기한 Round에서 미출전한 경우 첫 Round부터 Career에 직접 1회 감점. */
    auditCapture('개인파울 감점',career,{count:R.f,penalty:fp,steps:cfg.foulPenaltySteps});
 if(!abilityRoundPlayed(R)){
      const ap=cfg.absence||{},aw=longFormWeights(playerOvrProfile(player,R.date.slice(0,4),cfg).weights||{});
      absenceLedger[R.date]=keys.filter(k=>k!=='pac').reduce((sum,k)=>sum+Math.min(Math.max(0,career[k]-cfg.scoreMin),Math.max(0,-num(ap[k])))*aw[k],0);
      keys.forEach(k=>{const dec=Math.min(0,num(ap[k])); if(dec){career[k]+=dec;careerGrowth[k]+=dec;}});
    }
    auditCapture('결석 감점',career,{played:abilityRoundPlayed(R),expectedTeam:R.expectedTeam,rates:cfg.absence});
 keys.forEach(k=>career[k]=Math.max(num(cfg.scoreMin),Math.min(num(cfg.scoreMax),career[k])));
 auditCapture('상·하한 보정',career,{min:cfg.scoreMin,max:cfg.scoreMax});
    keys.forEach(k=>matchGrowth[k]+=career[k]-beforeEvent[k]);
    const beforeLong={...career},entry=longByDate.get(R.date);
    // Preserve the previous release before the transition date; never stack old/new decay.
    if(R.date<cfg.slump.startDate)applyLongFormCheckpoint(career,playerOvrProfile(player,R.date.slice(0,4),cfg).weights||{},longState,entry,allRounds,entry.round-1,cfg,absenceLedger);
    auditCapture('이전 LONG FORM',career,{checkpoint:entry,event:longState.events.at(-1)?.date===R.date?longState.events.at(-1):null});
 GGFCSlump.apply(career,playerOvrProfile(player,R.date.slice(0,4),cfg).weights||{},slumpState,slumpByDate.get(R.date),cfg.slump,cfg.scoreMin,player);
    keys.forEach(k=>careerGrowth[k]+=career[k]-beforeLong[k]);
 auditCapture('이전 SLUMP 영구 감점',career,{checkpoint:slumpByDate.get(R.date)});auditFinish(career,slumpState,cfg,slumpByDate.get(R.date),roundForm);
  });

  // Keep growth/retest calculations on the unpenalized core; project SLUMP only for output.
  const coreSkills={...career},slumpProjected=GGFCSlump.project(coreSkills,slumpState,cfg.scoreMin);
  keys.forEach(k=>{careerGrowth[k]+=slumpProjected[k]-career[k];career[k]=slumpProjected[k];});
  /* V3.24: BASE는 Career 원점수, FORM은 최근 5R 상태, CURRENT는 BASE OVR에만 FORM 보정을 적용한다. */
  const vals=Object.assign({},career), displayVals={}; keys.forEach(k=>displayVals[k]=Math.floor(num(vals[k])));
  const weightSum=keys.reduce((t,k)=>t+Math.max(0,num(ow[k])),0);
  const baseOvrRaw=weightSum>0?keys.reduce((t,k)=>t+num(vals[k])*Math.max(0,num(ow[k])),0)/weightSum:keys.reduce((t,k)=>t+num(vals[k]),0)/6;
  const baseOvr=Math.floor(baseOvrRaw), form=abilityFormFromRounds(allRounds), currentOvrRaw=Math.max(num(cfg.scoreMin),Math.min(num(cfg.scoreMax),baseOvrRaw+form.modifier)), currentOvr=Math.round(currentOvrRaw), ovr=baseOvr;
  const baseFloor=Math.floor(baseOvrRaw), ovrProgress=baseFloor>=num(cfg.scoreMax)?100:Math.max(0,Math.min(100,(baseOvrRaw-baseFloor)*100)), nextBaseOvr=Math.min(num(cfg.scoreMax),baseFloor+1);
  const rounds=playerAbilityRoundRows(player,info).filter(r=>r.date<=effectiveCutoff), periodBasis=rounds.length, summary=abilitySeasonStats(rounds,periodBasis), team=playerSquadDisplayTeam(player,{asOf:effectiveCutoff,comp:'정규리그'});
  /* 화면의 누적 결석R은 선택 반기/기준일까지의 Round 안에서 계산한다. Career 결석감점은 Career 시작일부터 누적된 전체 결석을 그대로 사용한다. */
  const periodAbsenceRounds=Math.max(0,num(summary.progress)-num(summary.att));
  const careerAbsenceRounds=allRounds.filter(r=>!abilityRoundPlayed(r)).length, absenceCfg=cfg.absence||{}, absencePenalty={};
  keys.forEach(k=>absencePenalty[k]=careerAbsenceRounds*Math.min(0,num(absenceCfg[k])));
  const growth={}; keys.forEach(k=>growth[k]=num(careerGrowth[k]));
  const longForm=slumpResult(slumpTimeline,slumpState,longState,cfg,effectiveCutoff,ow,coreSkills,career);
  return {longForm,coreSkills,player,team,info,base:start,start,initialSkills,soccerBeeInitial:sbInitial,growth,careerGrowth,career,absence:{rounds:periodAbsenceRounds,careerRounds:careerAbsenceRounds,penalty:absencePenalty},rounds,careerRounds:allRounds,summary,measurementBase,matchGrowth,retestGrowth,clampAdjustment,measurementDates,partialMeasurement:Object.keys(lastMeasured).length<4,measured,provisional:Object.keys(lastMeasured).length<4,sbDate,cutoffDate:effectiveCutoff,mode:'BASE+FORM',benchmark:null,benchmarkEligible:false,benchmarkStats:null,benchmarkRecord:null,position:ovrProfile.position||ovrProfile.rawPosition||'',ovrWeightSource:ovrProfile.source,display:displayVals,pac:vals.pac,sho:vals.sho,pas:vals.pas,dri:vals.dri,def:vals.def,phy:vals.phy,ovr,ovrRaw:baseOvrRaw,baseOvr,baseOvrRaw,currentOvr,currentOvrRaw,form,ovrProgress,nextBaseOvr};
}
function abilityHalfForDate(year,date){
  const d=normDate(date), c=seasonCfg(String(year));
  if(!d) return "H1";
  return dateHalfKey(d)||(d>=c.h2s?"H2":"H1");
}
function abilityMetricLabel(k){return ({spm:'SPM(회/분)',sprintPer10:'스프린트(회/10분)',sprintMetersPer10:'스프린트 거리(m/10분)',maxSpeed:'최고속도',hpm:'HPM',hsrRatio:'HSR비율',hapm:'HAPM',apm:'APM',accel:'가속',activityRange:'활동범위',avgSpeed:'평균속도',action:'가속감속액션',highAccel:'고강도가속',decel:'감속',highDecel:'고강도감속',dpm:'DPM',energy:'에너지점수'})[k]||k;}
function compCompact(v){
  return String(v||"").trim().toLowerCase().replace(/[\s_.\-]/g,"");
}
function isRegularComp(v){
  const n=compCompact(v);
  return n.includes("정규리그") || n==="regularleague" || n==="regular" || !!leagueCompetitionGroup(v);
}
function isInterleagueComp(v){
  const n=compCompact(v);
  return n.includes("인터리그") || n.includes("교차리그") || n==="interleague";
}
function leagueCompetitionGroup(v){
  const n=compCompact(v);
  return ['슈퍼리그','superleague'].includes(n)?'A':['챌린지리그','challengeleague'].includes(n)?'B':'';
}
function isLeagueFamilyComp(v){return isRegularComp(v)||isInterleagueComp(v);}
function calendarHalfKey(date){
  const d=normDate(date||''),y=d.slice(0,4);if(!/^\d{4}$/.test(y))return '';
  const c=seasonCfg(y);return d>=c.h1s&&d<=c.h1e?'H1':d>=c.h2s&&d<=c.h2e?'H2':'';
}
function matchHalfKey(m){
  const fromSquad=matchSquadHalf(m);
  return fromSquad!==null?fromSquad:(normHalf(m.half)||calendarHalfKey(m.date));
}
function dateHalfKey(date){
  const d=normDate(date||''),sameDay=verifiedRecords().matches.filter(m=>normDate(m.date)===d);
  const halves=[...new Set(sameDay.map(matchHalfKey).filter(Boolean))];
  if(sameDay.length)return halves.length===1?halves[0]:'';
  const fromSquad=[...new Set(squadSnapshot({date:d,comp:'정규리그'}).map(r=>normHalf(r.half)).filter(Boolean))];
  return fromSquad.length===1?fromSquad[0]:calendarHalfKey(d);
}
function playerSquadDisplayTeam(player,info={}){
  const teams=squadPlayerTeams(squadQueryContext(info),player);
  // Missing/ambiguous squad membership must not silently resurrect an old match team.
  return teams.length?teams.join(' · '):'-';
}
function uploadedPlayerPhoto(){return ''}
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
