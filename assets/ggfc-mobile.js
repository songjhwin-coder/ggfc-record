function mobileMetrics(items){return '<dl class="member-metrics">'+items.map(([k,v])=>'<div><dt>'+esc(k)+'</dt><dd>'+v+'</dd></div>').join('')+'</dl>';}
function mobilePlayerCards(rows,info){
  return rows.length?rows.map(p=>{const a=p.ability,f=a?.form;return '<article class="member-card" data-member-name="'+esc(p.player)+'"><header><div>'+playerCardLink(p.player,playerFaceChip(p.player,false,info?.year),info)+'<p>'+esc(teamDisplayName(p.displayTeam||p.mainTeam||''))+'</p></div><span class="member-label">'+(a?('CURRENT '+a.currentOvr+' · BASE '+fmtAbility(a.baseOvrRaw)+' · '+esc(f.status.icon)+' '+abilityFormValue(f)):'출석 '+p.attendanceRate+'%')+'</span></header>'+careerFrameListHtml(p.frameState)+mobileMetrics([['등번호',esc(String(p.shirtNumber??'')||'—')],['포지션',esc(p.position||'—')],['팀경기',p.teamGames],['득점',p.g],['도움',p.a||0],['승점',p.pts],['출석',p.att],['선방',p.sv||0],['MOM',p.mom||0]])+'<div class="member-card-foot">'+p.w+'승 '+p.d+'무 '+p.l+'패 · 승률 '+p.winRate+'% · 개인파울 '+(p.f||0)+(a?' · '+(a.measured?'SB MEASURED':'SB 68P'):'')+'</div>'+playerListAchievements(p.player,p.careerCutoff)+'</article>';}).join(''):'<p class="empty">선택 기간에 선수 기록이 없습니다.</p>';
}
function mobileAbilityCards(rows,prevMap){
  return '<div class="mobile-only member-cards">'+rows.map(r=>{
    const p=prevMap[r.player]||{},f=r.form;
    return '<article class="member-card"><header><div>'+playerCardLink(r.player,playerFaceChip(r.player,false,r.info?.year||abilityYear),Object.assign({},r.info,{asOf:r.cutoffDate,allCompetitions:true}))+'<p>'+esc(teamDisplayName(r.team||''))+'</p></div><div class="member-ovr"><small>CURRENT</small>'+abilityScoreWithDelta(r.currentOvr,p.currentOvr)+'</div></header><div class="member-card-foot ability-mobile-meta">BASE '+fmtAbility(r.baseOvrRaw)+' · '+esc(f.status.icon)+' FORM '+abilityFormValue(f)+' · '+Math.round(r.ovrProgress)+'%</div>'+longFormBadge(r)+mobileMetrics([['PAC',abilityScoreWithDelta(r.pac,p.pac)],['DRI',abilityScoreWithDelta(r.dri,p.dri)],['SHO',abilityScoreWithDelta(r.sho,p.sho)],['DEF',abilityScoreWithDelta(r.def,p.def)],['PAS',abilityScoreWithDelta(r.pas,p.pas)],['PHY',abilityScoreWithDelta(r.phy,p.phy)]])+'<div class="member-card-foot">'+(r.measured?'SoccerBee '+esc(r.sbDate):'SoccerBee 68P · PROVISIONAL')+' · 출석 '+r.summary.att+'R · 결석 '+num(r.absence?.rounds)+'R</div></article>';
  }).join('')+'</div>';
}
// Compatibility hook used by the shared view renderer; navigation now lives in the topbar/sidebar.
function syncMobileNav(v){}
function mobileSwipeSettings(raw=DB.settings?.mobileSwipe){
  return {enabled:raw?.enabled!==false,sensitivity:['low','normal','high'].includes(raw?.sensitivity)?raw.sensitivity:'normal'};
}
function mobileSwipeDistance(width=innerWidth){
  const factor={low:1.4,normal:1,high:.7}[mobileSwipeSettings().sensitivity];
  return Math.max(60,Math.min(100,width*.18))*factor;
}
let mobilePageSwipe=null;
function initMobilePageSwipe(){
 const main=document.getElementById('mainContent');if(!main||main.dataset.pageSwipeBound)return;
 main.dataset.pageSwipeBound='1';
 let gesture=null,paintFrame=0,settleTimer=0,suppressClickUntil=0,viewportWidth=innerWidth;
 const prepared=new Set();
 const masks=document.getElementsByClassName('mask'),dialogs=document.getElementsByTagName('dialog');
 const modalOpen=()=>{
  for(const node of masks)if(node.classList.contains('on'))return true;
  for(const node of dialogs)if(node.open)return true;
  return document.getElementById('playerCardMask')?.classList.contains('on');
 };

 const menus=()=>Array.from(document.querySelectorAll('#tabs button[data-v]')).filter(b=>!b.hidden&&b.style.display!=='none'&&menuViewAllowed(b.dataset.v)).map(b=>b.dataset.v);
 const blocked=()=>!mobileSwipeSettings().enabled||squadAppearanceDirty||squadExportBusy||!document.documentElement.classList.contains('ggfc-mobile')||document.body.classList.contains('sidebar-open')||modalOpen()||GGFC.pending||GGFC.editing||menuSettingsDirty||careerFrameSettingsDirty||analysisStartSettingsDirty||cardDesignSettingsDirty;
 const interactive=target=>{
  if(!(target instanceof Element)||target.closest('a,button,input,select,textarea,label,summary,[contenteditable]:not([contenteditable="false"]),[draggable="true"],[role="slider"],svg,canvas,#chemistryMap,[data-no-menu-swipe]'))return true;
  for(let el=target;el&&el!==main;el=el.parentElement)if(el.scrollWidth>el.clientWidth+2&&/auto|scroll/.test(getComputedStyle(el).overflowX))return true;
  return false;
 };
 const remember=node=>({node,style:node.getAttribute('style'),hidden:node.hidden,inert:node.inert,aria:node.getAttribute('aria-hidden')});
 const restore=state=>{
  if(!state)return;const {node}=state;
  if(state.content){
   state.anchor.replaceWith(state.content.node);restore(state.content);node.remove();return;
  }
  if(state.temporary){node.remove();return;}
  if(state.style===null)node.removeAttribute('style');else node.setAttribute('style',state.style);
  node.hidden=state.hidden;node.inert=state.inert;
  if(state.aria===null)node.removeAttribute('aria-hidden');else node.setAttribute('aria-hidden',state.aria);
  node.classList.remove('swipe-page','swipe-preparing','swipe-content');
 };
 const originTop=()=>Math.max(document.getElementById('ggfcTopbar').getBoundingClientRect().bottom,parseFloat(getComputedStyle(main).paddingTop)||0);
 function cancel(){
  clearTimeout(settleTimer);cancelAnimationFrame(paintFrame);paintFrame=0;
  const g=gesture;gesture=null;if(!g)return;
  g.transitionCleanup?.();restore(g.incoming);restore(g.outgoing);g.backdrop?.remove();g.placeholder?.remove();if(g.locked)window.scrollTo({top:g.scrollY,behavior:'instant'});document.body.classList.remove('swipe-active');recordTableScrollRefresh?.();
 }
 function invalidate(){cancel();prepared.clear();}
 function rendered(id){prepared.add(id);}
 function position(node,x){node.style.transform='translate3d('+x+'px,0,0)';}
 // Move a viewport-sized clipping frame, not the entire long table/card page.
 function mountPanel(panel,g,top,z,temporary=false,childTop=null){
  const state=temporary?null:remember(panel),anchor=document.createComment('swipe-origin');
  if(!temporary)panel.before(anchor);
  const frame=document.createElement('div');frame.className='swipe-viewport swipe-page';
  const origin=g.origin;
  Object.assign(frame.style,{left:g.left+'px',top:origin+'px',width:g.width+'px',height:g.frameHeight+'px',zIndex:String(z)});
  main.append(frame);frame.append(panel);
  panel.hidden=false;panel.inert=true;panel.setAttribute('aria-hidden','true');panel.classList.add('swipe-content');
  Object.assign(panel.style,{position:'relative',left:'0',top:(top-origin)+'px',width:'100%',margin:'0',display:'block'});
  // Only the outgoing page needs collapsed-margin alignment; do not force a
  // layout of the incoming long table/card tree just to find an unused child.
  if(childTop!==null){
   const firstVisible=[...panel.children].find(el=>el.getClientRects().length);
   if(firstVisible)panel.style.top=(top-origin+childTop-firstVisible.getBoundingClientRect().top)+'px';
  }
  return {node:frame,content:state,anchor,temporary};
 }
 function stage(g){
  const panel=document.getElementById('v-'+g.view),rect=panel.getBoundingClientRect(),flowHeight=main.getBoundingClientRect().height,childTop=[...panel.children].find(el=>el.getClientRects().length)?.getBoundingClientRect().top;
  // Read stable header geometry before moving a large table/card tree.
  g.origin=originTop();g.frameHeight=Math.max(0,innerHeight-g.origin);g.headerBottom=document.getElementById('ggfcTopbar').getBoundingClientRect().bottom;
  g.left=rect.left;g.width=rect.width;document.body.classList.add('swipe-active');
  g.placeholder=document.createElement('div');g.placeholder.className='swipe-placeholder';g.placeholder.style.height=rect.height+'px';panel.before(g.placeholder);
  g.backdrop=document.createElement('div');g.backdrop.className='swipe-backdrop';g.backdrop.style.top=g.headerBottom+'px';g.backdrop.setAttribute('aria-hidden','true');main.append(g.backdrop);
  g.outgoing=mountPanel(panel,g,rect.top,11,false,childTop??null);
  g.placeholder.style.height=Math.max(0,rect.height+flowHeight-main.getBoundingClientRect().height)+'px';g.locked=true;
 }
 function adjacent(g,dx){
  const direction=dx<0?1:-1;
  if(g.direction===direction)return;
  const list=g.menus,i=list.indexOf(g.view),target=list[i+direction]||null;
  restore(g.incoming);g.incoming=null;g.target=null;g.direction=direction;
  if(!target)return;
  let panel,temporary=false;
  if(prepared.has(target)){
   panel=document.getElementById('v-'+target);if(!panel)return;
  }else{
   // Never calculate a view in touchmove/touchend. Slide a lightweight first-visit preview.
   panel=document.createElement('section');panel.className='view swipe-loading';
   const title=document.createElement('h2'),note=document.createElement('p'),lines=document.createElement('div');
   title.textContent=document.querySelector('#tabs button[data-v="'+target+'"]')?.textContent.trim()||'GGFC';
   note.textContent='화면을 준비하고 있습니다…';lines.className='swipe-loading-lines';
   for(let i=0;i<5;i++)lines.append(document.createElement('span'));
   panel.append(title,note,lines);temporary=true;
  }
  g.target=target;
  g.incoming=mountPanel(panel,g,g.origin,12,temporary);
 }
 function paint(g){
  if(gesture!==g)return;
  const x=g.target?Math.max(-g.viewport,Math.min(g.viewport,g.dx)):g.dx*.22;
  position(g.outgoing.node,x);if(g.incoming)position(g.incoming.node,x+g.direction*g.viewport);
 }
 function sample(g,x){
  const now=performance.now(),last=g.samples[g.samples.length-1],previous=g.samples[g.samples.length-2];
  if(previous&&last&&(last.x-previous.x)*(x-last.x)<0&&Math.abs(x-last.x)>3)g.samples=[last];
  g.samples.push({x,time:now});g.samples=g.samples.filter(s=>now-s.time<=120).slice(-8);g.lastMove=now;
 }
 function settle(g,commit){
  g.settling=true;cancelAnimationFrame(paintFrame);paintFrame=0;paint(g);
  const end=commit?-g.direction*g.viewport:0;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches,duration=reduced?0:Math.max(100,Math.min(190,Math.abs(end-g.dx)*.4));
  let finished=false;
  const finish=()=>{
   if(gesture!==g||finished)return;finished=true;clearTimeout(settleTimer);g.transitionCleanup?.();
   const target=g.target,valid=commit&&target&&!blocked()&&activeView===g.view&&menuViewAllowed(target);
   if(!valid){cancel();return;}
   const navigate=()=>{
    if(gesture!==g)return;
    if(blocked()||activeView!==g.view||!menuViewAllowed(target)){cancel();return;}
    try{const next=goTab(target,{swipePrepared:true});location.hash=next;window.scrollTo({top:0,behavior:'instant'});}
    catch(error){console.error('메뉴 화면 준비 실패',error);cancel();goTab(g.view);}
   };
   if(g.incoming?.temporary){
    // The transition has completed; yield once instead of waiting two extra frames.
    settleTimer=setTimeout(navigate,0);
   }else navigate();
  };
  const transitioned=event=>{if(event.target===g.outgoing.node&&event.propertyName==='transform')finish();};
  g.outgoing.node.addEventListener('transitionend',transitioned);
  g.transitionCleanup=()=>g.outgoing.node.removeEventListener('transitionend',transitioned);
  const transition='transform '+duration+'ms cubic-bezier(.22,.72,.22,1)';g.outgoing.node.style.transition=transition;if(g.incoming)g.incoming.node.style.transition=transition;
  // Keep the finger position for one paint before animating to the final location.
  paintFrame=requestAnimationFrame(()=>{paintFrame=0;if(gesture!==g)return;position(g.outgoing.node,end);if(g.incoming)position(g.incoming.node,end+g.direction*g.viewport);if(!duration)finish();else settleTimer=setTimeout(finish,duration+32);});
 }
 main.addEventListener('touchstart',event=>{
  if(gesture?.settling)return;cancel();
  if(event.touches.length!==1||blocked()||interactive(event.target)){return;}
  const t=event.touches[0];if(t.clientX<24||t.clientX>innerWidth-24)return;
  const source=event.target.closest('section.view.on');if(!source||source.id!=='v-'+activeView)return;
  gesture={id:t.identifier,x:t.clientX,y:t.clientY,view:activeView,scrollY:scrollY,viewport:innerWidth,menus:menus(),dx:0,locked:false,samples:[{x:t.clientX,time:performance.now()}],lastMove:performance.now()};
 },{passive:true});
 main.addEventListener('touchmove',event=>{
  const g=gesture;if(!g||g.settling)return;
  if(event.touches.length!==1||blocked()||activeView!==g.view){cancel();return;}
  const t=event.touches[0],dx=t.clientX-g.x,dy=t.clientY-g.y;if(t.identifier!==g.id){cancel();return;}
  if(!g.locked){
   if(Math.abs(scrollY-g.scrollY)>12||Math.abs(dy)>10&&Math.abs(dy)>Math.abs(dx)*.8){cancel();return;}
   if(Math.abs(dx)<10||Math.abs(dx)<Math.abs(dy)*1.35)return;
   if(!event.cancelable){cancel();return;}stage(g);
  }
  if(event.cancelable)event.preventDefault();else{cancel();return;}
  g.dx=dx;sample(g,t.clientX);adjacent(g,dx);suppressClickUntil=performance.now()+400;
  if(!paintFrame)paintFrame=requestAnimationFrame(()=>{paintFrame=0;paint(g);});
 },{passive:false});
 main.addEventListener('touchcancel',()=>{cancel();},{passive:true});
 main.addEventListener('touchend',event=>{
  const g=gesture;if(!g||g.settling)return;
  if(event.touches.length||blocked()||activeView!==g.view){cancel();return;}
  const t=Array.from(event.changedTouches).find(t=>t.identifier===g.id);if(!t||!g.locked){cancel();return;}
  g.dx=t.clientX-g.x;adjacent(g,g.dx);
  const samples=g.samples,first=samples[0],last=samples[samples.length-1],dt=last.time-first.time;
  const velocity=performance.now()-g.lastMove<160&&dt>0?(last.x-first.x)/dt:0;
  const factor=mobileSwipeDistance(g.viewport)/Math.max(60,Math.min(100,g.viewport*.18));
  const forward=velocity*g.dx>0,returning=velocity*g.dx<0&&Math.abs(velocity)>.35;
  const commit=!!g.target&&!returning&&(Math.abs(g.dx)>=mobileSwipeDistance(g.viewport)||forward&&Math.abs(velocity)>.55*factor&&Math.abs(g.dx)>=32);
  suppressClickUntil=performance.now()+400;settle(g,commit);
 },{passive:true});
 main.addEventListener('click',event=>{if(performance.now()<suppressClickUntil){event.preventDefault();event.stopImmediatePropagation();}},{capture:true});
 window.addEventListener('resize',()=>{
  // Mobile browser chrome/keyboard changes height, not the layout width.
  if(innerWidth!==viewportWidth){viewportWidth=innerWidth;invalidate();}else cancel();
 },{passive:true});
 window.addEventListener('orientationchange',invalidate,{passive:true});
 window.addEventListener('scroll',()=>{if(gesture&&Math.abs(scrollY-gesture.scrollY)>12)cancel();},{passive:true});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel();});
 mobilePageSwipe={cancel,invalidate,rendered,isPrepared:id=>prepared.has(id)};
}

