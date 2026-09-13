function mobileMetrics(items){return '<dl class="member-metrics">'+items.map(([k,v])=>'<div><dt>'+esc(k)+'</dt><dd>'+v+'</dd></div>').join('')+'</dl>';}
function mobilePlayerCards(rows,info){
  return rows.length?rows.map(p=>'<article class="member-card" data-member-name="'+esc(p.player)+'"><header><div>'+playerCardLink(p.player,'<strong>'+esc(p.player)+'</strong>',info)+'<p>'+esc(teamDisplayName(p.mainTeam||''))+'</p></div><span class="member-label">출석 '+p.attendanceRate+'%</span></header>'+mobileMetrics([['득점',p.g],['도움',p.a||0],['승점',p.pts],['출석',p.att],['선방',p.sv||0],['MOM',p.mom||0]])+'<div class="member-card-foot">'+p.w+'승 '+p.d+'무 '+p.l+'패 · 승률 '+p.winRate+'% · 개인파울 '+(p.f||0)+'</div></article>').join(''):'<p class="empty">선택 기간에 선수 기록이 없습니다.</p>';
}
function mobileAbilityCards(rows,prevMap){
  return '<div class="mobile-only member-cards">'+rows.map(r=>{
    const p=prevMap[r.player]||{};
    return '<article class="member-card"><header><div>'+playerCardLink(r.player,'<strong>'+esc(r.player)+'</strong>',Object.assign({},r.info,{asOf:r.cutoffDate,allCompetitions:true}))+'<p>'+esc(teamDisplayName(r.team||''))+'</p></div><div class="member-ovr"><small>OVR</small>'+abilityScoreWithDelta(r.ovr,p.ovr)+'</div></header>'+mobileMetrics([['PAC',abilityScoreWithDelta(r.pac,p.pac)],['DRI',abilityScoreWithDelta(r.dri,p.dri)],['SHO',abilityScoreWithDelta(r.sho,p.sho)],['DEF',abilityScoreWithDelta(r.def,p.def)],['PAS',abilityScoreWithDelta(r.pas,p.pas)],['PHY',abilityScoreWithDelta(r.phy,p.phy)]])+'<div class="member-card-foot">'+(r.measured?'SoccerBee '+esc(r.sbDate):'SoccerBee 미평가')+' · 출석 '+r.summary.att+'R · 결석 '+num(r.absence?.rounds)+'R</div></article>';
  }).join('')+'</div>';
}
function syncMobileNav(v){
  document.querySelectorAll('[data-mobile-tab]').forEach(el=>{el.classList.toggle('on',el.dataset.mobileTab===v);if(el.dataset.mobileTab===v)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
}
function initMemberUI(){
  const panel=document.querySelector('#memberMorePanel'),more=document.querySelector('#memberMore');
  const close=()=>{panel.hidden=true;more.setAttribute('aria-expanded','false');};
  more.onclick=()=>{panel.hidden=!panel.hidden;more.setAttribute('aria-expanded',String(!panel.hidden));};
  document.querySelector('#memberMoreClose').onclick=()=>{close();more.focus();};
  document.querySelector('#memberLogin').onclick=()=>{close();GGFC.loginOrLogout();};
  document.querySelectorAll('[data-mobile-tab]').forEach(el=>el.onclick=()=>{close();goTab(el.dataset.mobileTab);location.hash=el.dataset.mobileTab;window.scrollTo({top:0,behavior:'smooth'});});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
  document.addEventListener('click',e=>{if(!panel.hidden&&!panel.contains(e.target)&&!more.contains(e.target))close();});
  const search=document.querySelector('#memberPlayerSearch');
  if(search)search.oninput=()=>{const q=search.value.normalize('NFKC').replace(/\s/g,'').toLowerCase();document.querySelectorAll('[data-member-name]').forEach(el=>el.hidden=!el.dataset.memberName.normalize('NFKC').replace(/\s/g,'').toLowerCase().includes(q));};
  const media=matchMedia('(max-width: 820px)');
  const update=()=>{const desktop=new URLSearchParams(location.search).get('view')==='desktop';document.documentElement.classList.toggle('ggfc-mobile',!desktop&&(window.GGFC_MOBILE_ENTRY||media.matches));};
  media.addEventListener('change',update);update();syncMobileNav(location.hash.slice(1)||'dash');
}
