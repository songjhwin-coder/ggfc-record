/* Team Squad v3.24.1: CURRENT OVR/FORM team strength + pro staff + change-date + IN/OUT. */
let teamSquadCompetition='';
let teamSquadAsOfDate='';
// Latest known league per team as of the query date, without future membership.
function squadLeagueMembership(asOf){
 return leagueMembership(asOf);
}
function squadMemberRadar(ability){
 const keys=['pac','sho','pas','dri','def','phy'];
 if(!ability)return '<span class="ts-mini-radar ts-radar-empty">미평가</span>';
 const points=(ratio,values)=>keys.map((key,i)=>{const angle=-Math.PI/2+i*Math.PI/3,r=24*ratio*(values?Math.max(0,Math.min(100,ability[key]))/100:1);return (42+Math.cos(angle)*r).toFixed(2)+','+(38+Math.sin(angle)*r).toFixed(2);}).join(' ');
 const label=keys.map(k=>k.toUpperCase()+' '+Math.floor(ability[k])).join(' · ');
 return '<svg class="ts-mini-radar" viewBox="0 0 84 76" role="img" aria-label="'+esc(label)+'"><title>'+esc(label)+'</title>'+[.33,.66,1].map(r=>'<polygon class="ts-radar-grid" points="'+points(r)+'"/>').join('')+keys.map((k,i)=>{const a=-Math.PI/2+i*Math.PI/3;return '<line class="ts-radar-grid" x1="42" y1="38" x2="'+(42+24*Math.cos(a))+'" y2="'+(38+24*Math.sin(a))+'"/>';}).join('')+'<polygon class="ts-radar-shape" points="'+points(1,true)+'"/>'+keys.map((k,i)=>{const a=-Math.PI/2+i*Math.PI/3;return '<text x="'+(42+35*Math.cos(a))+'" y="'+(38+33*Math.sin(a)+2)+'" text-anchor="middle">'+k.toUpperCase()+'</text>';}).join('')+'</svg>';
}
const TEAM_SQUAD_AXES=[
 {id:'attack',label:'공격',code:'FW',weights:{sho:.45,pac:.25,dri:.20,phy:.10}},
 {id:'midfield',label:'중앙',code:'MF',weights:{pas:.45,dri:.30,phy:.15,def:.10}},
 {id:'defence',label:'수비',code:'DF',weights:{def:.55,phy:.30,pac:.15}}
];
function squadToday(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
function squadSafeDate(value,fallback=''){
 const v=normDate(value||'');
 return /^\d{4}-\d{2}-\d{2}$/.test(v)?v:fallback;
}
function squadStarsValue(score){return Number.isFinite(score)?Math.max(0,Math.min(5,Math.round(score/10)/2)):null;}
function squadStars(score){
 const stars=squadStarsValue(score);if(stars===null)return '<span class="ts-unrated">미평가</span>';
 return '<span class="ts-stars" role="img" aria-label="5점 만점 '+stars+'점">'+Array.from({length:5},(_,i)=>'<span class="ts-star" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 2 15 8.5 22 9.3 17 14.3 18.4 21.5 12 18 5.6 21.5 7 14.3 2 9.3 9 8.5Z"/></svg><span style="width:'+Math.max(0,Math.min(1,stars-i))*100+'%"><svg viewBox="0 0 24 24"><path d="M12 2 15 8.5 22 9.3 17 14.3 18.4 21.5 12 18 5.6 21.5 7 14.3 2 9.3 9 8.5Z"/></svg></span></span>').join('')+'<b>'+stars.toFixed(1)+'</b></span>';
}
function squadRoleRank(role){
 const r=String(role||'').normalize('NFKC').trim().toLowerCase();
 if(r==='감독'||r==='manager'||r==='head coach'||r==='headcoach')return 0;
 if(r==='코치'||r==='coach'||r==='assistant coach'||r==='assistantcoach')return 1;
 return 2;
}
function squadRoleLabel(role){
 const rank=squadRoleRank(role);
 return rank===0?'감독':rank===1?'코치':String(role||'선수');
}
function latestTeamSquadRows(competition,asOf=squadToday()){
 const cutoff=squadSafeDate(asOf,squadToday()),rows=squadSnapshot({date:cutoff,comp:competition});
 const year=rows.map(r=>r.date.slice(0,4)).sort().pop()||'';
 return {year,rows:rows.sort((a,b)=>compareNamesKo(a.team,b.team))};
}
function squadChangeDates(competition,limit=squadToday()){
 const cutoff=squadSafeDate(limit,squadToday()), grouped=new Map();
 squadRows().filter(r=>(isLeagueFamilyComp(competition)?isLeagueFamilyComp(r.comp):r.comp===competition)&&/^\d{4}-\d{2}-\d{2}$/.test(r.date)&&r.date<=cutoff).forEach(r=>{
  if(!grouped.has(r.date))grouped.set(r.date,new Set());
  grouped.get(r.date).add(r.team);
 });
 return [...grouped.entries()].map(([date,teams])=>({date,count:teams.size,teams:[...teams]})).sort((a,b)=>b.date.localeCompare(a.date));
}
function squadChangeInfo(competition,asOf){
 const dates=squadChangeDates(competition,asOf), current=dates[0]?.date||'', previous=dates[1]?.date||'';
 return {current,previous,dates};
}
function squadSnapshotMap(competition,asOf){
 const snap=latestTeamSquadRows(competition,asOf);
 return new Map(snap.rows.map(r=>[r.team,r]));
}
function teamSquadModel(competition,asOf=squadToday()){
 const cutoff=squadSafeDate(asOf,squadToday()), snapshot=latestTeamSquadRows(competition,cutoff),year=cutoff.slice(0,4),cache=new Map(),enabled=abilitySystemEnabled();
 const known=new Map();
 (DB.roster||[]).filter(r=>!r.year||String(r.year)<=year).forEach(r=>{if(r.player&&!known.has(normalizePlayerMatchKey(r.player)))known.set(normalizePlayerMatchKey(r.player),r.player);});
 const ratings=name=>{
  const key=normalizePlayerMatchKey(name);if(cache.has(key))return cache.get(key);
  const canonical=known.get(key),roster=canonical?selectPlayerRoster(canonical,year):null;
  const eligible=canonical&&playerEligibleOn(canonical,cutoff);
  const ability=enabled&&eligible?playerAbilityRecordAtDate(canonical,year,abilityHalfForDate(year,cutoff),cutoff,true):null;
  const valid=ability&&['pac','sho','pas','dri','def','phy'].every(k=>Number.isFinite(ability[k]));
  const row={name:canonical||name,roster,ability:valid?ability:null,position:normalizeAbilityPosition(roster?.pos),reason:!canonical?'선수명단 미등록':!eligible?'참여 시작 전':!enabled?'능력치 기능 꺼짐':!valid?'자료 부족':''};cache.set(key,row);return row;
 };
 const teams=snapshot.rows.map(s=>{
  const members=[],seen=new Set();
  (s.members||[]).forEach(m=>{const key=normalizePlayerMatchKey(m.player);if(!key||seen.has(key)||isOwnGoalPlayer(m.player))return;seen.add(key);members.push({...ratings(m.player),role:m.role||'선수'});});
  const evaluated=members.filter(m=>m.ability);
  const scores={};TEAM_SQUAD_AXES.forEach(axis=>{scores[axis.id]=evaluated.length?evaluated.reduce((sum,m)=>{const base=Object.entries(axis.weights).reduce((v,[k,w])=>v+m.ability[k]*w,0),form=num(m.ability.form?.modifier);return sum+Math.max(0,Math.min(99,base+form));},0)/evaluated.length:null;});
  const total=evaluated.length?TEAM_SQUAD_AXES.reduce((sum,a)=>sum+scores[a.id],0)/3:null;
  const positions={GR:0,FS:1,AL:2,PV:3};
  members.sort((a,b)=>squadRoleRank(a.role)-squadRoleRank(b.role)||(positions[a.position]??4)-(positions[b.position]??4)||compareNamesKo(a.name,b.name));
  const staff=members.filter(m=>squadRoleRank(m.role)<2);
  return {...s,members,staff,evaluated:evaluated.length,scores,total};
 });
 const membership=squadLeagueMembership(cutoff),rank={A:0,B:1};
 teams.forEach(t=>t.league=membership[t.team]||'');
 teams.sort((a,b)=>(rank[a.league]??2)-(rank[b.league]??2)||leagueTeamDisplayOrder(a.team)-leagueTeamDisplayOrder(b.team)||compareNamesKo(a.team,b.team));
 return {year:snapshot.year,asOf:cutoff,today:cutoff,teams};
}
function squadStaffPortrait(member,year){
 const name=String(member?.name||'').trim();if(!name)return '';
 const role=squadRoleLabel(member.role), rank=squadRoleRank(member.role), photo=normalizePlayerPhotoUrl(selectPlayerRoster(name,year)?.photoCutout||'');
 const fallback=esc(Array.from(name.replace(/\s+/g,'')).slice(0,1).join('')||'선');
 const klass=rank===0?'manager':'coach';
 return '<article class="ts-staff-person ts-staff-'+klass+'" title="'+esc(role+' · '+name)+'"><div class="ts-staff-photo" data-photo-kind="cutout"><span class="ts-staff-fallback">'+fallback+'</span>'+(photo?'<img src="'+esc(photo)+'" data-player-photo-source="'+esc(photo)+'" data-photo-index="0" alt="'+esc(name+' '+role+' 사진')+'" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="handlePlayerPhotoError(this)">':'')+'</div><div class="ts-staff-caption"><span>'+esc(role)+'</span><b>'+esc(name)+'</b></div></article>';
}
function squadRawMemberMap(row){
 const map=new Map();
 (row?.members||[]).forEach(m=>{const rawName=m.player||m.name||'';const key=normalizePlayerMatchKey(rawName);if(key&&!map.has(key))map.set(key,{key,name:String(rawName).trim(),role:m.role||'선수',rank:squadRoleRank(m.role)});});
 return map;
}
function squadStaffName(map,rank){
 return [...map.values()].filter(m=>m.rank===rank).map(m=>m.name).join(', ');
}
function squadDiff(currentRow,previousRow){
 const current=squadRawMemberMap(currentRow), previous=squadRawMemberMap(previousRow);
 if(!previousRow)return {first:true,inPlayers:[],outPlayers:[],roleChanges:[],staffChanges:[]};
 const inPlayers=[...current.values()].filter(m=>m.rank===2&&!previous.has(m.key));
 const outPlayers=[...previous.values()].filter(m=>m.rank===2&&!current.has(m.key));
 const roleChanges=[...current.values()].filter(m=>previous.has(m.key)&&squadRoleLabel(previous.get(m.key).role)!==squadRoleLabel(m.role)).map(m=>({name:m.name,from:squadRoleLabel(previous.get(m.key).role),to:squadRoleLabel(m.role)}));
 const staffChanges=[];
 [0,1].forEach(rank=>{const before=squadStaffName(previous,rank),after=squadStaffName(current,rank);if(before!==after)staffChanges.push({role:rank===0?'감독':'코치',before:before||'공석',after:after||'공석'});});
 return {first:false,inPlayers,outPlayers,roleChanges,staffChanges};
}
function squadMovementHtml(currentRow,previousRow,previousDate,currentDate){
 const diff=squadDiff(currentRow,previousRow);
 if(!previousDate||diff.first)return '<div class="ts-movement ts-movement-first"><div class="ts-movement-head"><b>SQUAD MOVEMENT</b><span>최초 등록 스쿼드</span></div><div class="ts-movement-empty">비교할 이전 스쿼드가 없습니다.</div></div>';
 const groups=[];
 if(diff.inPlayers.length)groups.push('<div class="ts-move-group in"><span class="ts-move-label">IN <b>'+diff.inPlayers.length+'</b></span><div class="ts-move-names">'+diff.inPlayers.map(m=>'<span>'+esc(m.name)+'</span>').join('')+'</div></div>');
 if(diff.outPlayers.length)groups.push('<div class="ts-move-group out"><span class="ts-move-label">OUT <b>'+diff.outPlayers.length+'</b></span><div class="ts-move-names">'+diff.outPlayers.map(m=>'<span>'+esc(m.name)+'</span>').join('')+'</div></div>');
 if(diff.roleChanges.length)groups.push('<div class="ts-move-group role"><span class="ts-move-label">ROLE <b>'+diff.roleChanges.length+'</b></span><div class="ts-move-names">'+diff.roleChanges.map(m=>'<span>'+esc(m.name)+' <small>'+esc(m.from)+'→'+esc(m.to)+'</small></span>').join('')+'</div></div>');
 if(diff.staffChanges.length)groups.push('<div class="ts-move-group staff"><span class="ts-move-label">STAFF <b>'+diff.staffChanges.length+'</b></span><div class="ts-move-names">'+diff.staffChanges.map(m=>'<span><strong>'+esc(m.role)+'</strong> '+esc(m.before)+' → '+esc(m.after)+'</span>').join('')+'</div></div>');
 return '<div class="ts-movement"><div class="ts-movement-head"><b>SQUAD MOVEMENT</b><span>'+esc(previousDate)+' → '+esc(currentDate||currentRow.date)+'</span></div>'+(groups.length?'<div class="ts-movement-groups">'+groups.join('')+'</div>':'<div class="ts-movement-empty ok">이전 스쿼드 대비 변경 없음</div>')+'</div>';
}
function renderTeamSquad(){
 const root=document.getElementById('teamSquadContent'),filter=document.getElementById('teamSquadComp'),changeSelect=document.getElementById('teamSquadChangeDate');if(!root)return;
 renderSquadAppearanceEditor();
 const exportButton=document.getElementById('squadExportButton');if(exportButton){exportButton.onclick=()=>exportTeamSquadImage(exportButton);exportButton.disabled=squadExportBusy;}
 const today=squadToday();
 teamSquadAsOfDate=squadSafeDate(teamSquadAsOfDate,today);if(teamSquadAsOfDate>today)teamSquadAsOfDate=today;
 const competitions=[...new Set(squadRows().map(r=>isLeagueFamilyComp(r.comp)?'정규리그':r.comp).filter(Boolean))].sort(compareNamesKo);
 if(!competitions.includes(teamSquadCompetition))teamSquadCompetition=competitions.includes('정규리그')?'정규리그':competitions[0]||'';
 if(filter){filter.innerHTML=competitions.map(c=>'<option value="'+esc(c)+'"'+(c===teamSquadCompetition?' selected':'')+'>'+esc(c==='정규리그'?'리그 통합':c)+'</option>').join('');filter.disabled=!competitions.length;filter.onchange=()=>{teamSquadCompetition=filter.value;teamSquadAsOfDate='';renderTeamSquad();};}
 const scope=document.getElementById('teamSquadScope');
 if(!competitions.length){if(scope)scope.textContent='';if(changeSelect){changeSelect.innerHTML='<option>변경일 없음</option>';changeSelect.disabled=true;}root.innerHTML='<div class="empty">팀스쿼드가 없습니다. 관리자에서 통합 엑셀 DB의 팀스쿼드 시트를 업로드해 주세요.</div>';return;}
 const allChangeDates=squadChangeDates(teamSquadCompetition,today);
 if(!allChangeDates.some(d=>d.date===teamSquadAsOfDate))teamSquadAsOfDate=allChangeDates[0]?.date||today;
 const changeInfo=squadChangeInfo(teamSquadCompetition,teamSquadAsOfDate);
 if(changeSelect){
  changeSelect.disabled=!allChangeDates.length;
  changeSelect.innerHTML='<option value="" disabled>스쿼드 변경일 선택</option>'+allChangeDates.map(d=>'<option value="'+d.date+'">'+d.date+' · '+d.count+'팀 변경</option>').join('');
  changeSelect.value=changeInfo.current||'';
  changeSelect.onchange=()=>{if(changeSelect.value){teamSquadAsOfDate=changeSelect.value;renderTeamSquad();}};
 }
 const model=teamSquadModel(teamSquadCompetition,teamSquadAsOfDate);
 if(scope)scope.textContent=(model.year?model.year+' 시즌 · ':'')+'선택 변경일 '+model.asOf+(changeInfo.previous?' · 이전 '+changeInfo.previous:'');
 if(!model.teams.length){root.innerHTML='<div class="empty">선택한 조회일까지 적용되는 스쿼드가 없습니다. 스쿼드 적용일 또는 조회 날짜를 확인해 주세요.</div>';return;}
 const previousMap=changeInfo.previous?squadSnapshotMap(teamSquadCompetition,changeInfo.previous):new Map();
 const query={year:model.asOf.slice(0,4),mode:'SEASON',start:model.asOf.slice(0,4)+'-01-01',end:model.asOf,asOf:model.asOf,allCompetitions:true};
 const value=v=>Number.isFinite(v)?v.toFixed(1):'—';
 root.innerHTML=model.teams.map((t,teamIndex)=>{
  const logo=teamLogo(t.team), year=model.asOf.slice(0,4), rosterId='teamSquadRoster'+teamIndex;
  const watermark=logo?'<img class="ts-team-watermark" src="'+esc(logo)+'" alt="" aria-hidden="true" loading="lazy" decoding="async" onerror="this.hidden=true">':'';
  const bars=TEAM_SQUAD_AXES.map(a=>'<div class="ts-axis '+a.id+'"><div class="ts-axis-heading"><b>'+a.code+' · '+a.label+'</b><strong>'+value(t.scores[a.id])+'</strong></div><div class="ts-bar" role="meter" aria-label="'+esc(t.team+' '+a.label)+'" aria-valuemin="0" aria-valuemax="100"'+(Number.isFinite(t.scores[a.id])?' aria-valuenow="'+t.scores[a.id].toFixed(1)+'"':'')+'><i style="width:'+(t.scores[a.id]??0)+'%"></i></div>'+squadStars(t.scores[a.id])+'</div>').join('');
  const staffPortraits=t.staff.slice(0,2).map(m=>squadStaffPortrait(m,year)).join('');
  const rows='<p class="note">선수카드를 불러오는 중입니다.</p>';
  const leagueHead=teamIndex===0||model.teams[teamIndex-1].league!==t.league?'<header class="ts-league-heading" data-league="'+esc(t.league)+'">'+(t.league?leagueSymbolHtml(t.league):'')+'<div><h2>'+esc(t.league?leagueGroupLabel(t.league):'리그 미지정')+'</h2><span>조회일 기준 · '+model.teams.filter(x=>x.league===t.league).length+'팀</span></div></header>':'';
  const movement=squadMovementHtml(t,previousMap.get(t.team),changeInfo.previous,changeInfo.current);
  return leagueHead+'<section class="ts-team" data-team="'+esc(t.team)+'"><header class="ts-team-header">'+watermark+'<div class="ts-team-brand">'+(logo?'<img class="ts-team-logo" src="'+esc(logo)+'" alt="'+esc(t.team)+' 로고">':'<span class="ts-logo-fallback">'+esc(t.team.slice(0,2))+'</span>')+'<div class="ts-team-copy"><span class="ts-team-kicker">TEAM SQUAD</span><h3>'+esc(teamDisplayName(t.team))+'</h3><p class="ts-basis-note">스쿼드 적용일 '+esc(t.date)+' · 능력치 기준 '+esc(model.asOf)+' · '+t.members.length+'명</p><span class="ts-overall"><span>TEAM CURRENT</span><strong class="ts-current-score">'+value(t.total)+'</strong> '+squadStars(t.total)+'</span></div>'+(staffPortraits?'<div class="ts-staff-showcase" aria-label="감독 및 코치"><span class="ts-staff-kicker">COACHING STAFF</span><div class="ts-staff-stack">'+staffPortraits+'</div></div>':'')+'</div><div class="ts-team-bars">'+bars+'</div></header>'+movement+'<div class="ts-roster-title"><div><h4>등록 선수 명단</h4><span>전력 산정 '+t.evaluated+'/'+t.members.length+'명 · 감독·코치 우선 표시</span></div><label class="ts-roster-switch"><input type="checkbox" data-ts-roster-toggle aria-controls="'+rosterId+'"><span class="ts-switch-track" aria-hidden="true"><i></i></span><b>명단 보기</b></label></div><div class="ts-roster ts-card-gallery" data-team-index="'+teamIndex+'" id="'+rosterId+'" hidden>'+(rows||'<p class="empty">등록된 구성원이 없습니다.</p>')+'</div></section>';
 }).join('');
 applySquadAppearance();syncSquadExportTeams(model);
 root.querySelectorAll('[data-ts-roster-toggle]').forEach(input=>{
  const panel=document.getElementById(input.getAttribute('aria-controls'));if(!panel)return;
  const label=input.closest('.ts-roster-switch')?.querySelector('b');
  const sync=()=>{if(input.checked&&!panel.dataset.cardsReady){const team=model.teams[Number(panel.dataset.teamIndex)],careerMap=v319CareerStatsMap(model.asOf);panel.replaceChildren(...team.members.map(member=>squadPlayerCard(member,team.team,query,careerMap)));panel.dataset.cardsReady='1';}panel.hidden=!input.checked;input.setAttribute('aria-expanded',String(input.checked));if(label)label.textContent=input.checked?'명단 숨기기':'명단 보기';};
  input.addEventListener('change',sync);sync();
 });
}

function squadPlayerCard(member,team,query,careerMap){
 const source=document.querySelector('#playerCardContainer .ggfc-player-card');
 const button=document.createElement('button');button.type='button';button.className='ts-player-card-button';button.setAttribute('aria-label',member.name+' '+squadRoleLabel(member.role)+' 선수카드 보기');
 if(!source){button.textContent=member.name;button.onclick=()=>openPlayerCard(member.name,query);return button;}
 const card=source.cloneNode(true),roster=playerCardRoster(member.name,query)||member.roster||{},ability=member.ability;
 card.removeAttribute('style');
 const text=(id,value)=>{const el=card.querySelector('#'+id);if(el)el.textContent=value;};
 text('playerCardYear',playerCardYearShort(query.year));text('playerCardName',String(roster.engName||'').trim()||member.name);
 text('playerCardOVR',ability?ability.currentOvr:'—');text('playerCardPosition',roster.pos||'PLAYER');
 ['Pac','Sho','Pas','Dri','Def','Phy'].forEach(k=>text('playerCardStat'+k,ability?Math.floor(ability[k.toLowerCase()]):'—'));
 const tier=careerFrameState(careerMap[member.name]||{}).tier;card.dataset.careerTier=tier.id;text('playerCardFrameBadge',tier.name);
 const logo=teamLogo(team),club=card.querySelector('.ggfc-player-card-club');club.style.backgroundImage=logo?'url('+JSON.stringify(logo)+')':'none';club.textContent=logo?'':teamDisplayName(team);club.title=teamDisplayName(team);
 const brand=card.querySelector('.ggfc-player-card-brand-logo'),hLogo=headerLogo();brand.style.backgroundImage=hLogo?'url('+JSON.stringify(hLogo)+')':'none';brand.textContent=hLogo?'':'GGFC';
 const mark=card.querySelector('.ggfc-player-card-watermark');mark.style.backgroundImage=logo?'url('+JSON.stringify(logo)+')':'none';mark.textContent='';
 const wrap=card.querySelector('.ggfc-player-card-photo-wrap'),cutout=normalizePlayerPhotoUrl(roster.photoCutout),photo=cutout?roster.photoCutout:roster.photo;
 wrap.title='';wrap.dataset.photoState='empty';wrap.dataset.photoKind=cutout?'cutout':'original';wrap.innerHTML='<div class="ggfc-player-card-photo-fallback">'+esc(playerInitials(member.name))+'</div>';
 if(normalizePlayerPhotoUrl(photo)){
  const img=document.createElement('img');img.className='ggfc-player-card-photo';img.alt=member.name+' 선수 사진';img.loading='lazy';img.decoding='async';img.referrerPolicy='no-referrer';img.dataset.playerPhotoSource=photo;img.dataset.photoIndex='0';
  if(cutout&&normalizePlayerPhotoUrl(roster.photo)&&normalizePlayerPhotoUrl(roster.photo)!==cutout)img.dataset.playerPhotoFallback=roster.photo;
  img.onload=()=>wrap.dataset.photoState='loaded';img.onerror=()=>handlePlayerPhotoError(img);img.src=playerPhotoCandidates(photo)[0];wrap.append(img);
 }
 card.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));applyPlayerCardDesign(card,tier.design);
 const stage=document.createElement('span');stage.className='ts-player-card-stage';stage.append(card);button.append(stage);
 const label=document.createElement('span');label.className='ts-player-card-caption';label.textContent=member.name+' · '+squadRoleLabel(member.role);button.append(label);
 if(member.reason){const note=document.createElement('small');note.textContent=member.reason;button.append(note);}
 button.onclick=()=>openPlayerCard(member.name,query);return button;
}

