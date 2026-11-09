/* Administrator-only, explicitly requested single-player analysis. No background work. */
window.GGFCAbilityAudit=(()=>{
 const axes=['pac','sho','pas','dri','def','phy'],labels={goal:'득점',assist:'도움',save:'선방',sot:'유효슛',keyPass:'키패스',defSuccess:'수비성공',attendance:'명단 출석'};
 const E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const N=(v,d=4)=>{if(v===null||v===undefined||!Number.isFinite(Number(v)))return '—';const s=Number(v).toFixed(d);return s.includes('.')?s.replace(/\.?0+$/,''):s;};
 const signed=v=>Math.abs(v)<1e-10?'0':(v>0?'+':'')+N(v,6);
 let worker=null,token=0,report=null,page=0,root=null,names=[],timeout=null,assets=null,viewRequest=0;
 const requests={},dailyPages={loss:0,trend:0};
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
  root.innerHTML='<div class="card"><h3>능력치 변동 분석</h3><p>선수 한 명을 선택하고 분석 버튼을 눌러 주세요. 이름 입력만으로는 능력치를 계산하지 않습니다.</p><form class="aa-search"><label>선수 이름<input data-name type="search" autocomplete="off" placeholder="이름 입력" aria-controls="aaSuggestions" required></label><label>기준일 (선택)<input data-date type="date" min="'+abilityCareerStartDate()+'"></label><button class="btn primary" data-run type="submit">선택 선수 분석</button><button class="btn" data-cancel type="button" hidden>분석 취소</button></form><div id="aaSuggestions" class="aa-suggestions" aria-label="선수 검색 결과"></div><p class="note" data-status role="status">대기 중 · 전체 선수 일괄 분석을 실행하지 않습니다.</p><p class="note">현재 DB와 현재 설정으로 재계산합니다. 과거 설정 변경 전의 확정 이력은 아닙니다. 기준일을 비우면 기존 능력치 화면의 최신 기준을 사용합니다. 분석 결과는 DB에 저장하지 않습니다.</p></div><div data-result></div>';
  root.querySelector('[data-name]').value=previousName;root.querySelector('[data-date]').value=previousDate>=abilityCareerStartDate()?previousDate:'';
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
  const began=performance.now(),sourceDB=DB,sourceCounters=liveCounterTeamPlayerRecords;
  const valid=()=>run===token&&allowed()&&sourceDB===DB&&sourceCounters===liveCounterTeamPlayerRecords;
  try{
   worker=new Worker(assets.worker,{name:'GGFC single-player ability audit'});
   const w=worker;
   timeout=setTimeout(()=>{if(valid()){stop();message('분석 시간이 60초를 넘어 중단했습니다. 기준일을 좁히거나 기록 크기를 확인해 주세요.');}},60000);
   w.onerror=()=>{if(valid()){stop();message('분리 분석 파일을 불러오지 못했습니다. 앱 업데이트 확인 후 다시 시도해 주세요.');}};
   w.onmessage=e=>{
    if(!valid())return;
    if(e.data.type==='error'){stop();message('분석을 완료하지 못했습니다: '+e.data.message);return;}
    if(e.data.type==='page'){if(e.data.request===requests.events)showEvents(e.data);return;}
    if(e.data.type==='dailyPage'){if(e.data.request===requests[e.data.mode])showDaily(e.data);return;}
    if(e.data.type==='dayDetail'){if(e.data.request===requests[e.data.mode+'Detail'])renderDayDetail(e.data.day,e.data.mode);return;}
    if(e.data.type==='detail'){if(e.data.request===requests.eventsDetail)renderDetail(e.data.event);return;}
    if(e.data.type!=='result')return;
    clearTimeout(timeout);report=e.data.report;report.elapsed=performance.now()-began;report.workerMs=e.data.workerMs;
    root.querySelector('[data-run]').disabled=false;root.querySelector('[data-cancel]').hidden=true;
    message(player+' 분석 완료 · '+(report.elapsed/1000).toFixed(2)+'초 · 변동 합계 검증 통과');renderReport();
   };
   w.postMessage({type:'init'});
   // Only calculation data. Photos/logo bytes and UI settings never enter the worker.
   // Small batches yield between transfers, so touch/paint can continue.
   const items=['matches','attendance','goals','saves','fouls','moms','roster','soccerbee','specials'].map(key=>({key,value:sourceDB[key]||[],settings:false}));
   items.push({key:'liveCounterTeamPlayerRecords',value:sourceCounters,settings:false});
   for(const key of ['ability','seasons','teamSquads','appTeamPlayerRecords','goalkeeperEntries'])items.push({key,value:sourceDB.settings?.[key]??(key==='ability'||key==='seasons'?{}:[]),settings:true});
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
 function formHtml(f){
  if(f.mode!=='MATCH_PERFORMANCE')return '<p>FORM 평가 보류</p>';
  const d=report.formDiagnostics;if(!d)return '<p>'+E(f.reason)+'</p>';
  const names={g:'득점',a:'도움',sot:'유효슛',keyPass:'키패스',defSuccess:'수비성공',saves:'선방',ga:'키퍼실점',minutes:'키퍼 수행시간(분)',mom:'MOM'},percent=v=>N(v*100,2)+'%',range=list=>list.length?list[0].date+' ~ '+list.at(-1).date:'없음';
  const next=d.additionalCompleteGames===null?'설정 확인 필요':d.additionalCompleteGames===0?'현재 경기 수·기록칸 조건 충족':'앞으로 완전한 기록의 실제 출전 '+d.additionalCompleteGames+'경기';
  let html='<section class="aa-form-explain"><p class="aa-form-verdict '+(f.ready?'aa-form-ready':'aa-form-wait')+'"><b>'+(f.ready?'FORM 평가 가능':'FORM 평가 보류')+'</b> · '+E(f.reason)+'</p>'+
   '<div class="aa-form-summary"><span>실제 평가 대상 출전 <b>'+d.totalGames+'경기</b></span><span>최근 <b>'+d.recent.length+'/'+d.window+'경기</b></span><span>평소 <b>'+d.baseline.length+'경기</b> / 최대 '+d.maxBaseline+'</span><span>FORM 관련 공유 기록 연결 <b>'+d.sharedGames+'경기</b></span><span>마지막 공유 기록 경기일 <b>'+E(d.lastSharedMatchDate||'없음')+'</b></span></div>'+
   '<p><b>CURRENT 보정 '+signed(f.modifier)+' OVR</b> · 성장 배율 ×'+N(f.growthMultiplier)+' · 평가 기준 경기일 '+E(d.cutoff||'없음')+'</p>'+
   '<p>경기일 수가 아닌 <b>실제 개별 출전 경기 수</b>입니다. 최근 '+d.window+'경기는 '+E(range(d.recent))+', 그 직전 평소 비교 경기는 '+E(range(d.baseline))+'입니다. 두 구간은 겹치지 않습니다.</p>'+
   '<h4>1. 왜 계산되거나 보류되는지</h4>'+table(['조건','현재 값','필요 조건','판정'],[
    ['FORM 사용 설정',d.formEnabled?'켜짐':'꺼짐','켜짐',d.formEnabled?'충족':'미사용'],
    ['전체 실제 출전',d.totalGames+'경기',d.minimumMatches+'경기 이상',d.totalGames>=d.minimumMatches?'충족':'부족'],
    ['최근 창',d.recent.length+'경기',d.window+'경기',d.recent.length>=d.window?'충족':'부족'],
    ['평소 비교 창',d.baseline.length+'경기',d.minimumBaseline+'경기 이상',d.baseline.length>=d.minimumBaseline?'충족':'부족'],
    ['기준일 실제 출전',d.cutoffPlayed?'확인':'미출전', '새 FORM 평가를 위한 출전 확인',d.cutoffPlayed?'충족':'현재 정책상 보류'],
    ['역할별 기록 충족',percent(f.coverage||0),'포지션 가중치 합계 '+percent(d.roleCoverage)+' 이상',f.ready?'충족':!d.enoughGames?'경기 수 확인 후 평가':'아래 항목 확인']
   ])+
   '<p>각 항목은 최근·평소 구간에서 '+percent(d.coverage)+' 이상 기록되어야 합니다. 득점과 유효슛, 도움과 키패스는 <b>같은 경기에서 둘 다 확인</b>되어야 하며, 평소 구간에는 최소 '+d.minimumBaseline+'개의 유효 경기 기록이 필요합니다.</p>'+
   table(['능력치·필요 항목','역할 가중치','최근 유효 / 전체','최근 필요·부족','평소 유효 / 전체','평소 필요·부족','항목 기록 조건'],d.groups.map(g=>[
    '<b>'+g.axis.toUpperCase()+'</b> · '+E(g.fields.map(k=>names[k]).join(' + ')),percent(g.weight),g.recentKnown+' / '+d.recent.length,g.requiredRecent+'경기 필요 · '+g.recentMissing+'경기 부족',g.baselineKnown+' / '+d.baseline.length,g.requiredBaseline+'경기 필요 · '+g.baselineMissing+'경기 부족',g.ready?'충족':'미충족'
   ]))+
   '<p>포지션 역할은 '+E(d.roleFallback?'포지션 미지정 → AL 기본 역할':d.position)+'이며 역할 가중치는 '+Object.entries(d.role).map(([k,w])=>k.toUpperCase()+' '+percent(w)).join(' · ')+'입니다. 유효한 축의 가중치 합계가 '+percent(d.roleCoverage)+'에 도달해야 최종 FORM을 계산합니다. 충족한 축만으로 가중치를 다시 나눕니다.</p>';
  if(d.gk){const r=d.gk.recent,b=d.gk.baseline;html+='<h4>골키퍼 추가 조건</h4><p>일반 출전 이력 '+d.totalAppearances+'경기 중 FORM용 골키퍼 경기로 연결된 이력은 '+d.totalGames+'경기입니다. 아래 합계에는 선방·실점·수행시간이 모두 확인된 경기만 포함합니다.</p>'+table(['구간','선방','실점','상대 유효슛(선방+실점)','수행시간'],[['최근',r.saves,r.ga,r.shots,N(r.minutes)+'분'],['평소',b.saves,b.ga,b.shots,N(b.minutes)+'분']])+'<p>두 구간의 상대 유효슛 합계 '+(r.shots+b.shots)+'회 / 최소 '+d.gk.shotsRequired+'회 · 부족 '+d.gk.shotsMissing+'회. 최근·평소 각각 상대 유효슛과 수행시간이 0보다 커야 합니다. 추가 조건 '+(d.gk.sampleReady?'충족':'미충족')+'. 팀 실점과 키퍼별 실점 배정이 맞지 않는 경기는 아래에 사유를 표시합니다.</p>';}
  html+='<h4>2. 몇 경기를 더 기록해야 하는지</h4><p class="aa-form-projection"><b>'+E(next)+'</b><br>이 예상은 앞으로 출전하는 매 경기에서 필요한 경기기록과 앱 카운트가 모두 확인된다는 가정의 경기 수·기록 충족도 계산입니다. 경기력 향상이나 FORM 점수 변화 자체를 예측한 값은 아닙니다.'+(d.gk?' 골키퍼 상대 유효슛·수행시간 조건은 별도입니다.':'')+'</p>'+
   '<p>기존 비교 구간의 빈칸을 보완하면 새 경기를 기다리지 않고 조건을 충족할 수도 있습니다. 위 부족 수와 아래 경기 목록을 확인하세요. 최근부터 모든 평가 항목이 연속으로 확인된 경기는 '+d.completeStreak+'경기입니다.</p>'+
   '<p>기본 예시로 과거 출전이 충분히 있고 평소 20경기가 모두 미기록이면, 최근 5경기와 평소 20경기 중 16경기 기록이 필요합니다. 최근부터 연속으로 완전한 기록을 채우는 경우 <b>21경기를 채워야 하는 예</b>가 생깁니다. 출전 이력이 8경기뿐이고 모두 기록되어 있으면 최근 5 + 평소 3으로도 평가할 수 있습니다. 현재 선수·설정에 맞춘 값은 위 예상입니다.</p>';
  if(!d.formEnabled)html+='<p class="aa-form-wait">현재 FORM 사용 설정이 꺼져 있습니다. 기록을 채워도 FORM을 적용하지 않습니다.</p>';
  if(!d.cutoffPlayed)html+='<p class="aa-form-wait">기준 경기일에 실제 출전하지 않아 현행 정책상 FORM이 보류됩니다. 미출전 시 이전 FORM을 유지하는 정책으로 변경한 상태는 아닙니다.</p>';
  const fields=d.position==='GR'?['saves','ga','minutes','mom']:['g','sot','a','keyPass','defSuccess','mom'];
  const rowsHtml=(rows,recent)=>table(['순서','경기일','경기번호 / 경기','팀',...(recent&&d.position!=='GR'?['최근 가중치']:[]),...fields.map(k=>names[k]),'확인 사항'],rows.map(r=>[
   r.index,E(r.date),E(r.no+' / '+r.round),E(r.team),...(recent&&d.position!=='GR'?[percent(r.recentWeight)]:[]),...fields.map(k=>(r.values[k]===null?(r.inputValues[k]!==undefined?N(r.inputValues[k])+'<small class="aa-down">평가 제외</small>':'<span class="aa-down">'+(['g','a','ga','minutes'].includes(k)?'미확인':'미기록')+'</span>'):N(r.values[k]))+(r.origins[k]&&r.origins[k]!=='미기록'?'<small class="aa-record-origin">'+E(r.origins[k])+'</small>':'')),E(r.notes.join(' · ')||'—')
  ]));
  html+='<h4>3. 이번 계산에 사용한 경기와 항목</h4><p>오래된 경기부터 표시합니다. <b>공유</b> 표시는 앱에서 공유 저장한 기록입니다. ‘평가 제외’는 입력은 있지만 기록 검증 문제로 FORM에 사용하지 않는 값입니다. 0은 검수된 0회이며 미기록과 다릅니다.</p><h5>최근 '+d.recent.length+'경기</h5>'+rowsHtml(d.recent,true)+'<details class="aa-form-baseline"><summary>평소 비교 '+d.baseline.length+'경기 목록 보기</summary>'+rowsHtml(d.baseline,false)+'</details>';
  if(d.unlinkedKeeperCount)html+='<details class="aa-form-baseline"><summary>골키퍼 경기 연결 확인 '+d.unlinkedKeeperCount+'경기 · 최근 '+d.unlinkedKeeperGames.length+'경기 보기</summary><p>선방을 저장했어도 키퍼실점·수행시간이 연결되지 않으면 GK FORM 표본이 되지 않습니다. 실제 골키퍼로 출전한 경기는 원본 키퍼실점·시간·배정을 보완하세요. 필드 선수로 뛴 경기를 임의로 골키퍼 경기로 바꾸지는 않습니다.</p>'+rowsHtml(d.unlinkedKeeperGames,false)+'</details>';
  html+='<h4>4. 실제 수치 대입과 계산식</h4>';
  if(d.position==='GR'){
   const r=d.gk.recent,b=d.gk.baseline,sr=r.shots?r.saves/r.shots:null,sb=b.shots?b.saves/b.shots:null,gr=r.minutes?r.ga/r.minutes*15:null,gb=b.minutes?b.ga/b.minutes*15:null,q=d.gk.recent.known/(d.gk.recent.known+d.smoothingMatches);
   html+=table(['지표','최근','평소'],[['선방률',sr===null?'미확인':percent(sr),sb===null?'미확인':percent(sb)],['15분당 실점',N(gr),N(gb)]])+ '<p>선방률 변화 = 최근 선방률 − 평소 선방률<br>실점률 변화 = (최근 15분당 실점 − 평소 15분당 실점) ÷ max(평소 15분당 실점, 1)<br>표본 완화 = 최근 유효 경기 수 ÷ (최근 유효 경기 수 + '+d.smoothingMatches+') = '+N(q)+'<br>DEF 변화지수 = clamp((선방률 변화 × 0.7 − 실점률 변화 × 0.3) × 표본 완화, −1, +1)</p><p>실제 DEF 변화지수 '+N(f.indices?.def)+' · 골키퍼는 최근 경기의 횟수·시간을 합산하며 경기별 최근 가중 평균은 사용하지 않습니다.</p>';
  }else{
   const floors={g:.25,sot:.5,a:.25,keyPass:.5,defSuccess:1};
   html+='<p>최근 가중 평균 R = Σ(확인된 경기 기록 × 해당 경기 가중치) ÷ Σ(그 경기 가중치). 최신 경기부터 '+(report.cfg.form.recency||[]).map(percent).join(' · ')+'를 적용합니다. 평소 평균 B = 같은 항목 묶음이 확인된 비교 경기의 합계 ÷ 그 유효 경기 수입니다.</p>'+
    '<p>표본 보정 S = (R × 최근 유효 경기 수 n + B × '+d.smoothingMatches+') ÷ (n + '+d.smoothingMatches+')<br>항목 변화지수 = clamp((S − B) ÷ max(B, 항목 최소 분모), −1, +1)</p>'+
    table(['항목','최근 가중 평균 R','평소 평균 B','최근 유효 n','표본 보정 S','최소 분모','변화지수'],Object.entries(floors).map(([k,floor])=>{const v=f.metrics?.[k];return [names[k],N(v?.recent),N(v?.baseline),v?.recentKnown??'—',N(v?.smoothed),N(floor),N(v?.change)];}))+
    '<p>SHO 변화 = 득점 변화 × 0.4 + 유효슛 변화 × 0.6<br>PAS 변화 = 도움 변화 × 0.4 + 키패스 변화 × 0.6<br>DEF 변화 = 수비성공 변화</p>'+table(['SHO 변화','PAS 변화','DEF 변화'],[[N(f.indices?.sho),N(f.indices?.pas),N(f.indices?.def)]]);
  }
  html+='<p>종합 변화 = Σ(유효한 축의 변화지수 × 포지션 역할 가중치) ÷ 유효한 축의 가중치 합계 = '+(f.ready?N(f.performance):'평가 조건 미충족으로 미계산')+'<br>MOM 보정 = min(1, 최근 MOM '+d.momCount+'회 × '+N(report.cfg.growthPolicy.formMom)+') = '+N(d.momBonus)+(f.ready?'':' (평가 보류 시 미적용)')+'<br>최종 FORM = clamp(종합 변화 ÷ '+N(d.fullFormChange)+' × '+N(d.formLimit)+' + MOM 보정, −'+N(d.formLimit)+', +'+N(d.formLimit)+')<br>실제 적용값 = <b>'+signed(f.modifier)+' OVR</b>'+(f.ready?'':' · 평가 조건 미충족으로 수치를 적용하지 않고 보정 0')+'</p>'+
   '<p>성장 배율 = clamp(1 + FORM × 0.025, 0.9, 1.1) = ×'+N(f.growthMultiplier)+'<br>CURRENT OVR 원점수 = clamp(BASE OVR 원점수 '+N(report.result.baseOvrRaw)+' + 적용 FORM '+signed(f.modifier)+', '+report.cfg.scoreMin+', '+report.cfg.scoreMax+') = '+N(report.result.currentOvrRaw)+'</p>'+
   '<p>식에서 Σ는 합계, max는 더 큰 값, min은 더 작은 값, clamp는 최솟값~최댓값 범위로 제한한다는 뜻입니다. 필드 선수의 항목 변화지수 0.1은 +10%, −0.5는 −50% 변화입니다. 여기 표시한 OVR은 소수 원점수이므로 선수카드의 정수 표시와 차이가 있을 수 있습니다.</p>'+
   '<p>FORM이 0이어도 평가 보류와 정상 중립은 다릅니다. 경기력이 평소와 비슷하거나, 자료 부족·설정 꺼짐·기준일 미출전이면 0일 수 있습니다. 출석·결석·개인파울은 FORM에 직접 가감하지 않습니다. MOM만으로 자료 부족 조건을 통과하지는 않습니다.</p></section>';
  return html;
 }
 function slumpHtml(l){
  if(report.cfg.growthPolicy){const x=report.result.growthPolicy.sustainedState;return "<p>기존 SLUMP 감점은 중복 적용하지 않습니다. 새 지속 부진 BASE 조정 "+x.events.length+"회.</p>";}

  if(!l)return '<p>판정 데이터 없음</p>';
  const c=report.cfg.slump,metricNames={g:'득점/경기',a:'도움/경기',sot:'유효슛/경기',keyPass:'키패스/경기',defSuccess:'수비성공/경기',saveRate:'선방률',ga15:'15분당 실점'},legacy=l.mode==='legacy';
  const severe=legacy?70:c.severePerformance,critical=legacy?60:c.criticalPerformance;
  const formula=l.position==='GR'?'GR DEF = 선방률 PI × 70% + 15분당 실점 PI × 30%. 실점 PI는 기준 실점률 ÷ 최근 실점률 × 100으로 역산합니다.':'SHO = 득점 PI × 60% + 유효슛 PI × 40% · PAS = 도움 PI × 50% + 키패스 PI × 50% · DEF = 수비성공 PI. 종합 가중치 '+Object.entries(report.slumpWeights[l.position]||{}).map(([k,v])=>k.toUpperCase()+' '+N(v*100,2)+'%').join(' / ')+' · MOM 가산 '+N(l.momBonus||0);
  return '<p>상태 <b>'+E(l.status)+'</b> · PI '+N(l.overall)+' · 최근 '+l.recentGames+'경기 / 기준 '+l.baselineGames+'경기 · 개인 기준 고정일 '+E(l.referenceDate||'없음')+'</p><p>판정 기준: 최근 '+c.recentGames+'경기 / 기준 최대 '+c.baselineGames+'경기(최소 '+c.minimumBaselineGames+') · PI ≤ '+c.performanceTrigger+' · '+c.persistenceRounds+'R 지속 · '+c.interval+'R 간격</p><p>현재 지속 '+(l.persistence||0)+'R · 감점 체크포인트 '+(l.checkpoint?'해당':'아님')+' · 실제 출전 '+(l.played?'있음':'없음')+' · 데이터 충족 '+(l.ready?'충족':'미충족')+'</p><p>축 PI &lt; '+critical+' → −'+c.criticalDrop+' / &lt; '+severe+' → −'+c.severeDrop+' / ≤ '+c.performanceTrigger+' → −'+c.slumpDrop+' · 연간 신규 감점 한도 '+c.seasonCap+' OVR</p>'+(legacy?'<p>이전 SLUMP 방식: FORM ≤ '+c.formTrigger+' 조건도 충족해야 하며 영구 감점으로 적용됩니다.</p>':'<p>회복형 전환일 '+E(c.recoveryStartDate)+' · 축별 회복 PI ≥ '+c.recoveryPerformance+'가 '+c.recoveryRounds+'R 지속하면 회복 시작 잔액의 '+c.recoveryPercent+'%씩 복구합니다.</p>')+'<p>일반 지표 PI = 최근 평균 ÷ 기준 평균 × 100, 50~120으로 제한. 둘 다 0이면 100, 기준만 0이고 최근 값이 양수이면 120입니다. '+E(formula)+' 누락 지표는 제외하고 가중치를 재정규화합니다.</p>'+table(['지표','최근 값','기준 값','PI'],Object.entries(l.metrics||{}).map(([k,m])=>[E(metricNames[k]||k),N(m.recent),N(m.baseline),N(m.score)]))+table(['축','SHO PI','PAS PI','DEF PI'],[['축별 판정',N(l.indices?.sho),N(l.indices?.pas),N(l.indices?.def)]])+'<p class="note">— 는 미기록 또는 판정 불가입니다. 데이터 부족을 0점으로 처리하지 않습니다. 회복형 SLUMP는 CORE를 깎지 않고 BASE에 잔액을 차감합니다. 이전 방식의 영구 감점은 별도 내역입니다.</p>';
 }
 function initialHtml(){
  const r=report.result,i=r.initialSkills,b=r.soccerBeeInitial?.evaluation,c=report.cfg;
  return table(['축','시작 값','근거'],axes.map(k=>[k.toUpperCase(),N(r.start[k]),['sho','pas'].includes(k)?(i.source==='PREVIOUS_YEAR'?i.year+'년 기록 · 보정 경기당 '+N(k==='sho'?i.adjustedGpr:i.adjustedApr)+' · 백분위 '+N(k==='sho'?i.shoPercentile:i.pasPercentile):'현재 기록지 재계산 · 고정 시작값'):(Number.isFinite(b?.[k])?'시작 시점 SoccerBee · '+E(b.measurementDates[k])+' · 측정 지수 '+N(b.index[k]):'유효 측정 없음 · 미측정 초기값')]))+
   '<p>SHO/PAS는 설정 시작값에서 현재 기록지의 실제 실적을 순서대로 반영합니다. 이전 연도 백분위 초기 배치는 사용하지 않습니다.</p>'+
   '<p class="note">경기 시작 후 첫 SoccerBee 측정은 실제 측정일의 변동 내역에 표시됩니다. 기존 경기 성장분은 유지됩니다.</p>';
 }
 function renderReport(){
  if(!allowed()||!report)return;
  const r=report.result,box=root.querySelector('[data-result]');
  box.innerHTML='<article class="card"><h3>'+E(report.player)+' · '+E(report.cutoff)+' 기준</h3>'+(report.enabled?'':'<p class="note">능력치 시스템이 OFF입니다. 아래는 엔진 계산 참고값이며 공개 화면 적용 상태와 구분해 주세요.</p>')+'<div class="aa-summary"><div>BASE OVR<b>'+N(r.baseOvrRaw)+'</b><small>표시 '+r.baseOvr+' · 내림</small></div><div>FORM<b>'+signed(r.form.modifier)+'</b><small>레벨 '+r.form.level+' · 성장 ×'+r.form.growthMultiplier+'</small></div><div>CURRENT OVR<b>'+r.currentOvr+'</b><small>원점수 '+N(r.currentOvrRaw)+' · 반올림</small></div></div><p>포지션 '+E(r.position||'기본 가중치')+' · OVR = '+axes.map(k=>k.toUpperCase()+' × '+N(report.weights[k]*100,2)+'%').join(' + ')+'</p>'+table(['능력치','시작','상승 합계','하락 합계','CORE','SLUMP 잔액','BASE 원점수','화면 표시'],axes.map(k=>{const totals=report.axisTotals[k];return [k.toUpperCase(),N(r.start[k]),deltaCell(totals.up),deltaCell(totals.down),N(r.coreSkills[k]),N(r.longForm.balance[k]||0),N(r.career[k]),r.display[k]];}))+'<p class="note">시작 + 상승 합계 + 하락 합계 = BASE 원점수 검증 완료. 소수점은 화면에서 최대 6자리로 줄여 표시합니다. CORE에는 과거 영구 감점이 포함될 수 있습니다. CURRENT는 BASE OVR + FORM 보정을 상·하한 제한 후 반올림한 값입니다.</p></article><details class="card"><summary>초기 능력치 근거</summary><div data-initial></div></details><details class="card"><summary>현재 FORM 상세 계산</summary><div data-form></div></details><details class="card"><summary>지속 부진 BASE 보정</summary><div data-slump></div></details>'+dailyPanelsHtml()+'<article class="card"><h3>날짜별 변동 내역</h3><div class="aa-filters"><label>능력치 <select data-axis><option value="">전체</option>'+axes.map(k=>'<option value="'+k+'">'+k.toUpperCase()+'</option>').join('')+'</select></label><label>유형 <select data-type><option value="">전체</option><option value="round">경기 기록</option><option value="sb">SoccerBee</option></select></label></div><p class="note">최신 날짜부터 12건씩 표시합니다. 한 날짜의 ‘이유 보기’를 누르면 원자료, 적용 배율, 증감 값, 보정 사유가 나옵니다. 능력치 필터는 해당 축의 변동이 있는 날짜만 표시합니다.</p><div data-events></div><div class="aa-pages"><button class="btn" data-prev>이전</button><span data-pages></span><button class="btn" data-next>다음</button></div><div data-detail></div></article><details class="card"><summary>계산 제외·연결 경고 ('+report.issueCount+')</summary><p class="note">검증 과정에서 발견된 DB 공통 경고입니다. 선택 선수와 직접 관계없는 경고도 포함됩니다. 화면 부담을 줄이기 위해 경기 경고 50건·팀 기록 연결 경고 50건까지만 표시합니다. 해당 경기의 충돌·누락을 확인해 주세요.</p><div data-issues></div></details>';
  const lazy=(key,fn)=>{const el=box.querySelector('[data-'+key+']');el.parentElement.addEventListener('toggle',()=>{if(el.parentElement.open&&!el.dataset.ready){el.innerHTML=fn();el.dataset.ready='1';}});};
  lazy('initial',initialHtml);lazy('form',()=>formHtml(r.form));lazy('slump',()=>slumpHtml(r.longForm));lazy('issues',()=>'<pre>'+E(JSON.stringify([...report.issues,...report.teamIssues],null,2))+'</pre>');
  for(const key of ['axis','type'])box.querySelector('[data-'+key+']').onchange=()=>{page=0;renderEvents();};
  box.querySelector('[data-prev]').onclick=()=>{page--;renderEvents();};box.querySelector('[data-next]').onclick=()=>{page++;renderEvents();};
  box.querySelector('[data-events]').onclick=e=>{const b=e.target.closest('[data-event]');if(b&&worker){root.querySelector('[data-detail]').textContent='상세 기록을 불러오는 중입니다…';sendRequest('eventsDetail',{type:'detail',index:Number(b.dataset.event)});}};
  bindDailyPanels(box);renderEvents();renderDaily('loss');renderDaily('trend');
 }
 function renderEvents(){
  if(!worker||!allowed())return;
  const axis=root.querySelector('[data-axis]').value,eventType=root.querySelector('[data-type]').value;
  root.querySelector('[data-detail]').innerHTML='';root.querySelector('[data-events]').textContent='내역을 불러오는 중입니다…';root.querySelector('[data-prev]').disabled=true;root.querySelector('[data-next]').disabled=true;
  requests.eventsDetail=++viewRequest;sendRequest('events',{type:'page',axis,eventType,page});
 }
 function showEvents(data){
  page=data.page;
  root.querySelector('[data-events]').innerHTML=table(['날짜','유형',...axes.map(k=>k.toUpperCase()),'상세'],data.rows.map(e=>[E(e.date),e.type==='sb'?'측정':'경기',...axes.map(k=>deltaCell(e.delta[k])),'<button class="btn" data-event="'+e.i+'">이유 보기</button>']));
  root.querySelector('[data-pages]').textContent=(page+1)+' / '+data.pages+' · '+data.total+'건';root.querySelector('[data-prev]').disabled=page===0;root.querySelector('[data-next]').disabled=page===data.pages-1;
 }
 function sendRequest(key,payload){const request=++viewRequest;requests[key]=request;worker.postMessage({...payload,request});}
 function dailyPanelsHtml(){
  const summary=report.dailySummary||{};
  return '<article class="card aa-daily-card" data-daily="loss"><h3>날짜별 하락 내역</h3><p class="note">BASE 차감과 FORM 하락이 발생한 날짜만 모았습니다. BASE 칸은 성장과 상쇄되기 전 하락 요인 합계이므로 당일 최종 순변동과 다를 수 있습니다. FORM은 OVR 보정이며 개별 능력치 감점과 별개입니다.</p><div class="aa-filters"><label>하락 항목<select data-daily-axis><option value="">모든 하락 (BASE·FORM)</option><option value="base">BASE 차감만</option><option value="form">FORM 하락만</option>'+axes.map(k=>'<option value="'+k+'">'+k.toUpperCase()+' 차감</option>').join('')+'</select></label></div><div data-daily-rows></div>'+dailyPager()+'<div data-daily-detail></div></article>'+
   '<article class="card aa-daily-card" data-daily="trend"><h3>FORM · 부진 BASE 날짜별 변동</h3><div class="aa-daily-summary"><span>FORM 상승 <b>'+summary.formUp+'일</b></span><span>FORM 하락 <b>'+summary.formDown+'일</b></span><span>부진 BASE 상승 <b>'+summary.slumpUp+'일</b></span><span>부진 BASE 하락 <b>'+summary.slumpDown+'일</b></span></div><p class="note">날짜별 마지막 값을 직전 기록 날짜의 마지막 값과 비교합니다. 같은 날 측정과 경기가 있으면 한 줄로 합칩니다. OVR는 분석 기준일의 포지션 가중치로 비교하며 CURRENT는 상·하한 적용 후 원점수입니다.</p><p class="note">BASE 순변동에는 경기 성장·SoccerBee가 포함됩니다. 부진 BASE 조정은 지속 부진·이전 LONG FORM·SLUMP의 차감/복구분만 구분합니다. 현재 지속 부진 감점은 자동 환급하지 않으므로 FORM이 회복되어도 부진 BASE가 자동 상승하지 않습니다. 평가 보류는 실력 회복과 구분해 표시합니다.</p><div class="aa-filters"><label>비교 지표<select data-daily-metric><option value="">전체 지표</option><option value="form">FORM</option><option value="slump">부진 BASE 조정</option><option value="base">BASE 순변동</option><option value="current">CURRENT 순변동</option></select></label><label>변동 방향<select data-daily-direction><option value="">전체 (유지 포함)</option><option value="changed">변동 있음</option><option value="up">상승만</option><option value="down">하락만</option></select></label></div><div data-daily-rows></div>'+dailyPager()+'<div data-daily-detail></div></article>';
 }
 function dailyPager(){return '<div class="aa-pages"><button class="btn" type="button" data-daily-prev>이전</button><span data-daily-pages role="status"></span><button class="btn" type="button" data-daily-next>다음</button></div>';}
 function bindDailyPanels(box){
  for(const mode of ['loss','trend']){
   const panel=box.querySelector('[data-daily="'+mode+'"]');dailyPages[mode]=0;
   panel.querySelectorAll('select').forEach(el=>el.onchange=()=>{dailyPages[mode]=0;renderDaily(mode);});
   panel.querySelector('[data-daily-prev]').onclick=()=>{dailyPages[mode]--;renderDaily(mode);};
   panel.querySelector('[data-daily-next]').onclick=()=>{dailyPages[mode]++;renderDaily(mode);};
   panel.querySelector('[data-daily-rows]').onclick=e=>{const button=e.target.closest('[data-day]');if(button&&worker&&allowed()){panel.querySelector('[data-daily-detail]').textContent='상세 기록을 불러오는 중입니다…';sendRequest(mode+'Detail',{type:'dayDetail',mode,date:button.dataset.day});}};
  }
 }
 function renderDaily(mode){
  if(!worker||!allowed())return;const panel=root.querySelector('[data-daily="'+mode+'"]');
  requests[mode+'Detail']=++viewRequest;panel.querySelector('[data-daily-detail]').innerHTML='';panel.querySelector('[data-daily-rows]').textContent='내역을 불러오는 중입니다…';panel.querySelector('[data-daily-prev]').disabled=true;panel.querySelector('[data-daily-next]').disabled=true;
  sendRequest(mode,{type:'dailyPage',mode,page:dailyPages[mode],axis:panel.querySelector('[data-daily-axis]')?.value||'',metric:panel.querySelector('[data-daily-metric]')?.value||'',direction:panel.querySelector('[data-daily-direction]')?.value||''});
 }
 function transitionCell(before,after){return '<span class="aa-transition">'+N(before)+' <span aria-label="에서">→</span> <b>'+N(after)+'</b></span>';}
 function formState(f){return '<span class="aa-form-state '+(f.ready?'':'aa-pending')+'" title="'+E(f.reason)+'">'+(f.ready?'평가 가능':'평가 보류')+'</span>';}
 function showDaily(data){
  if(!allowed())return;const mode=data.mode,panel=root.querySelector('[data-daily="'+mode+'"]');dailyPages[mode]=data.page;
  const detail=d=>'<button class="btn" type="button" data-day="'+E(d.date)+'">'+(mode==='loss'?'하락 이유':'변동 이유')+'</button>';
  let html;
  if(!data.rows.length)html='<p class="aa-empty">'+(mode==='loss'?'선택 조건에 해당하는 하락 내역이 없습니다.':'선택 조건에 해당하는 날짜별 변동이 없습니다.')+'</p>';
  else if(mode==='loss')html=table(['날짜','하락 원인',...axes.map(k=>k.toUpperCase()),'BASE 차감 요인 (OVR)','FORM 하락 (OVR)','상세'],data.rows.map(d=>[E(d.date),'<span class="aa-reasons">'+d.reasons.map(E).join(' · ')+'</span>',...axes.map(k=>deltaCell(d.down[k])),deltaCell(d.baseDown),deltaCell(d.formDown),detail(d)]));
  else html=table(['날짜','FORM 전 → 후','FORM 증감','부진 BASE 조정','부진 누적 영향','BASE 전 → 후','BASE 순변동','CURRENT 전 → 후','CURRENT 증감','FORM 평가','상세'],data.rows.map(d=>[E(d.date),transitionCell(d.formBefore.modifier,d.formAfter.modifier),deltaCell(d.formDelta),deltaCell(d.slumpDelta),deltaCell(d.slumpTotal),transitionCell(d.baseBefore,d.baseAfter),deltaCell(d.baseDelta),transitionCell(d.currentBefore,d.currentAfter),deltaCell(d.currentDelta),formState(d.formAfter),detail(d)]));
  panel.querySelector('[data-daily-rows]').innerHTML=html;panel.querySelector('[data-daily-pages]').textContent=(data.page+1)+' / '+data.pages+' · '+data.total+'일';panel.querySelector('[data-daily-prev]').disabled=data.page===0;panel.querySelector('[data-daily-next]').disabled=data.page===data.pages-1;
 }
 function renderDayDetail(day,mode){
  const panel=root.querySelector('[data-daily="'+mode+'"]'),negative=mode==='loss',steps=day.events.flatMap(e=>e.steps.map(step=>({...step,type:e.type}))).filter(s=>!negative||axes.some(k=>s.delta[k]< -1e-10));
  const rows=steps.map(step=>[E(step.reason),step.type==='sb'?'측정':'경기',...axes.map(k=>deltaCell(negative?Math.min(0,step.delta[k]):step.delta[k]))]);
  panel.querySelector('[data-daily-detail]').innerHTML='<div class="aa-detail"><h3>'+E(day.date)+' · '+(negative?'하락 요인':'날짜별 변동')+' 상세</h3>'+table(['원인','유형',...axes.map(k=>k.toUpperCase())],rows)+'<p>FORM '+transitionCell(day.formBefore.modifier,day.formAfter.modifier)+' · 증감 '+deltaCell(negative?day.formDown:day.formDelta)+' OVR</p><p>'+formState(day.formAfter)+' '+E(day.formAfter.reason)+'</p>'+(negative?'<p class="note">음수인 단계만 표시했습니다. 당일 성장과 합산한 최종 BASE는 아래 전체 날짜별 변동 내역에서 확인할 수 있습니다.</p>':table(['항목','변동 전','변동 후','증감'],[['BASE OVR',N(day.baseBefore),N(day.baseAfter),deltaCell(day.baseDelta)],['FORM',N(day.formBefore.modifier),N(day.formAfter.modifier),deltaCell(day.formDelta)],['부진 BASE 조정','—','—',deltaCell(day.slumpDelta)],['CURRENT OVR',N(day.currentBefore),N(day.currentAfter),deltaCell(day.currentDelta)]]))+'</div>';
 }
 function detailText(s){
  const d=s.detail||{},c=report.cfg;
  if(s.reason==='경기 기록 성장')return '<p>기록 기본 가산 × 승점 × 현재 능력 성장률 × FORM 성장 배율</p>'+table(['축','기록 가산','승점 배율','능력 성장률','FORM 배율','적용 증감'],axes.map(k=>[k.toUpperCase(),N(d.add[k]),N(d.pm),N(d.rates[k]),N(d.fm),deltaCell(s.delta[k])]));
  if(s.reason==='연간 한도 출석 가산')return '<p>명단 출석일당 1회 · 연간 축당 '+N(d.axisCap)+'점 한도</p>'+table(['축','이번 출석 기여','올해 누적'],axes.map(k=>[k.toUpperCase(),N(d.applied[k]),N(d.annual[k])]));
  if(s.reason==='MOM 성장')return '<p>실제 MOM '+N(d.count)+'회 × 축별 가산 × 현재 능력 성장 완화 × FORM 배율 '+N(d.fm)+'</p>';
  if(s.reason==='페어플레이 분리')return '<p>개인파울 '+N(d.fouls)+'회 · 능력치 영향 0 · 페어플레이 및 팀파울 통계만 반영</p>';
  if(s.reason==='결석 직접 감점 미사용')return '<p>결석 자체로 BASE를 깎지 않습니다.</p>';
  if(s.reason==='상·하한')return '<p>'+d.min+'~'+d.max+' 범위로 제한합니다.</p>';
  if(s.reason==='지속 부진 BASE 보정')return '<p>부진 지속 '+N(d.streak)+'개 출전 경기일 · '+E(d.form.reason)+'</p>'+d.events.map(e=>'<p>가중 OVR 차감 '+N(e.actual)+' · '+Object.entries(e.loss).map(([k,v])=>k.toUpperCase()+' −'+N(v)).join(' / ')+'</p>').join('');
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
  el.innerHTML='<div class="aa-detail"><h3>'+E(e.date)+' · '+(e.type==='sb'?'SoccerBee':'경기 기록')+' 상세</h3>'+(r?'<p>명단 출석 '+(r.att?'있음':'없음')+' · 득점 '+r.g+' · 도움 '+r.a+' · 유효슛 '+r.sot+' · 키패스 '+r.keyPass+' · 수비성공 '+r.defSuccess+' · 선방 '+r.sv+' · MOM '+r.mom+' · 개인파울 '+r.f+' · '+r.w+'승 '+r.d+'무 '+r.l+'패</p>':'')+table(['능력치','변동 전 BASE','당일 순변동','변동 후 BASE'],axes.map(k=>[k.toUpperCase(),N(e.beforeBase[k]),deltaCell(e.delta[k]),N(e.afterBase[k])]))+e.steps.map(s=>'<details><summary>'+E(s.reason)+' <span class="aa-step-total">'+axes.filter(k=>Math.abs(s.delta[k])>1e-10).map(k=>k.toUpperCase()+' '+signed(s.delta[k])).join(' · ')+(!axes.some(k=>Math.abs(s.delta[k])>1e-10)?'변동 없음':'')+'</span></summary>'+detailText(s)+'</details>').join('')+(e.form?'<details><summary>당일 FORM 계산</summary>'+formHtml(e.form)+'</details>':'')+(e.checkpoint&&!report.cfg.growthPolicy?'<details><summary>당일 SLUMP 판정 근거</summary>'+slumpHtml(e.checkpoint)+'</details>':'')+'</div>';
 }
 return {render,stop};
})();
