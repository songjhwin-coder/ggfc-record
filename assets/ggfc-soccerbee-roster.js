/* SoccerBee appointments are separate from the recorded measurements and ability calculations. */
const SOCCERBEE_ROUND_LIMIT=53,SOCCERBEE_GROUP_SIZE=6,SOCCERBEE_TARGET=2;
const SOCCERBEE_ROUND_SIZE=2*SOCCERBEE_GROUP_SIZE;
let soccerBeeRoundSelection=null,soccerBeeDraft=null;

window.GGFCSoccerBeeRoster={
  get dirty(){return !!soccerBeeDraft?.dirty;},
  get draft(){return soccerBeeDraft?.backup?.()||null;},
  discard(){soccerBeeDraft=null;}
};

function soccerBeeAttendanceWindow(date){
  const start=new Date(date+'T00:00:00Z'),end=new Date(start);
  end.setUTCDate(end.getUTCDate()-1);
  const day=start.getUTCDate();
  start.setUTCDate(1);
  start.setUTCMonth(start.getUTCMonth()-6);
  const last=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,0)).getUTCDate();
  start.setUTCDate(Math.min(day,last));
  return {from:start.toISOString().slice(0,10),through:end.toISOString().slice(0,10)};
}

function soccerBeeMeasurementPlan(settings,year,half){
  const plan=settings.seasons?.[year]?.[half]||{},rounds={...plan.rounds};
  const legacy=normDate(settings.date);
  if(!rounds[1]&&legacy.slice(0,4)===year&&latestDbPeriodContext(legacy)?.half===half)rounds[1]={date:legacy};
  const protectedRound=Math.max(1,...Object.keys(rounds).map(Number).filter(number=>
    Number.isInteger(number)&&number>=1&&number<=SOCCERBEE_ROUND_LIMIT&&(rounds[number]?.date||rounds[number]?.completed===true)
  ));
  const count=Number(plan.roundCount);
  const roundCount=Number.isInteger(count)&&count>=1&&count<=SOCCERBEE_ROUND_LIMIT?count:15;
  return {managed:plan.managed===true,roundCount:Math.max(roundCount,protectedRound),protectedRound,rounds};
}

function soccerBeeParticipants(year){
  const available=draftRosterRows(''),yearOf=row=>String(row.year||'').match(/20[0-9]{2}|2100/)?.[0]||'';
  const years=[...new Set(available.map(yearOf).filter(Boolean))].sort().reverse();
  const rosterYear=years.includes(year)?year:(years[0]||'');
  const roster=new Map();
  for(const row of available){
    const rowYear=yearOf(row),key=normalizePlayerMatchKey(row.player);
    if((!rowYear||rowYear===rosterYear)&&(!roster.has(key)||rowYear&&!yearOf(roster.get(key))))roster.set(key,row);
  }
  const players=Array.from(roster,([key,row])=>{
    const player=String(row.player).trim();
    return {key,player,team:String(row.team||''),start:playerParticipationStart(player)};
  });
  return {rosterYear,players};
}

function soccerBeeAttendanceRanker(players){
  const matches=verifiedRecords().matches;
  const latest=latestMatchDate()||recordToday();
  const next=new Date(latest+'T00:00:00Z');
  next.setUTCDate(next.getUTCDate()+1);
  const fallback=next.toISOString().slice(0,10),cache=new Map();
  return date=>{
    const anchor=date||fallback;
    if(cache.has(anchor))return cache.get(anchor);
    const {from,through}=soccerBeeAttendanceWindow(anchor);
    const list=matches.filter(match=>{const day=normDate(match.date);return day>=from&&day<=through;});
    const attendance=new Map();
    if(list.length){
      for(const row of queryPlayerStats(list)){
        const key=normalizePlayerMatchKey(row.player);
        if(row.att>(attendance.get(key)?.att||0))attendance.set(key,row);
      }
    }
    const rows=players.map(row=>{
      const recorded=attendance.get(row.key);
      const team=row.team||recorded?.mainTeam||'';
      const att=recorded?.att||0,teamGames=recorded?.teamGames??(list.length?playerOpportunityCount(row.player,list,team):0);
      return {...row,team,att,teamGames,rate:teamGames?pct(att,teamGames):null};
    });
    const ranked={from,through,rows};
    cache.set(anchor,ranked);
    return ranked;
  };
}

