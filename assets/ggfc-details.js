/* GGFC V3.18.6 — 읽기 전용 경기 상세 / 선수 비교 창.
   앱의 기존 경기 범위·능력치·파울 집계 함수를 사용하며 DB를 저장하지 않는다. */
let ggfcDetailState=null;
const DETAIL_RECORD_KINDS=[['attendance','출석'],['goals','득점·도움'],['fouls','개인파울'],['saves','선방'],['moms','MOM']];
const COMPARE_ABILITIES=[['ovr','OVR'],['pac','PAC'],['sho','SHO'],['pas','PAS'],['dri','DRI'],['def','DEF'],['phy','PHY']];

function detailMatchKey(value){return String(value??'').trim();}
function detailResultLabel(result){return {W:'승',D:'무',L:'패'}[result]||'미확인';}
function detailMatchPoints(m,team){const r=matchResult(m,team);return r==='W'?3:r==='D'?1:0;}
function detailMatchRows(kind,m){
  const id=detailMatchKey(m.id);
  return id?(DB[kind]||[]).filter(r=>detailMatchKey(r.id)===id):[];
}
function matchDetailData(m){
  const source=Object.fromEntries(DETAIL_RECORD_KINDS.map(([kind])=>[kind,detailMatchRows(kind,m)]));
  const validTeams=new Set([m.home,m.away].map(t=>String(t||'').trim()).filter(Boolean));
  const attendanceTeams=new Map();
  source.attendance.forEach(r=>{
    const name=String(r.player||'').trim(),team=String(r.team||'').trim();
    if(!name||!validTeams.has(team))return;
    if(!attendanceTeams.has(name))attendanceTeams.set(name,new Set());
    attendanceTeams.get(name).add(team);
  });
  const resolveTeam=(r,kind)=>{
    const explicit=String(r.team||'').trim();
    if(explicit)return validTeams.has(explicit)?explicit:'';
    // 팀파울 집계와 동일하게 소속팀이 명시되지 않은 개인파울은 별도 확인 대상으로 둔다.
    if(kind==='fouls')return '';
    const teams=attendanceTeams.get(String(r.player||'').trim());
    return teams?.size===1?[...teams][0]:'';
  };
  const applied=matchTeamFouls(m),unassigned=[];
  const teams=[m.home,m.away].map((team,index)=>{
    const members=new Map(),coaches=new Set();
    const get=name=>{
      if(!members.has(name))members.set(name,{player:name,att:false,g:0,a:0,f:0,sv:0,mom:0,ownGoal:isOwnGoalPlayer(name)});
      return members.get(name);
    };
    DETAIL_RECORD_KINDS.forEach(([kind])=>source[kind].forEach(r=>{
      if(resolveTeam(r,kind)!==String(team||'').trim())return;
      if(kind==='attendance'&&String(r.coach||'').trim())coaches.add(String(r.coach).trim());
      const name=String(r.player||'').trim();if(!name)return;
      const row=get(name);
      if(kind==='attendance')row.att=true;
      if(kind==='goals'){row.g+=num(r.g);row.a+=num(r.a);}
      if(kind==='fouls')row.f+=num(r.fouls);
      if(kind==='saves')row.sv+=num(r.saves);
      if(kind==='moms')row.mom+=num(r.mom);
    }));
    const rows=[...members.values()].sort((a,b)=>Number(a.ownGoal)-Number(b.ownGoal)||compareNamesKo(a.player,b.player));
    const totals=rows.reduce((sum,r)=>{
      for(const key of ['g','a','f','sv','mom'])sum[key]+=r[key];
      if(r.att&&!r.ownGoal)sum.att++;
      if(r.ownGoal)sum.ownGoal+=r.g;
      return sum;
    },{att:0,g:0,a:0,f:0,sv:0,mom:0,ownGoal:0});
    return {team,rows,totals,coaches:[...coaches].sort(compareNamesKo),result:matchResult(m,team),points:detailMatchPoints(m,team),score:num(index===0?m.hs:m.as),rawFouls:num(index===0?m.hf:m.af),fouls:index===0?applied.home:applied.away,group:matchTeamGroup(m,team)};
  });
  DETAIL_RECORD_KINDS.forEach(([kind,label])=>source[kind].forEach(r=>{
    if(!resolveTeam(r,kind)||!String(r.player||'').trim())unassigned.push({kind,label,row:r});
  }));
  return {match:m,teams,unassigned};
}
function detailMetricGrid(items){
  return '<dl class="detail-metrics">'+items.map(([label,value])=>'<div><dt>'+esc(label)+'</dt><dd>'+esc(value)+'</dd></div>').join('')+'</dl>';
}
function detailPlayerTable(team){
  if(!team.rows.length)return '<div class="detail-empty">등록된 선수별 기록이 없습니다.</div>';
  return '<p class="detail-scroll-hint">표를 좌우로 밀면 모든 기록을 볼 수 있습니다.</p><div class="detail-table-wrap" tabindex="0" aria-label="'+esc(teamDisplayName(team.team))+' 선수별 경기 기록 표"><table class="detail-table"><caption class="detail-visually-hidden">'+esc(teamDisplayName(team.team))+' 선수별 경기 기록</caption><thead><tr><th scope="col">선수</th><th scope="col">출석</th><th scope="col">득점</th><th scope="col">도움</th><th scope="col">개인파울</th><th scope="col">선방</th><th scope="col">MOM</th><th scope="col">승점</th></tr></thead><tbody>'+team.rows.map(r=>
    '<tr><th scope="row">'+esc(r.ownGoal?'자책골':r.player)+'</th><td>'+(r.ownGoal?'—':r.att?'<span class="detail-attended">출석</span>':'<span class="detail-missing">미등록</span>')+'</td><td>'+r.g+'</td><td>'+r.a+'</td><td>'+r.f+'</td><td>'+r.sv+'</td><td>'+r.mom+'</td><td>'+(r.att&&!r.ownGoal?team.points:'—')+'</td></tr>'
  ).join('')+'</tbody><tfoot><tr><th scope="row">합계</th><td>'+team.totals.att+'명</td><td>'+team.totals.g+'</td><td>'+team.totals.a+'</td><td>'+team.totals.f+'</td><td>'+team.totals.sv+'</td><td>'+team.totals.mom+'</td><td>'+team.totals.att*team.points+'</td></tr></tfoot></table></div>';
}
function detailUnassignedHtml(items){
  if(!items.length)return '';
  const contents=({kind,row:r})=>kind==='attendance'?'출석'+(r.coach?' · 감독 '+r.coach:''):kind==='goals'?'득점 '+num(r.g)+' · 도움 '+num(r.a):kind==='fouls'?'개인파울 '+num(r.fouls):kind==='saves'?'선방 '+num(r.saves):'MOM '+num(r.mom);
  return '<section class="detail-section"><h3>소속팀·선수 확인이 필요한 기록</h3><p class="detail-note">아래 기록은 팀이나 선수를 확정할 수 없어 선수별 표에 포함하지 않았습니다.</p><div class="detail-table-wrap"><table class="detail-table"><thead><tr><th>구분</th><th>등록팀</th><th>선수</th><th>기록</th></tr></thead><tbody>'+items.map(x=>'<tr><td>'+esc(x.label)+'</td><td>'+esc(x.row.team||'미등록')+'</td><td>'+esc(x.row.player||'미등록')+'</td><td>'+esc(contents(x))+'</td></tr>').join('')+'</tbody></table></div></section>';
}
function matchDetailHtml(data){
  const m=data.match,round=recordMatchRoundNumber(m),ground=matchGround(m);
  const meta=[normDate(m.date),m.comp,halfLabel(normHalf(m.half)),round?round+'R':'',m.round,m.no,ground?ground+'구장':''].filter(Boolean);
  return '<div class="detail-match-meta">'+meta.map(v=>'<span>'+esc(v)+'</span>').join('')+'</div>'+
    '<div class="detail-scoreboard">'+data.teams.map((t,i)=>
      (i===1?'<div class="detail-score"><b>'+num(m.hs)+' <span>:</span> '+num(m.as)+'</b>'+fixtureMomHtml(m)+'</div>':'')+
      '<div class="detail-score-team">'+fixtureLogoHtml(t.team)+'<strong>'+esc(teamDisplayName(t.team))+'</strong><span>'+detailResultLabel(t.result)+' · 승점 '+t.points+(t.group?' · '+esc(leagueGroupLabel(t.group)):'')+'</span></div>'
    ).join('')+'</div>'+(forfeitText(m)?'<p class="detail-notice">'+esc(forfeitText(m))+' · 승패와 승점은 몰수패 판정을 적용합니다.</p>':'')+
    '<div class="detail-team-columns">'+data.teams.map(t=>'<section class="detail-section"><h3>'+teamChip(t.team)+'</h3><p class="detail-note">감독: '+esc(t.coaches.join(', ')||'미등록')+'</p>'+detailMetricGrid([
      ['팀 득점',t.score],['도움',t.totals.a],['적용 팀파울',t.fouls],['개인파울 합계',t.totals.f],['선방',t.totals.sv],['MOM',t.totals.mom]
    ])+'<p class="detail-foul-note">팀파울: 개인파울 기록이 있으면 그 합계, 없으면 기존 팀파울 값 적용 · 기존 팀파울 입력값 '+t.rawFouls+'</p>'+detailPlayerTable(t)+(t.totals.ownGoal?'<p class="detail-note">자책골 표기 '+t.totals.ownGoal+'골은 등록된 팀의 득점 기록에 포함됩니다.</p>':'')+
    (t.totals.g!==t.score?'<p class="detail-notice">팀 점수 '+t.score+'골 / 등록 득점자 합계 '+t.totals.g+'골</p>':'')+'</section>').join('')+'</div>'+
    '<p class="detail-note">출석은 해당 경기의 출석 명단 기준입니다. 기록만 있고 출석이 미등록인 선수도 표시하며, 경기승점은 출석이 등록된 선수에게만 반영합니다.</p>'+detailUnassignedHtml(data.unassigned)+(m.memo||m.note?'<section class="detail-section"><h3>비고</h3><p class="detail-note detail-prewrap">'+esc([m.memo,m.note].filter(Boolean).join('\n'))+'</p></section>':'');
}
function matchDetailButton(m){
  if(!detailMatchKey(m.id))return '';
  const label=[m.date,m.no,teamDisplayName(m.home)+' 대 '+teamDisplayName(m.away),'경기 상세기록 보기'].filter(Boolean).join(' · ');
  return '<button class="match-detail-open" type="button" data-match-detail-id="'+esc(detailMatchKey(m.id))+'" aria-haspopup="dialog" aria-label="'+esc(label)+'" data-export-ignore>경기 상세기록 보기 <span aria-hidden="true">↗</span></button>';
}