/* V3.25.35: administrator appearance controls and shareable squad images. */
let squadAppearanceDraft=null,squadAppearanceDirty=false,squadAppearanceScope='',squadExportBusy=false;
function squadAppearanceNumber(value,fallback,min,max){
 if(value===null||value===undefined||value==='')return fallback;
 const n=Number(value);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;
}
function squadPhotoSettings(raw={}){
 return {scale:squadAppearanceNumber(raw?.scale,100,60,150),x:squadAppearanceNumber(raw?.x,0,-30,30),y:squadAppearanceNumber(raw?.y,0,-30,30)};
}
function normalizeSquadAppearance(raw=DB.settings?.squadAppearance){
 const src=raw&&typeof raw==='object'?raw:{};
 const settings={manager:squadPhotoSettings(src.manager),coach:squadPhotoSettings(src.coach),logoSize:squadAppearanceNumber(src.logoSize,52,30,90),logoOpacity:squadAppearanceNumber(src.logoOpacity,11,0,35),border:src.border!==false,colors:{},teams:{}};
 const safe=key=>!['__proto__','constructor','prototype'].includes(key);
 Object.entries(src.colors||{}).forEach(([team,color])=>{if(safe(team)&&/^#[0-9a-f]{6}$/i.test(String(color)))settings.colors[team]=color;});
 Object.entries(src.teams||{}).forEach(([team,value])=>{if(safe(team)&&value&&typeof value==='object')settings.teams[team]={manager:squadPhotoSettings(value.manager||settings.manager),coach:squadPhotoSettings(value.coach||settings.coach)};});
 return settings;
}
function squadAppearanceTeams(){return [...new Set([...teamList(),...squadRows().map(r=>r.team)])].filter(t=>t&&!['__proto__','constructor','prototype'].includes(t));}
function effectiveSquadAppearance(){return normalizeSquadAppearance(admin&&squadAppearanceDirty?squadAppearanceDraft:DB.settings?.squadAppearance);}
function applySquadAppearance(root=document.getElementById('teamSquadContent'),settings=effectiveSquadAppearance()){
 if(!root)return;
 root.querySelectorAll('.ts-team').forEach(box=>{
  const team=box.dataset.team,photo=settings.teams[team]||settings;
  box.style.setProperty('--ts-manager-col',String(226.2*photo.manager.scale/100)+'fr');box.style.setProperty('--ts-coach-col',String(191.1*photo.coach.scale/100)+'fr');
  box.style.setProperty('--ts-team-color',settings.colors[team]||teamRecordColor(team));
  box.classList.toggle('ts-color-border',settings.border);
  box.style.setProperty('--ts-logo-size',settings.logoSize+'%');box.style.setProperty('--ts-logo-opacity',String(settings.logoOpacity/100));
  for(const role of ['manager','coach'])for(const key of ['scale','x','y'])box.style.setProperty('--ts-'+role+'-'+key,key==='scale'?String(photo[role][key]/100):photo[role][key]+'px');
 });
}
function renderSquadAppearanceEditor(){
 const panel=document.getElementById('squadAppearancePanel'),root=document.getElementById('squadAppearanceEditor');if(!panel||!root)return;
 panel.hidden=!admin;if(!admin){squadAppearanceDirty=false;squadAppearanceDraft=null;return;}
 if(!squadAppearanceDirty||!squadAppearanceDraft)squadAppearanceDraft=normalizeSquadAppearance();
 const d=squadAppearanceDraft,teams=squadAppearanceTeams();if(!teams.includes(squadAppearanceScope))squadAppearanceScope='';
 const p=d.teams[squadAppearanceScope]||d;
 const slider=(label,key,value,min,max,step=1)=>'<label class="squad-range">'+label+'<span><input type="range" data-squad-setting="'+key+'" min="'+min+'" max="'+max+'" step="'+step+'" value="'+value+'"><output>'+value+(key.endsWith('scale')||key.startsWith('logo')?'%':'px')+'</output></span></label>';
 root.innerHTML='<p class="note">사진 크기 100%는 현재 크기입니다. 좌우·상하 위치는 px 단위이며, +는 오른쪽·아래 방향입니다. 변경은 아래 팀 상자에 미리 보이며 설정 저장 후 모든 회원에게 적용됩니다.</p><label class="squad-setting-scope">사진 조정 대상<select id="squadPhotoScope"><option value="">전체 팀 공통</option>'+teams.map(t=>'<option value="'+esc(t)+'">'+esc(teamDisplayName(t))+'</option>').join('')+'</select></label><p class="note">'+(squadAppearanceScope?(d.teams[squadAppearanceScope]?'이 팀은 개별 사진 설정을 사용합니다.':'현재 공통 사진 설정을 사용합니다. 조절하면 이 팀에만 적용됩니다.'):'팀별 사진 설정이 있는 팀은 해당 설정을 우선합니다.')+'</p><div class="squad-settings-grid">'+['manager','coach'].map(role=>'<fieldset class="ggfc-ui-settings"><legend>'+(role==='manager'?'감독':'코치')+' 사진</legend>'+slider('크기',role+'.scale',p[role].scale,60,150,5)+slider('좌우 위치',role+'.x',p[role].x,-30,30)+slider('상하 위치',role+'.y',p[role].y,-30,30)+'</fieldset>').join('')+'<fieldset class="ggfc-ui-settings"><legend>배경 로고 · 전체 팀 공통</legend>'+slider('배치 너비','logoSize',d.logoSize,30,90)+slider('진하기','logoOpacity',d.logoOpacity,0,35)+'<p class="note">원본 로고의 비율은 유지합니다. 진하기 0%는 숨김입니다.</p></fieldset></div><fieldset class="ggfc-ui-settings"><legend>팀 고유 색상 테두리</legend><label><input type="checkbox" id="squadBorderEnabled" '+(d.border?'checked':'')+'> 팀별 색상 사용</label><div class="squad-team-colors">'+teams.map(t=>'<label>'+esc(teamDisplayName(t))+'<input type="color" data-squad-color="'+esc(t)+'" aria-label="'+esc(t)+' 테두리 색상" value="'+esc(d.colors[t]||teamRecordColor(t))+'"></label>').join('')+'</div></fieldset><div class="squad-settings-actions"><span id="squadAppearanceStatus" role="status">'+(squadAppearanceDirty?'저장 전 미리보기':'현재 저장된 설정')+'</span><button type="button" class="btn" id="squadPhotoReset">'+(squadAppearanceScope?'이 팀 사진을 공통 설정으로':'전체 디자인 기본값')+'</button><button type="button" class="btn" id="squadAppearanceCancel">변경 취소</button><button type="button" class="btn primary" id="squadAppearanceSave">디자인 설정 저장</button></div>';
 document.getElementById('squadPhotoScope').value=squadAppearanceScope;
 document.getElementById('squadPhotoScope').onchange=e=>{squadAppearanceScope=e.target.value;renderSquadAppearanceEditor();};
 root.querySelectorAll('[data-squad-setting]').forEach(input=>input.oninput=()=>{
  if(!admin||!GGFC.canEdit())return;
  const key=input.dataset.squadSetting,value=Number(input.value);
  if(key.includes('.')){let target=d;if(squadAppearanceScope){if(!d.teams[squadAppearanceScope])d.teams[squadAppearanceScope]={manager:{...d.manager},coach:{...d.coach}};target=d.teams[squadAppearanceScope];}const [role,field]=key.split('.');target[role][field]=value;}else d[key]=value;
  input.nextElementSibling.textContent=value+(key.endsWith('scale')||key.startsWith('logo')?'%':'px');squadAppearanceChanged();
 });
 root.querySelectorAll('[data-squad-color]').forEach(input=>input.oninput=()=>{if(!admin||!GGFC.canEdit())return;d.colors[input.dataset.squadColor]=input.value;squadAppearanceChanged();});
 document.getElementById('squadBorderEnabled').onchange=e=>{if(!admin||!GGFC.canEdit())return;d.border=e.target.checked;squadAppearanceChanged();};
 document.getElementById('squadPhotoReset').onclick=()=>{if(!admin||!GGFC.canEdit())return;if(squadAppearanceScope)delete d.teams[squadAppearanceScope];else squadAppearanceDraft=normalizeSquadAppearance({});squadAppearanceChanged();renderSquadAppearanceEditor();};
 document.getElementById('squadAppearanceCancel').onclick=()=>{squadAppearanceDirty=false;squadAppearanceDraft=null;renderSquadAppearanceEditor();applySquadAppearance();GGFC.refreshUI();};
 document.getElementById('squadAppearanceSave').onclick=saveSquadAppearance;
}
function squadAppearanceChanged(){
 squadAppearanceDirty=true;applySquadAppearance();const status=document.getElementById('squadAppearanceStatus');if(status)status.textContent='저장 전 미리보기';GGFC.refreshUI();
}
function saveSquadAppearance(){
 if(!admin||!GGFC.canEdit()){toast('관리자 인증과 서버 연결을 확인해 주세요.');return false;}
 const previous=DB.settings.squadAppearance;DB.settings.squadAppearance=normalizeSquadAppearance(squadAppearanceDraft);
 try{const result=save();if(!result.cloudPending)throw result.error||new Error('저장 실패');}
 catch(e){if(previous===undefined)delete DB.settings.squadAppearance;else DB.settings.squadAppearance=previous;toast('설정을 저장하지 못했습니다. 다시 시도하세요.');return false;}
 squadAppearanceDirty=false;squadAppearanceDraft=null;renderSquadAppearanceEditor();applySquadAppearance();GGFC.refreshUI();toast('디자인 설정 적용 · 공유 저장 중');return true;
}
function syncSquadExportTeams(model){
 const select=document.getElementById('squadExportTeam');if(!select)return;const old=select.value;
 select.innerHTML='<option value="">전체 팀</option>'+model.teams.map(t=>'<option value="'+esc(t.team)+'">'+esc(teamDisplayName(t.team))+'</option>').join('');
 if(model.teams.some(t=>t.team===old))select.value=old;
}
function squadSharePlayerHtml(member,year){
 const roster=selectPlayerRoster(member.name,year)||member.roster||{},photo=normalizePlayerPhotoUrl(roster.photoCutout)||normalizePlayerPhotoUrl(roster.photo),a=member.ability;
 return '<article class="squad-share-player"><div class="squad-share-face"><span>'+esc(playerInitials(member.name))+'</span>'+(photo?'<img src="'+esc(photo)+'" alt="'+esc(member.name)+'">':'')+'</div><div><strong>'+esc(member.name)+'</strong><small>'+esc(squadRoleLabel(member.role))+' · '+esc(member.position||roster.pos||'—')+'</small><b>OVR '+(a?esc(String(a.currentOvr)):'—')+'</b></div><div class="squad-share-values">'+['pac','sho','pas','dri','def','phy'].map(k=>'<span>'+k.toUpperCase()+'<b>'+(a?Math.floor(a[k]):'—')+'</b></span>').join('')+'</div></article>';
}
async function prepareSquadExportImages(root){
 // Rasterize contain-fit padding: html2canvas does not reliably respect object-fit.
 const groups=new Map();root.querySelectorAll('img').forEach(img=>{const src=img.getAttribute('src')||'';if(!groups.has(src))groups.set(src,[]);groups.get(src).push(img);});
 let unavailable=0;
 await Promise.all([...groups].map(async([src,images])=>{
  const image=new Image();image.crossOrigin='anonymous';image.referrerPolicy='no-referrer';
  const ready=new Promise(resolve=>{const timer=setTimeout(()=>resolve(false),7000);image.onload=()=>{clearTimeout(timer);resolve(true);};image.onerror=()=>{clearTimeout(timer);resolve(false);};});image.src=src;
  if(!await ready||!image.naturalWidth){unavailable++;images.forEach(img=>img.remove());return;}
  for(const img of images){let canvas;
   try{
    const win=root.ownerDocument.defaultView,style=win.getComputedStyle(img),width=Math.max(1,img.clientWidth),height=Math.max(1,img.clientHeight);
    canvas=document.createElement('canvas');const factor=Math.min(2,2048/Math.max(width,height));canvas.width=Math.ceil(width*factor);canvas.height=Math.ceil(height*factor);
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas unavailable');
    const scale=Math.min(canvas.width/image.naturalWidth,canvas.height/image.naturalHeight),w=image.naturalWidth*scale,h=image.naturalHeight*scale;
    const position=style.objectPosition.split(' '),fraction=value=>value==='right'||value==='bottom'?1:value==='left'||value==='top'?0:Number.isFinite(parseFloat(value))?parseFloat(value)/100:.5;
    ctx.drawImage(image,(canvas.width-w)*fraction(position[0]),(canvas.height-h)*fraction(position[1]),w,h);
    img.src=canvas.toDataURL('image/png');img.removeAttribute('crossorigin');
   }catch(e){unavailable++;img.remove();}finally{if(canvas)canvas.width=canvas.height=0;}
  }
 }));
 await waitDashboardImages(root);return unavailable;
}
async function exportTeamSquadImage(button){
 if(squadExportBusy)return;
 const source=document.getElementById('teamSquadContent');if(!source?.querySelector('.ts-team')){toast('저장할 팀 스쿼드가 없습니다.');return;}
 if(squadAppearanceDirty){toast('미리보기 중입니다. 디자인 설정을 저장하거나 변경을 취소한 뒤 이미지를 저장해 주세요.');return;}
 const selected=document.getElementById('squadExportTeam').value,includeRoster=document.getElementById('squadExportRoster').checked;
 const model=teamSquadModel(teamSquadCompetition,teamSquadAsOfDate),cutoff=model.asOf,settings=normalizeSquadAppearance();
 const clone=source.cloneNode(true),query={year:cutoff.slice(0,4),mode:'SEASON',start:cutoff.slice(0,4)+'-01-01',end:cutoff,asOf:cutoff,allCompetitions:true};
 
 clone.querySelectorAll('.ts-team').forEach(box=>{if(selected&&box.dataset.team!==selected){box.remove();return;}const team=model.teams.find(t=>t.team===box.dataset.team),roster=box.querySelector('.ts-roster');
  box.querySelector('.ts-roster-switch')?.remove();
  if(includeRoster&&team){roster.className='squad-share-roster';roster.innerHTML=team.members.map(m=>squadSharePlayerHtml(m,query.year)).join('');roster.hidden=false;}else{roster.remove();box.querySelector('.ts-roster-title')?.remove();}
 });
 clone.querySelectorAll('.ts-league-heading').forEach(h=>{if(!h.nextElementSibling?.classList.contains('ts-team'))h.remove();});
 clone.querySelectorAll('.ts-basis-note,.ts-movement').forEach(n=>n.remove());
 clone.querySelectorAll('.ts-league-heading').forEach(h=>{let count=0;for(let n=h.nextElementSibling;n&&!n.classList.contains('ts-league-heading');n=n.nextElementSibling)if(n.classList.contains('ts-team'))count++;const text=h.querySelector('div>span');if(text)text.textContent='조회일 기준 · '+count+'팀';});
 cleanDashboardSnapshot(clone);applySquadAppearance(clone,settings);
 let frame,canvas;const label=button.textContent;squadExportBusy=true;button.disabled=true;button.textContent='이미지 준비 중…';button.setAttribute('aria-busy','true');
 try{
  const renderer=await loadDashboardRenderer();
  frame=document.createElement('iframe');frame.title='Team Squad 이미지 준비';frame.tabIndex=-1;frame.setAttribute('aria-hidden','true');frame.style.cssText='position:fixed;left:-100000px;top:0;width:1080px;height:1000px;border:0;pointer-events:none';document.body.appendChild(frame);
  const doc=frame.contentDocument;doc.documentElement.lang='ko';const base=doc.createElement('base');base.href=document.baseURI;doc.head.appendChild(base);
  const link=doc.createElement('link');link.rel='stylesheet';link.href=[...document.querySelectorAll('link[rel="stylesheet"]')].find(l=>/\/ggfc\.css(?:\?|$)/.test(l.href)).href;
  const ready=settleExportResource(link,12000,()=>!!link.sheet);doc.head.appendChild(link);await ready;if(!link.sheet)throw new Error('출력 스타일을 불러오지 못했습니다.');
  const style=doc.createElement('style');style.textContent='@font-face{font-family:SquadExport;src:url("assets/fonts/GGFCBody.woff")}html,body{margin:0;padding:0;background:#f3f5f7;min-width:0}#v-squad{display:block!important;width:1080px;box-sizing:border-box;padding:32px;font-family:SquadExport,sans-serif}#v-squad *{font-family:inherit}#v-squad .squad-share-heading{background:#102b4e;color:white;padding:24px;border-radius:12px}#v-squad .squad-share-heading h1{margin:0 0 8px;font-size:30px}#v-squad .squad-share-heading p{margin:0;font-size:15px}#v-squad .ts-team{break-inside:avoid}#v-squad .ts-basis-note{display:none}#v-squad .squad-share-foot{text-align:center;color:#52657a;font-size:13px;padding:16px}';doc.head.appendChild(style);
  const root=doc.createElement('section');root.id='v-squad';const heading=doc.createElement('header');heading.className='squad-share-heading';
  const h=doc.createElement('h1');h.textContent=(displaySettings().brandTitle||'GGFC')+' · Team Squad';const p=doc.createElement('p');p.textContent=(selected?teamDisplayName(selected):'전체 팀')+' · 스쿼드 기준 '+cutoff;heading.append(h,p);root.append(heading,doc.adoptNode(clone));const foot=doc.createElement('div');foot.className='squad-share-foot';foot.textContent='GGFC RECORD CENTER · '+cutoff;root.append(foot);doc.body.append(root);
  await doc.fonts.load('400 16px SquadExport');if(![...document.fonts].some(f=>f.family==='SquadExport'))document.fonts.add(await new FontFace('SquadExport','url("'+new URL('assets/fonts/GGFCBody.woff',document.baseURI).href+'")').load());
  const unavailable=await prepareSquadExportImages(root);const height=Math.ceil(root.getBoundingClientRect().height);frame.style.height=height+'px';
  const scale=Math.min(2,16000/height,Math.sqrt(12000000/(1080*height)));if(scale<.75)throw new Error('선수 명단이 많습니다. 저장 범위를 팀별로 선택해 주세요.');
  button.textContent='PNG 만드는 중…';canvas=await renderer(root,{scale,width:1080,height,windowWidth:1080,windowHeight:height,backgroundColor:'#f3f5f7',useCORS:true,allowTaint:false,logging:false});
  const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?.size?resolve(b):reject(new Error('PNG 변환 실패')),'image/png'));
  downloadBlob('GGFC_Team_Squad_'+exportSafeName(selected||'ALL')+'_'+cutoff+'.png',blob);
  toast('Team Squad PNG 저장 · '+canvas.width+' × '+canvas.height+'px'+(unavailable?' · 불러오지 못한 사진은 이름으로 표시했습니다.':''));
 }catch(e){console.error(e);toast('이미지 저장 실패: '+e.message);}
 finally{if(canvas)canvas.width=canvas.height=0;frame?.remove();squadExportBusy=false;button.disabled=false;button.textContent=label;button.removeAttribute('aria-busy');}
}