function soccerBeeSlotPlayers(slot){
  return Array.isArray(slot?.assignment?.players)?slot.assignment.players.filter(row=>row?.player):[];
}

function soccerBeeChecked(slot){
  return new Set(Array.isArray(slot?.checked)?slot.checked:[]);
}

function soccerBeeCompareAttendance(a,b){
  return (b.rate??-1)-(a.rate??-1)||b.att-a.att||compareNamesKo(a.player,b.player);
}

function buildSoccerBeeSchedule(plan,players,rank,regenerate,lockedRound){
  const rounds=Array.from({length:plan.roundCount},(_,i)=>plan.rounds[i+1]||{});
  const completed=new Map(),projected=new Map(),carry=new Set();
  for(const slot of rounds){
    if(slot.completed!==true)continue;
    const checked=soccerBeeChecked(slot);
    for(const key of new Set(soccerBeeSlotPlayers(slot).map(row=>normalizePlayerMatchKey(row.player)))){
      if(checked.has(key))completed.set(key,(completed.get(key)||0)+1);
    }
  }
  for(const [key,total] of completed)projected.set(key,total);
  const results=rounds.map((slot,index)=>{
    if(slot.completed===true){
      const checked=soccerBeeChecked(slot);
      for(const row of soccerBeeSlotPlayers(slot)){
        const key=normalizePlayerMatchKey(row.player);
        if(checked.has(key))carry.delete(key);
        else if((completed.get(key)||0)<SOCCERBEE_TARGET)carry.add(key);
      }
      return slot;
    }
    const date=slot.date||'';
    let assignment=slot.assignment;
    if(!assignment||assignment.date!==date||(regenerate&&index+1!==lockedRound)){
      const {from,through,rows}=rank(date);
      const remaining=rounds.slice(index).filter(item=>item.completed!==true);
      const candidates=rows.filter(row=>(!date||!row.start||row.start<=date)&&(projected.get(row.key)||0)<SOCCERBEE_TARGET)
        .map(row=>({...row,slack:remaining.filter(item=>!item.date||!row.start||row.start<=item.date).length-SOCCERBEE_TARGET+(projected.get(row.key)||0)}));
      candidates.sort((a,b)=>Number(carry.has(b.key))-Number(carry.has(a.key))||
        a.slack-b.slack||(projected.get(a.key)||0)-(projected.get(b.key)||0)||soccerBeeCompareAttendance(a,b));
      assignment={date,from,through,players:candidates.slice(0,SOCCERBEE_ROUND_SIZE).map(({player,team,att,teamGames,rate})=>({player,team,att,teamGames,rate}))};
    }
    const assigned=soccerBeeSlotPlayers({assignment}),previousChecks=soccerBeeChecked(slot);
    for(const row of assigned){
      const key=normalizePlayerMatchKey(row.player);
      projected.set(key,(projected.get(key)||0)+1);
      carry.delete(key);
    }
    const checked=assigned.map(row=>normalizePlayerMatchKey(row.player)).filter(key=>previousChecks.has(key));
    return {...slot,date,assignment,checked};
  });
  const missing=players.map(row=>({player:row.player,count:Math.max(0,SOCCERBEE_TARGET-(projected.get(row.key)||0))})).filter(row=>row.count);
  return {rounds:results,completed,projected,missing,remaining:missing.reduce((sum,row)=>sum+row.count,0)};
}

