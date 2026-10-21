function mobileMetrics(items){return '<dl class="member-metrics">'+items.map(([k,v])=>'<div><dt>'+esc(k)+'</dt><dd>'+v+'</dd></div>').join('')+'</dl>';}
function mobilePlayerCards(rows,info){
  return rows.length?rows.map(p=>{const a=p.ability,f=a?.form;return '<article class="member-card" data-member-name="'+esc(p.player)+'"><header><div>'+playerCardLink(p.player,playerFaceChip(p.player,false,info?.year),info)+'<p>'+esc(teamDisplayName(p.displayTeam||p.mainTeam||''))+'</p></div><span class="member-label">'+(a?('CURRENT '+a.currentOvr+' · BASE '+fmtAbility(a.baseOvrRaw)+' · '+esc(f.status.icon)+' '+(f.level>0?'+':'')+f.level):'출석 '+p.attendanceRate+'%')+'</span></header>'+careerFrameListHtml(p.frameState)+mobileMetrics([['등번호',esc(String(p.shirtNumber??'')||'—')],['포지션',esc(p.position||'—')],['팀경기',p.teamGames],['득점',p.g],['도움',p.a||0],['승점',p.pts],['출석',p.att],['선방',p.sv||0],['MOM',p.mom||0]])+'<div class="member-card-foot">'+p.w+'승 '+p.d+'무 '+p.l+'패 · 승률 '+p.winRate+'% · 개인파울 '+(p.f||0)+(a?' · '+(a.measured?'SB MEASURED':'SB 68P'):'')+'</div>'+playerListAchievements(p.player,p.careerCutoff)+'</article>';}).join(''):'<p class="empty">선택 기간에 선수 기록이 없습니다.</p>';
}
function mobileAbilityCards(rows,prevMap){
  return '<div class="mobile-only member-cards">'+rows.map(r=>{
    const p=prevMap[r.player]||{},f=r.form;
    return '<article class="member-card"><header><div>'+playerCardLink(r.player,playerFaceChip(r.player,false,r.info?.year||abilityYear),Object.assign({},r.info,{asOf:r.cutoffDate,allCompetitions:true}))+'<p>'+esc(teamDisplayName(r.team||''))+'</p></div><div class="member-ovr"><small>CURRENT</small>'+abilityScoreWithDelta(r.currentOvr,p.currentOvr)+'</div></header><div class="member-card-foot ability-mobile-meta">BASE '+fmtAbility(r.baseOvrRaw)+' · '+esc(f.status.icon)+' FORM '+(f.level>0?'+':'')+f.level+' · '+Math.round(r.ovrProgress)+'%</div>'+longFormBadge(r)+mobileMetrics([['PAC',abilityScoreWithDelta(r.pac,p.pac)],['DRI',abilityScoreWithDelta(r.dri,p.dri)],['SHO',abilityScoreWithDelta(r.sho,p.sho)],['DEF',abilityScoreWithDelta(r.def,p.def)],['PAS',abilityScoreWithDelta(r.pas,p.pas)],['PHY',abilityScoreWithDelta(r.phy,p.phy)]])+'<div class="member-card-foot">'+(r.measured?'SoccerBee '+esc(r.sbDate):'SoccerBee 68P · PROVISIONAL')+' · 출석 '+r.summary.att+'R · 결석 '+num(r.absence?.rounds)+'R</div></article>';
  }).join('')+'</div>';
}
function syncMobileNav(v){
  document.querySelectorAll('[data-mobile-tab]').forEach(el=>{el.classList.toggle('on',el.dataset.mobileTab===v);if(el.dataset.mobileTab===v)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
  const nav=document.querySelector('.member-nav'),active=nav?.querySelector('[data-mobile-tab].on');if(nav&&active){const x=active.offsetLeft,y=nav.scrollLeft;if(x<y||x+active.offsetWidth>y+nav.clientWidth)nav.scrollLeft=Math.max(0,x-(nav.clientWidth-active.offsetWidth)/2);}
}
let sidebarReturnFocus=null;
function desktopSidebarOpen(){return !document.body.classList.contains('sidebar-collapsed');}
function setDesktopSidebar(open,persist=true){
 const mobile=document.documentElement.classList.contains('ggfc-mobile'),panel=document.getElementById('ggfcSidebar'),button=document.getElementById('sidebarToggle');
 document.body.classList.toggle('sidebar-collapsed',!open);
 if(persist)try{localStorage.setItem('ggfc-sidebar-open',open?'1':'0');}catch(e){}
 if(!mobile){if(!open&&panel.contains(document.activeElement))button.focus();panel.inert=!open;panel.setAttribute('aria-hidden',String(!open));button.setAttribute('aria-expanded',String(open));button.setAttribute('aria-label',open?'왼쪽 메뉴 숨기기':'왼쪽 메뉴 열기');}
}
function closeMemberSidebar(restoreFocus=false){
 const panel=document.getElementById('ggfcSidebar'),more=document.getElementById('memberMore'),toggle=document.getElementById('sidebarToggle'),mobile=document.documentElement.classList.contains('ggfc-mobile'),wasOpen=document.body.classList.contains('sidebar-open');
 document.body.classList.remove('sidebar-open');document.getElementById('sidebarBackdrop').hidden=true;
 document.getElementById('mainContent').inert=false;document.querySelector('.member-nav').inert=false;document.getElementById('ggfcTopbar').inert=false;
 more.setAttribute('aria-expanded','false');panel.removeAttribute('aria-modal');panel.removeAttribute('role');
 if(restoreFocus&&wasOpen&&mobile)(sidebarReturnFocus?.isConnected?sidebarReturnFocus:toggle).focus();
 if(mobile){panel.inert=true;panel.setAttribute('aria-hidden','true');toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','메뉴 열기');}
 else setDesktopSidebar(false,false);
}
function openMemberSidebar(){
 if(!document.documentElement.classList.contains('ggfc-mobile')){setDesktopSidebar(true);return;}
 const panel=document.getElementById('ggfcSidebar');sidebarReturnFocus=document.activeElement;
 document.body.classList.add('sidebar-open');document.getElementById('sidebarBackdrop').hidden=false;
 document.getElementById('memberMore').setAttribute('aria-expanded','true');document.getElementById('sidebarToggle').setAttribute('aria-expanded','true');
 panel.inert=false;panel.removeAttribute('aria-hidden');panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');document.getElementById('sidebarClose').focus();
 document.getElementById('mainContent').inert=true;document.querySelector('.member-nav').inert=true;document.getElementById('ggfcTopbar').inert=true;
}
function initMemberUI(){
  const panel=document.querySelector('#ggfcSidebar'),more=document.querySelector('#memberMore');
  setDesktopSidebar(false,false);
  document.getElementById('sidebarToggle').onclick=()=>document.documentElement.classList.contains('ggfc-mobile')?openMemberSidebar():setDesktopSidebar(!desktopSidebarOpen());
  document.getElementById('topBrandHome').onclick=()=>{location.hash=goTab(menuFallbackView());window.scrollTo({top:0,behavior:'smooth'});};
  document.getElementById('topMenuNav').onclick=e=>{const b=e.target.closest('[data-top-menu]');if(b){location.hash=goTab(b.dataset.topMenu);window.scrollTo({top:0,behavior:'smooth'});}};
  more.onclick=()=>document.body.classList.contains('sidebar-open')?closeMemberSidebar(true):openMemberSidebar();
  document.querySelector('#sidebarClose').onclick=()=>document.documentElement.classList.contains('ggfc-mobile')?closeMemberSidebar(true):setDesktopSidebar(false);
  document.querySelector('#sidebarBackdrop').onclick=()=>closeMemberSidebar(true);
  document.querySelectorAll('[data-mobile-tab]').forEach(el=>el.onclick=()=>{location.hash=goTab(el.dataset.mobileTab);window.scrollTo({top:0,behavior:'smooth'});});
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&!document.documentElement.classList.contains('ggfc-mobile')&&desktopSidebarOpen()){e.preventDefault();setDesktopSidebar(false);document.getElementById('sidebarToggle').focus();return;}
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
    if(!mobile && document.activeElement===more) (desktopSidebarOpen()?(panel.querySelector('button.on')||panel):document.getElementById('sidebarToggle')).focus();
    closeMemberSidebar();
  };
  media.addEventListener('change',update);update();syncMobileNav(location.hash.slice(1)||'dash');
}
