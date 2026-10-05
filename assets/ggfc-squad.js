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
 const role=squadRoleLabel(member.role), rank=squadRoleRank(member.role), photo=playerPhoto(name,year);
 const fallback=esc(Array.from(name.replace(/\s+/g,'')).slice(0,1).join('')||'선');
 const klass=rank===0?'manager':'coach';
 return '<article class="ts-staff-person ts-staff-'+klass+'" title="'+esc(role+' · '+name)+'"><div class="ts-staff-photo"><span class="ts-staff-fallback">'+fallback+'</span>'+(photo?'<img src="'+esc(photo)+'" data-player-photo-source="'+esc(photo)+'" data-photo-index="0" alt="'+esc(name+' '+role+' 사진')+'" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="handlePlayerPhotoError(this)">':'')+'</div><div class="ts-staff-caption"><span>'+esc(role)+'</span><b>'+esc(name)+'</b></div></article>';
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
  const bars=TEAM_SQUAD_AXES.map(a=>'<div class="ts-axis '+a.id+'"><div class="ts-axis-heading"><b>'+a.code+' · '+a.label+'</b><strong>'+value(t.scores[a.id])+'</strong></div><div class="ts-bar" role="meter" aria-label="'+esc(t.team+' '+a.label)+'" aria-valuemin="0" aria-valuemax="100"'+(Number.isFinite(t.scores[a.id])?' aria-valuenow="'+t.scores[a.id].toFixed(1)+'"':'')+'><i style="width:'+(t.scores[a.id]??0)+'%"></i></div>'+squadStars(t.scores[a.id])+'</div>').join('');
  const staffPortraits=t.staff.slice(0,2).map(m=>squadStaffPortrait(m,year)).join('');
  const rows='<p class="note">선수카드를 불러오는 중입니다.</p>';
  const leagueHead=teamIndex===0||model.teams[teamIndex-1].league!==t.league?'<header class="ts-league-heading" data-league="'+esc(t.league)+'">'+(t.league?leagueSymbolHtml(t.league):'')+'<div><h2>'+esc(t.league?leagueGroupLabel(t.league):'리그 미지정')+'</h2><span>조회일 기준 · '+model.teams.filter(x=>x.league===t.league).length+'팀</span></div></header>':'';
  const movement=squadMovementHtml(t,previousMap.get(t.team),changeInfo.previous,changeInfo.current);
  return leagueHead+'<section class="ts-team" data-team="'+esc(t.team)+'"><header class="ts-team-header"><div class="ts-team-brand">'+(logo?'<img class="ts-team-logo" src="'+esc(logo)+'" alt="'+esc(t.team)+' 로고">':'<span class="ts-logo-fallback">'+esc(t.team.slice(0,2))+'</span>')+'<div class="ts-team-copy"><span class="ts-team-kicker">TEAM SQUAD</span><h3>'+esc(teamDisplayName(t.team))+'</h3><p>스쿼드 적용일 '+esc(t.date)+' · 능력치 기준 '+esc(model.asOf)+' · '+t.members.length+'명</p><span class="ts-overall"><span>TEAM CURRENT</span><strong class="ts-current-score">'+value(t.total)+'</strong> '+squadStars(t.total)+'</span></div>'+(staffPortraits?'<div class="ts-staff-showcase" aria-label="감독 및 코치"><span class="ts-staff-kicker">COACHING STAFF</span><div class="ts-staff-stack">'+staffPortraits+'</div></div>':'')+'</div><div class="ts-team-bars">'+bars+'</div></header>'+movement+'<div class="ts-roster-title"><div><h4>등록 선수 명단</h4><span>전력 산정 '+t.evaluated+'/'+t.members.length+'명 · 감독·코치 우선 표시</span></div><label class="ts-roster-switch"><input type="checkbox" data-ts-roster-toggle aria-controls="'+rosterId+'"><span class="ts-switch-track" aria-hidden="true"><i></i></span><b>명단 보기</b></label></div><div class="ts-roster ts-card-gallery" data-team-index="'+teamIndex+'" id="'+rosterId+'" hidden>'+(rows||'<p class="empty">등록된 구성원이 없습니다.</p>')+'</div></section>';
 }).join('');
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
  const img=document.createElement('img');img.className='ggfc-player-card-photo';img.alt=member.name+' 선수 사진';img.loading='lazy';img.decoding='async';img.referrerPolicy='no-referrer';img.dataset.playerPhotoSource=photo;img.dataset.photoIndex='0';img.dataset.useCutoutCache=String(!!cutout);
  if(cutout&&normalizePlayerPhotoUrl(roster.photo)&&normalizePlayerPhotoUrl(roster.photo)!==cutout)img.dataset.playerPhotoFallback=roster.photo;
  img.onload=()=>wrap.dataset.photoState='loaded';img.onerror=()=>handlePlayerPhotoError(img);img.src=playerPhotoCandidates(photo,!!cutout)[0];wrap.append(img);
 }
 card.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));applyPlayerCardDesign(card,tier.design);
 const stage=document.createElement('span');stage.className='ts-player-card-stage';stage.append(card);button.append(stage);
 const label=document.createElement('span');label.className='ts-player-card-caption';label.textContent=member.name+' · '+squadRoleLabel(member.role);button.append(label);
 if(member.reason){const note=document.createElement('small');note.textContent=member.reason;button.append(note);}
 button.onclick=()=>openPlayerCard(member.name,query);return button;
}