function showGGFCDetail(kind,title,html,trigger){
  const dialog=document.querySelector('#ggfcDetailDialog');
  if(!dialog.open)ggfcDetailState={kind,trigger:trigger||document.activeElement,overflow:document.body.style.overflow};
  else ggfcDetailState.kind=kind;
  document.querySelector('#ggfcDetailTitle').textContent=title;
  const body=document.querySelector('#ggfcDetailBody');body.innerHTML=html;body.scrollTop=0;
  document.querySelector('#ggfcDetailClose').setAttribute('aria-label',title+' 닫기');
  if(!dialog.open){dialog.showModal();document.body.style.overflow='hidden';}
}
function closeGGFCDetail(){
  const dialog=document.querySelector('#ggfcDetailDialog');
  if(dialog.open)dialog.close();
}
function openMatchDetail(id,trigger){
  const key=detailMatchKey(id),m=(DB.matches||[]).find(x=>key&&detailMatchKey(x.id)===key);
  if(!m){toast('해당 경기 기록을 찾을 수 없습니다.');return false;}
  showGGFCDetail('match','경기 상세기록',matchDetailHtml(matchDetailData(m)),trigger);return true;
}

function comparisonScope(){
  const list=uniqueRecordMatches(chemMatches());
  const dates=list.map(m=>normDate(m.date)).filter(Boolean).sort();
  return {list,start:dates[0]||'',end:dates[dates.length-1]||'',label:[chemYear==='ALL'?'전체 연도':chemYear+'년',comp==='ALL'?'전체 대회':comp,seasonYear!=='ALL'?seasonLabel():''].filter(Boolean).join(' · ')};
}
function playerComparisonData(a,b){
  const scope=comparisonScope(),stats=queryPlayerStats(scope.list),cutoff=scope.end,year=cutoff.slice(0,4);
  const draftNames=draftPlayerNameSet(year),abilityOn=abilitySystemEnabled(),half=year?abilityHalfForDate(year,cutoff):'';
  const players=[a,b].map(name=>{
    const stat=stats.find(p=>p.player===name)||{player:name,mainTeam:'',att:0,w:0,d:0,l:0,g:0,a:0,f:0,sv:0,mom:0,pts:0,teamGames:0,attendanceRate:0,winRate:0};
    const draft=draftPlayerVisible(name,draftNames);
    const ability=abilityOn&&cutoff&&draft?playerAbilityRecordAtDate(name,year,half,cutoff,true):null;
    return {name,stat,roster:selectPlayerRoster(name,year)||{},ability,abilityNote:!abilityOn?'능력치 시스템 꺼짐':!cutoff?'기준 경기 없음':!draft?'Draft 미등록':'누적 능력치'};
  });
  return {scope,players,cutoff,year,pair:pairStats(a,b,scope.list)};
}
function comparisonRow(label,a,b,options={}){
  const available=v=>v!==null&&v!==undefined&&Number.isFinite(Number(v));
  const format=v=>available(v)?(options.decimals!==undefined?Number(v).toFixed(options.decimals):String(v))+(options.unit||''):'—';
  const max=options.max||Math.max(1,available(a)?Number(a):0,available(b)?Number(b):0);
  const width=v=>available(v)?Math.max(0,Math.min(100,Number(v)/max*100)):0;
  const equal=available(a)&&available(b)&&Number(a)===Number(b),diff=available(a)&&available(b)?Math.round((Number(a)-Number(b))*100)/100:null;
  const suffix=options.unit==='%'?'%p':(options.unit||'');
  const summary=diff===null?'':equal?'동일':'기준 '+(diff>0?'+':'')+diff+suffix;
  return '<div class="compare-row"><div class="compare-value base"><b>'+format(a)+'</b><span class="compare-track" aria-hidden="true"><i style="width:'+width(a)+'%"></i></span></div><div class="compare-label"><strong>'+esc(label)+'</strong><small>'+esc(summary)+'</small></div><div class="compare-value other"><b>'+format(b)+'</b><span class="compare-track" aria-hidden="true"><i style="width:'+width(b)+'%"></i></span></div></div>';
}
function comparisonRadar(players){
  const keys=COMPARE_ABILITIES.slice(1),cx=160,cy=155,r=100;
  const point=(i,f)=>{const theta=-Math.PI/2+i*Math.PI/3;return [cx+Math.cos(theta)*r*f,cy+Math.sin(theta)*r*f];};
  const polygon=f=>keys.map((_,i)=>point(i,f).join(',')).join(' ');
  let shapes=[.25,.5,.75,1].map(f=>'<polygon points="'+polygon(f)+'" fill="none" stroke="#d6e0ec" stroke-width="1"/>').join('');
  shapes+=keys.map(([key,label],i)=>{const [x,y]=point(i,1),[lx,ly]=point(i,1.27);return '<line x1="'+cx+'" y1="'+cy+'" x2="'+x+'" y2="'+y+'" stroke="#d6e0ec"/><text x="'+lx+'" y="'+ly+'" text-anchor="middle" dominant-baseline="middle" fill="#405875" font-size="12" font-weight="750">'+label+'</text>';}).join('');
  players.forEach((p,index)=>{
    if(!p.ability)return;
    const color=index===0?'#245a93':'#cf2947',points=keys.map(([key],i)=>point(i,Math.max(0,Math.min(100,Math.floor(num(p.ability[key]))))/100).join(',')).join(' ');
    shapes+='<polygon points="'+points+'" fill="'+color+'" fill-opacity=".12" stroke="'+color+'" stroke-width="2.2"'+(index===1?' stroke-dasharray="6 3"':'')+'><title>'+esc(p.name)+'</title></polygon>';
  });
  return '<svg class="compare-radar" viewBox="0 0 320 310" role="img" aria-label="'+esc(players[0].name+'와 '+players[1].name+'의 6개 능력치 비교, 0부터 100')+'">'+shapes+'</svg>';
}
function comparisonPairHtml(data){
  const {tog,vs}=data.pair,[a,b]=data.players;
  const matchRows=(rows,opposed)=>rows.length?'<div class="detail-table-wrap"><table class="detail-table"><thead><tr><th>날짜 / 경기</th><th>대진 / 스코어</th><th>기준 선수 결과</th><th>'+esc(a.name)+' 득점</th><th>'+esc(b.name)+' 득점</th></tr></thead><tbody>'+rows.map(x=>'<tr><td>'+esc(x.m.date)+'<small>'+esc([x.m.comp,x.m.no,x.m.round].filter(Boolean).join(' · '))+'</small></td><td>'+esc(teamDisplayName(x.m.home))+' '+num(x.m.hs)+' : '+num(x.m.as)+' '+esc(teamDisplayName(x.m.away))+'</td><td>'+detailResultLabel(x.r)+'</td><td>'+num(x.ag)+'</td><td>'+num(x.bg)+'</td></tr>').join('')+'</tbody></table></div>':'<p class="detail-empty">'+(opposed?'맞대결':'같은 팀 출석')+' 기록이 없습니다.</p>';
  return '<section class="detail-section"><h3>함께 뛴 경기와 맞대결</h3><div class="compare-pair-grid"><div><h4>같은 팀 출석</h4><b>'+tog.p+'경기</b><p>'+tog.w+'승 '+tog.d+'무 '+tog.l+'패 · 승률 '+(tog.p?pct(tog.w,tog.p)+'%':'—')+'</p><p>'+esc(a.name)+' '+tog.ag+'골 / '+esc(b.name)+' '+tog.bg+'골</p></div><div><h4>서로 다른 팀 출석</h4><b>'+vs.p+'경기</b><p>'+esc(a.name)+' '+vs.aw+'승 · 무 '+vs.d+' · '+esc(b.name)+' '+vs.bw+'승</p><p>'+esc(a.name)+' '+vs.ag+'골 / '+esc(b.name)+' '+vs.bg+'골</p></div></div><details class="compare-match-list"><summary>같은 팀 출석 경기 전체 '+tog.p+'건</summary>'+matchRows(tog.rows,false)+'</details><details class="compare-match-list"><summary>맞대결 경기 전체 '+vs.p+'건</summary>'+matchRows(vs.rows,true)+'</details></section>';
}
function playerComparisonHtml(data){
  const [a,b]=data.players,sa=a.stat,sb=b.stat;
  const metrics=[['경기수','att','경기'],['승','w','승'],['무','d','무'],['패','l','패'],['득점','g','골'],['도움','a','회'],['선방','sv','회'],['개인파울','f','회'],['MOM','mom','회'],['승점','pts','점']];
  const names=chemPlayers(),select=(id,value)=>'<select id="'+id+'">'+names.map(n=>'<option value="'+esc(n)+'"'+(n===value?' selected':'')+'>'+esc(n)+'</option>').join('')+'</select>';
  const controls='<div class="compare-controls"><label>기준 선수'+select('compareBasePlayer',a.name)+'</label><label>상대 선수'+select('compareOtherPlayer',b.name)+'</label><button type="button" class="btn primary" id="compareRefresh">비교 적용</button><button type="button" class="btn" id="compareSwap">선수 바꾸기 ⇄</button></div>';
  const identity='<div class="compare-players">'+data.players.map((p,i)=>'<div class="compare-player '+(i?'other':'base')+'"><span class="compare-role">'+(i?'상대 선수':'기준 선수')+'</span>'+playerFaceChip(p.name,true,data.year)+'<p>'+esc(teamDisplayName(p.stat.mainTeam||p.roster.team||'소속 미등록'))+' · '+esc(p.roster.pos||'포지션 미등록')+'</p></div>').join('')+'</div>';
  const rate=(p,key,denominator)=>denominator?num(p[key]):null;
  const perGame=(p,key)=>p.att?num(p[key])/p.att:null;
  const stats=metrics.map(([label,key,unit])=>comparisonRow(label,num(sa[key]),num(sb[key]),{unit})).join('')+
    comparisonRow('득점+도움',sa.g+sa.a,sb.g+sb.a,{unit:'회'})+
    comparisonRow('경기당 득점',perGame(sa,'g'),perGame(sb,'g'),{decimals:2})+
    comparisonRow('경기당 도움',perGame(sa,'a'),perGame(sb,'a'),{decimals:2})+
    comparisonRow('경기당 파울',perGame(sa,'f'),perGame(sb,'f'),{decimals:2})+
    comparisonRow('승률',rate(sa,'winRate',sa.att),rate(sb,'winRate',sb.att),{unit:'%',max:100})+
    comparisonRow('출석률',rate(sa,'attendanceRate',sa.teamGames),rate(sb,'attendanceRate',sb.teamGames),{unit:'%',max:100});
  const abilities=COMPARE_ABILITIES.map(([key,label])=>comparisonRow(label,a.ability?Math.floor(num(a.ability[key])):null,b.ability?Math.floor(num(b.ability[key])):null,{max:100})).join('');
  return controls+'<p class="detail-scope"><b>'+esc(data.scope.label)+'</b><span>'+esc(data.scope.start)+' ~ '+esc(data.scope.end)+' · 조회 경기 '+data.scope.list.length+'경기</span></p>'+identity+
    '<section class="detail-section"><h3>누적 경기 기록 비교</h3><p class="detail-note">두 선수에게 동일한 조회 기간을 적용합니다. 가운데 차이는 기준 선수 값에서 상대 선수 값을 뺀 수치입니다.</p><div class="compare-stat-columns">'+stats+'</div><p class="detail-note">출석률: 주 소속팀 경기수 대비 출석 · '+esc(a.name)+' '+sa.att+'/'+sa.teamGames+'경기 / '+esc(b.name)+' '+sb.att+'/'+sb.teamGames+'경기. 경기수는 출석 명단 기준입니다.</p></section>'+
    '<section class="detail-section"><h3>능력치 비교</h3><p class="detail-note">'+esc(data.cutoff||'기준일 없음')+' 기준 · 능력치는 기존 시스템의 누적값입니다. 경기기록의 조회 대회와 별도로 전체 기록을 반영합니다.</p><div class="compare-ability-layout"><div>'+comparisonRadar(data.players)+'<p class="compare-radar-legend"><span class="base">실선 · '+esc(a.name)+'</span><span class="other">점선 · '+esc(b.name)+'</span></p></div><div>'+abilities+'</div></div><p class="detail-note">'+data.players.map(p=>esc(p.name)+': '+esc(p.abilityNote)).join(' / ')+'</p></section>'+comparisonPairHtml(data);
}
function updateChemCompareButton(){
  const button=document.querySelector('#chemCompareOpen');if(!button)return;
  const names=chemPlayers(),valid=chemSel&&chemOther&&chemSel!==chemOther&&names.includes(chemSel)&&names.includes(chemOther);
  button.disabled=!valid;
  const note=document.querySelector('#chemCompareNote');
  if(note)note.textContent=valid?'선수 비교 분석을 누르면 두 선수의 기록과 능력치를 별도 창에서 볼 수 있습니다.':'기준 선수와 다른 상대 선수를 선택하면 비교할 수 있습니다.';
}
function openPlayerComparison(a=chemSel,b=chemOther,trigger){
  const names=chemPlayers();
  if(!a||!b||a===b||!names.includes(a)||!names.includes(b)){toast('기준 선수와 서로 다른 상대 선수를 선택하세요.');return false;}
  const data=playerComparisonData(a,b);
  showGGFCDetail('comparison','선수 비교 분석',playerComparisonHtml(data),trigger);return true;
}
function applyPlayerComparison(swap=false){
  const left=document.querySelector('#compareBasePlayer'),right=document.querySelector('#compareOtherPlayer');
  const a=swap?right.value:left.value,b=swap?left.value:right.value;
  if(openPlayerComparison(a,b)){
    chemSel=a;chemOther=b;renderChem();
    document.querySelector(swap?'#compareSwap':'#compareRefresh').focus({preventScroll:true});
  }
}

