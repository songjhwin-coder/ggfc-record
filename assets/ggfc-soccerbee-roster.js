/* SoccerBee planning uses the same verified Excel records and attendance rates as the player list. */
const SOCCERBEE_ROUND_LIMIT=53;
let soccerBeeRoundSelection=null;

function soccerBeeAttendanceWindow(date){
  if(!date)return {from:'',through:''};
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
  const lastScheduled=Math.max(1,...Object.entries(rounds).filter(([,slot])=>slot?.date).map(([round])=>Number(round)).filter(round=>Number.isInteger(round)&&round<=SOCCERBEE_ROUND_LIMIT));
  const configured=Number(plan.roundCount);
  const roundCount=Number.isInteger(configured)&&configured>0&&configured<=SOCCERBEE_ROUND_LIMIT?configured:15;
  return {roundCount:Math.max(roundCount,lastScheduled),lastScheduled,rounds};
}

function soccerBeeConfirmedAssignment(slot){
  return slot?.date&&slot.assignment?.date===slot.date&&Array.isArray(slot.assignment.players)?slot.assignment:null;
}

function soccerBeeMeasurementRoster(year,date,round,rounds){
  const {from,through}=soccerBeeAttendanceWindow(date);
  const available=draftRosterRows(''),yearOf=row=>String(row.year||'').match(/20[0-9]{2}|2100/)?.[0]||'';
  const years=[...new Set(available.map(yearOf).filter(Boolean))].sort().reverse();
  const rosterYear=years.includes(year)?year:(years[0]||'');
  const roster=new Map();
  for(const row of available){
    const rowYear=yearOf(row),key=normalizePlayerMatchKey(row.player);
    if((!rowYear||rowYear===rosterYear)&&(!roster.has(key)||rowYear&&!yearOf(roster.get(key))))roster.set(key,row);
  }
  const list=date?verifiedRecords().matches.filter(match=>{
    const day=normDate(match.date);
    return day>=from&&day<=through;
  }):[];
  const attendance=new Map();
  if(list.length){
    for(const row of queryPlayerStats(list)){
      const key=normalizePlayerMatchKey(row.player);
      if(row.att>(attendance.get(key)?.att||0))attendance.set(key,row);
    }
  }
  const assigned=new Map();
  let confirmedRounds=0;
  for(const [number,slot] of Object.entries(rounds)){
    const confirmed=Number(number)<round&&soccerBeeConfirmedAssignment(slot);
    if(!confirmed)continue;
    confirmedRounds++;
    for(const key of new Set(confirmed.players.map(row=>normalizePlayerMatchKey(row.player)))){
      assigned.set(key,(assigned.get(key)||0)+1);
    }
  }
  const rows=Array.from(roster,([key,row])=>{
    const recorded=attendance.get(key),player=String(row.player).trim();
    const team=String(row.team||recorded?.mainTeam||'');
    const att=recorded?.att||0;
    const teamGames=recorded?.teamGames??(list.length?playerOpportunityCount(player,list,team):0);
    return {key,player,team,att,teamGames,rate:teamGames?pct(att,teamGames):null,assigned:assigned.get(key)||0,eligible:!!date&&playerEligibleOn(player,date)};
  }).sort((a,b)=>a.assigned-b.assigned||(b.rate??-1)-(a.rate??-1)||b.att-a.att||compareNamesKo(a.player,b.player));
  const players=rows.filter(row=>row.eligible).slice(0,12).map(({player,team,att,teamGames,rate})=>({player,team,att,teamGames,rate}));
  return {rows,rosterYear,confirmedRounds,assignment:{date,from,through,players}};
}

function renderSoccerBeeGroupTables(assignment){
  const players=assignment?.players||[];
  return [0,6].map((offset,i)=>{
    const slots=Array.from({length:6},(_,j)=>{
      const row=players[offset+j];
      if(!row)return '<tr><td>'+(j+1)+'</td><td colspan="4">빈자리</td></tr>';
      const rate=row.teamGames?esc(row.rate)+'%':'—';
      return '<tr><td>'+(j+1)+'</td><th scope="row">'+esc(row.player)+'</th><td>'+esc(teamDisplayName(row.team)||'—')+'</td><td>'+esc(row.att)+' / '+esc(row.teamGames)+'</td><td>'+rate+'</td></tr>';
    }).join('');
    return '<section class="sb-measurement-group"><h4>'+(i+1)+'조</h4><table><thead><tr><th scope="col">번호</th><th scope="col">선수명</th><th scope="col">소속</th><th scope="col">출석 / 대상</th><th scope="col">출석률</th></tr></thead><tbody>'+slots+'</tbody></table></section>';
  }).join('');
}

