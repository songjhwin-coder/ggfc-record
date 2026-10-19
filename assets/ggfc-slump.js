/* GGFC V3.25.27 — personal performance comparison. No source records are mutated. */
const GGFCSlump=(()=>{
 const defaults={enabled:true,startDate:'2026-10-20',recentGames:10,baselineGames:20,minimumBaselineGames:10,formTrigger:-2,performanceTrigger:75,persistenceRounds:4,interval:4,recoveryPerformance:85,recoveryRounds:3,slumpDrop:.20,severeDrop:.35,criticalDrop:.50,seasonCap:1.5,storyEnabled:false};
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
 function performance(games,position,cfg){
  // Deduplicate appearances before selecting windows; a day can contain several matches.
  const seen=new Set(),list=games.filter(g=>!seen.has(g.id)&&seen.add(g.id)),recent=list.slice(-cfg.recentGames),baseline=list.slice(Math.max(0,list.length-cfg.recentGames-cfg.baselineGames),Math.max(0,list.length-cfg.recentGames));
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
 function timeline(rounds,forms,games,gkGames,positionAt,cfg){
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
 function apply(career,ovrWeights,state,entry,cfg,scoreMin,player){
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
 function validate(c){
  if(typeof c.enabled!=='boolean'||typeof c.storyEnabled!=='boolean')return 'SLUMP 사용 여부와 Story 설정을 확인하세요.';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(c.startDate)||!Number.isFinite(Date.parse(c.startDate))||new Date(c.startDate).toISOString().slice(0,10)!==c.startDate)return 'SLUMP 적용 시작일을 올바른 날짜로 입력하세요.';
  for(const [k,lo,hi,int] of [['recentGames',10,50,true],['baselineGames',10,100,true],['minimumBaselineGames',10,100,true],['formTrigger',-5,-1,true],['performanceTrigger',50,75,false],['persistenceRounds',4,20,true],['interval',4,20,true],['recoveryPerformance',85,120,false],['recoveryRounds',3,20,true],['slumpDrop',0,2,false],['severeDrop',0,2,false],['criticalDrop',0,2,false],['seasonCap',0,1.5,false]])if(!Number.isFinite(c[k])||c[k]<lo||c[k]>hi||(int&&!Number.isInteger(c[k])))return 'SLUMP '+k+': '+lo+'~'+hi+(int?'의 정수':'')+' 범위로 입력하세요.';
  if(c.minimumBaselineGames>c.baselineGames)return 'Baseline 최대 경기 수는 최소 경기 수 이상이어야 합니다.';
  if(!(c.slumpDrop<=c.severeDrop&&c.severeDrop<=c.criticalDrop))return '부진 단계가 심할수록 감소량이 작아질 수 없습니다.';
  return '';
 }
 return {defaults,weights,metric,weighted,performance,timeline,apply,validate};
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
 return GGFCSlump.timeline(rounds,forms,games,gk,date=>playerOvrProfile(player,date.slice(0,4),cfg).position,{...cfg.slump,enabled:cfg.slump.enabled&&cfg.form.enabled!==false});
}
function slumpResult(timeline,state,legacy,cfg,cutoff){
 const last=timeline.at(-1)||{status:'INSUFFICIENT DATA',overall:null,ready:false,indices:{},metrics:{},recentGames:0,baselineGames:0,persistence:0,recovery:0,form:0};
 return {...last,enabled:cfg.slump.enabled&&cfg.form.enabled!==false,score:last.overall,events:state.events,byYear:state.byYear,skills:state.skills,yearLoss:state.byYear[cutoff.slice(0,4)]||0,seasonCap:cfg.slump.seasonCap,startDate:cfg.slump.startDate,legacyEvents:legacy.events.filter(e=>e.actual>0),legacyYearLoss:legacy.byYear[cutoff.slice(0,4)]||0,recoveries:timeline.filter((x,i)=>x.status==='RECOVERED'&&timeline[i-1]?.status!=='RECOVERED').map(x=>x.date)};
}
function longFormStatus(record){const l=record.longForm;return !l?.enabled?'OFF':l.status;}
function longFormBadge(record){
 const l=record?.longForm;if(!l)return '';return '<span class="lf-badge '+(l.confirmed?'risk':'')+'">SLUMP <b>'+esc(longFormStatus(record))+'</b> · PI '+(l.ready?l.overall.toFixed(1):'—')+'</span>';
}
function longFormMethodHtml(){
 const c=abilityConfig().slump;
 return '<details class="lf-method"><summary>LONG FORM / SLUMP · 계산 기준</summary><p><b>자신의 과거 경기력=100.</b> 최근 실제 출전 '+c.recentGames+'경기와 바로 이전 최대 '+c.baselineGames+'경기(최소 '+c.minimumBaselineGames+'경기)를 비교합니다. 결석을 0회 기록으로 넣지 않습니다. 필드 선수의 출전시간·분당 기록·드리블·턴오버·수비블록·팀 승패는 Performance 계산에 사용하지 않습니다.</p><p>각 지표=(최근 기록합계÷최근 출전 경기 수)÷(과거 기록합계÷과거 출전 경기 수)×100. 50~120으로 제한합니다. 과거/최근 모두 0이면 100, 과거만 0이면 120입니다. 기간 중 한 경기라도 값이 미확인인 지표는 두 기간 비교에서 제외하고 나머지 가중치를 재분배합니다.</p><p>SHOOTING=골 60%+유효슛 40%, PASSING=도움 50%+키패스 50%, DEFENSIVE=수비성공 100%. 종합 가중치(SHO/PAS/DEF)는 PV 55/30/15%, AL 35/35/30%, FS 15/25/60%입니다. 최근 MOM 1회당 +3, 최대 +6은 종합 점수에만 더합니다. 포지션을 확인할 수 없으면 감점하지 않습니다.</p><p>GK는 GK 수행기록이 있는 출전만 별도 비교합니다. SAVE%=선방÷(선방+실점)×100, GA/15=실점÷GK시간×15. SAVE% 최근/과거 비교 70%+GA/15 과거/최근 역비교 30%. 선방+실점=0인 SAVE%는 N/A입니다. 누락·팀 실점 불일치 기록은 해당 지표에서 제외합니다.</p><p><b>기본 FORM 주의:</b> 4R 연속 출전이면 최근 5R 출석 가산은 최소 +0.8, 경기성과 최저는 −1.5이므로 FORM 최저는 반올림 −1입니다. 기본 FORM ≤−2·연속 출전 4R 조건으로는 신규 감점이 발생하지 않습니다. 기존 FORM은 유지하며, 실제 운영 적용을 원하면 관리자가 FORM 기준을 −1로 조정할 수 있습니다.</p><p>FORM ≤ '+c.formTrigger+' AND 종합 PI ≤ '+c.performanceTrigger+' AND 충분한 표본 AND 실제 출전한 경기일에서 '+c.persistenceRounds+'R 연속 지속해야 확정합니다. 1R=기존 FORM과 같은 경기일이며 당일 여러 대진은 출전 경기 수에는 각각 반영됩니다. 결석 R은 지속·회복 연속 횟수를 끊으며 SLUMP 추가 감점은 없습니다.</p><p>확정 시 처음 적용하고 이후 최소 '+c.interval+'R 간격입니다. 개별 Index도 기준 이하인 축만 70~'+c.performanceTrigger+' → −'+c.slumpDrop+', 60~70 미만 → −'+c.severeDrop+', 60 미만 → −'+c.criticalDrop+' <b>능력치 점수</b>를 적용합니다. SHO/PAS/DEF만 대상이며 GK는 DEF만 대상입니다. PAC/DRI/PHY는 건드리지 않습니다. 실제 축을 내린 뒤 기존 OVR로 재계산하며 연간(1~12월) SLUMP 직접 영향 최대 '+c.seasonCap+' OVR에 맞춰 마지막 감소량을 비례 축소합니다.</p><p>PI ≥ '+c.recoveryPerformance+'가 실제 출전 '+c.recoveryRounds+'R 연속이면 RECOVERED. 이미 적용한 감소량은 자동 복원하지 않습니다. 감점 조건이 깨진 시점부터 추가 감점은 중단됩니다.</p><p>적용 시작일 '+esc(c.startDate)+' 전에는 새 SLUMP 이벤트와 지속 횟수를 만들지 않습니다. 이전 경기들은 비교 표본으로 사용합니다. 기존 V3.25.26 LONG FORM 조정은 시작일 전까지만 이전 산식으로 유지하고 새 SLUMP와 중첩 적용하지 않습니다. 새 SLUMP OFF는 신규 감소만 중단합니다.</p><p>이벤트는 선수·경기일 ID로 날짜순 재계산합니다. 조회·새로고침·동기화로 누적 저장하지 않습니다. 기록 정정·요율·시작일 변경 시 결과가 재계산됩니다. 미기록 여부를 확신할 수 없는 도움 0은 보수적으로 제외합니다. 골은 팀 득점과 득점자 합계가 일치하는 경기만 사용합니다.</p></details>';
}
function longFormCardHtml(record){
 const l=record?.longForm;if(!l)return '';const c=abilityConfig().slump,fmt=v=>Number.isFinite(v)?v.toFixed(2):'—';
 const metrics={g:'골 / 경기',a:'도움 / 경기',sot:'유효슛 / 경기',keyPass:'키패스 / 경기',defSuccess:'수비성공 / 경기',saveRate:'SAVE %',ga15:'GA / 15분'};
 const details=admin?'<details class="slump-admin-details"><summary>관리자 · 경기력 비교 상세'+(l.partial?' · 부분 데이터 기반':'')+'</summary><p>Recent '+l.recentGames+'/'+c.recentGames+'경기 · Baseline '+l.baselineGames+'/'+c.baselineGames+'경기 (최소 '+c.minimumBaselineGames+') · 포지션 '+esc(l.position||'미확인')+'</p><div class="tablewrap">'+tbl(['기록','최근 평균','과거 평균','Performance','최근/과거 기록 확인'].map(t=>({t})),Object.entries(l.metrics||{}).map(([k,m])=>[metrics[k],fmt(m.recent),fmt(m.baseline),fmt(m.score),m.recentCoverage!==undefined?m.recentCoverage+'/'+l.recentGames+' · '+m.baselineCoverage+'/'+l.baselineGames:'GK 합계 기준']))+'</div><p>SHOOTING '+fmt(l.indices?.sho)+' · PASSING '+fmt(l.indices?.pas)+' · DEFENSIVE '+fmt(l.indices?.def)+' · OVERALL '+fmt(l.overall)+' · MOM 보정 +'+(l.momBonus||0)+'</p><p>FORM '+record.form.level+' · 지속 '+l.persistence+'/'+c.persistenceRounds+'R · 회복 '+l.recovery+'/'+c.recoveryRounds+'R · 시즌 신규 조정 −'+l.yearLoss.toFixed(3)+' / '+c.seasonCap+' OVR · 적용 시작 '+esc(c.startDate)+'</p><p>Last Decay Event: '+esc(l.events.filter(e=>e.actual>0).at(-1)?.id||'없음')+'</p><p>미기록은 평균 분모를 줄여 계산하지 않습니다. 한 구간에 누락이 있으면 해당 지표 전체를 제외합니다. 도움은 팀 도움 기록 또는 팀 무득점이 확인된 경기만 사용합니다.</p><div class="tablewrap">'+tbl(['날짜','R','PI / FORM','축별 감소','OVR 영향','판정'].map(t=>({t})),l.events.slice().reverse().map(e=>[esc(e.date),e.round,fmt(e.score)+' / '+e.form,esc(Object.entries(e.losses).filter(([,v])=>v>0).map(([k,v])=>k.toUpperCase()+' −'+v.toFixed(3)).join(' · ')||'—'),e.actual.toFixed(3),esc(e.reason)]))+'</div><details><summary>이전 LONG FORM 조정 · '+l.legacyEvents.length+'회</summary><p>시작일 이전 기존 계산을 보존합니다. 해당 연도 이전 방식 영향 −'+l.legacyYearLoss.toFixed(3)+' OVR. 신규 SLUMP 한도와 구분합니다.</p></details></details>':'';
 return '<div class="lf-panel slump-panel">'+longFormBadge(record)+'<div class="slump-summary"><span>BASE <b>'+record.baseOvrRaw.toFixed(2)+'</b></span><span>CURRENT <b>'+record.currentOvr+'</b></span><span>FORM <b>'+record.form.level+'</b></span><span>PERFORMANCE <b>'+fmt(l.overall)+'</b></span></div>'+(l.confirmed?'<p>최근 경기력이 평소보다 낮은 상태가 지속되고 있습니다.</p>':'')+(l.partial?'<p class="note">부분 데이터 기반 · 미기록 지표 제외</p>':'')+details+longFormMethodHtml()+'</div>';
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
 return '<div class="ability-config-card full" id="slumpConfig"><h3>LONG FORM / SLUMP · 개인 경기력</h3><p>필드 선수는 출전 경기당 기록을 사용합니다. 결석으로 신규 SLUMP 감점하지 않습니다. 시작일 이전 기존 LONG FORM 이력은 보존합니다.</p><div class="ability-config-fields">'+select('enabled','SLUMP SYSTEM')+select('storyEnabled','회복 Story 공개')+'<label>적용 시작일<input type="date" data-ability-cfg="slump.startDate" value="'+esc(s.startDate)+'"></label>'+[
 ['Recent 출전 경기 수','recentGames',10,50,1],['Baseline 최대 경기 수','baselineGames',10,100,1],['Baseline 최소 경기 수','minimumBaselineGames',10,100,1],['FORM 기준 이하','formTrigger',-5,-1,1],['Performance 기준 이하','performanceTrigger',50,75,1],['연속 지속 R','persistenceRounds',4,20,1],['추가 감소 간격 R','interval',4,20,1],['회복 Performance 이상','recoveryPerformance',85,120,1],['연속 회복 R','recoveryRounds',3,20,1],['SLUMP 능력치 감소','slumpDrop',0,2,.01],['SEVERE 능력치 감소','severeDrop',0,2,.01],['CRITICAL 능력치 감소','criticalDrop',0,2,.01],['시즌 OVR 영향 한도','seasonCap',0,1.5,.1]
 ].map(([label,key,min,max,step])=>abilityCfgField(label,'slump.'+key,s[key],String(step),String(min),String(max))).join('')+'</div><p>10경기 표본, 4R 지속/간격, 3R 회복, 시즌 1.5 OVR 한도는 안전 범위입니다. 더 신중한 기준으로 조정할 수 있습니다. 시작일을 과거로 옮기거나 설정을 바꾸면 결과도 재계산됩니다.</p>'+longFormMethodHtml()+'</div>';
}
