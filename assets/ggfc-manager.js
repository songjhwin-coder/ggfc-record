/* Director records use verified fixtures and the effective team sheet on each match date. */
window.GGFCManagers=(()=>{
  const titleHeaders=['우승명','날짜','상하반기','우승팀','감독','코치',...Array.from({length:15},(_,i)=>'선수'+(i+1))];
  const championships=()=>DB.settings?.championshipRecords;
  const titleRows=()=>Array.isArray(championships()?.rows)?championships().rows:[];
  const championshipCount=()=>titleRows().length;
  const key=name=>normalizePlayerMatchKey(name);
  let selected='',season='ALL',cached=null,exporting=false;

  const iconPaths={
    win:'<path d="M3 18l6-6 4 4 7-8m-5 0h5v5"/>',
    trophy:'<path d="M8 3h8v5a4 4 0 0 1-8 0zm0 2H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4m-4 1v6m-4 3h8"/>',
    rank:'<path d="M3 20v-6h6m0 6V8h6v12m0-9h6v9M3 20h18m-9-18 1.4 1.5L12 5l-1.4-1.5z"/>',
    team:'<circle cx="8" cy="7" r="3"/><circle cx="17" cy="8" r="2.5"/><path d="M2 21v-3a6 6 0 0 1 12 0v3m2-7a5 5 0 0 1 6 5v2"/>',
    person:'<circle cx="8" cy="7" r="3"/><path d="M2 21v-3a6 6 0 0 1 10-4m3 4 2 2 5-5"/>',
    points:'<path d="m12 3 2.7 5.6 6.3.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1.1-6.2L3 9.5l6.3-.9z"/>',
    goals:'<circle cx="12" cy="12" r="9"/><path d="m12 8 3.8 2.8-1.4 4.5H9.6l-1.4-4.5zM12 3v5m8.3 1.3-4.5 1.5m-1.4 4.5 2.7 3.9m-7.5-3.9-2.7 3.9m1.3-8.4L3.7 9.3"/>',
    ownGoals:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 3v2m0 14v2M3 12h2m14 0h2"/>',
    conceded:'<path d="M12 3 4 6v5c0 5 3 8 8 10 5-2 8-5 8-10V6zm-3 9h6"/>',
    versus:'<path d="M4 7h15m-4-4 4 4-4 4m5 6H5m4-4-4 4 4 4"/>'
  };
  function icon(name){
    return '<svg class="manager-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#dfbb87" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+iconPaths[name]+'</svg>';
  }

  function validateHeaders(headers){
    const normalized=headers.map(value=>String(value).normalize('NFKC').replace(/\s/g,''));
    const missing=titleHeaders.slice(0,5).filter(header=>!normalized.includes(header));
    if(missing.length)throw new Error('우승기록 필수 열을 확인해 주세요. '+missing.join(', '));
  }

  function importChampionships(objs){
    if(objs.length)validateHeaders(Object.keys(objs[0]));
    const rows=[],seen=new Map();
    for(const o of objs){
      const cells=titleHeaders.map(header=>String(pick(o,header)||'').trim());
      const [name,sourceDate,sourceHalf,team,director,coach,...players]=cells;
      if(!cells.slice(1).some(Boolean))continue; // A competition-only row is a blank template.
      const date=squadSafeDate(sourceDate),half=normHalf(sourceHalf);
      if(!name||!date||!half||!team||!key(director)||isOwnGoalPlayer(director)||
         Number.isNaN(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)
        throw new Error('우승기록의 우승명, 날짜, 상하반기, 우승팀, 감독을 확인해 주세요. '+(name||team||director));
      const identity=JSON.stringify([tournamentCompName(name)||compCompact(name),date,half,team]);
      if(seen.has(identity)){
        if(seen.get(identity)!==key(director))throw new Error(date+' '+name+' '+team+'의 우승 감독이 중복됩니다.');
        continue;
      }
      seen.set(identity,key(director));
      rows.push({name,date,half,team,director,coach,players});
    }
    DB.settings.championshipRecords={rows};
    return rows.length;
  }

  function exportChampionships(){
    return {name:'우승기록',head:titleHeaders.join(','),rows:titleRows().map(r=>
      [r.name,r.date,halfLabel(r.half),r.team,r.director,r.coach,...(r.players||[])])};
  }

  function matchDirector(squad){
    const directors=(squad?.members||[]).filter(member=>squadRoleRank(member.role)===0);
    return directors.length===1?directors[0].player:'';
  }

  function model(){
    const wire=verifiedRecords(),squads=squadRows(),titles=championships(),today=recordToday();
    const seasonSettings=JSON.stringify(DB.settings?.seasons||{});
    if(cached?.wire!==wire||cached.squads!==squads||cached.titles!==titles||cached.seasonSettings!==seasonSettings||cached.today!==today){
      const years=new Set();
      for(const rows of [wire.matches,squads,titleRows()]){
        for(const row of rows){
          const date=normDate(row.date);
          if(/^\d{4}-\d{2}-\d{2}$/.test(date)&&date<=today)years.add(date.slice(0,4));
        }
      }
      cached={wire,squads,titles,seasonSettings,today,years:[...years].sort().reverse(),views:new Map(),rankings:new Map()};
    }
    if(season!=='ALL'&&!cached.years.includes(season))season='ALL';
    if(cached.views.has(season))return cached.views.get(season);
    const inSeason=date=>date&&date<=today&&(season==='ALL'||date.slice(0,4)===season);
    const fixtures=wire.matches.filter(m=>inSeason(normDate(m.date)));
    const goalsByPlayer=analysisGoalLookup(fixtures);
    const directors=new Map(),attendance=new Map(),leagueSeasons=new Set(),rosters=new WeakMap();
    const get=(name)=>{
      const id=key(name);
      if(!directors.has(id))directors.set(id,{id,name,teams:new Map(),opponents:new Map(),titles:[],best:null,
        games:0,W:0,D:0,L:0,points:0,gf:0,ga:0,goals:0,teamPresent:0,teamSlots:0,personalPresent:0,attendanceGames:0});
      return directors.get(id);
    };
    for(const record of wire.attendance){
      const id=detailMatchKey(record.id);
      const player=key(record.player);
      if(!id||!record.team||!player||isOwnGoalPlayer(record.player))continue;
      if(!attendance.has(id))attendance.set(id,new Map());
      const sides=attendance.get(id);
      if(!sides.has(record.team))sides.set(record.team,new Set());
      sides.get(record.team).add(player);
    }
    const addTeam=(row,team,date)=>{
      if(!row.teams.has(team)||date>row.teams.get(team))row.teams.set(team,date);
    };
    for(const squad of squads){
      if(!inSeason(squad.date))continue;
      const name=matchDirector(squad);
      if(name)addTeam(get(name),squad.team,squad.date);
    }
    for(const match of fixtures){
      const date=normDate(match.date);
      const id=detailMatchKey(match.id);
      const sides=[match.home,match.away].map(team=>{
        const squad=squadAtMatch(match,team),name=matchDirector(squad);
        return {team,squad,manager:name?get(name):null};
      });
      if(isLeagueFamilyComp(match.comp)){
        const half=matchHalfKey(match);
        if(half)leagueSeasons.add(date.slice(0,4)+'-'+half);
      }
      sides.forEach(({team,squad,manager},i)=>{
        if(!manager)return;
        const result=matchResult(match,team);
        if(!result)return;
        manager.games++;
        manager[result]++;
        manager.points+=detailMatchPoints(match,team)-matchPointDeduction(match,team);
        manager.gf+=num(i===0?match.hs:match.as);
        manager.ga+=num(i===0?match.as:match.hs);
        manager.goals+=goalsByPlayer(id,team,manager.name);
        addTeam(manager,team,date);
        const present=attendance.get(id)?.get(team);
        if(present?.size){
          if(!rosters.has(squad))rosters.set(squad,new Set(squad.members.filter(p=>!isOwnGoalPlayer(p.player)).map(p=>key(p.player)).filter(Boolean)));
          const roster=rosters.get(squad);
          manager.teamSlots+=roster.size;
          for(const name of roster)if(present.has(name))manager.teamPresent++;
          manager.attendanceGames++;
          if(present.has(manager.id))manager.personalPresent++;
        }
        const opponent=sides[1-i].manager;
        if(opponent&&opponent.id!==manager.id){
          if(!manager.opponents.has(opponent.id))manager.opponents.set(opponent.id,{name:opponent.name,teams:new Map(),games:0,W:0,D:0,L:0});
          const record=manager.opponents.get(opponent.id);
          addTeam(record,sides[1-i].team,date);
          record.games++;
          record[result]++;
        }
      });
    }
    for(const period of leagueSeasons){
      if(!cached.rankings.has(period)){
        const [year,half]=period.split('-');
        cached.rankings.set(period,halfTeamRanking({year,half}));
      }
      const ranking=cached.rankings.get(period);
      if(!Object.keys(ranking.detail.totals).length)continue;
      const {year,half,end,list}=ranking.scope;
      const latest=new Map();
      for(const match of list){
        const date=normDate(match.date);
        for(const team of [match.home,match.away]){
          if(!latest.has(team)||date>=normDate(latest.get(team).date))latest.set(team,match);
        }
      }
      const provisional=end>today||ranking.detail.segments.some(segment=>segment.enabled&&segment.inQuery&&
        segment.mode==='REP'&&segment.start<=today&&!segment.complete);
      ranking.teams.forEach((team,i)=>{
        const match=latest.get(team.team);
        if(!match)return;
        const name=matchDirector(squadAtMatch(match,team.team));
        const manager=directors.get(key(name));
        if(!manager)return;
        const rank=ranking.ranks[i],date=normDate(match.date);
        const best=manager.best;
        const preferredTie=best&&rank===best.rank&&
          ((best.provisional&&!provisional)||(best.provisional===provisional&&date>best.date));
        if(!best||rank<best.rank||preferredTie){
          manager.best={rank,date,year,half,points:team.representative,provisional};
        }
      });
    }
    for(const title of titleRows()){
      if(!inSeason(title.date))continue;
      const director=get(title.director);
      director.titles.push(title);
      addTeam(director,title.team,title.date);
    }
    for(const director of directors.values())director.titles.sort((a,b)=>b.date.localeCompare(a.date));
    const result={years:cached.years,hasTitles:!!titles,rows:[...directors.values()].sort((a,b)=>b.games-a.games||compareNamesKo(a.name,b.name))};
    cached.views.set(season,result);
    return result;
  }

  function rate(n,denominator){return denominator?pct(n,denominator)+'%':'—';}
  function teamMark(team){
    const name=teamDisplayName(team),logo=teamLogo(team);
    return logo?'<img src="'+esc(logo)+'" alt="'+esc(name)+' 로고">':
      '<span role="img" aria-label="'+esc(name)+'">'+esc(teamInitials(name))+'</span>';
  }

  function opponentsHtml(d){
    const opponents=[...d.opponents.values()].sort((a,b)=>b.games-a.games||compareNamesKo(a.name,b.name));
    return '<section class="manager-opponents"><h3>'+icon('versus')+'상대 감독 전적</h3>'+
      (opponents.length?'<ul>'+opponents.map(o=>{
        const teams=[...o.teams].sort((a,b)=>b[1].localeCompare(a[1])||compareNamesKo(a[0],b[0]));
        return '<li><div class="manager-opponent-name"><span class="manager-opponent-logos">'+
          teams.map(([team])=>teamMark(team)).join('')+'</span><b>'+esc(o.name)+'</b></div><span>'+o.games+'경기</span>'+
        '<span class="manager-wdl">'+o.W+'승 '+o.D+'무 '+o.L+'패</span>'+
        '<strong aria-label="승률 '+rate(o.W,o.games)+'">'+rate(o.W,o.games)+'</strong></li>';
      }).join('')+'</ul>':
        '<p>양 팀 감독이 확인된 맞대결 기록이 없습니다.</p>')+'</section>';
  }

  function cardHtml(d,hasTitles){
    const teams=[...d.teams].sort((a,b)=>b[1].localeCompare(a[1])||compareNamesKo(a[0],b[0]));
    const [firstTeam,date]=teams[0]||[];
    const year=season==='ALL'?date?.slice(0,4)||'':season;
    const roster=selectPlayerRoster(d.name,year);
    const archive=allTimeRows().find(row=>key(row.player)===d.id);
    const portrait=atPhoto({player:d.name,photo:roster?.photoCutout||archive?.photoCutout,photoCutout:roster?.photo||archive?.photo});
    const team=firstTeam?teamDisplayName(firstTeam):'';
    const emblem='<span class="manager-emblem">'+(firstTeam?teamMark(firstTeam):'')+'</span>';
    const best=d.best;
    const basis=best?[best.year+' '+halfLabel(best.half), '합산 '+best.points+'점',best.provisional?'잠정':''].filter(Boolean).join(' · '):'';
    const metrics=[
      ['win','승률',rate(d.W,d.games),d.games+'경기 · '+d.W+'승 '+d.D+'무 '+d.L+'패'],
      ['trophy','우승',hasTitles?d.titles.length+'회':'—'],
      ['rank','최고 순위',best?best.rank+'위':'—',basis],
      ['team','팀 출석률',rate(d.teamPresent,d.teamSlots),d.teamSlots?d.teamPresent+' / '+d.teamSlots:''],
      ['person','본인 출석률',rate(d.personalPresent,d.attendanceGames),d.attendanceGames?d.personalPresent+' / '+d.attendanceGames+'경기':''],
      ['points','승점',d.games?d.points+'점':'—'],
      ['goals','팀 득점',d.games?d.gf+'골':'—'],
      ['ownGoals','감독 득점',d.games?d.goals+'골':'—'],
      ['conceded','팀 실점',d.games?d.ga+'골':'—']
    ];
    return '<article class="manager-card" id="managerCard"><header class="manager-card-top">'+portrait+
      '<div><p>GGFC RECORD</p><h2>'+esc(d.name)+'</h2><span>감독'+(team?' · '+esc(team):'')+'</span>'+
      '<small class="manager-season-label">'+(season==='ALL'?'전체 시즌':season+' 시즌')+'</small></div>'+emblem+'</header>'+
      (teams.length>1?'<ul class="manager-teams" aria-label="그 외 담당 팀">'+teams.slice(1).map(([team])=>'<li>'+teamChip(team)+'</li>').join('')+'</ul>':'')+
      '<dl class="manager-metrics">'+metrics.map(([symbol,label,value,note],i)=>{
        const titles=symbol==='trophy'&&d.titles.length?'<ul class="manager-title-names">'+d.titles.map(t=>'<li>'+esc(t.name)+'</li>').join('')+'</ul>':'';
        return '<div'+(i>=6?' class="manager-score-metric"':'')+'><dt>'+icon(symbol)+label+'</dt><dd'+(titles?' class="manager-win-titles"':'')+'><strong>'+value+'</strong>'+titles+(note?'<small>'+esc(note)+'</small>':'')+'</dd></div>';
      }).join('')+
      '</dl>'+opponentsHtml(d)+'</article>';
  }

  function recordHtml(d,hasTitles){
    const wins=d.titles;
    return '<section class="manager-records"><h2>우승 이력</h2>'+
      (wins.length?'<ul class="manager-titles">'+wins.map(t=>'<li><strong>'+esc(t.name)+'</strong><span>'+esc([t.date,halfLabel(t.half),teamDisplayName(t.team)].join(' · '))+'</span></li>').join('')+'</ul>':
        '<p class="note">'+(hasTitles?'등록된 우승 이력이 없습니다.':'관리자가 엑셀의 우승기록 시트를 등록하면 표시됩니다.')+'</p>')+'</section>';
  }

  async function saveCard(button,name){
    const card=document.getElementById('managerCard');
    if(exporting||!card)return;
    exporting=true;button.disabled=true;
    const exportSeason=season;
    const stage=document.createElement('div');stage.className='manager-export-stage';stage.setAttribute('aria-hidden','true');
    try{
      const copy=card.cloneNode(true);copy.removeAttribute('id');
      cleanDashboardSnapshot(copy);stage.append(copy);document.body.append(stage);
      const [renderer,missing]=await Promise.all([loadDashboardRenderer(),embedDashboardImages(copy),document.fonts.ready]);
      await containDashboardLogoImages(copy);
      const canvas=await renderer(copy,{backgroundColor:'#100e11',scale:2,useCORS:true,logging:false});
      const png=await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?.size?resolve(blob):reject(new Error('PNG 변환 실패')),'image/png'));
      downloadBlob('GGFC_감독_'+exportSafeName(name)+(exportSeason==='ALL'?'':'_'+exportSeason)+'.png',png);
      toast(missing?'이미지 저장 완료 · 불러오지 못한 사진은 대체 표시':'감독 카드 이미지 저장 완료');
    }catch(error){toast(error.message||'감독 카드 이미지를 저장하지 못했습니다.');}
    finally{stage.remove();exporting=false;button.disabled=false;}
  }

  function render(){
    const root=document.getElementById('managerRecords');
    const {rows,years,hasTitles}=model();
    const director=rows.find(row=>row.id===selected)||rows[0];
    selected=director?.id||'';
    const options=[['ALL','전체 시즌'],...years.map(year=>[year,year+'년'])];
    const controls='<div class="manager-controls"><label for="managerSeason">시즌 선택<select id="managerSeason">'+
      options.map(([id,label])=>'<option value="'+id+'"'+(id===season?' selected':'')+'>'+label+'</option>').join('')+
      '</select></label>'+(director?'<label for="managerSelect">감독 선택<select id="managerSelect">'+
        rows.map(row=>'<option value="'+esc(row.id)+'"'+(row.id===selected?' selected':'')+'>'+esc(row.name)+'</option>').join('')+
        '</select></label><button class="btn" type="button" data-manager-save>카드 PNG 저장</button>':'')+'</div>';
    root.innerHTML='<header class="manager-view-head"><h1 id="managerTitle">'+esc(menuLabel('manager'))+'</h1></header>'+controls+
      (director?cardHtml(director,hasTitles)+recordHtml(director,hasTitles)+
        '<details class="manager-method"><summary>집계 기준</summary><p>경기일 팀 스쿼드의 감독을 기준으로 선택 시즌의 완료 경기를 집계합니다. 승률은 승리 경기 ÷ 담당 경기이며, 승점은 경기별 승점에서 삭감을 뺀 합계입니다. 감독 득점은 해당 팀을 맡았던 경기에서 본인 이름으로 등록된 득점입니다.</p>'+
        '<p>팀 출석률은 출석 기록이 있는 담당 경기에서 스쿼드 구성원의 출석 합계 ÷ 스쿼드 인원 합계입니다. 본인 출석률은 같은 경기에서 감독 본인이 출석한 비율입니다.</p>'+
        '<p>최고 순위는 조회 범위에서 상반기와 하반기 팀 순위를 비교해 가장 높은 순위를 표시합니다. 반기별로 확정된 대표승점과 개별승점을 합산하며, 동점이면 누적 참석수와 누적 승점을 적용합니다. 순위는 팀의 반기 마지막 경기 담당 감독에게 연결됩니다. 진행 중이거나 대표승점 미확정 구간이 남으면 잠정으로 표시하고, 순위가 같으면 확정된 반기를 우선합니다.</p>'+
        '<p>우승은 엑셀 우승기록 시트의 날짜와 감독 기준입니다.</p></details>':
        '<p class="note">선택한 시즌에 등록된 감독 기록이 없습니다.</p>');
    for(const [id,update] of [['managerSeason',value=>{season=value;}],['managerSelect',value=>{selected=value;}]]){
      const select=root.querySelector('#'+id);
      if(!select)continue;
      select.onchange=()=>{update(select.value);render();root.querySelector('#'+id)?.focus({preventScroll:true});};
    }
    const save=root.querySelector('[data-manager-save]');
    if(save)save.onclick=()=>saveCard(save,director.name);
  }

  return {render,validateHeaders,importChampionships,exportChampionships,championshipCount};
})();
