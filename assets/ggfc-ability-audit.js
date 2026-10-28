/* Administrator-only, explicitly requested single-player analysis. No background work. */
window.GGFCAbilityAudit=(()=>{
 const axes=['pac','sho','pas','dri','def','phy'],labels={goal:'득점',assist:'도움',save:'선방',sot:'유효슛',keyPass:'키패스',defSuccess:'수비성공',attendance:'명단 출석'};
 const E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const N=(v,d=4)=>{if(v===null||v===undefined||!Number.isFinite(Number(v)))return '—';const s=Number(v).toFixed(d);return s.includes('.')?s.replace(/\.?0+$/,''):s;};
 const signed=v=>Math.abs(v)<1e-10?'0':(v>0?'+':'')+N(v,6);
 let worker=null,token=0,report=null,page=0,root=null,names=[],timeout=null,assets=null,viewRequest=0;
 const allowed=()=>admin&&GGFC.authorized&&activeView==='abilityaudit';
 const yieldUI=()=>new Promise(r=>setTimeout(r,0));
 function stop(clear=false){token++;clearTimeout(timeout);worker?.terminate();worker=null;if(clear){report=null;if(root)root.innerHTML='';}if(root){root.querySelector('[data-run]')?.removeAttribute('disabled');root.querySelector('[data-cancel]')?.setAttribute('hidden','');}}
 function message(s){const el=root?.querySelector('[data-status]');if(el)el.textContent=s;}
 function table(headers,rows){return '<div class="aa-table"><table><thead><tr>'+headers.map(x=>'<th>'+E(x)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(x=>'<td>'+x+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';}
 function deltaCell(n){return '<span class="aa-'+(n>1e-10?'up':n< -1e-10?'down':'zero')+'">'+signed(n)+'</span>';}
 function render(host,urls){
  const previousName=root?.querySelector('[data-name]')?.value||'',previousDate=root?.querySelector('[data-date]')?.value||'';
  stop();report=null;page=0;root=host;assets=urls;
  if(!allowed()){root.innerHTML='';return;}
  names=[...new Set([...(DB.roster||[]),...(DB.attendance||[])].map(r=>String(r.player||'').trim()).filter(Boolean))].sort(compareNamesKo);
  root.innerHTML='<div class="card"><h3>능력치 변동 분석</h3><p>선수 한 명을 선택하고 분석 버튼을 눌러 주세요. 이름 입력만으로는 능력치를 계산하지 않습니다.</p><form class="aa-search"><label>선수 이름<input data-name type="search" autocomplete="off" placeholder="이름 입력" aria-controls="aaSuggestions" required></label><label>기준일 (선택)<input data-date type="date"></label><button class="btn primary" data-run type="submit">선택 선수 분석</button><button class="btn" data-cancel type="button" hidden>분석 취소</button></form><div id="aaSuggestions" class="aa-suggestions" aria-label="선수 검색 결과"></div><p class="note" data-status role="status">대기 중 · 전체 선수 일괄 분석을 실행하지 않습니다.</p><p class="note">현재 DB와 현재 설정으로 재계산합니다. 과거 설정 변경 전의 확정 이력은 아닙니다. 기준일을 비우면 기존 능력치 화면의 최신 기준을 사용합니다. 분석 결과는 DB에 저장하지 않습니다.</p></div><div data-result></div>';
  root.querySelector('[data-name]').value=previousName;root.querySelector('[data-date]').value=previousDate;
  root.querySelector('[data-name]').oninput=()=>{
   const q=root.querySelector('[data-name]').value.trim(),box=root.querySelector('#aaSuggestions');
   box.innerHTML=q?names.filter(n=>n.includes(q)).slice(0,12).map(n=>'<button class="btn" type="button" data-pick="'+E(n)+'">'+E(n)+'</button>').join(''):'';
  };
  root.querySelector('#aaSuggestions').onclick=e=>{const b=e.target.closest('[data-pick]');if(b){root.querySelector('[data-name]').value=b.dataset.pick;root.querySelector('#aaSuggestions').innerHTML='';root.querySelector('[data-run]').focus();}};
  root.querySelector('form').onsubmit=e=>{e.preventDefault();start();};
  root.querySelector('[data-cancel]').onclick=()=>{stop();message('분석을 취소했습니다.');};
 }
 async function start(){
  if(!allowed())return;
  const player=root.querySelector('[data-name]').value.trim(),cutoff=root.querySelector('[data-date]').value;
  if(!names.includes(player)){message('검색 결과에서 등록된 선수 이름을 정확히 선택해 주세요.');return;}
  if(typeof Worker==='undefined'){message('이 브라우저에서는 분리 분석을 지원하지 않습니다. 화면 지연을 피하기 위해 분석을 실행하지 않았습니다. 최신 Chrome 또는 Safari에서 이용해 주세요.');return;}
  stop();const run=token;report=null;page=0;root.querySelector('[data-result]').innerHTML='';root.querySelector('[data-run]').disabled=true;root.querySelector('[data-cancel]').hidden=false;root.querySelector('#aaSuggestions').innerHTML='';message('기록을 준비하고 있습니다…');
  const began=performance.now(),sourceDB=DB;
  const valid=()=>run===token&&allowed()&&sourceDB===DB;
  try{
   worker=new Worker(assets.worker,{name:'GGFC single-player ability audit'});
   const w=worker;
   timeout=setTimeout(()=>{if(valid()){stop();message('분석 시간이 60초를 넘어 중단했습니다. 기준일을 좁히거나 기록 크기를 확인해 주세요.');}},60000);
   w.onerror=()=>{if(valid()){stop();message('분리 분석 파일을 불러오지 못했습니다. 앱 업데이트 확인 후 다시 시도해 주세요.');}};
   w.onmessage=e=>{
    if(!valid())return;
    if(e.data.type==='error'){stop();message('분석을 완료하지 못했습니다: '+e.data.message);return;}
    if(e.data.type==='page'){if(e.data.request===viewRequest)showEvents(e.data);return;}
    if(e.data.type==='detail'){if(e.data.request===viewRequest)renderDetail(e.data.event);return;}
    if(e.data.type!=='result')return;
    clearTimeout(timeout);report=e.data.report;report.elapsed=performance.now()-began;report.workerMs=e.data.workerMs;
    root.querySelector('[data-run]').disabled=false;root.querySelector('[data-cancel]').hidden=true;
    message(player+' 분석 완료 · '+(report.elapsed/1000).toFixed(2)+'초 · 변동 합계 검증 통과');renderReport();
   };
   w.postMessage({type:'init'});
   // Only calculation data. Photos/logo bytes and UI settings never enter the worker.
   // Small batches yield between transfers, so touch/paint can continue.
   const items=['matches','attendance','goals','saves','fouls','moms','roster','soccerbee','specials'].map(key=>({key,value:sourceDB[key]||[],settings:false}));
   for(const key of ['ability','seasons','teamSquads','teamPlayerRecords','goalkeeperEntries'])items.push({key,value:sourceDB.settings?.[key]??(key==='ability'||key==='seasons'?{}:[]),settings:true});
   for(const item of items){
    if(!valid())return;
    if(Array.isArray(item.value)){
     for(let i=0;i<item.value.length;i+=100){
      if(!valid())return;
      const rows=item.value.slice(i,i+100).map(r=>item.key==='roster'?{...r,photo:String(r.photo||'').trim()?'present':'',photoCutout:''}:r);
      w.postMessage({type:'rows',key:item.key,settings:item.settings,rows});await yieldUI();
     }
     if(!item.value.length)w.postMessage({type:'value',key:item.key,settings:item.settings,value:[]});
    }else{w.postMessage({type:'value',key:item.key,settings:item.settings,value:item.value});await yieldUI();}
   }
   if(!valid())return;message(player+'의 상승·하락 원인을 별도 작업 공간에서 분석 중입니다…');
   w.postMessage({type:'run',player,cutoff});
  }catch(error){if(valid()){stop();message('분석을 시작하지 못했습니다: '+error.message);}}
 }
 function formHtml(form){
  const f=form,c=report.cfg.form,ec=c.events,recent=f.recent||[],rawWeights=(c.recency||[]).slice(0,recent.length),sum=rawWeights.reduce((s,n)=>s+Math.max(0,n),0)||1;
  if(c.enabled===false)return '<p>FORM이 OFF이므로 CURRENT 보정은 0, 경기 성장 배율은 1입니다.</p>';
  if(!recent.length)return '<p>기준일까지 분석할 Round가 없어 FORM 보정은 0, 경기 성장 배율은 1입니다.</p>';
  return '<p>FORM 원점수 = 출석 '+N(f.attendanceBase)+' + 연속 결석 '+N(f.streakPenalty)+' + 경기 활약 '+N(f.performance)+' = <b>'+N(f.raw)+'</b> → 반올림·−5~5 제한 → <b>'+N(f.level)+'</b></p><p>CURRENT OVR 보정 '+signed(f.modifier)+' · 경기 성장 배율 ×'+N(f.growthMultiplier)+' · 실제 출전 '+(f.played??0)+' / 최근 '+recent.length+'R</p>'+table(['날짜','득점 / 도움 / 선방 / MOM / 파울','승·무·패 / 승점','활약 원점수 → 제한 후','최근 가중치','가중 기여'],recent.map((r,i)=>{
   const games=r.w+r.d+r.l,ppg=games?r.pts/games:0,result=games?(ppg>=2?ec.win:ppg<1?ec.loss:ec.draw):0;
   const a=Math.max(0,r.g)*ec.goal,b=Math.max(0,r.a)*ec.assist,s=Math.min(Math.max(0,ec.saveMax),Math.floor(Math.max(0,r.sv)/5)*Math.max(0,ec.savePer5)),m=Math.min(1,Math.max(0,r.mom))*Math.max(0,ec.mom),p=Math.max(0,r.f)*Math.min(0,ec.foul),raw=a+b+s+m+p+result,clamped=Math.max(ec.roundMin,Math.min(ec.roundMax,raw)),w=Math.max(0,rawWeights[recent.length-1-i]||0)/sum;
   return [E(r.date),[r.g,r.a,r.sv,r.mom,r.f].map(x=>N(x)).join(' / '),r.w+'·'+r.d+'·'+r.l+' / '+r.pts,[a,b,s,m,p,result].map(x=>N(x)).join(' + ')+' = '+N(raw)+' → '+N(clamped),N(w*100,2)+'%',N(clamped*w)];
  }))+'<p class="note">FORM은 6개 능력치에 직접 더하지 않고 CURRENT OVR과 경기 성장 배율에 적용됩니다. 활약 항목 순서: 득점·도움·선방·MOM·파울·경기 결과. FORM OFF이면 위 기여를 적용하지 않습니다.</p>';
 }
 function slumpHtml(l){
  if(!l)return '<p>판정 데이터 없음</p>';
  const c=report.cfg.slump,metricNames={g:'득점/경기',a:'도움/경기',sot:'유효슛/경기',keyPass:'키패스/경기',defSuccess:'수비성공/경기',saveRate:'선방률',ga15:'15분당 실점'},legacy=l.mode==='legacy';
  const severe=legacy?70:c.severePerformance,critical=legacy?60:c.criticalPerformance;
  const formula=l.position==='GR'?'GR DEF = 선방률 PI × 70% + 15분당 실점 PI × 30%. 실점 PI는 기준 실점률 ÷ 최근 실점률 × 100으로 역산합니다.':'SHO = 득점 PI × 60% + 유효슛 PI × 40% · PAS = 도움 PI × 50% + 키패스 PI × 50% · DEF = 수비성공 PI. 종합 가중치 '+Object.entries(report.slumpWeights[l.position]||{}).map(([k,v])=>k.toUpperCase()+' '+N(v*100,2)+'%').join(' / ')+' · MOM 가산 '+N(l.momBonus||0);
  return '<p>상태 <b>'+E(l.status)+'</b> · PI '+N(l.overall)+' · 최근 '+l.recentGames+'경기 / 기준 '+l.baselineGames+'경기 · 개인 기준 고정일 '+E(l.referenceDate||'없음')+'</p><p>판정 기준: 최근 '+c.recentGames+'경기 / 기준 최대 '+c.baselineGames+'경기(최소 '+c.minimumBaselineGames+') · PI ≤ '+c.performanceTrigger+' · '+c.persistenceRounds+'R 지속 · '+c.interval+'R 간격</p><p>현재 지속 '+(l.persistence||0)+'R · 감점 체크포인트 '+(l.checkpoint?'해당':'아님')+' · 실제 출전 '+(l.played?'있음':'없음')+' · 데이터 충족 '+(l.ready?'충족':'미충족')+'</p><p>축 PI &lt; '+critical+' → −'+c.criticalDrop+' / &lt; '+severe+' → −'+c.severeDrop+' / ≤ '+c.performanceTrigger+' → −'+c.slumpDrop+' · 연간 신규 감점 한도 '+c.seasonCap+' OVR</p>'+(legacy?'<p>이전 SLUMP 방식: FORM ≤ '+c.formTrigger+' 조건도 충족해야 하며 영구 감점으로 적용됩니다.</p>':'<p>회복형 전환일 '+E(c.recoveryStartDate)+' · 축별 회복 PI ≥ '+c.recoveryPerformance+'가 '+c.recoveryRounds+'R 지속하면 회복 시작 잔액의 '+c.recoveryPercent+'%씩 복구합니다.</p>')+'<p>일반 지표 PI = 최근 평균 ÷ 기준 평균 × 100, 50~120으로 제한. 둘 다 0이면 100, 기준만 0이고 최근 값이 양수이면 120입니다. '+E(formula)+' 누락 지표는 제외하고 가중치를 재정규화합니다.</p>'+table(['지표','최근 값','기준 값','PI'],Object.entries(l.metrics||{}).map(([k,m])=>[E(metricNames[k]||k),N(m.recent),N(m.baseline),N(m.score)]))+table(['축','SHO PI','PAS PI','DEF PI'],[['축별 판정',N(l.indices?.sho),N(l.indices?.pas),N(l.indices?.def)]])+'<p class="note">— 는 미기록 또는 판정 불가입니다. 데이터 부족을 0점으로 처리하지 않습니다. 회복형 SLUMP는 CORE를 깎지 않고 BASE에 잔액을 차감합니다. 이전 방식의 영구 감점은 별도 내역입니다.</p>';
 }
 function initialHtml(){
  const r=report.result,i=r.initialSkills,b=r.soccerBeeInitial?.evaluation,c=report.cfg;
  return table(['축','시작 값','근거'],axes.map(k=>[k.toUpperCase(),N(r.start[k]),['sho','pas'].includes(k)?(i.source==='PREVIOUS_YEAR'?i.year+'년 기록 · 보정 경기당 '+N(k==='sho'?i.adjustedGpr:i.adjustedApr)+' · 백분위 '+N(k==='sho'?i.shoPercentile:i.pasPercentile):'이전 연도 기록 없음 · 설정 초기값'):(Number.isFinite(b?.[k])?'시작 시점 SoccerBee · '+E(b.measurementDates[k])+' · 측정 지수 '+N(b.index[k]):'유효 측정 없음 · 미측정 초기값')]))+
   '<p>SHO/PAS 초기값: 이전 연도 '+i.att+'R · 득점 '+i.g+' · 도움 '+i.a+' · 신뢰도 '+N(i.reliability*100,2)+'% (기준 '+c.initialSkills.reliabilityRounds+'R). 원래 경기당 기록과 리그 평균을 신뢰도로 혼합한 뒤 백분위로 초기값을 결정합니다.</p>'+
   '<p class="note">경기 시작 후 첫 SoccerBee 측정은 실제 측정일의 변동 내역에 표시됩니다. 기존 경기 성장분은 유지됩니다.</p>';
 }
 function renderReport(){
  if(!allowed()||!report)return;
  const r=report.result,box=root.querySelector('[data-result]');
  box.innerHTML='<article class="card"><h3>'+E(report.player)+' · '+E(report.cutoff)+' 기준</h3>'+(report.enabled?'':'<p class="note">능력치 시스템이 OFF입니다. 아래는 엔진 계산 참고값이며 공개 화면 적용 상태와 구분해 주세요.</p>')+'<div class="aa-summary"><div>BASE OVR<b>'+N(r.baseOvrRaw)+'</b><small>표시 '+r.baseOvr+' · 내림</small></div><div>FORM<b>'+signed(r.form.modifier)+'</b><small>레벨 '+r.form.level+' · 성장 ×'+r.form.growthMultiplier+'</small></div><div>CURRENT OVR<b>'+r.currentOvr+'</b><small>원점수 '+N(r.currentOvrRaw)+' · 반올림</small></div></div><p>포지션 '+E(r.position||'기본 가중치')+' · OVR = '+axes.map(k=>k.toUpperCase()+' × '+N(report.weights[k]*100,2)+'%').join(' + ')+'</p>'+table(['능력치','시작','상승 합계','하락 합계','CORE','SLUMP 잔액','BASE 원점수','화면 표시'],axes.map(k=>{const totals=report.axisTotals[k];return [k.toUpperCase(),N(r.start[k]),deltaCell(totals.up),deltaCell(totals.down),N(r.coreSkills[k]),N(r.longForm.balance[k]||0),N(r.career[k]),r.display[k]];}))+'<p class="note">시작 + 상승 합계 + 하락 합계 = BASE 원점수 검증 완료. 소수점은 화면에서 최대 6자리로 줄여 표시합니다. CORE에는 과거 영구 감점이 포함될 수 있습니다. CURRENT는 BASE OVR + FORM 보정을 상·하한 제한 후 반올림한 값입니다.</p></article><details class="card"><summary>초기 능력치 근거</summary><div data-initial></div></details><details class="card"><summary>현재 FORM 상세 계산</summary><div data-form></div></details><details class="card"><summary>현재 SLUMP 판정·감점·복구</summary><div data-slump></div></details><article class="card"><h3>날짜별 변동 내역</h3><div class="aa-filters"><label>능력치 <select data-axis><option value="">전체</option>'+axes.map(k=>'<option value="'+k+'">'+k.toUpperCase()+'</option>').join('')+'</select></label><label>유형 <select data-type><option value="">전체</option><option value="round">경기 기록</option><option value="sb">SoccerBee</option></select></label></div><p class="note">최신 날짜부터 12건씩 표시합니다. 한 날짜의 ‘이유 보기’를 누르면 원자료, 적용 배율, 증감 값, 보정 사유가 나옵니다. 능력치 필터는 해당 축의 변동이 있는 날짜만 표시합니다.</p><div data-events></div><div class="aa-pages"><button class="btn" data-prev>이전</button><span data-pages></span><button class="btn" data-next>다음</button></div><div data-detail></div></article><details class="card"><summary>계산 제외·연결 경고 ('+report.issueCount+')</summary><p class="note">검증 과정에서 발견된 DB 공통 경고입니다. 선택 선수와 직접 관계없는 경고도 포함됩니다. 화면 부담을 줄이기 위해 경기 경고 50건·팀 기록 연결 경고 50건까지만 표시합니다. 해당 경기의 충돌·누락을 확인해 주세요.</p><div data-issues></div></details>';
  const lazy=(key,fn)=>{const el=box.querySelector('[data-'+key+']');el.parentElement.addEventListener('toggle',()=>{if(el.parentElement.open&&!el.dataset.ready){el.innerHTML=fn();el.dataset.ready='1';}});};
  lazy('initial',initialHtml);lazy('form',()=>formHtml(r.form));lazy('slump',()=>slumpHtml(r.longForm));lazy('issues',()=>'<pre>'+E(JSON.stringify([...report.issues,...report.teamIssues],null,2))+'</pre>');
  for(const key of ['axis','type'])box.querySelector('[data-'+key+']').onchange=()=>{page=0;renderEvents();};
  box.querySelector('[data-prev]').onclick=()=>{page--;renderEvents();};box.querySelector('[data-next]').onclick=()=>{page++;renderEvents();};
  box.querySelector('[data-events]').onclick=e=>{const b=e.target.closest('[data-event]');if(b&&worker){root.querySelector('[data-detail]').textContent='상세 기록을 불러오는 중입니다…';worker.postMessage({type:'detail',index:Number(b.dataset.event),request:++viewRequest});}};
  renderEvents();
 }
 function renderEvents(){
  if(!worker||!allowed())return;
  const axis=root.querySelector('[data-axis]').value,eventType=root.querySelector('[data-type]').value;
  root.querySelector('[data-detail]').innerHTML='';root.querySelector('[data-events]').textContent='내역을 불러오는 중입니다…';root.querySelector('[data-prev]').disabled=true;root.querySelector('[data-next]').disabled=true;
  worker.postMessage({type:'page',axis,eventType,page,request:++viewRequest});
 }
 function showEvents(data){
  page=data.page;
  root.querySelector('[data-events]').innerHTML=table(['날짜','유형',...axes.map(k=>k.toUpperCase()),'상세'],data.rows.map(e=>[E(e.date),e.type==='sb'?'측정':'경기',...axes.map(k=>deltaCell(e.delta[k])),'<button class="btn" data-event="'+e.i+'">이유 보기</button>']));
  root.querySelector('[data-pages]').textContent=(page+1)+' / '+data.pages+' · '+data.total+'건';root.querySelector('[data-prev]').disabled=page===0;root.querySelector('[data-next]').disabled=page===data.pages-1;
 }
 function detailText(s){
  const d=s.detail||{},c=report.cfg;
  if(s.reason==='경기 성장')return '<p>승점 '+d.R.pts+' → ×'+N(d.pm)+' · FORM 레벨 '+d.form.level+' → ×'+N(d.fm)+'</p>'+table(['능력치','성장 전 CORE','성장 요소 (배율 적용 전)','합계','승점 × 구간 × FORM','적용 증감'],axes.map(k=>[k.toUpperCase(),N(s.before[k]),Object.entries(d.parts[k]).map(([n,v])=>E(labels[n])+' '+N(v)).join(' + '),N(d.add[k]),N(d.pm)+' × '+N(d.rates[k])+' × '+N(d.fm),deltaCell(s.delta[k])]))+'<p>득점 1골당 '+c.goalPerGoal+' · 유효슛 min(기록 × '+c.teamRecords.sot.rate+', '+c.teamRecords.sot.cap+') · 키패스 min(기록 × '+c.teamRecords.keyPass.rate+', '+c.teamRecords.keyPass.cap+') · 수비성공 min(기록 × '+c.teamRecords.defSuccess.rate+', '+c.teamRecords.defSuccess.cap+')</p><p>도움 구간 '+E(c.assistSteps.map(x=>x.min+'개 이상 → '+x.value).join(' / '))+'<br>선방 구간 '+E(c.saveSteps.map(x=>x.min+'개 이상 → '+x.value).join(' / '))+'</p>';
  if(s.reason==='MOM 보너스')return '<p>MOM '+d.count+'회 × 축별 보너스 × FORM '+N(d.fm)+' (일반 성장 구간·승점 배율은 적용하지 않음)</p><p>'+axes.map(k=>k.toUpperCase()+' '+N(d.rates[k]||0)).join(' · ')+'</p>';
  if(s.reason==='개인파울 감점')return '<p>개인파울 '+d.count+'개 → DEF '+signed(d.penalty)+' · '+E(d.steps.map(x=>x.min+'개 이상 '+x.value).join(' / '))+'</p>';
  if(s.reason==='결석 감점')return '<p>예상 소속 '+E(d.expectedTeam||'미확인')+' · '+(d.played?'출전·활동 기록 확인 → 결석 감점 없음':'활동 기록 없음 → 해당 날짜 결석 요율 적용')+'</p><p>'+axes.map(k=>k.toUpperCase()+' '+N(d.rates[k]||0)).join(' · ')+'</p>';
  if(s.reason==='상·하한 보정')return '<p>능력치를 '+d.min+'~'+d.max+' 범위로 제한합니다. 0이면 보정이 필요하지 않았습니다.</p>';
  if(s.reason.startsWith('SoccerBee')){
   const weights=c.soccerbee.weights[d.axis],den=Object.keys(d.metrics).reduce((a,k)=>a+Math.max(0,weights[k]||0),0);
   return '<p>'+d.axis.toUpperCase()+': ('+N(d.measured)+' − '+N(d.previous)+') × '+N(d.multiplier)+' = '+signed(s.delta[d.axis])+'</p><p>유효 지표 가중합 / 유효 가중치 합 → 지수 '+N(d.index)+' → '+c.soccerbee.abilityMin+' + ('+c.soccerbee.abilityMax+' − '+c.soccerbee.abilityMin+') × 지수 / 100 = '+N(d.measured)+'</p>'+table(['측정 지표','원값','환산 점수','유효 가중치','환산 기준값'],Object.entries(d.metrics).map(([k,v])=>[E(report.metricLabels[k]||k),N(d.raw[k]),N(v),N(weights[k]/den*100,2)+'%',E((c.soccerbee.criteria[k]||[]).map((v,i)=>v+' → '+c.soccerbee.scorePoints[i]).join(' / '))]))+'<p class="note">구간 사이는 선형 보간합니다. 누락 지표는 제외하고 남은 가중치를 재정규화합니다. 첫 측정은 측정 초기값만 교체하고 경기 성장분을 유지합니다.</p>';
  }
  if(s.reason==='이전 LONG FORM')return '<p>'+E(d.event?.reason||'해당 날짜의 이전 방식 감점 적용 없음')+'</p>'+(d.event?'<p>장기 점수 '+N(d.event.score)+' · 요청 '+N(d.event.requested)+' · 결석 중복 공제 '+N(d.event.absenceCredit)+' · 실제 OVR 감소 '+N(d.event.actual)+'</p>':'');
  if(s.reason==='이전 SLUMP 영구 감점')return '<p>'+(d.checkpoint?.mode==='legacy'?'이전 방식 SLUMP 판정 · PI '+N(d.checkpoint.overall)+' · FORM '+N(d.checkpoint.form)+' · 체크포인트 '+(d.checkpoint.checkpoint?'해당':'아님'):'해당 날짜는 이전 SLUMP 영구 감점 대상이 아닙니다.')+'</p>';
  if(s.reason==='회복형 SLUMP 잔액 영향')return table(['축','이전 잔액','이후 잔액','BASE 영향 변화'],axes.map(k=>[k.toUpperCase(),N(d.before[k]||0),N(d.after[k]||0),deltaCell(s.delta[k])]))+(d.events.length?d.events.map(e=>'<p>'+E(e.reason)+' · 감점 OVR '+N(e.actual)+' / 복구 OVR '+N(e.restored||0)+'</p>').join(''):'<p>새 감점·복구 이벤트 없음. 하한에 닿으면 실제 BASE 영향은 잔액과 다를 수 있습니다.</p>');
  return '';
 }
 function renderDetail(e){
  const r=e.round,el=root.querySelector('[data-detail]');
  el.innerHTML='<div class="aa-detail"><h3>'+E(e.date)+' · '+(e.type==='sb'?'SoccerBee':'경기 기록')+' 상세</h3>'+(r?'<p>명단 출석 '+(r.att?'있음':'없음')+' · 득점 '+r.g+' · 도움 '+r.a+' · 유효슛 '+r.sot+' · 키패스 '+r.keyPass+' · 수비성공 '+r.defSuccess+' · 선방 '+r.sv+' · MOM '+r.mom+' · 개인파울 '+r.f+' · '+r.w+'승 '+r.d+'무 '+r.l+'패</p>':'')+table(['능력치','변동 전 BASE','당일 순변동','변동 후 BASE'],axes.map(k=>[k.toUpperCase(),N(e.beforeBase[k]),deltaCell(e.delta[k]),N(e.afterBase[k])]))+e.steps.map(s=>'<details><summary>'+E(s.reason)+' <span class="aa-step-total">'+axes.filter(k=>Math.abs(s.delta[k])>1e-10).map(k=>k.toUpperCase()+' '+signed(s.delta[k])).join(' · ')+(!axes.some(k=>Math.abs(s.delta[k])>1e-10)?'변동 없음':'')+'</span></summary>'+detailText(s)+'</details>').join('')+(e.form?'<details><summary>당일 FORM 계산</summary>'+formHtml(e.form)+'</details>':'')+(e.checkpoint?'<details><summary>당일 SLUMP 판정 근거</summary>'+slumpHtml(e.checkpoint)+'</details>':'')+'</div>';
 }
 return {render,stop};
})();
