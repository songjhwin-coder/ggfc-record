/* Read-only dashboard. The router calls render only when Home is opened. */
window.GGFCHome=(()=>{
  const shortcuts=[
    ['dash','최근 경기 결과와 대진 기록'],
    ['squad','팀 전력과 선수 명단'],
    ['ability','선수별 능력치와 최근 변동'],
    ['chem','선수 분석과 듀오 기록']
  ];
  let root,selectedTeam='',lastRecords,lastDataKey='',competition='',squadDate='';
  let round=null,matches=[],squads=[];
  const displayedTeam=()=>selectedTeam||round?.standings[0]?.team||'';

  function update(slot,html){
    const node=root.querySelector('[data-home-slot="'+slot+'"]');
    if(node.homeMarkup===html)return;
    node.innerHTML=html;
    node.homeMarkup=html;
  }

  function syncStatus(){
    if(!root?.classList.contains('on'))return;
    const messages={
      loading:'공유 기록을 불러오는 중입니다.',
      offline:'오프라인 상태입니다. 이 기기에 저장된 기록이 없습니다.',
      unavailable:'공유 기록을 불러오지 못했습니다.',
      cached:'이 기기에 마지막으로 저장된 기록을 표시합니다.'
    };
    const status=root.querySelector('[data-home-status]');
    const message=messages[GGFC.recordStatus]||'';
    if(status.textContent!==message)status.textContent=message;
    status.hidden=!message;
  }

  function crest(team){
    const logo=teamLogo(team);
    return '<span class="home-crest">'+(logo
      ? '<img src="'+esc(logo)+'" alt="" decoding="async">'
      : '<b aria-hidden="true">'+teamInitials(team)+'</b>')+'</span>';
  }

  function renderShortcuts(){
    const nav=navigationSettings();
    const cards=shortcuts.filter(([id])=>menuViewAllowed(id)).map(([id,description])=>{
      const icon=document.querySelector('#tabs [data-v="'+id+'"] .sidebar-menu-icon')?.outerHTML||'';
      return '<a class="home-shortcut" href="#'+id+'" data-home-menu="'+id+'">'+icon+
        '<strong>'+esc(menuLabel(id,nav))+'</strong><span>'+esc(description)+'</span>'+
        '<i aria-hidden="true">→</i></a>';
    });
    update('shortcuts',cards.join(''));
  }

  function latestRound(rows){
    const latest=rows[0];
    if(!latest)return null;
    const {date}=latest,year=date.slice(0,4);
    const competition=isLeagueFamilyComp(latest.m.comp)?'정규리그':matchCompetition(latest.m);
    const half=matchHalfKey(latest.m);
    const scope=rows.filter(({m,date:day,round:number})=>{
      const sameCompetition=competition==='정규리그'?isLeagueFamilyComp(m.comp):matchCompetition(m)===competition;
      return sameCompetition&&(latest.round>0
        ? day.startsWith(year+'-')&&number===latest.round&&matchHalfKey(m)===half
        : day===date);
    }).map(({m})=>m);
    const attendance=teamAttendanceCounts(scope);
    const standings=statsFromMatches(scope).map(t=>({...t,attendance:attendance[t.team]||0,diff:t.gf-t.ga}));
    standings.sort((a,b)=>b.pts-a.pts||b.attendance-a.attendance||b.diff-a.diff||compareNamesKo(a.team,b.team));
    return {date,year,number:latest.round,competition,standings};
  }

  function renderTeam(){
    const name=displayedTeam();
    if(!name){update('team','');return;}
    const result=round?.standings.find(t=>t.team===name);
    const squad=squads.find(row=>row.team===name);
    const canOpen=squad&&menuViewAllowed('squad');
    const model=canOpen?withRenderCalculationCache(()=>teamSquadModel(competition,squadDate,name)):null;
    const team=model?.teams[0];
    const league=team?.league?leagueGroupLabel(team.league):'';
    const metrics=result?'<dl class="home-team-metrics"><div><dt>승점</dt><dd>'+result.pts+'</dd></div>'+
      '<div><dt>출석</dt><dd>'+result.attendance+'회</dd></div>'+
      '<div><dt>득실차</dt><dd>'+(result.diff>0?'+':'')+result.diff+'</dd></div></dl>':
      round?'<p class="home-basis">이 라운드에 등록된 팀 경기 기록이 없습니다.</p>':'';
    const roundBasis=round?'<p class="home-basis">'+esc(round.year+' 시즌 · '+(round.number?round.number+'R':'경기일 기준'))+
      ' · <time datetime="'+esc(round.date)+'">'+esc(round.date)+'</time></p>':'';
    update('team','<div class="home-team-card">'+crest(name)+
      '<div class="home-team-copy"><strong>'+esc(teamDisplayName(name))+'</strong>'+
      (!selectedTeam&&result?'<span>라운드 1위'+(league?' · '+esc(league):'')+'</span>':league?'<span>'+esc(league)+'</span>':'')+'</div>'+
      (team?'<div class="home-team-score"><span>팀 OVR</span><strong>'+(Number.isFinite(team.total)?team.total.toFixed(1):'미평가')+'</strong></div>':'')+
      metrics+roundBasis+(team?'<p class="home-basis">스쿼드 적용일 <time datetime="'+esc(team.date)+'">'+esc(team.date)+'</time>'+
      (model.abilityAsOf?' · 능력치 기준 <time datetime="'+esc(model.abilityAsOf)+'">'+esc(model.abilityAsOf)+'</time>':'')+'</p>'+
      '<a class="home-team-link" href="#squad" data-home-team-link>팀 스쿼드 보기 <span aria-hidden="true">→</span></a>':'')+'</div>');
  }

  function renderTeams(ready,today){
    const section=root.querySelector('[data-home-teams]');
    section.hidden=!ready;
    if(!ready){update('team-select','');update('team','');return;}

    const canOpenSquad=menuViewAllowed('squad');
    competition=round?.competition||'';
    if(!competition&&canOpenSquad){
      const latest=squadRows().reduce((previous,row)=>
        row.comp&&squadSafeDate(row.date)&&row.date<=today&&(!previous||row.date>previous.date)?row:previous,null);
      const latestLeague=squadChangeDates('정규리그',today)[0];
      const hasLeagueThisSeason=latestLeague&&latestLeague.date.slice(0,4)===latest?.date.slice(0,4);
      competition=hasLeagueThisSeason?'정규리그':latest?.comp||'';
    }
    squadDate=canOpenSquad&&competition?squadChangeDates(competition,round?.date||today)[0]?.date||'':'';
    const snapshot=squadDate?latestTeamSquadRows(competition,squadDate):{year:'',rows:[]};
    const year=round?.year||snapshot.year;
    squads=snapshot.rows.filter(row=>row.date.startsWith(year+'-'));
    const teams=[...new Set([...(round?.standings.map(t=>t.team)||[]),...squads.map(row=>row.team)])];
    if(!teams.includes(selectedTeam))selectedTeam='';
    update('team-select',teams.length
      ? '<div class="home-team-picker"><label for="ggfcHomeTeamSelect">'+esc(year)+' 시즌 · '+teams.length+'팀</label>'+
        '<select id="ggfcHomeTeamSelect"><option value="">'+(round?'라운드 1위 자동':'팀 선택')+'</option>'+
        teams.map(team=>'<option value="'+esc(team)+'">'+esc(teamDisplayName(team))+'</option>').join('')+'</select></div>'
      : '<p class="home-empty">등록된 경기 또는 팀 정보가 없습니다.</p>');
    const select=root.querySelector('#ggfcHomeTeamSelect');
    if(select&&select.value!==selectedTeam)select.value=selectedTeam;
    renderTeam();
  }

  function renderRecent(ready){
    if(!ready){update('matches','');return;}
    const team=displayedTeam();
    const canOpen=menuViewAllowed('dash');
    const recent=team?matches.filter(({m,date})=>(m.home===team||m.away===team)&&!matchCompletionReason(m)&&
      (!round||date.startsWith(round.year+'-'))).slice(0,3):[];
    update('matches',recent.length?'<ul class="home-matches">'+recent.map(({m,date})=>{
      const scoreHome=matchScore(m.hs),scoreAway=matchScore(m.as);
      const detail=canOpen?matchDetailAttrs(m):'';
      const description=detail?' aria-description="경기 점수 '+scoreHome+' 대 '+scoreAway+'"':'';
      const context=[...new Set([matchCompetition(m),m.no,m.round].filter(Boolean))].join(' · ');
      return '<li><div class="home-match"'+detail+description+'>'+
        '<div class="home-match-context"><time datetime="'+esc(date)+'">'+esc(date)+'</time><span>'+esc(context)+'</span></div>'+
        '<div class="home-match-scoreline"><span class="home-match-team">'+crest(m.home)+'<b>'+esc(teamDisplayName(m.home))+'</b></span>'+
        '<strong class="home-score">'+scoreHome+'<span aria-hidden="true"> : </span><span class="home-sr"> 대 </span>'+scoreAway+'</strong>'+
        '<span class="home-match-team away">'+crest(m.away)+'<b>'+esc(teamDisplayName(m.away))+'</b></span>'+
        (detail?'<span class="home-match-arrow" aria-hidden="true">›</span>':'')+'</div></div></li>';
    }).join('')+'</ul>':'<p class="home-empty">'+(team?'해당 팀의 완료 경기 기록이 없습니다.':'팀을 선택하면 최근 경기 기록을 볼 수 있습니다.')+'</p>');
  }

  function onNavigation(event){
    const teamLink=event.target.closest('[data-home-team-link]');
    const link=event.target.closest('[data-home-menu]')||teamLink;
    if(!link||event.defaultPrevented||event.button||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    event.preventDefault();
    const target=teamLink?'squad':link.dataset.homeMenu;
    if(!menuViewAllowed(target))return;
    if(teamLink){
      teamSquadCompetition=competition;
      teamSquadAsOfDate=squadDate;
    }
    openMenuFromNavigation(target);
    if(teamLink){
      const team=document.querySelector('#teamSquadContent [data-team="'+CSS.escape(displayedTeam())+'"]');
      const heading=team?.querySelector('h3');
      if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}
      team?.scrollIntoView({block:'start'});
    }
  }

  function render(){
    if(!root){
      root=document.getElementById('v-home');
      root.querySelector('[data-home-brand] img').src=appInterfaceLogo();
      root.addEventListener('click',onNavigation);
      root.addEventListener('change',event=>{
        if(event.target.id!=='ggfcHomeTeamSelect')return;
        selectedTeam=event.target.value;
        renderTeam();
        renderRecent(true);
      });
    }
    syncStatus();
    renderShortcuts();
    const ready=['ready','cached'].includes(GGFC.recordStatus);
    const records=ready?verifiedRecords():null;
    const today=recordToday();
    const key=[ready,today,comp,menuViewAllowed('squad'),menuViewAllowed('dash')].join('|');
    if(lastRecords===records&&lastDataKey===key)return;
    lastRecords=records;
    lastDataKey=key;
    matches=ready?recordBaseMatches().map(m=>({m,date:normDate(m.date),round:recordMatchRoundNumber(m),game:parseInt(m.round,10)||0}))
      .filter(({date})=>date&&date<=today)
      .sort((a,b)=>b.date.localeCompare(a.date)||b.round-a.round||b.game-a.game):[];
    round=latestRound(matches);
    renderTeams(ready,today);
    renderRecent(ready);
  }

  return {render,syncStatus};
})();
