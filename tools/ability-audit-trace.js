/* Build-time instrumentation only. Never loaded by the member application. */
module.exports=function instrument(source){
 function replace(a,b){if(source.split(a).length!==2)throw Error('Audit instrumentation anchor changed: '+a.slice(0,90));source=source.replace(a,b);}
 replace('const beforeEvent={...career};','const beforeEvent={...career};\n auditBegin(ev,career,slumpState,cfg);');
 replace('let delta;','let delta; const auditOldMeasured=lastMeasured[k],auditOldBase=measurementBase[k];');
 replace('career[k]+=delta;careerGrowth[k]+=delta;lastMeasured[k]=cur[k];measurementDates[k]=ev.date;',
 `career[k]+=delta;careerGrowth[k]+=delta;lastMeasured[k]=cur[k];measurementDates[k]=ev.date;
 auditCapture(Number.isFinite(auditOldMeasured)?'SoccerBee 재측정':'SoccerBee 첫 측정',career,{axis:k,previous:Number.isFinite(auditOldMeasured)?auditOldMeasured:auditOldBase,measured:cur[k],multiplier:Number.isFinite(auditOldMeasured)?cfg.soccerbee.retestMultiplier:1,index:cur.index[k],metrics:cur.metricScores[k],raw:cur.raw,coverage:cur.coverage[k]});`);
 replace("measured=Object.keys(lastMeasured).length>0;sbDate=Object.values(measurementDates).sort().pop()||'';return;",
 "auditCapture('상·하한 보정',career,{min:cfg.scoreMin,max:cfg.scoreMax});auditFinish(career,slumpState,cfg);measured=Object.keys(lastMeasured).length>0;sbDate=Object.values(measurementDates).sort().pop()||'';return;");
 replace('keys.forEach(k=>{const inc=add[k]*pm*abilityGrowthRate(career[k])*fm;career[k]+=inc;careerGrowth[k]+=inc;});',
 `const auditRates=Object.fromEntries(keys.map(k=>[k,abilityGrowthRate(career[k])]));
 keys.forEach(k=>{const inc=add[k]*pm*abilityGrowthRate(career[k])*fm;career[k]+=inc;careerGrowth[k]+=inc;});
 auditCapture('경기 성장',career,{R,add,pm,fm,rates:auditRates,form:roundForm,parts:{
 pac:{attendance:R.att?num(att.pac):0},sho:{goal:goalGrowth(R.g),sot:teamRecordGrowth(R.sot,'sot'),attendance:R.att?num(att.sho):0},
 pas:{assist:assistGrowth(R.a),keyPass:teamRecordGrowth(R.keyPass,'keyPass'),attendance:R.att?num(att.pas):0},dri:{attendance:R.att?num(att.dri):0},
 def:{save:saveGrowth(R.sv),defSuccess:teamRecordGrowth(R.defSuccess,'defSuccess'),attendance:R.att?num(att.def):0},phy:{attendance:R.att?num(att.phy):0}}});`);
 replace("const fp=foulPenalty(R.f);", "auditCapture('MOM 보너스',career,{count:R.mom,rates:mb,fm});\n const fp=foulPenalty(R.f);");
 replace('if(!abilityRoundPlayed(R)){', "auditCapture('개인파울 감점',career,{count:R.f,penalty:fp,steps:cfg.foulPenaltySteps});\n if(!abilityRoundPlayed(R)){");
 replace('keys.forEach(k=>career[k]=Math.max(num(cfg.scoreMin),Math.min(num(cfg.scoreMax),career[k])));',
 "auditCapture('결석 감점',career,{played:abilityRoundPlayed(R),expectedTeam:R.expectedTeam,rates:cfg.absence});\n keys.forEach(k=>career[k]=Math.max(num(cfg.scoreMin),Math.min(num(cfg.scoreMax),career[k])));\n auditCapture('상·하한 보정',career,{min:cfg.scoreMin,max:cfg.scoreMax});");
 replace('GGFCSlump.apply(career,',"auditCapture('이전 LONG FORM',career,{checkpoint:entry,event:longState.events.at(-1)?.date===R.date?longState.events.at(-1):null});\n GGFCSlump.apply(career,");
 replace('keys.forEach(k=>careerGrowth[k]+=career[k]-beforeLong[k]);',
 "keys.forEach(k=>careerGrowth[k]+=career[k]-beforeLong[k]);\n auditCapture('이전 SLUMP 영구 감점',career,{checkpoint:slumpByDate.get(R.date)});auditFinish(career,slumpState,cfg,slumpByDate.get(R.date),roundForm);");
 return source;
};