function renderSoccerBeeAllPlayers(result,assignment,date){
  const picked=new Map((assignment?.players||[]).map((row,i)=>[normalizePlayerMatchKey(row.player),i<6?'1조':'2조']));
  const rows=result.rows.map(row=>{
    const rate=row.teamGames?row.rate+'%':'—';
    const status=picked.get(row.key)||(date&&!row.eligible?'등록 시작 전':'—');
    return '<tr><th scope="row">'+esc(row.player)+'</th><td>'+esc(teamDisplayName(row.team)||'—')+'</td><td>'+row.att+' / '+row.teamGames+'</td><td>'+rate+'</td><td>'+row.assigned+'회</td><td>'+status+'</td></tr>';
  }).join('');
  return '<h3>전체 선수 명단 · '+result.rows.length+'명</h3><p>엑셀 DB '+(result.rosterYear?esc(result.rosterYear)+'년 명단':'선수명단')+' · 이전 확정 '+result.confirmedRounds+'개 라운드의 배정 횟수 기준</p>'+
    '<p>배정 횟수가 적은 순으로 선정하며, 동률은 출석률, 출석 경기 수, 이름 순으로 정합니다.</p>'+
    (rows?'<div class="tablewrap"><table><thead><tr><th scope="col">선수명</th><th scope="col">소속</th><th scope="col">출석 / 대상</th><th scope="col">출석률</th><th scope="col">이전 배정</th><th scope="col">현재 조</th></tr></thead><tbody>'+rows+'</tbody></table></div>':'<p class="empty">엑셀 DB에 등록된 선수가 없습니다.</p>');
}

