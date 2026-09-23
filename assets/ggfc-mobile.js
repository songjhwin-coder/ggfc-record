function mobileMetrics(items){return '<dl class="member-metrics">'+items.map(([k,v])=>'<div><dt>'+esc(k)+'</dt><dd>'+v+'</dd></div>').join('')+'</dl>';}
function mobilePlayerCards(rows,info){
  return rows.length?rows.map(p=>'<article class="member-card" data-member-name="'+esc(p.player)+'"><header><div>'+playerCardLink(p.player,playerFaceChip(p.player,false,info?.year),info)+'<p>'+esc(teamDisplayName(p.mainTeam||''))+'</p></div><span class="member-label">출석 '+p.attendanceRate+'% · 🏅 '+(p.achievementCount||0)+'</span></header>'+mobileMetrics([['득점',p.g],['도움',p.a||0],['승점',p.pts],['출석',p.att],['선방',p.sv||0],['MOM',p.mom||0]])+'<div class="member-card-foot">'+p.w+'승 '+p.d+'무 '+p.l+'패 · 승률 '+p.winRate+'% · 개인파울 '+(p.f||0)+'</div></article>').join(''):'<p class="empty">선택 기간에 선수 기록이 없습니다.</p>';
}
function mobileAbilityCards(rows,prevMap){
  return '<div class="mobile-only member-cards">'+rows.map(r=>{
    const p=prevMap[r.player]||{};
    return '<article class="member-card"><header><div>'+playerCardLink(r.player,playerFaceChip(r.player,false,r.info?.year||abilityYear),Object.assign({},r.info,{asOf:r.cutoffDate,allCompetitions:true}))+'<p>'+esc(teamDisplayName(r.team||''))+'</p></div><div class="member-ovr"><small>OVR</small>'+abilityScoreWithDelta(r.ovr,p.ovr)+'</div></header>'+mobileMetrics([['PAC',abilityScoreWithDelta(r.pac,p.pac)],['DRI',abilityScoreWithDelta(r.dri,p.dri)],['SHO',abilityScoreWithDelta(r.sho,p.sho)],['DEF',abilityScoreWithDelta(r.def,p.def)],['PAS',abilityScoreWithDelta(r.pas,p.pas)],['PHY',abilityScoreWithDelta(r.phy,p.phy)]])+'<div class="member-card-foot">'+(r.measured?'SoccerBee '+esc(r.sbDate):'SoccerBee 미평가')+' · 출석 '+r.summary.att+'R · 결석 '+num(r.absence?.rounds)+'R</div></article>';
  }).join('')+'</div>';
}
function syncMobileNav(v){
  document.querySelectorAll('[data-mobile-tab]').forEach(el=>{el.classList.toggle('on',el.dataset.mobileTab===v);if(el.dataset.mobileTab===v)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
}
function closeMemberSidebar(restoreFocus=false){
  const panel=document.querySelector('#ggfcSidebar'),more=document.querySelector('#memberMore');
  const mobile=document.documentElement.classList.contains('ggfc-mobile');
  const wasOpen=document.body.classList.contains('sidebar-open');
  document.body.classList.remove('sidebar-open');
  document.querySelector('#sidebarBackdrop').hidden=true;
  document.querySelector('#mainContent').inert=false;
  document.querySelector('.member-nav').inert=false;
  more.setAttribute('aria-expanded','false');
  panel.removeAttribute('aria-modal');
  panel.removeAttribute('role');
  // Move focus before hiding the drawer from assistive technology.
  if(restoreFocus && wasOpen && mobile) more.focus();
  if(mobile) panel.setAttribute('aria-hidden','true');
  else panel.removeAttribute('aria-hidden');
}
function openMemberSidebar(){
  if(!document.documentElement.classList.contains('ggfc-mobile')) return;
  const panel=document.querySelector('#ggfcSidebar');
  document.body.classList.add('sidebar-open');
  document.querySelector('#sidebarBackdrop').hidden=false;
  document.querySelector('#memberMore').setAttribute('aria-expanded','true');
  panel.removeAttribute('aria-hidden');
  panel.setAttribute('role','dialog');
  panel.setAttribute('aria-modal','true');
  document.querySelector('#sidebarClose').focus();
  document.querySelector('#mainContent').inert=true;
  document.querySelector('.member-nav').inert=true;
}
function initMemberUI(){
  const panel=document.querySelector('#ggfcSidebar'),more=document.querySelector('#memberMore');
  more.onclick=()=>document.body.classList.contains('sidebar-open')?closeMemberSidebar(true):openMemberSidebar();
  document.querySelector('#sidebarClose').onclick=()=>closeMemberSidebar(true);
  document.querySelector('#sidebarBackdrop').onclick=()=>closeMemberSidebar(true);
  document.querySelectorAll('[data-mobile-tab]').forEach(el=>el.onclick=()=>{goTab(el.dataset.mobileTab);location.hash=el.dataset.mobileTab;window.scrollTo({top:0,behavior:'smooth'});});
  document.addEventListener('keydown',e=>{
    if(!document.body.classList.contains('sidebar-open')) return;
    if(e.key==='Escape'){e.preventDefault();closeMemberSidebar(true);return;}
    if(e.key!=='Tab')return;
    const focusable=[...panel.querySelectorAll('button:not([disabled]),select:not([disabled]),a[href],[tabindex="0"]')].filter(el=>el.getClientRects().length);
    const first=focusable[0],last=focusable[focusable.length-1];
    if(!first){e.preventDefault();panel.focus();return;}
    if(e.shiftKey && (document.activeElement===first || !focusable.includes(document.activeElement))){e.preventDefault();last.focus();}
    else if(!e.shiftKey && (document.activeElement===last || !focusable.includes(document.activeElement))){e.preventDefault();first.focus();}
  });
  // Reuse the desktop/mobile filter so period changes retain the name query.
  if(typeof bindPlayerRecordSearch==='function')bindPlayerRecordSearch();
  const media=matchMedia('(max-width: 820px)');
  const update=()=>{
    const desktop=new URLSearchParams(location.search).get('view')==='desktop';
    const mobile=!desktop && (window.GGFC_MOBILE_ENTRY || media.matches);
    // Release modal focus and page interaction before changing the layout.
    closeMemberSidebar(true);
    const focusInSidebar=panel.contains(document.activeElement);
    document.documentElement.classList.toggle('ggfc-mobile',!!mobile);
    if(mobile && focusInSidebar) more.focus();
    if(!mobile && document.activeElement===more) (panel.querySelector('button.on')||panel).focus();
    closeMemberSidebar();
  };
  media.addEventListener('change',update);update();syncMobileNav(location.hash.slice(1)||'dash');
}