function renderSoccerBeeGroupTables(slot,checked,editable,completed,attempts){
  const players=soccerBeeSlotPlayers(slot);
  return [0,SOCCERBEE_GROUP_SIZE].map((offset,i)=>{
    const slots=Array.from({length:SOCCERBEE_GROUP_SIZE},(_,j)=>{
      const row=players[offset+j];
      if(!row)return '<tr><td>'+(j+1)+'</td><td colspan="5">빈자리</td></tr>';
      const key=normalizePlayerMatchKey(row.player),done=checked.has(key),rate=row.teamGames?esc(row.rate)+'%':'—';
      const attempt=Math.min(SOCCERBEE_TARGET,(attempts.get(key)||0)+1)+'차';
      const label=attempt+(completed?(done?' 완료':' 미측정'):'');
      const check='<input type="checkbox" data-sb-player="'+esc(key)+'" aria-label="'+esc(row.player)+' 측정 완료"'+
        (done?' checked':'')+(editable?'':' disabled')+'><span class="sb-measurement-attempt">'+label+
        '</span><span class="sb-measurement-print-status">'+label+'</span>';
      return '<tr><td>'+(j+1)+'</td><th scope="row">'+esc(row.player)+'</th><td>'+esc(teamDisplayName(row.team)||'—')+'</td><td>'+esc(row.att)+' / '+esc(row.teamGames)+'</td><td>'+rate+'</td><td>'+check+'</td></tr>';
    }).join('');
    return '<section class="sb-measurement-group"><h4>'+(i+1)+'조</h4><table><thead><tr><th scope="col">번호</th><th scope="col">선수명</th><th scope="col">소속</th><th scope="col">출석 / 대상</th><th scope="col">출석률</th><th scope="col">측정 완료</th></tr></thead><tbody>'+slots+'</tbody></table></section>';
  }).join('');
}

function renderSoccerBeeAllPlayers(rows,rosterYear,result,slot,date){
  const picked=new Map(soccerBeeSlotPlayers(slot).map((row,i)=>[normalizePlayerMatchKey(row.player),i<SOCCERBEE_GROUP_SIZE?'1조':'2조']));
  const body=rows.slice().sort(soccerBeeCompareAttendance).map(row=>{
    const rate=row.teamGames?row.rate+'%':'—';
    const done=result.completed.get(row.key)||0,planned=(result.projected.get(row.key)||0)-done;
    const group=picked.get(row.key)||(date&&row.start&&row.start>date?'등록 시작 전':'—');
    return '<tr><th scope="row">'+esc(row.player)+'</th><td>'+esc(teamDisplayName(row.team)||'—')+'</td><td>'+row.att+' / '+row.teamGames+'</td><td>'+rate+'</td><td>'+done+' / 2회</td><td>'+planned+'회</td><td>'+group+'</td></tr>';
  }).join('');
  return '<h3>전체 선수 명단 · '+rows.length+'명</h3><p>엑셀 DB '+(rosterYear?esc(rosterYear)+'년 명단':'선수명단')+' · 직전 6개월 출석률</p>'+
    (body?'<div class="tablewrap"><table><thead><tr><th scope="col">선수명</th><th scope="col">소속</th><th scope="col">출석 / 대상</th><th scope="col">출석률</th><th scope="col">측정 완료</th><th scope="col">남은 배정</th><th scope="col">선택 라운드</th></tr></thead><tbody>'+body+'</tbody></table></div>':'<p class="empty">엑셀 DB에 등록된 선수가 없습니다.</p>');
}