let sidebarReturnFocus=null,sidebarPinned=false;
try{sidebarPinned=localStorage.getItem('ggfc-sidebar-pinned')==='1';}catch(e){}
function desktopSidebarOpen(){return !document.body.classList.contains('sidebar-collapsed');}
function setDesktopSidebar(open,persist=true){
 const mobile=document.documentElement.classList.contains('ggfc-mobile'),panel=document.getElementById('ggfcSidebar'),button=document.getElementById('sidebarToggle');
 document.body.classList.toggle('sidebar-collapsed',!open);
 if(persist)try{localStorage.setItem('ggfc-sidebar-open',open?'1':'0');}catch(e){}
 if(!mobile){if(!open&&panel.contains(document.activeElement))button.focus();panel.inert=!open;panel.setAttribute('aria-hidden',String(!open));button.setAttribute('aria-expanded',String(open));button.setAttribute('aria-label',open?'왼쪽 메뉴 숨기기':'왼쪽 메뉴 열기');}
}
function closeMemberSidebar(restoreFocus=false,force=false){
 if(sidebarPinned&&!force)return;
 if(force)try{localStorage.setItem('ggfc-sidebar-open','0');}catch(e){}
 const panel=document.getElementById('ggfcSidebar'),toggle=document.getElementById('sidebarToggle'),mobile=document.documentElement.classList.contains('ggfc-mobile'),wasOpen=document.body.classList.contains('sidebar-open');
 document.body.classList.remove('sidebar-open');document.getElementById('sidebarBackdrop').hidden=true;
 document.getElementById('mainContent').inert=false;document.getElementById('ggfcTopbar').inert=false;
 panel.removeAttribute('aria-modal');panel.removeAttribute('role');
 if(restoreFocus&&wasOpen&&mobile)(sidebarReturnFocus?.isConnected?sidebarReturnFocus:toggle).focus();
 if(mobile){document.body.classList.add('sidebar-collapsed');panel.inert=true;panel.setAttribute('aria-hidden','true');toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','메뉴 열기');}
 else setDesktopSidebar(false,false);
}
function openMemberSidebar(){
 mobilePageSwipe?.cancel();
 if(!document.documentElement.classList.contains('ggfc-mobile')){setDesktopSidebar(true);return;}
 const panel=document.getElementById('ggfcSidebar');sidebarReturnFocus=document.activeElement;
 document.body.classList.remove('sidebar-collapsed');
 try{localStorage.setItem('ggfc-sidebar-open','1');}catch(e){}
 document.body.classList.add('sidebar-open');document.getElementById('sidebarBackdrop').hidden=false;
 document.getElementById('sidebarToggle').setAttribute('aria-expanded','true');
 panel.inert=false;panel.removeAttribute('aria-hidden');panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');(panel.querySelector('select:not([disabled]),button:not([disabled]),a[href]')||panel).focus();
 document.getElementById('mainContent').inert=true;document.getElementById('ggfcTopbar').inert=true;
}
function initMemberUI(){
  const panel=document.querySelector('#ggfcSidebar'),toggle=document.getElementById('sidebarToggle');
  let pinOpen=sidebarPinned;try{pinOpen=pinOpen&&localStorage.getItem('ggfc-sidebar-open')!=='0';}catch(e){}
  setDesktopSidebar(pinOpen,false);syncSidebarPinUI();
  document.getElementById('sidebarPin').onclick=()=>setSidebarPinned(!sidebarPinned);
  document.getElementById('sidebarDismiss').onclick=()=>closeMemberSidebar(true,true);
  document.getElementById('sidebarToggle').onclick=()=>document.documentElement.classList.contains('ggfc-mobile')?openMemberSidebar():setDesktopSidebar(!desktopSidebarOpen());
  document.getElementById('topBrandHome').onclick=()=>{location.hash=goTab(menuFallbackView());window.scrollTo({top:0,behavior:'smooth'});};
  document.getElementById('topMenuNav').onclick=e=>{const b=e.target.closest('[data-top-menu]');if(b){location.hash=goTab(b.dataset.topMenu);window.scrollTo({top:0,behavior:'smooth'});}};
  document.querySelector('#sidebarBackdrop').onclick=()=>closeMemberSidebar(true);
  // Mobile uses the backdrop so an outside tap never activates the page underneath.
  document.addEventListener('pointerdown',e=>{
    if(sidebarPinned||document.documentElement.classList.contains('ggfc-mobile')||!desktopSidebarOpen())return;
    if(panel.contains(e.target)||toggle.contains(e.target)||e.target.closest('.mask,dialog'))return;
    setDesktopSidebar(false);
  },{capture:true});
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&!document.documentElement.classList.contains('ggfc-mobile')&&desktopSidebarOpen()){e.preventDefault();setDesktopSidebar(false);document.getElementById('sidebarToggle').focus();return;}
    if(!document.body.classList.contains('sidebar-open')) return;
    if(e.key==='Escape'){e.preventDefault();closeMemberSidebar(true,true);return;}
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
    // Release modal focus before switching layouts, then restore pinned openness.
    const keepPinnedOpen=sidebarPinned&&desktopSidebarOpen();
    closeMemberSidebar(true,true);
    const focusInSidebar=panel.contains(document.activeElement);
    document.documentElement.classList.toggle('ggfc-mobile',!!mobile);
    if(mobile && focusInSidebar) toggle.focus();
    closeMemberSidebar(false,true);
    if(keepPinnedOpen)openMemberSidebar();
  };
  media.addEventListener('change',update);update();initMobilePageSwipe();
}

function syncSidebarPinUI(){
 const button=document.getElementById('sidebarPin');if(!button)return;
 button.setAttribute('aria-pressed',String(sidebarPinned));button.setAttribute('aria-label',sidebarPinned?'왼쪽 메뉴 고정 해제':'왼쪽 메뉴 고정');
 button.title=sidebarPinned?'고정 해제 · 자동 닫힘 사용':'고정 · 메뉴 이동과 본문 클릭에도 열림 유지';
 button.classList.toggle('is-pinned',sidebarPinned);document.body.classList.toggle('sidebar-pinned',sidebarPinned);
}
function setSidebarPinned(value){
 sidebarPinned=!!value;try{localStorage.setItem('ggfc-sidebar-pinned',sidebarPinned?'1':'0');}catch(e){}
 if(sidebarPinned)openMemberSidebar();syncSidebarPinUI();
}
