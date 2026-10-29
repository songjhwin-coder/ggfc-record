/* Build-time tracing of the exact application engine. Fail closed on stale anchors. */
module.exports=function instrument(source){
 function replace(a,b){if(source.split(a).length!==2)throw Error('Audit anchor changed: '+a.slice(0,100));source=source.replace(a,b);}
 replace('const beforeEvent={...career};','const beforeEvent={...career};auditBegin(ev,career,slumpState,cfg);');
 replace('let delta;','let delta;const auditOldMeasured=lastMeasured[k],auditOldBase=measurementBase[k];');
 replace('career[k]+=delta;careerGrowth[k]+=delta;lastMeasured[k]=cur[k];measurementDates[k]=ev.date;',`career[k]+=delta;careerGrowth[k]+=delta;lastMeasured[k]=cur[k];measurementDates[k]=ev.date;
 auditCapture(Number.isFinite(auditOldMeasured)?'SoccerBee 재측정':'SoccerBee 첫 측정',career,{axis:k,previous:Number.isFinite(auditOldMeasured)?auditOldMeasured:auditOldBase,measured:cur[k],multiplier:Number.isFinite(auditOldMeasured)?cfg.soccerbee.retestMultiplier:1,index:cur.index[k],metrics:cur.metricScores[k],raw:cur.raw,coverage:cur.coverage[k]});`);
 replace("measured=Object.keys(lastMeasured).length>0;sbDate=Object.values(measurementDates).sort().pop()||'';return;","auditCapture('상·하한',career,{min:cfg.scoreMin,max:cfg.scoreMax});auditFinish(career,slumpState,cfg);measured=Object.keys(lastMeasured).length>0;sbDate=Object.values(measurementDates).sort().pop()||'';return;");
 replace('keys.forEach(k=>{const inc=add[k]*pm*abilityGrowthRate(career[k])*fm;career[k]+=inc;careerGrowth[k]+=inc;});',`const auditRates=Object.fromEntries(keys.map(k=>[k,abilityGrowthRate(career[k])]));
 keys.forEach(k=>{const inc=add[k]*pm*abilityGrowthRate(career[k])*fm;career[k]+=inc;careerGrowth[k]+=inc;});
 auditCapture('경기 기록 성장',career,{R,add,pm,fm,rates:auditRates});`);
 replace('const attendanceApplied=abilityApplyAttendance(career,R,cfg,attendanceLedger,fm);keys.forEach(k=>careerGrowth[k]+=attendanceApplied[k]);',`const attendanceApplied=abilityApplyAttendance(career,R,cfg,attendanceLedger,fm);keys.forEach(k=>careerGrowth[k]+=attendanceApplied[k]);
 auditCapture('연간 한도 출석 가산',career,{applied:attendanceApplied,annual:attendanceLedger[R.date.slice(0,4)],axisCap:cfg.growthPolicy.attendanceAxisCap});`);
 replace('const fp=0;',"auditCapture('MOM 성장',career,{count:R.mom,rates:mb,fm,softcap:true});const fp=0;");
 replace('if(!abilityRoundPlayed(R)){',"auditCapture('페어플레이 분리',career,{fouls:R.f,abilityImpact:0});if(!abilityRoundPlayed(R)){");
 replace('keys.forEach(k=>career[k]=Math.max(num(cfg.scoreMin),Math.min(num(cfg.scoreMax),career[k])));',"auditCapture('결석 직접 감점 미사용',career,{});keys.forEach(k=>career[k]=Math.max(num(cfg.scoreMin),Math.min(num(cfg.scoreMax),career[k])));auditCapture('상·하한',career,{min:cfg.scoreMin,max:cfg.scoreMax});");
 replace('keys.forEach(k=>careerGrowth[k]+=career[k]-beforeLong[k]);',"keys.forEach(k=>careerGrowth[k]+=career[k]-beforeLong[k]);auditCapture('지속 부진 BASE 보정',career,{form:roundForm,streak:sustainedState.streak,events:sustainedState.events.filter(e=>e.date===R.date)});auditFinish(career,slumpState,cfg,slumpByDate.get(R.date),roundForm);");
 return source;
};