function renderSoccerBeeMeasurementRoster(){
  if(!admin||!GGFC.authorized)return;
  const element=id=>document.getElementById('sbMeasurement'+id);
  const form=element('Controls'),year=element('Year'),half=element('Half'),count=element('RoundCount');
  const round=element('Round'),date=element('Date'),saveButton=element('Save'),completeButton=element('Complete');
  const editButton=element('EditCompletion'),refreshButton=element('Refresh'),cancelButton=element('Cancel');
  const printButton=element('Print'),status=element('Status');
  const sheet=element('Sheet'),roster=element('Roster'),overview=element('Rounds');
  const config=()=>DB.settings?.soccerbeeMeasurement||{};
  const defaultDate=normDate(config().date)||latestMatchDate()||recordToday();
  const selection=soccerBeeRoundSelection||config().selection||{};
  let base,participants,rank,result,active,selected,saving=false,dateError='';
  year.innerHTML=Array.from({length:101},(_,i)=>'<option value="'+(2000+i)+'">'+(2000+i)+'년</option>').join('');
  year.value=String(selection.year||defaultDate.slice(0,4));
  if(!year.value)year.value=recordToday().slice(0,4);
  half.value=selection.half==='H1'||selection.half==='H2'?selection.half:latestDbPeriodContext(defaultDate)?.half||'H1';
  const edits=()=>soccerBeeDraft;
  const slot=()=>result.rounds[selected-1];
  const correction=()=>edits().correction;
  const checks=()=>correction()?.checked??(selected===active&&edits().checked?edits().checked:soccerBeeChecked(slot()));
  const scheduleDirty=()=>edits().count!==null||edits().dates.size>0||edits().regenerate;
  const correctionChanged=()=>{
    const draft=correction();
    if(!draft)return false;
    const saved=soccerBeeChecked(base.rounds[draft.round]);
    return saved.size!==draft.checked.size||[...draft.checked].some(key=>!saved.has(key));
  };
  const changed=()=>scheduleDirty()||edits().checked!==null||correctionChanged();
  const editable=()=>!!slot()&&selected===active&&!!slot().date&&base.managed&&!scheduleDirty()&&!dateError&&date.validity.valid&&count.validity.valid&&!saving;
  const note=message=>{status.textContent=message;};

  function controls(){
    const correcting=!!correction(),completed=slot().completed===true;
    year.disabled=half.disabled=count.disabled=round.disabled=saving||correcting;
    date.disabled=saving||completed||(selected===active&&checks().size>0);
    const invalid=!count.validity.valid||!date.validity.valid||!!dateError;
    saveButton.disabled=saving||correcting||invalid||(!changed()&&base.managed);
    completeButton.disabled=!editable();
    editButton.hidden=!completed;
    editButton.disabled=saving||!completed||(correcting?!correctionChanged():changed()||!soccerBeeSlotPlayers(slot()).length);
    editButton.textContent=correcting?'완료 기록 저장':'완료 기록 수정';
    refreshButton.disabled=saving||correcting||!active;
    cancelButton.disabled=saving||(!correcting&&!changed());
    printButton.disabled=saving||correcting||invalid||!base.managed||scheduleDirty()||!slot().date||!soccerBeeSlotPlayers(slot()).length;
    overview.querySelectorAll('[data-sb-round]').forEach(button=>button.disabled=saving||correcting);
  }

  function describe(){
    if(correction())note('측정 완료 체크를 정정한 뒤 완료 기록 저장을 누르세요. 저장하면 남은 명단을 다시 배정합니다.');
    else if(!count.validity.valid)note('라운드 수는 '+base.protectedRound+'~'+SOCCERBEE_ROUND_LIMIT+'R로 설정해 주세요.');
    else if(!date.validity.valid)note('측정일은 2000년부터 2100년 사이로 입력해 주세요.');
    else if(dateError)note(dateError);
    else if(slot().completed===true){
      if(changed())note('편집 중인 일정이나 체크를 먼저 저장하거나 취소해 주세요.');
      else if(!soccerBeeSlotPlayers(slot()).length)note('라운드 완료 · 배정된 선수가 없습니다.');
      else note('라운드 완료 · 측정 결과를 정정하려면 완료 기록 수정을 누르세요.');
    }
    else if(!base.managed||scheduleDirty())note('편성 미리보기입니다. 일정·명단 저장을 누르면 전체 라운드에 반영됩니다.');
    else if(!slot().date)note('이 라운드의 측정일을 입력하고 일정·명단 저장을 눌러 주세요.');
    else if(selected===active)note('측정한 선수만 체크한 후 라운드 완료를 누르세요. 미측정 선수는 다음 라운드에 우선 배정됩니다.');
    else note(active+'R을 완료하면 이후 명단이 갱신됩니다.');
  }

  function sharedSettings(rounds,nextRound){
    const settings=config(),seasons={...settings.seasons},yearPlans={...seasons[year.value]};
    yearPlans[half.value]={
      ...yearPlans[half.value],managed:true,roundCount:rounds.length,
      rounds:Object.fromEntries(rounds.map((item,i)=>[i+1,item]))
    };
    seasons[year.value]=yearPlans;
    return {...settings,seasons,selection:{year:year.value,half:half.value,round:nextRound}};
  }

  function checkedRounds(){
    return result.rounds.map((item,i)=>i+1===active&&edits().checked?
      {...item,checked:[...edits().checked]}:item);
  }

  function rebuildOpenRounds(rounds,lockedRound=null){
    const plan={roundCount:rounds.length,rounds:Object.fromEntries(rounds.map((item,i)=>[i+1,item]))};
    return withRenderCalculationCache(()=>buildSoccerBeeSchedule(plan,participants.players,rank,true,lockedRound).rounds);
  }

  function correctedRounds(rounds){
    const {round,checked}=correction();
    rounds[round-1]={...rounds[round-1],checked:[...checked]};
    // Keep the next round's saved measurements and its roster if it has already started.
    const lockedRound=active&&soccerBeeChecked(rounds[active-1]).size?active:null;
    return rebuildOpenRounds(rounds,lockedRound);
  }

  function refreshDraft(){
    edits().dirty=changed();
    GGFC.refreshUI();
  }

  function drawOverview(){
    const complete=result.rounds.length-result.rounds.filter(item=>item.completed!==true).length;
    const min=participants.players.length?Math.max(SOCCERBEE_TARGET,Math.ceil(participants.players.length*SOCCERBEE_TARGET/SOCCERBEE_ROUND_SIZE)):0;
    const missing=result.remaining?'<p role="status">현재 일정에서 미배정 <strong>'+result.remaining+'회</strong> · '+result.missing.length+'명</p>'+
      '<details><summary>미배정 선수 보기</summary><ul>'+result.missing.map(row=>'<li>'+esc(row.player)+' '+row.count+'회</li>').join('')+'</ul></details>':'';
    overview.innerHTML='<h3>라운드 일정 · '+complete+' / '+result.rounds.length+'R 완료</h3><p>선수 '+participants.players.length+'명 · 1인 2회 · 라운드당 최대 12명'+
      (min?' · 첫 편성 최소 '+min+'R':'')+'</p>'+missing+'<div class="sb-measurement-rounds">'+result.rounds.map((item,i)=>{
      const number=i+1,done=item.completed===true,assigned=soccerBeeSlotPlayers(item).length;
      const state=done?'완료 · '+soccerBeeChecked(item).size+' / '+assigned+'명':(number===active?'다음 측정':'예정')+' · '+assigned+' / 12명';
      return '<button type="button" class="btn sb-measurement-round" data-sb-round="'+number+'"'+(number===selected?' aria-current="true"':'')+'><strong>'+number+'R</strong><span>'+esc(item.date||'날짜 미설정')+'</span><small>'+state+'</small></button>';
    }).join('')+'</div>';
  }

  function draw(){
    const current=slot(),done=current.completed===true,correcting=!!correction(),checked=checks(),assignment=current.assignment||{};
    const period=assignment.from?'출석 집계 '+esc(assignment.from)+' ~ '+esc(assignment.through)+(current.date?'':' · 측정일 미설정, 최신 경기 기준'):'출석 집계 자료 없음';
    const dateText=current.date||'미설정',players=soccerBeeSlotPlayers(current).length;
    const attempts=new Map();
    for(const prior of result.rounds.slice(0,selected-1)){
      const measured=soccerBeeChecked(prior);
      for(const row of soccerBeeSlotPlayers(prior)){
        const key=normalizePlayerMatchKey(row.player);
        if(prior.completed!==true||measured.has(key))attempts.set(key,(attempts.get(key)||0)+1);
      }
    }
    sheet.innerHTML='<h3>GGFC 사커비 측정 명단</h3><p><strong>'+esc(year.value)+'년 '+esc(halfLabel(half.value))+' '+selected+'R</strong> · 측정일 <strong id="sbMeasurementSheetDate">'+esc(dateText)+'</strong></p><p>'+period+'</p>'+
      '<p>'+(correcting?'완료 기록 수정 중':done?'라운드 완료':!base.managed||scheduleDirty()?'배정 미리보기':'배정 명단')+' · '+players+' / 12명 · 측정 <strong id="sbMeasurementCheckedCount">'+checked.size+' / '+players+'명</strong></p>'+
      '<div class="sb-measurement-groups">'+renderSoccerBeeGroupTables(current,checked,editable()||correcting,done&&!correcting,attempts)+'</div>';
    roster.innerHTML=renderSoccerBeeAllPlayers(rank(current.date||'').rows,participants.rosterYear,result,current,current.date);
    drawOverview();controls();describe();
  }

  function selectRound(number,syncDate=true){
    selected=Math.max(1,Math.min(result.rounds.length,Number(number)||active||1));
    round.value=String(selected);
    if(syncDate)date.value=slot().date||'';
    soccerBeeRoundSelection={year:year.value,half:half.value,round:selected};
    draw();
  }

  function calculate(number,syncDate=true){
    const draft=edits(),rounds={...base.rounds};
    for(const [key,value] of draft.dates)rounds[key]={...rounds[key],date:value};
    const effective={roundCount:draft.count??base.roundCount,rounds};
    active=Array.from({length:effective.roundCount},(_,i)=>i+1).find(n=>rounds[n]?.completed!==true);
    const lockedRound=active&&((draft.checked||soccerBeeChecked(rounds[active])).size>0)?active:null;
    result=withRenderCalculationCache(()=>buildSoccerBeeSchedule(effective,participants.players,rank,!base.managed||scheduleDirty(),lockedRound));
    let last='';
    dateError='';
    for(const item of result.rounds){
      if(!item.date)continue;
      if(item.date<=last){dateError='라운드 순서대로 서로 다른 측정일을 지정해 주세요.';break;}
      last=item.date;
    }
    round.innerHTML=result.rounds.map((item,i)=>'<option value="'+(i+1)+'">'+(i+1)+'R'+(item.date?' · '+esc(item.date):'')+(item.completed===true?' · 완료':'')+'</option>').join('');
    selectRound(number,syncDate);
  }

  function load(number){
    const key=year.value+'/'+half.value;
    if(edits()?.key!==key)soccerBeeDraft={key,count:null,dates:new Map(),checked:null,correction:null,regenerate:false,dirty:false};
    base=soccerBeeMeasurementPlan(config(),year.value,half.value);
    if(correction()&&!edits().dirty){
      const original=base.rounds[correction().round];
      if(original?.completed===true)correction().checked=soccerBeeChecked(original);
      else edits().correction=null;
    }
    participants=soccerBeeParticipants(year.value);
    rank=soccerBeeAttendanceRanker(participants.players);
    count.min=String(base.protectedRound);count.value=String(edits().count??base.roundCount);
    calculate(number);
    edits().backup=()=>{
      if(!changed())return null;
      const rounds=checkedRounds();
      return sharedSettings(correctionChanged()?correctedRounds(rounds):rounds,selected);
    };
  }

  async function persist(action){
    if(!admin||!GGFC.canEdit()||GGFC.pending){note('관리자 인증과 상단 공유 저장 상태를 확인해 주세요.');return;}
    let rounds=checkedRounds(),nextRound=selected;
    if(action==='complete'){
      const checked=checks(),missed=soccerBeeSlotPlayers(slot()).length-checked.size;
      const detail=missed?(selected<rounds.length?' 미측정 '+missed+'명은 다음 라운드에 우선 배정됩니다.':' 미측정 '+missed+'명은 미배정 목록에 표시됩니다.'):'';
      if(!window.confirm(selected+'R을 '+checked.size+'명 측정 완료로 마감할까요?'+detail))return;
      rounds[selected-1]={...rounds[selected-1],completed:true,checked:[...checked]};
      rounds=rebuildOpenRounds(rounds);
      nextRound=rounds.findIndex(item=>item.completed!==true)+1||selected;
    }
    if(action==='correct'){
      if(!correctionChanged()||slot().completed!==true)return;
      rounds=correctedRounds(rounds);
    }
    const settings=sharedSettings(rounds,nextRound);
    DB.settings.soccerbeeMeasurement=settings;
    soccerBeeRoundSelection=settings.selection;soccerBeeDraft=null;
    saving=true;
    form.querySelectorAll('button,input,select').forEach(field=>field.disabled=true);
    sheet.querySelectorAll('input').forEach(field=>field.disabled=true);
    overview.querySelectorAll('button').forEach(field=>field.disabled=true);
    note('공유 저장 중…');
    save();
    const shared=await GGFC.flush();
    if(form.onsubmit!==submit)return;
    saving=false;
    renderSoccerBeeMeasurementRoster();
    const messages={complete:'라운드 완료 및 남은 명단 공유 저장 완료',correct:'완료 기록 수정 및 남은 명단 공유 저장 완료',schedule:'일정·명단 공유 저장 완료'};
    note(shared?messages[action]:'상단 공유 저장 상태를 확인해 주세요.');
  }

  const submit=event=>{event.preventDefault();if(!saveButton.disabled)persist('schedule');};
  form.onsubmit=submit;
  year.onchange=half.onchange=()=>{
    if(changed()&&!window.confirm('저장하지 않은 변경을 취소하고 다른 반기를 볼까요?')){
      year.value=soccerBeeRoundSelection.year;half.value=soccerBeeRoundSelection.half;return;
    }
    load(null);refreshDraft();
  };
  round.onchange=()=>selectRound(round.value);
  overview.onclick=event=>{
    const button=event.target.closest('button[data-sb-round]');
    if(button&&!button.disabled)selectRound(button.dataset.sbRound);
  };
  count.oninput=()=>{
    if(!count.validity.valid){controls();describe();return;}
    const value=Number(count.value);
    edits().count=value===base.roundCount?null:value;
    calculate(selected);refreshDraft();
  };
  date.oninput=date.onchange=()=>{
    if(!date.validity.valid||date.value===(slot().date||'')){controls();describe();return;}
    const value=date.value;
    if(value===(base.rounds[selected]?.date||''))edits().dates.delete(selected);
    else edits().dates.set(selected,value);
    calculate(selected,false);refreshDraft();
  };
  sheet.onchange=event=>{
    const input=event.target.closest('input[data-sb-player]');
    if(!input||saving||(!correction()&&!editable()))return;
    const checked=checks(),key=input.dataset.sbPlayer;
    if(input.checked)checked.add(key);else checked.delete(key);
    if(!correction()){
      const saved=soccerBeeChecked(slot());
      edits().checked=checked.size===saved.size&&[...checked].every(value=>saved.has(value))?null:checked;
    }
    element('CheckedCount').textContent=checked.size+' / '+soccerBeeSlotPlayers(slot()).length+'명';
    controls();refreshDraft();
  };
  cancelButton.onclick=()=>{soccerBeeDraft=null;load(selected);refreshDraft();};
  refreshButton.onclick=()=>{edits().regenerate=true;calculate(selected);refreshDraft();};
  completeButton.onclick=()=>{if(!completeButton.disabled)persist('complete');};
  editButton.onclick=()=>{
    if(editButton.disabled||!admin||!GGFC.authorized)return;
    if(correction()){persist('correct');return;}
    edits().correction={round:selected,checked:soccerBeeChecked(slot())};
    draw();
  };
  printButton.onclick=()=>{
    if(admin&&GGFC.authorized&&!printButton.disabled){draw();window.print();}
  };
  load(selection.round);
}
