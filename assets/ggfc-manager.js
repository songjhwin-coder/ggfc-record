/* Director records use verified fixtures and the effective team sheet on each match date. */
window.GGFCManagers=(()=>{
  const titleHeaders=['우승명','날짜','상하반기','우승팀','감독','코치',...Array.from({length:15},(_,i)=>'선수'+(i+1))];
  const championships=()=>DB.settings?.championshipRecords;
  const titleRows=()=>Array.isArray(championships()?.rows)?championships().rows:[];
  const championshipCount=()=>titleRows().length;
  const key=name=>normalizePlayerMatchKey(name);
  let selected='',cached=null,exporting=false;

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
    if(cached?.wire===wire&&cached.squads===squads&&cached.titles===titles&&cached.today===today)return cached.result;
    const directors=new Map(),attendance=new Map(),leagueSeasons=new Map(),rosters=new WeakMap();
    const get=(name)=>{
      const id=key(name);
      if(!directors.has(id))directors.set(id,{id,name,teams:new Map(),opponents:new Map(),titles:[],best:null,
        games:0,W:0,D:0,L:0,points:0,gf:0,ga:0,teamPresent:0,teamSlots:0,personalPresent:0,attendanceGames:0});
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
      if(!squad.date||squad.date>today)continue;
      const name=matchDirector(squad);
      if(name)addTeam(get(name),squad.team,squad.date);
    }
    for(const match of wire.matches){
      const date=normDate(match.date);
      if(!date||date>today)continue;
      const id=detailMatchKey(match.id);
      const sides=[match.home,match.away].map(team=>{
        const squad=squadAtMatch(match,team),name=matchDirector(squad);
        return {team,squad,manager:name?get(name):null};
      });
      if(isLeagueFamilyComp(match.comp)){
        const half=matchHalfKey(match)||normHalf(match.half)||calendarHalfKey(date);
        if(half){
          const season=date.slice(0,4)+'-'+half;
          if(!leagueSeasons.has(season))leagueSeasons.set(season,{matches:[],last:new Map()});
          const period=leagueSeasons.get(season);
          period.matches.push(match);
          sides.forEach(({team,manager})=>{
            if(!period.last.has(team)||date>=period.last.get(team).date)period.last.set(team,{date,manager});
          });
        }
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
          if(!manager.opponents.has(opponent.id))manager.opponents.set(opponent.id,{name:opponent.name,games:0,W:0,D:0,L:0});
          const record=manager.opponents.get(opponent.id);
          record.games++;
          record[result]++;
        }
      });
    }
    for(const [season,period] of leagueSeasons){
      const membership=leagueMembershipForList(period.matches),position={A:0,B:0};
      for(const team of statsFromMatches(period.matches)){
        const group=membership[team.team]==='B'?'B':'A';
        const rank=++position[group];
        const final=period.last.get(team.team),manager=final?.manager;
        if(manager&&(!manager.best||rank<manager.best.rank||(rank===manager.best.rank&&final.date>manager.best.date)))
          manager.best={rank,date:final.date,season:season.slice(0,4),half:season.slice(5),group,team:team.team};
      }
    }
    for(const title of titleRows()){
      if(title.date>today)continue;
      const director=get(title.director);
      director.titles.push(title);
      addTeam(director,title.team,title.date);
    }
    const result={hasTitles:!!titles,rows:[...directors.values()].sort((a,b)=>b.games-a.games||compareNamesKo(a.name,b.name))};
    cached={wire,squads,titles,today,result};
    return result;
  }

  function rate(n,denominator){return denominator?pct(n,denominator)+'%':'—';}
  function cardHtml(d,hasTitles){
    const teams=[...d.teams].sort((a,b)=>b[1].localeCompare(a[1])||compareNamesKo(a[0],b[0]));
    const [firstTeam,date]=teams[0]||[];
    const year=date?.slice(0,4)||'';
    const roster=selectPlayerRoster(d.name,year);
    const archive=allTimeRows().find(row=>key(row.player)===d.id);
    const portrait=atPhoto({player:d.name,photo:roster?.photoCutout||archive?.photoCutout,photoCutout:roster?.photo||archive?.photo});
    const metrics=[
      ['승률',rate(d.W,d.games),d.games+'경기 · '+d.W+'승 '+d.D+'무 '+d.L+'패'],
      ['우승',hasTitles?d.titles.length+'회':'—'],
      ['최고 순위',d.best?d.best.rank+'위':'—',d.best?[d.best.season,halfLabel(d.best.half),leagueGroupLabel(d.best.group)].join(' ') :''],
      ['팀 출석률',rate(d.teamPresent,d.teamSlots),d.teamSlots?d.teamPresent+' / '+d.teamSlots:''],
      ['본인 출석률',rate(d.personalPresent,d.attendanceGames),d.attendanceGames?d.personalPresent+' / '+d.attendanceGames+'경기':''],
      ['승점',d.games?d.points+'점':'—'],
      ['득점',d.games?d.gf+'골':'—'],
      ['실점',d.games?d.ga+'골':'—']
    ];
    return '<article class="manager-card" id="managerCard"><header class="manager-card-top">'+portrait+
      '<div><p>GGFC RECORD</p><h2>'+esc(d.name)+'</h2><span>감독 · '+esc(firstTeam?teamDisplayName(firstTeam):'팀 미등록')+'</span></div></header>'+
      '<ul class="manager-teams" aria-label="담당 팀">'+teams.map(([team])=>'<li>'+teamChip(team)+'</li>').join('')+'</ul>'+
      '<dl class="manager-metrics">'+metrics.map(([label,value,note])=>'<div><dt>'+label+'</dt><dd><strong>'+value+
      '</strong>'+(note?'<small>'+esc(note)+'</small>':'')+'</dd></div>').join('')+'</dl></article>';
  }

  function recordHtml(d,hasTitles){
    const opponents=[...d.opponents.values()].sort((a,b)=>b.games-a.games||compareNamesKo(a.name,b.name));
    const wins=d.titles.slice().sort((a,b)=>b.date.localeCompare(a.date));
    return '<div class="manager-records"><section><h2>상대 감독 전적</h2>'+
      (opponents.length?'<div class="tablewrap"><table><thead><tr><th scope="col">상대 감독</th><th scope="col">경기</th><th scope="col">승</th><th scope="col">무</th><th scope="col">패</th><th scope="col">승률</th></tr></thead><tbody>'+
        opponents.map(o=>'<tr><th scope="row">'+esc(o.name)+'</th><td>'+o.games+'</td><td>'+o.W+'</td><td>'+o.D+'</td><td>'+o.L+'</td><td>'+rate(o.W,o.games)+'</td></tr>').join('')+
        '</tbody></table></div>':'<p class="note">양 팀 감독이 확인된 맞대결 기록이 없습니다.</p>')+'</section><section><h2>우승 이력</h2>'+
      (wins.length?'<ul class="manager-titles">'+wins.map(t=>'<li><strong>'+esc(t.name)+'</strong><span>'+esc([t.date,halfLabel(t.half),teamDisplayName(t.team)].join(' · '))+'</span></li>').join('')+'</ul>':
        '<p class="note">'+(hasTitles?'등록된 우승 이력이 없습니다.':'관리자가 엑셀의 우승기록 시트를 등록하면 표시됩니다.')+'</p>')+'</section></div>';
  }

  async function saveCard(button,name){
    const card=document.getElementById('managerCard');
    if(exporting||!card)return;
    exporting=true;button.disabled=true;
    const stage=document.createElement('div');stage.className='manager-export-stage';stage.setAttribute('aria-hidden','true');
    try{
      const copy=card.cloneNode(true);copy.removeAttribute('id');
      cleanDashboardSnapshot(copy);stage.append(copy);document.body.append(stage);
      const [renderer,missing]=await Promise.all([loadDashboardRenderer(),embedDashboardImages(copy),document.fonts.ready]);
      await containDashboardLogoImages(copy);
      const canvas=await renderer(copy,{backgroundColor:'#100e11',scale:2,useCORS:true,logging:false});
      const png=await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?.size?resolve(blob):reject(new Error('PNG 변환 실패')),'image/png'));
      downloadBlob('GGFC_감독_'+exportSafeName(name)+'.png',png);
      toast(missing?'이미지 저장 완료 · 불러오지 못한 사진은 대체 표시':'감독 카드 이미지 저장 완료');
    }catch(error){toast(error.message||'감독 카드 이미지를 저장하지 못했습니다.');}
    finally{stage.remove();exporting=false;button.disabled=false;}
  }

  function render(){
    const root=document.getElementById('managerRecords');
    const {rows,hasTitles}=model();
    const director=rows.find(row=>row.id===selected)||rows[0];
    selected=director?.id||'';
    root.innerHTML='<header class="manager-view-head"><h1 id="managerTitle">'+esc(menuLabel('manager'))+'</h1></header>'+
      (director?'<div class="manager-controls"><label for="managerSelect">감독 선택<select id="managerSelect">'+
        rows.map(row=>'<option value="'+esc(row.id)+'"'+(row.id===selected?' selected':'')+'>'+esc(row.name)+'</option>').join('')+
        '</select></label><button class="btn" type="button" data-manager-save>카드 PNG 저장</button></div>'+cardHtml(director,hasTitles)+recordHtml(director,hasTitles)+
        '<details class="manager-method"><summary>집계 기준</summary><p>경기일 팀 스쿼드의 감독을 기준으로 완료 경기를 집계합니다. 승률은 승리 경기 ÷ 담당 경기이며, 승점은 경기별 승점에서 삭감을 뺀 합계입니다.</p><p>팀 출석률은 출석 기록이 있는 담당 경기에서 스쿼드 구성원의 출석 합계 ÷ 스쿼드 인원 합계입니다. 본인 출석률은 같은 경기에서 감독 본인이 출석한 비율입니다. 최고 순위는 각 시즌 반기 마지막 감독의 리그별 팀 순위 중 가장 높은 순위입니다. 진행 중인 반기는 집계일 현재 순위입니다.</p><p>우승은 엑셀 우승기록 시트의 감독을 기준으로 집계합니다.</p></details>':
        '<p class="note">팀 스쿼드 또는 우승기록에 등록된 감독이 없습니다.</p>');
    const select=root.querySelector('#managerSelect');
    if(select){select.onchange=()=>{selected=select.value;render();root.querySelector('#managerSelect').focus({preventScroll:true});};}
    const save=root.querySelector('[data-manager-save]');
    if(save)save.onclick=()=>saveCard(save,director.name);
  }

  return {render,validateHeaders,importChampionships,exportChampionships,championshipCount};
})();
