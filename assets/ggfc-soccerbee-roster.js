/* Build the print list from the same verified matches, Excel roster and attendance rates as the app. */
function soccerBeeMeasurementRoster(){
  const ctx=latestDbPeriodContext();
  if(!ctx)return {ctx:null,rows:[],start:''};
  const list=verifiedRecords().matches.filter(m=>{
    const date=normDate(m.date);
    return date.slice(0,4)===ctx.year&&date<=ctx.date&&matchHalfKey(m)===ctx.half;
  });
  const names=draftPlayerNameSet(ctx.year);
  const candidates=queryPlayerStats(list)
    .filter(row=>row.teamGames>0&&draftPlayerVisible(row.player,names)&&playerEligibleOn(row.player,ctx.date))
    .sort((a,b)=>b.attendanceRate-a.attendanceRate||b.att-a.att||compareNamesKo(a.player,b.player));
  const seen=new Set();
  const rows=candidates.filter(row=>{
    const key=normalizePlayerMatchKey(row.player);
    if(seen.has(key))return false;
    seen.add(key);
    return true;
  }).slice(0,12);
  return {ctx,rows,start:list.reduce((start,m)=>normDate(m.date)<start?normDate(m.date):start,ctx.date)};
}

function renderSoccerBeeMeasurementRoster(){
  if(!admin||!GGFC.authorized)return;
  const form=document.getElementById('sbMeasurementControls'),input=document.getElementById('sbMeasurementDate');
  const saveButton=document.getElementById('sbMeasurementSave'),printButton=document.getElementById('sbMeasurementPrint');
  const status=document.getElementById('sbMeasurementStatus'),sheet=document.getElementById('sbMeasurementSheet');
  const {ctx,rows,start}=soccerBeeMeasurementRoster();
  let saved=normDate(DB.settings?.soccerbeeMeasurement?.date),saving=false;
  input.value=saved;
  const groups=[0,6].map((offset,i)=>{
    const slots=Array.from({length:6},(_,j)=>{
      const row=rows[offset+j];
      if(!row)return '<tr><td>'+(j+1)+'</td><td colspan="4">빈자리</td></tr>';
      return '<tr><td>'+(j+1)+'</td><th scope="row">'+esc(row.player)+'</th><td>'+esc(teamDisplayName(row.mainTeam))+'</td><td>'+row.att+' / '+row.teamGames+'</td><td>'+row.attendanceRate+'%</td></tr>';
    }).join('');
    return '<section class="sb-measurement-group"><h4>'+(i+1)+'조</h4><table><thead><tr><th scope="col">번호</th><th scope="col">선수명</th><th scope="col">주 소속</th><th scope="col">출석 / 대상</th><th scope="col">출석률</th></tr></thead><tbody>'+slots+'</tbody></table></section>';
  }).join('');
  sheet.innerHTML='<h3>GGFC 사커비 측정 명단</h3><p>측정일 <strong id="sbMeasurementSheetDate"></strong></p>'+
    (ctx?'<p>최신 경기 '+esc(ctx.date)+' · '+esc(halfLabel(ctx.half))+' 누적 '+esc(start)+' ~ '+esc(ctx.date)+'</p>':'<p>완료된 경기 기록이 없습니다.</p>')+
    '<p>출석률 순 · 동률은 출석 경기 수, 이름 순 · 선정 '+rows.length+'/12명</p><div class="sb-measurement-groups">'+groups+'</div>';
  const outputDate=document.getElementById('sbMeasurementSheetDate');
  const refresh=()=>{
    outputDate.textContent=saved||'미설정';
    input.disabled=saving;
    saveButton.disabled=saving||!input.value||input.value===saved;
    printButton.disabled=saving||!saved||input.value!==saved||!rows.length;
  };
  const describe=()=>{status.textContent=saved?'설정된 측정일 '+saved:'측정일을 선택하고 설정을 저장해 주세요.';};
  input.oninput=()=>{if(input.value===saved)describe();else status.textContent='변경한 측정일을 저장해 주세요.';refresh();};
  form.onsubmit=async event=>{
    event.preventDefault();
    if(!admin||!GGFC.canEdit()){toast('관리자 인증과 서버 연결을 확인해 주세요.');return;}
    const date=input.value;
    if(saving||!date||!input.validity.valid||date===saved)return;
    DB.settings.soccerbeeMeasurement={date};
    saved=date;saving=true;refresh();status.textContent='측정일을 공유 저장하고 있습니다…';
    save();
    const shared=await GGFC.flush();
    if(form.onsubmit!==submit)return;
    saving=false;refresh();
    status.textContent=shared?'측정일 공유 저장 완료 · '+date:'상단 공유 저장 상태를 확인해 주세요.';
  };
  const submit=form.onsubmit;
  printButton.onclick=()=>{if(admin&&GGFC.authorized&&!printButton.disabled)window.print();};
  describe();refresh();
}
