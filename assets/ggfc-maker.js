/* Balanced Team Maker — local session draft, never writes league/roster/ability DB. */
const TM_ROLES=['PV','AL','FS','GR'];
const TM_STYLES={balanced:'밸런스',attack:'공격형',defence:'수비형'};
const TM_FORMATIONS={
 diamond:{name:'다이아몬드',slots:[['PV',50,14,'피보'],['AL',20,40,'왼쪽 아라'],['AL',80,40,'오른쪽 아라'],['FS',50,66,'픽소'],['GR',50,88,'골레이로']]},
 '2-2':{name:'2-2',slots:[['PV',25,24,'전방 왼쪽'],['PV',75,24,'전방 오른쪽'],['FS',25,62,'후방 왼쪽'],['FS',75,62,'후방 오른쪽'],['GR',50,88,'골레이로']]},
 '4-0':{name:'4-0',slots:[['AL',14,43,'왼쪽 와이드'],['AL',38,43,'왼쪽 중앙'],['AL',62,43,'오른쪽 중앙'],['AL',86,43,'오른쪽 와이드'],['GR',50,88,'골레이로']]},
 '1-3':{name:'1-3',slots:[['AL',20,24,'전방 왼쪽'],['PV',50,24,'전방 중앙'],['AL',80,24,'전방 오른쪽'],['FS',50,65,'후방 중앙'],['GR',50,88,'골레이로']]},
 '3-1':{name:'3-1',slots:[['PV',50,16,'전방 중앙'],['FS',20,60,'후방 왼쪽'],['AL',50,60,'후방 중앙'],['FS',80,60,'후방 오른쪽'],['GR',50,88,'골레이로']]}
};
const tmState={date:'',competition:'정규리그',signature:'',pool:[],selected:new Set(),positions:new Map(),count:3,repeat:true,opponents:false,seed:1,teams:[],source:'',formation:'diamond',size:5,lineup:[],style:'balanced',search:'',teamFilter:'',tab:'balance',notice:'',busy:false};
const tmMean=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:null;
const tmClamp=v=>Math.max(0,Math.min(99,v));
const tmNumber=v=>Number.isFinite(v)?v.toFixed(1):'—';
const tmPair=(a,b)=>JSON.stringify([a,b].sort());
function tmPosition(value){return normalizeAbilityPosition(value)||({FW:'PV',MF:'AL',DF:'FS'}[String(value||'').trim().toUpperCase()]||'');}
function tmPool(date,competition){
 const year=date.slice(0,4),known=new Map(),snap=squadSnapshot({date,comp:competition}),members=new Map();
 for(const team of snap)for(const m of team.members||[]){const id=normalizePlayerMatchKey(m.player);if(!members.has(id))members.set(id,new Set());members.get(id).add(team.team);}
 for(const row of DB.roster||[]){
  const id=normalizePlayerMatchKey(row.player),y=String(row.year||'');
  if(!id||isOwnGoalPlayer(row.player)||(y&&y>year)||!playerEligibleOn(row.player,date))continue;
  const prev=known.get(id);if(!prev||String(prev.year||'')<y)known.set(id,row);
 }
 const recordDate=[...(DB.matches||[]).map(m=>normDate(m.date)),...(DB.soccerbee||[]).map(m=>normDate(m.date))].filter(d=>d&&d<=date).sort().pop()||date;
 const enabled=abilitySystemEnabled();
 return [...known].map(([id,row])=>{
  const actual=members.get(id),team=actual?.size===1?[...actual][0]:actual?.size>1?'중복 소속':snap.length?'미배정':row.team||'미배정';
  const ability=enabled?playerAbilityRecordAtDate(row.player,recordDate.slice(0,4),abilityHalfForDate(recordDate.slice(0,4),recordDate),recordDate,true):null;
  const rated=ability&&Number.isFinite(ability.currentOvr)&&['pac','sho','pas','dri','def','phy'].every(k=>Number.isFinite(ability[k]));
  return {id,name:row.player,team,position:tmPosition(row.pos),ovr:rated?ability.currentOvr:null,stats:rated?Object.fromEntries(['pac','sho','pas','dri','def','phy'].map(k=>[k,tmClamp(ability[k]+num(ability.form?.modifier))])):null,baseStats:rated?Object.fromEntries(['pac','sho','pas','dri','def','phy'].map(k=>[k,ability[k]])):null,formModifier:rated?num(ability.form?.modifier):0,provisional:rated&&!ability.measured,recordDate};
 }).sort((a,b)=>compareNamesKo(a.name,b.name));
}
function tmSelected(){
 const rows=tmState.pool.filter(p=>tmState.selected.has(p.id)),average=tmMean(rows.map(p=>p.ovr).filter(Number.isFinite))??50;
 return rows.map(p=>({...p,position:tmState.positions.get(p.id)??p.position,value:p.ovr??average,estimated:p.ovr===null}));
}
function tmHistory(date){
 // Last 12 actual match dates, all competitions, strictly before the planned day.
 const list=uniqueRecordMatches(DB.matches||[]).filter(m=>normDate(m.date)<date&&normDate(m.date)&&[m.hs,m.as].every(v=>v!==null&&v!==undefined&&String(v).trim()!==''&&Number.isFinite(Number(v)))&&matchResult(m,m.home));
 const days=[...new Set(list.map(m=>normDate(m.date)))].sort().slice(-12),wanted=new Set(days),pair=new Map();
 const attend=analysisAttendance(list.filter(m=>wanted.has(normDate(m.date)))),byId=new Map();
 for(const a of attend){const id=detailMatchKey(a.id);if(!byId.has(id))byId.set(id,new Map());const p=normalizePlayerMatchKey(a.player);if(!byId.get(id).has(p))byId.get(id).set(p,new Set());byId.get(id).get(p).add(a.team);}
 for(const m of list.filter(m=>wanted.has(normDate(m.date)))){
  const players=[...(byId.get(detailMatchKey(m.id))||[])].filter(([p,t])=>t.size===1&&[m.home,m.away].includes([...t][0]));
  for(let i=0;i<players.length;i++)for(let j=i+1;j<players.length;j++){
   const key=tmPair(players[i][0],players[j][0]),r=pair.get(key)||{same:0,opposite:0};
   if([...players[i][1]][0]===[...players[j][1]][0])r.same++;else r.opposite++;pair.set(key,r);
  }
 }
 return {pair,days:days.length,max:Math.max(1,...[...pair.values()].flatMap(p=>[p.same,p.opposite]))};
}
function tmBalanceCost(groups,history,options){
 const counts=groups.map(g=>{const roles={PV:0,AL:0,FS:0};let sum=0;for(const p of g){sum+=p.value;if(p.position in roles)roles[p.position]++;}return {roles,n:g.length,average:g.length?sum/g.length:0};});
 const mean=tmMean(counts.map(c=>c.average))||0,totalPlayers=counts.reduce((s,c)=>s+c.n,0);
 let cost=counts.reduce((s,c)=>s+(c.average-mean)**2,0)*12;
 for(const role of ['PV','AL','FS']){const total=counts.reduce((s,c)=>s+c.roles[role],0);cost+=counts.reduce((s,c)=>s+(c.roles[role]-total*c.n/totalPlayers)**2,0)*1.5;}
 if(options.repeat||options.opponents){let related=0,n=0;for(const g of groups)for(let i=0;i<g.length;i++)for(let j=i+1;j<g.length;j++){
  if(options._pairWeight)related+=options._pairWeight.get(g[i].id).get(g[j].id);
  else{const r=history.pair.get(tmPair(g[i].id,g[j].id));related+=((options.repeat?r?.same||0:0)-(options.opponents?r?.opposite||0:0))/history.max;}n++;
 }cost+=n?related/n*2:0;}
 return cost;
}
function tmBalance(players,count,history,options,seed=1){
 if(count<2||count>6||players.length<count)throw Error('선택 선수 수 이상으로 팀을 만들 수 없습니다. 2~6팀을 선택하세요.');
 if(new Set(players.map(p=>p.id)).size!==players.length)throw Error('선수가 중복 선택되었습니다.');
 // Precompute pair costs once; avoid serializing names inside the swap search.
 if(options.repeat||options.opponents){
  const weights=new Map(players.map(p=>[p.id,new Map()]));
  for(let i=0;i<players.length;i++)for(let j=i+1;j<players.length;j++){
   const a=players[i].id,b=players[j].id,r=history.pair.get(tmPair(a,b));
   const value=((options.repeat?r?.same||0:0)-(options.opponents?r?.opposite||0:0))/history.max;
   weights.get(a).set(b,value);weights.get(b).set(a,value);
  }options={...options,_pairWeight:weights};
 }
 const capacities=Array.from({length:count},(_,i)=>Math.floor(players.length/count)+(i<players.length%count?1:0));
 let rng=seed>>>0;const random=()=>((rng=(1664525*rng+1013904223)>>>0)/4294967296);
 let best=null,bestCost=Infinity;
 for(let trial=0;trial<10;trial++){
  const groups=capacities.map(()=>[]),shuffle=players.map(p=>({p,r:random()})).sort((a,b)=>(b.p.position==='GR')-(a.p.position==='GR')||a.r-b.r).map(x=>x.p);
  for(const p of shuffle){
   let choices=groups.map((g,i)=>i).filter(i=>groups[i].length<capacities[i]);
   if(p.position==='GR'){const low=Math.min(...choices.map(i=>groups[i].filter(x=>x.position==='GR').length));choices=choices.filter(i=>groups[i].filter(x=>x.position==='GR').length===low);}
   const i=choices[Math.floor(random()*choices.length)];groups[i].push(p);
  }
  let cost=tmBalanceCost(groups,history,options);
  for(let pass=0;pass<5;pass++){
   let swap=null,next=cost;
   for(let a=0;a<count;a++)for(let b=a+1;b<count;b++)for(let i=0;i<groups[a].length;i++)for(let j=0;j<groups[b].length;j++){
    if((groups[a][i].position==='GR')!==(groups[b][j].position==='GR'))continue;
    [groups[a][i],groups[b][j]]=[groups[b][j],groups[a][i]];
    const value=tmBalanceCost(groups,history,options);
    [groups[a][i],groups[b][j]]=[groups[b][j],groups[a][i]];
    if(value<next-1e-8){next=value;swap=[a,b,i,j];}
   }
   if(!swap)break;const [a,b,i,j]=swap;[groups[a][i],groups[b][j]]=[groups[b][j],groups[a][i]];cost=next;
  }
  if(cost<bestCost){bestCost=cost;best=groups.map(g=>g.slice());}
 }
 return best;
}
function tmSlots(){
 const slots=TM_FORMATIONS[tmState.formation].slots.map((s,i)=>({role:s[0],x:s[1],y:s[2],label:s[3],id:i}));
 if(tmState.size===6)slots.push({role:'AL',x:50,y:tmState.formation==='4-0'?65:tmState.formation==='3-1'?37:tmState.formation==='1-3'?45:tmState.formation==='2-2'?43:40,label:'추가 필드',id:5});
 return slots;
}
function tmRoleScore(p,role,style){
 const s=p.stats||Object.fromEntries(['pac','sho','pas','dri','def','phy'].map(k=>[k,p.value]));
 const weights={PV:{sho:.4,dri:.2,pac:.2,phy:.2},AL:{pas:.3,dri:.3,pac:.2,phy:.1,def:.1},FS:{def:.5,phy:.3,pas:.1,pac:.1},GR:{def:.6,pas:.2,phy:.2}}[role];
 const roleScore=Object.entries(weights).reduce((v,[k,w])=>v+s[k]*w,0);
 const mode=style==='attack'?s.sho*.45+s.pac*.25+s.dri*.2+s.pas*.1:style==='defence'?s.def*.55+s.phy*.3+s.pas*.15:p.value;
 return (role==='GR'?roleScore:.7*roleScore+.3*mode)+(p.position===role?2:0);
}
function tmAutoLineup(players,slots,style){
 // Assignment DP: each selected player at most once; no invented automatic keeper.
 const dp=new Map([[0,{score:0,picks:Array(slots.length).fill('')}]]);
 for(const p of players){const prev=[...dp];for(const [mask,state] of prev)for(let i=0;i<slots.length;i++){
  if(mask&(1<<i)||slots[i].role==='GR'&&p.position!=='GR')continue;
  const key=mask|(1<<i),score=state.score+tmRoleScore(p,slots[i].role,style),old=dp.get(key);
  if(!old||score>old.score){const picks=state.picks.slice();picks[i]=p.id;dp.set(key,{score,picks});}
 }}
 // Fill keeper first when one exists, then maximize filled places and role suitability.
 const keeper=slots.findIndex(s=>s.role==='GR'),hasKeeper=players.some(p=>p.position==='GR');
 return [...dp].filter(([mask])=>!hasKeeper||keeper<0||(mask&(1<<keeper))).sort((a,b)=>b[1].picks.filter(Boolean).length-a[1].picks.filter(Boolean).length||b[1].score-a[1].score)[0]?.[1].picks||Array(slots.length).fill('');
}
function tmSources(){
 const players=tmSelected();return [...tmState.teams.map((ids,i)=>({id:'auto:'+i,name:'TEAM '+String.fromCharCode(65+i),players:ids.map(id=>players.find(p=>p.id===id)).filter(Boolean)})),
 ...[...new Set(tmState.pool.map(p=>p.team))].sort(compareNamesKo).map(team=>({id:'club:'+team,name:teamDisplayName(team),players:players.filter(p=>p.team===team)}))];
}
function tmSource(){const sources=tmSources();return sources.find(s=>s.id===tmState.source)||sources[0]||{id:'',name:'팀 없음',players:[]};}
function tmReset(message='선택 조건이 바뀌어 편성안을 초기화했습니다.') {tmState.teams=[];tmState.lineup=[];tmState.notice=message;}
function tmRosterHtml(){
 const rows=tmState.pool.filter(p=>(!tmState.teamFilter||p.team===tmState.teamFilter)&&normalizePlayerMatchKey(p.name).includes(normalizePlayerMatchKey(tmState.search)));
 return rows.length?rows.map(p=>'<div class="tm-person"><label><input id="tm-check-'+esc(p.id)+'" type="checkbox" data-tm-player="'+esc(p.id)+'" '+(tmState.selected.has(p.id)?'checked':'')+'><span><b>'+esc(p.name)+'</b><small>'+esc(teamDisplayName(p.team))+(p.provisional?' · SB 미측정':'')+'</small></span><strong>'+tmNumber(p.ovr)+'</strong></label><select aria-label="'+esc(p.name)+' 편성용 포지션" data-tm-position="'+esc(p.id)+'"><option value="">미지정</option>'+TM_ROLES.map(r=>'<option '+((tmState.positions.get(p.id)??p.position)===r?'selected':'')+'>'+r+'</option>').join('')+'</select></div>').join(''):'<p class="empty">검색 결과가 없습니다.</p>';
}
function tmResultHtml(){
 const selected=tmSelected(),groups=tmState.teams.map(ids=>ids.map(id=>selected.find(p=>p.id===id)).filter(Boolean));
 if(!groups.length)return '<div class="tm-empty"><b>참석 예정 선수를 체크해 주세요.</b><p>18명 · 3팀이면 6명씩 편성합니다. 실제 출석은 저장하지 않습니다.</p></div>';
 const means=groups.map(g=>tmMean(g.map(p=>p.value))),gap=Math.max(...means)-Math.min(...means),keepers=groups.map(g=>g.filter(p=>p.position==='GR').length);
 return '<div class="tm-balance-summary"><div><small>평균 OVR 최대 차이</small><strong>'+gap.toFixed(1)+'</strong></div><div><small>팀별 인원</small><strong>'+groups.map(g=>g.length).join(' / ')+'</strong></div><div><small>팀별 GR</small><strong>'+keepers.join(' / ')+'</strong></div></div>'+
 (selected.some(p=>p.estimated)?'<p class="tm-warning">미평가 선수는 선택 선수의 평균 OVR(평가자 없으면 50)로 임시 편성했습니다. 아래 평균은 가정치를 포함하며 공식 평가가 아닙니다.</p>':'')+
 (keepers.some(n=>!n)?'<p class="tm-warning">GR이 없는 팀이 있습니다. 지원자를 정해 편성용 포지션을 GR로 바꾸고 다시 편성하거나, 전술 화면에서 직접 골키퍼를 지정하세요.</p>':'')+
 (Math.max(...keepers)-Math.min(...keepers)>1?'<p class="tm-warning">수동 교환 후 GR 인원이 불균형합니다.</p>':'')+
 '<div class="tm-teams">'+groups.map((g,i)=>'<article class="tm-team"><header><span>TEAM '+String.fromCharCode(65+i)+'</span><b>'+tmNumber(means[i])+' <small>OVR</small></b></header>'+squadStars(means[i])+'<p class="tm-distribution">'+TM_ROLES.map(r=>r+' '+g.filter(p=>p.position===r).length).join(' · ')+' · 미지정 '+g.filter(p=>!p.position).length+'</p><ul>'+g.map(p=>'<li><span class="tm-role">'+(p.position||'—')+'</span><b>'+esc(p.name)+'</b><span>'+tmNumber(p.ovr)+(p.estimated?'*':'')+'</span></li>').join('')+'</ul><button class="btn" type="button" data-tm-use="'+i+'">이 팀 전술 구성 →</button></article>').join('')+'</div><div class="tm-swap"><label>선수 교환<select id="tmSwapA">'+selected.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+'</option>').join('')+'</select></label><label>상대 선수<select id="tmSwapB">'+selected.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+'</option>').join('')+'</select></label><button type="button" class="btn" data-tm-action="swap">두 선수 교환</button></div>';
}
function tmScores(players){
 const scores={};for(const axis of TEAM_SQUAD_AXES)scores[axis.id]=tmMean(players.map(p=>{const base=Object.entries(axis.weights).reduce((s,[k,w])=>s+(p.baseStats?.[k]??p.stats?.[k]??p.value)*w,0);return tmClamp(base+(p.baseStats?p.formModifier||0:0));}));
 return {...scores,total:players.length?tmMean(Object.values(scores)):null,ovr:tmMean(players.map(p=>p.value))};
}
function tmTacticalHtml(){
 const source=tmSource();tmState.source=source.id;const slots=tmSlots(),players=source.players;
 tmState.lineup=slots.map((s,i)=>players.some(p=>p.id===tmState.lineup[i])?tmState.lineup[i]:'');
 const lineup=tmState.lineup.map(id=>players.find(p=>p.id===id)),chosen=lineup.filter(Boolean),scores=tmScores(chosen),bench=players.filter(p=>!tmState.lineup.includes(p.id)),complete=chosen.length===slots.length;
 const options=(current)=>'<option value="">선수 선택</option>'+players.map(p=>'<option value="'+esc(p.id)+'" '+(p.id===current?'selected':'')+' '+(p.id!==current&&tmState.lineup.includes(p.id)?'disabled':'')+'>'+esc(p.name)+' · '+(p.position||'미지정')+' · '+tmNumber(p.ovr)+'</option>').join('');
 return '<div class="tm-lineup-controls"><label>팀 선택<select id="tmSource">'+tmSources().map(s=>'<option value="'+esc(s.id)+'" '+(source.id===s.id?'selected':'')+'>'+esc(s.name)+' · 선택 '+s.players.length+'명</option>').join('')+'</select></label><label>전술<select id="tmFormation">'+Object.entries(TM_FORMATIONS).map(([id,f])=>'<option value="'+id+'" '+(id===tmState.formation?'selected':'')+'>'+f.name+'</option>').join('')+'</select></label><label>경기 인원<select id="tmSize"><option value="5" '+(tmState.size===5?'selected':'')+'>5인 · GR + 필드 4</option><option value="6" '+(tmState.size===6?'selected':'')+'>6인 · GR + 필드 5</option></select></label></div><div class="tm-style-buttons">'+Object.entries(TM_STYLES).map(([id,label])=>'<button type="button" class="btn '+(tmState.style===id?'primary':'')+'" data-tm-style="'+id+'">'+label+' 자동 선발</button>').join('')+'</div><p class="note">체크한 참석 예정 선수 중 선택 팀의 '+players.length+'명만 사용합니다. '+(tmState.size===6?'6인 모드는 기본 전술에 추가 AL 자리를 둡니다.':'전술 숫자는 필드 선수 4명의 배치입니다.')+'</p><div class="tm-tactical-grid"><div class="tm-pitch" aria-label="'+esc(source.name)+' '+TM_FORMATIONS[tmState.formation].name+' 전술 배치"><div class="tm-pitch-lines" aria-hidden="true"><i></i><b></b></div><span class="tm-pitch-title">'+esc(source.name)+' · '+TM_FORMATIONS[tmState.formation].name+'</span>'+slots.map((s,i)=>'<button type="button" class="tm-slot '+(!lineup[i]?'vacant':'')+'" style="left:'+s.x+'%;top:'+s.y+'%" data-tm-focus="'+i+'" aria-label="'+esc(s.label+' '+(lineup[i]?.name||'미선택'))+'"><span class="tm-role">'+s.role+'</span>'+(lineup[i]?tmFace(lineup[i]):'<span class="tm-avatar">＋</span><b>선수 선택</b>')+'<small>'+ (lineup[i]?'OVR '+tmNumber(lineup[i].ovr):s.label)+'</small></button>').join('')+'</div><div class="tm-lineup-info"><div class="tm-lineup-score"><small>'+ (complete?'TEAM CURRENT':'부분 편성 · '+chosen.length+'/'+slots.length)+' · '+TM_STYLES[tmState.style]+'</small><strong>'+tmNumber(scores.total)+'</strong>'+squadStars(scores.total)+'<p>선발 평균 OVR '+tmNumber(scores.ovr)+'</p></div>'+TEAM_SQUAD_AXES.map(a=>'<div class="tm-axis '+a.id+'"><span>'+a.label+'</span><b>'+tmNumber(scores[a.id])+'</b><div><i style="width:'+(scores[a.id]??0)+'%"></i></div></div>').join('')+(chosen.some(p=>p.estimated)?'<p class="tm-warning">미평가 선수의 가정 능력치를 포함합니다.</p>':'')+(!lineup[slots.findIndex(s=>s.role==='GR')]?'<p class="tm-warning">골키퍼 미배치</p>':lineup[slots.findIndex(s=>s.role==='GR')].position!=='GR'?'<p class="tm-warning">수동 지정 골키퍼 · 등록 GR 포지션이 아닙니다.</p>':'')+'<div class="tm-slot-selectors">'+slots.map((s,i)=>'<label>'+s.role+' · '+s.label+'<select id="tm-slot-'+i+'" data-tm-slot="'+i+'">'+options(tmState.lineup[i])+'</select></label>').join('')+'</div><div class="tm-bench"><b>대기 / 교체 · '+bench.length+'명</b><p>'+ (bench.map(p=>esc(p.name)+' ('+(p.position||'—')+')').join(' · ')||'없음')+'</p></div></div></div>';
}
function tmFace(p){
 const roster=selectPlayerRoster(p.name,tmState.date.slice(0,4)),cutout=normalizePlayerPhotoUrl(roster?.photoCutout),original=normalizePlayerPhotoUrl(roster?.photo),photo=cutout||original;
 return '<span class="tm-avatar"><span>'+esc(p.name.slice(0,1))+'</span>'+(photo?'<img src="'+esc(photo)+'" data-player-photo-source="'+esc(photo)+'" '+(cutout&&original?'data-player-photo-fallback="'+esc(original)+'"':'')+' alt="" referrerpolicy="no-referrer" onerror="handlePlayerPhotoError(this)" loading="lazy">':'')+'</span><b>'+esc(p.name)+'</b>';
}
function tmMethod(){return '<details class="tm-method"><summary>편성 기준 · 점수와 별점 안내</summary><p>이 화면은 현재 브라우저 탭의 임시 편성안입니다. 엑셀 팀스쿼드·출석·경기기록·선수 능력치를 변경하거나 다른 회원에게 자동 공유하지 않습니다. 페이지를 새로고침하면 초기화됩니다.</p><p>팀 인원 차이는 최대 1명, 자동 편성의 GR 인원 차이도 최대 1명입니다. 평균 OVR 차이를 우선 줄이고 PV/AL/FS 분포를 조정하는 반복 탐색이며 수학적 최적해를 보장하지 않습니다. 같은 입력과 재편성 횟수에서는 같은 결과가 나옵니다.</p><p>관계 옵션은 예정일 이전 최근 12개 경기일의 실제 동행·상대 횟수를 사용합니다. 동일 팀 반복을 줄이고, 상대 옵션은 과거에 자주 대결한 선수를 같은 팀에 둘 유인을 주어 새로운 상대 조합을 만듭니다. 기록이 없는 조합은 0회이며 기록이 없을 때 효과가 없습니다. OVR 균형과 GR 배분을 우선하므로 모든 희망 조건을 동시에 만족하지 못할 수 있습니다.</p><p>기준일의 팀스쿼드와 선수명단 포지션을 사용하고, 능력치는 기준일 이전 최종 기록까지의 CURRENT OVR과 FORM을 반영합니다. FW/MF/DF/GK는 편성 화면에서 PV/AL/FS/GR로 해석합니다. 편성용 포지션 변경은 DB에 저장하지 않습니다. SB 미측정 선수도 기존 프로그램의 임시 능력치를 사용합니다.</p><p>전술 자동 선발은 역할 적합도 70% + 선택 성향 30%에 원포지션 일치 2점을 더해 중복 없이 배치합니다. GR은 DEF 60%·PAS 20%·PHY 20%를 쓰며 GR 포지션 선수에게만 자동 배정합니다. 실제 선방률 평가가 아닙니다. GR 지원자는 명단에서 편성용 포지션을 바꾸거나 자리에서 직접 지정하세요.</p><p>역할 적합도: PV=SHO40/DRI20/PAC20/PHY20%, AL=PAS30/DRI30/PAC20/PHY10/DEF10%, FS=DEF50/PHY30/PAS10/PAC10%. 성향은 밸런스=CURRENT OVR, 공격형=SHO45/PAC25/DRI20/PAS10%, 수비형=DEF55/PHY30/PAS15%입니다. 선발 가능한 조합에 따라 세 버튼의 결과가 같을 수도 있습니다.</p><p>TEAM CURRENT와 공격·중앙·수비는 기존 Team Squad와 같은 배점으로 선발 선수만 평균합니다. 공격=SHO45/PAC25/DRI20/PHY10%, 중앙=PAS45/DRI30/PHY15/DEF10%, 수비=DEF55/PHY30/PAC15%. TEAM CURRENT는 세 항목 평균, 별점은 round(점수÷10)÷2로 최대 5개·반개 단위입니다. 전술명 자체로 능력치나 별점을 올리지 않습니다. 미완성 라인업은 부분 편성으로 표시합니다.</p></details>';}
function renderTeamMaker(){
 const root=document.getElementById('teamMakerContent');if(!root)return;
 tmState.date=tmState.date||squadToday();
 const competitions=[...new Set(['정규리그',...squadRows().map(r=>isLeagueFamilyComp(r.comp)?'정규리그':r.comp).filter(Boolean)])];
 const signature=JSON.stringify([tmState.date,tmState.competition,DB.roster,DB.matches,DB.attendance,DB.goals,DB.saves,DB.fouls,DB.moms,DB.soccerbee,DB.settings]);
 if(signature!==tmState.signature){
  const previous=!!tmState.signature;tmState.pool=tmPool(tmState.date,tmState.competition);tmState.signature=signature;
  const ids=new Set(tmState.pool.map(p=>p.id));tmState.selected=new Set([...tmState.selected].filter(id=>ids.has(id)));
  tmReset(previous?'날짜 또는 DB가 바뀌었습니다. 참석 예정 명단을 확인하고 다시 편성하세요.':'참석 예정 명단을 선택해 주세요.');
 }
 const focus=document.activeElement?.id,selected=tmSelected(),teams=[...new Set(tmState.pool.map(p=>p.team))].sort(compareNamesKo);
 if(!teams.includes(tmState.teamFilter))tmState.teamFilter='';
 root.innerHTML='<div class="tm-intro"><span>PLAN YOUR NEXT MATCH</span><h3>함께 뛰는 조합을 새롭게.</h3><p>참석 예정 선수 → 균형 편성 → 전술 라인업</p></div><div class="tm-top-controls"><label>경기 예정일 / 조회일<input type="date" id="tmDate" value="'+tmState.date+'"></label><label>스쿼드 기준 대회<select id="tmCompetition">'+competitions.map(c=>'<option '+(c===tmState.competition?'selected':'')+' value="'+esc(c)+'">'+esc(c==='정규리그'?'리그 통합':c)+'</option>').join('')+'</select></label><div class="tm-selection-count"><b>'+selected.length+'</b><span>명 선택 / '+tmState.pool.length+'명</span></div></div><p class="tm-notice" id="tmNotice" role="status" aria-live="polite">'+esc(tmState.notice)+'</p><div class="tm-workspace"><details class="tm-roster-panel" open><summary>참석 예정 선수 <b>'+selected.length+'명</b></summary><div class="tm-roster-filters"><input id="tmSearch" type="search" placeholder="이름 검색" aria-label="선수 이름 검색" value="'+esc(tmState.search)+'"><select id="tmTeamFilter" aria-label="명단 팀 필터"><option value="">전체 팀</option>'+teams.map(t=>'<option value="'+esc(t)+'" '+(t===tmState.teamFilter?'selected':'')+'>'+esc(teamDisplayName(t))+'</option>').join('')+'</select></div><div class="tm-roster-actions"><button class="btn sm" type="button" data-tm-action="select">검색 명단 선택</button><button class="btn sm" type="button" data-tm-action="clear">선택 해제</button><button class="btn sm" type="button" data-tm-action="attendance">해당일 출전 불러오기</button></div><div class="tm-roster-list" id="tmRosterList">'+tmRosterHtml()+'</div><p class="note">체크는 참석 예정 표시입니다. 오른쪽 포지션은 이번 편성에서만 변경합니다.</p></details><div class="tm-main"><div class="tm-tabs" role="group" aria-label="편성 화면"><button type="button" data-tm-tab="balance" aria-pressed="'+(tmState.tab==='balance')+'">01 자동 팀 편성</button><button type="button" data-tm-tab="tactical" aria-pressed="'+(tmState.tab==='tactical')+'">02 전술 라인업</button></div>'+(tmState.tab==='balance'?'<div class="tm-balance-controls"><label>팀 수<select id="tmCount">'+[2,3,4,5,6].map(n=>'<option '+(n===tmState.count?'selected':'')+' value="'+n+'">'+n+'팀</option>').join('')+'</select></label><label class="tm-check"><input type="checkbox" id="tmRepeat" '+(tmState.repeat?'checked':'')+'>같은 팀 반복 줄이기</label><label class="tm-check"><input type="checkbox" id="tmOpponents" '+(tmState.opponents?'checked':'')+'>새로운 상대 조합 우선</label><button class="btn primary" type="button" data-tm-action="generate" '+(tmState.busy?'disabled':'')+'>'+(tmState.busy?'편성 중…':'자동 팀 편성')+'</button></div>'+tmResultHtml():tmTacticalHtml())+'</div></div>'+tmMethod();
 root.oninput=e=>{if(e.target.id==='tmSearch'){tmState.search=e.target.value;document.getElementById('tmRosterList').innerHTML=tmRosterHtml();}};
 root.onchange=tmChange;root.onclick=tmClick;if(focus)document.getElementById(focus)?.focus({preventScroll:true});
}
function tmChange(e){
 const t=e.target;if(tmState.busy)return;
 if(t.dataset.tmPlayer!==undefined){t.checked?tmState.selected.add(t.dataset.tmPlayer):tmState.selected.delete(t.dataset.tmPlayer);tmReset();}
 else if(t.dataset.tmPosition!==undefined){tmState.positions.set(t.dataset.tmPosition,t.value);tmReset('편성용 포지션을 변경했습니다. 다시 편성하세요.');}
 else if(t.dataset.tmSlot!==undefined){const i=Number(t.dataset.tmSlot);if(t.value&&tmState.lineup.some((id,j)=>j!==i&&id===t.value))return;tmState.lineup[i]=t.value;tmState.notice='포지션별 선수를 직접 배치했습니다.';}
 else if(t.id==='tmDate'){if(!/^\d{4}-\d{2}-\d{2}$/.test(t.value))return;tmState.date=t.value;tmState.selected.clear();}
 else if(t.id==='tmCompetition'){tmState.competition=t.value;tmState.selected.clear();}
 else if(t.id==='tmTeamFilter'){tmState.teamFilter=t.value;document.getElementById('tmRosterList').innerHTML=tmRosterHtml();return;}
 else if(t.id==='tmCount'){tmState.count=Number(t.value);tmReset();}
 else if(t.id==='tmRepeat'||t.id==='tmOpponents'){tmState[t.id==='tmRepeat'?'repeat':'opponents']=t.checked;tmReset();}
 else if(t.id==='tmSource'){tmState.source=t.value;tmState.lineup=[];}
 else if(t.id==='tmFormation'){tmState.formation=t.value;tmState.lineup=[];}
 else if(t.id==='tmSize'){tmState.size=Number(t.value);tmState.lineup=[];}
 else return;renderTeamMaker();
}
async function tmClick(e){
 const b=e.target.closest('button');if(!b||tmState.busy)return;
 if(b.dataset.tmTab){tmState.tab=b.dataset.tmTab;renderTeamMaker();return;}
 if(b.dataset.tmUse!==undefined){tmState.source='auto:'+b.dataset.tmUse;tmState.tab='tactical';tmState.lineup=[];renderTeamMaker();return;}
 if(b.dataset.tmFocus!==undefined){const el=document.getElementById('tm-slot-'+b.dataset.tmFocus);el?.scrollIntoView({block:'center',behavior:'smooth'});el?.focus({preventScroll:true});return;}
 if(b.dataset.tmStyle){tmState.style=b.dataset.tmStyle;const source=tmSource();tmState.lineup=tmAutoLineup(source.players,tmSlots(),tmState.style);tmState.notice=source.players.length?TM_STYLES[tmState.style]+' 기준으로 '+tmState.lineup.filter(Boolean).length+'명을 배치했습니다.':'이 팀의 참석 예정 선수를 먼저 체크하세요.';renderTeamMaker();return;}
 const action=b.dataset.tmAction;if(!action)return;
 if(action==='select'){tmState.pool.filter(p=>(!tmState.teamFilter||p.team===tmState.teamFilter)&&normalizePlayerMatchKey(p.name).includes(normalizePlayerMatchKey(tmState.search))).forEach(p=>tmState.selected.add(p.id));tmReset();}
 if(action==='clear'){tmState.selected.clear();tmReset('참석 예정 선택을 해제했습니다.');}
 if(action==='attendance'){
  const list=(DB.matches||[]).filter(m=>normDate(m.date)===tmState.date&&(tmState.competition==='정규리그'?isLeagueFamilyComp(m.comp):compCompact(m.comp)===compCompact(tmState.competition))),att=analysisAttendance(list),ids=new Set(tmState.pool.map(p=>p.id));
  tmState.selected=new Set(att.map(a=>normalizePlayerMatchKey(a.player)).filter(id=>ids.has(id)));tmReset(tmState.selected.size?'해당일 출전 기록의 '+tmState.selected.size+'명을 선택했습니다. 예정 명단과 다르면 직접 수정하세요.':'해당일·대회의 출전 기록이 없습니다. 참석 예정 선수를 직접 체크하세요.');
 }
 if(action==='swap'){
  const a=document.getElementById('tmSwapA').value,b=document.getElementById('tmSwapB').value,ai=tmState.teams.findIndex(g=>g.includes(a)),bi=tmState.teams.findIndex(g=>g.includes(b));
  if(ai<0||bi<0||ai===bi){tmState.notice='서로 다른 팀의 선수를 선택하세요.';}else{const x=tmState.teams[ai].indexOf(a),y=tmState.teams[bi].indexOf(b);tmState.teams[ai][x]=b;tmState.teams[bi][y]=a;tmState.lineup=[];tmState.notice='두 선수를 교환했습니다. 팀별 OVR과 GR 배분을 확인하세요.';}
 }
 if(action==='generate'){
  const selected=tmSelected();if(selected.length<tmState.count){tmState.notice='팀 수 이상으로 선수를 선택해 주세요.';renderTeamMaker();return;}
  tmState.busy=true;tmState.notice='OVR·포지션·GR 배분을 계산하고 있습니다.';renderTeamMaker();await new Promise(r=>setTimeout(r,30));
  try{const history=tmHistory(tmState.date),groups=tmBalance(selected,tmState.count,history,tmState,tmState.seed++);tmState.teams=groups.map(g=>g.map(p=>p.id));tmState.lineup=[];tmState.source='auto:0';tmState.notice='편성 완료 · 관계 분석 '+history.days+'개 경기일 · 다시 누르면 다른 초기 조합을 탐색합니다.';}
  catch(err){tmState.notice='편성하지 못했습니다: '+err.message;}finally{tmState.busy=false;}
 }
 renderTeamMaker();
}