function renderSoccerBeeMeasurementRoster(){
  if(!admin||!GGFC.authorized)return;
  const element=id=>document.getElementById('sbMeasurement'+id);
  const form=element('Controls'),year=element('Year'),half=element('Half'),count=element('RoundCount');
  const round=element('Round'),date=element('Date'),saveButton=element('Save'),confirmButton=element('Confirm');
  const newButton=element('Refresh'),printButton=element('Print'),status=element('Status');
  const sheet=element('Sheet'),roster=element('Roster');
  const config=()=>DB.settings?.soccerbeeMeasurement||{};
  const legacy=normDate(config().date),defaultDate=legacy||latestMatchDate()||recordToday();
  const selected=soccerBeeRoundSelection||config().selection||{};
  let plan,preview=null,confirmed=null,saving=false,proposing=false,displayedDate=null;
  year.innerHTML=Array.from({length:101},(_,i)=>'<option value="'+(2000+i)+'">'+(2000+i)+'년</option>').join('');
  year.value=String(selected.year||defaultDate.slice(0,4));
  if(!year.value)year.value=recordToday().slice(0,4);
  half.value=selected.half==='H1'||selected.half==='H2'?selected.half:latestDbPeriodContext(defaultDate)?.half||'H1';
  const slot=()=>plan.rounds[round.value];
  const sameDate=()=>date.value===(slot()?.date||'');
  const roundOptions=(maximum,selectedRound)=>{
    round.innerHTML=Array.from({length:maximum},(_,i)=>{
      const number=i+1,current=plan.rounds[number];
      const label=current?.date?' · '+current.date+(soccerBeeConfirmedAssignment(current)?' ✓':''):'';
      return '<option value="'+number+'">'+number+'R'+esc(label)+'</option>';
    }).join('');
    round.value=String(Math.max(1,Math.min(Number(selectedRound)||1,maximum)));
  };
  const controls=()=>{
    [year,half,count,round,date].forEach(field=>field.disabled=saving);
    saveButton.disabled=saving||!count.validity.valid||!date.validity.valid||(sameDate()&&Number(count.value)===plan.roundCount);
    newButton.hidden=!confirmed;
    newButton.textContent=proposing?'확정 명단 보기':'새 배정 미리보기';
    newButton.disabled=saving;
    confirmButton.disabled=saving||!date.value||!date.validity.valid||!sameDate()||!count.validity.valid||Number(count.value)!==plan.roundCount||!preview?.players.length||!!confirmed&&!proposing;
    printButton.disabled=saving||!confirmed||proposing||!date.validity.valid;
  };
  const show=()=>{
    soccerBeeRoundSelection={year:year.value,half:half.value,round:Number(round.value)};
    const chosenDate=date.validity.valid?date.value:'';
    displayedDate=chosenDate;
    const result=withRenderCalculationCache(()=>soccerBeeMeasurementRoster(year.value,chosenDate,Number(round.value),plan.rounds));
    preview=result.assignment;
    confirmed=sameDate()?soccerBeeConfirmedAssignment(slot()):null;
    const assignment=confirmed&&!proposing?confirmed:preview;
    const period=chosenDate?'직전 6개월 '+esc(assignment.from)+' ~ '+esc(assignment.through):'측정일을 선택하면 직전 6개월 출석률을 집계합니다.';
    const countText=assignment.players.length+'/12명';
    sheet.innerHTML='<h3>GGFC 사커비 측정 명단</h3><p><strong>'+esc(year.value)+'년 '+esc(halfLabel(half.value))+' '+esc(round.value)+'R</strong> · 측정일 <strong id="sbMeasurementSheetDate">'+esc(date.value||'미설정')+'</strong></p><p>'+period+'</p><p>'+(confirmed&&!proposing?'배정 확정':'배정 미리보기')+' · '+countText+'</p><div class="sb-measurement-groups">'+renderSoccerBeeGroupTables(assignment)+'</div>';
    roster.innerHTML=renderSoccerBeeAllPlayers(result,assignment,chosenDate);
    controls();
  };
  const describe=()=>{
    if(!count.validity.valid)status.textContent='라운드 수는 '+plan.lastScheduled+'~'+SOCCERBEE_ROUND_LIMIT+'R로 설정해 주세요.';
    else if(!date.validity.valid)status.textContent='측정일은 2000년부터 2100년 사이로 입력해 주세요.';
    else if(!sameDate()||Number(count.value)!==plan.roundCount)status.textContent='변경한 라운드 수 또는 측정일을 일정 저장으로 적용해 주세요.';
    else if(!date.value)status.textContent='측정일을 선택하고 일정을 저장해 주세요.';
    else if(confirmed&&!proposing)status.textContent='확정된 명단을 인쇄하거나 새 배정을 미리 볼 수 있습니다.';
    else status.textContent='조 편성을 확인한 뒤 배정 확정을 누르면 인쇄할 수 있습니다.';
  };
  const changeRound=()=>{proposing=false;date.value=normDate(slot()?.date);show();describe();};
  const load=(selectedRound)=>{
    plan=soccerBeeMeasurementPlan(config(),year.value,half.value);
    count.min=String(plan.lastScheduled);count.value=String(plan.roundCount);
    roundOptions(plan.roundCount,selectedRound);changeRound();
  };
  const persist=async(confirmAssignment)=>{
    if(!admin||!GGFC.canEdit()){toast('관리자 인증과 서버 연결을 확인해 주세요.');return;}
    const currentYear=year.value,currentHalf=half.value,currentRound=round.value;
    const settings=config(),seasons={...settings.seasons},yearSettings={...seasons[currentYear]};
    const rounds={...plan.rounds};
    if(date.value||slot()){
      rounds[currentRound]={...slot(),date:date.value};
      if(confirmAssignment)rounds[currentRound].assignment=preview;
    }
    yearSettings[currentHalf]={roundCount:Number(count.value),rounds};
    seasons[currentYear]=yearSettings;
    DB.settings.soccerbeeMeasurement={...settings,seasons,selection:soccerBeeRoundSelection};
    saving=true;controls();status.textContent='공유 저장 중…';
    save();
    const shared=await GGFC.flush();
    if(form.onsubmit!==submit)return;
    saving=false;load(currentRound);
    status.textContent=shared?(confirmAssignment?'라운드 배정 공유 저장 완료':'일정 공유 저장 완료'):'상단 공유 저장 상태를 확인해 주세요.';
  };
  const submit=event=>{event.preventDefault();if(!saveButton.disabled)persist(false);};
  form.onsubmit=submit;
  year.onchange=half.onchange=()=>load(1);
  round.onchange=changeRound;
  count.oninput=()=>{
    if(!count.validity.valid){controls();describe();return;}
    const previous=round.value;
    roundOptions(Number(count.value),previous);
    if(round.value!==previous)changeRound();else{controls();describe();}
  };
  date.oninput=date.onchange=()=>{
    const chosenDate=date.validity.valid?date.value:'';
    if(chosenDate===displayedDate){controls();describe();return;}
    proposing=false;show();describe();
  };
  newButton.onclick=()=>{proposing=!proposing;show();describe();};
  confirmButton.onclick=()=>{if(!confirmButton.disabled)persist(true);};
  printButton.onclick=()=>{if(admin&&GGFC.authorized&&sameDate()&&!printButton.disabled)window.print();};
  load(selected.round);
}