document.addEventListener('click',e=>{
  const match=e.target.closest('[data-match-detail-id]');
  if(match){e.preventDefault();openMatchDetail(match.dataset.matchDetailId,match);return;}
  if(e.target.closest('#chemCompareOpen')){openPlayerComparison(chemSel,chemOther,document.querySelector('#chemCompareOpen'));return;}
  if(e.target.closest('#compareRefresh')){applyPlayerComparison();return;}
  if(e.target.closest('#compareSwap')){applyPlayerComparison(true);return;}
  if(e.target.closest('#ggfcDetailClose'))closeGGFCDetail();
});
const ggfcDetailDialog=document.querySelector('#ggfcDetailDialog');
ggfcDetailDialog.addEventListener('click',e=>{
  if(e.target!==ggfcDetailDialog)return;
  const bounds=ggfcDetailDialog.getBoundingClientRect();
  if(e.clientX<bounds.left||e.clientX>bounds.right||e.clientY<bounds.top||e.clientY>bounds.bottom)closeGGFCDetail();
});
ggfcDetailDialog.addEventListener('close',()=>{
  const state=ggfcDetailState;ggfcDetailState=null;
  if(!state)return;
  document.body.style.overflow=state.overflow;
  const target=state.trigger?.isConnected?state.trigger:document.querySelector('#mainContent');
  if(target)target.focus({preventScroll:true});
});
