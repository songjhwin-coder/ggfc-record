/* GGFC DUO TYPE v1 — deterministic, local, read-only. */
const DUO_MIN_GAMES=5,DUO_MIN_POOL=4;
const duoValid=v=>v!==null&&v!==undefined&&String(v).trim()!==''&&Number.isFinite(Number(v));
const duoClamp=v=>Math.max(0,Math.min(100,v));
function duoMean(parts){const valid=parts.filter(([v,w])=>duoValid(v)&&w>0);const total=valid.reduce((s,[v,w])=>s+w,0);return total?valid.reduce((s,[v,w])=>s+Number(v)*w,0)/total:null;}
function duoPercentile(value,values,inverse=false){
  const pool=values.filter(duoValid).map(Number);if(!duoValid(value)||pool.length<DUO_MIN_POOL)return null;
  value=Number(value);const lower=pool.filter(v=>v<value).length,equal=pool.filter(v=>v===value).length;
  const result=duoClamp(100*(lower+(equal-1)/2)/(pool.length-1));return inverse?100-result:result;
}
const duoH=(a,b)=>duoValid(a)&&duoValid(b) ? .6*Math.min(a,b)+.4*(Number(a)+Number(b))/2 : null;
const duoMix=(x,weights)=>duoMean(weights.map(([k,w])=>[x[k],w]));
const duoBoth=(a,b,k,min)=>duoValid(a[k])&&duoValid(b[k])&&Math.min(a[k],b[k])>=min;
const duoFormula=(a,b,weights)=>duoH(duoMix(a,weights),duoMix(b,weights));
function duoCross(a,b,left,right,gates){
  const candidates=[[a,b],[b,a]].filter(([x,y])=>gates(x,y)).map(([x,y])=>({base:duoH(duoMix(x,left),duoMix(y,right)),roles:[x.name,y.name]})).filter(x=>duoValid(x.base));
  return candidates.sort((x,y)=>y.base-x.base||compareNamesKo(x.roles[0],y.roles[0]))[0]||null;
}
const DUO_TYPES=[
 {id:'rush',name:'폭주 듀오',en:'TWIN SPEED',icon:'⚡',formula:'H(0.7S+0.3W)',condition:'두 선수 S≥70, W≥55',weights:[['S',.7],['W',.3]],gate:(a,b)=>duoBoth(a,b,'S',70)&&duoBoth(a,b,'W',55)},
 {id:'counter',name:'속공 듀오',en:'SPEED COUNTER',icon:'🚀',formula:'X(C, 0.6S+0.4A)',condition:'패서 C≥70 / 침투 S≥70, A≥60',cross:[[['C',1]],[['S',.6],['A',.4]]],roleLabels:['패서','침투'],gate:(a,b)=>a.C>=70&&b.S>=70&&b.A>=60},
 {id:'cannons',name:'쌍포 듀오',en:'TWIN CANNONS',icon:'🔫',formula:'H(A)',condition:'두 선수 A≥70',weights:[['A',1]],gate:(a,b)=>duoBoth(a,b,'A',70)},
 {id:'maker_killer',name:'메이커 & 킬러',en:'MAKER & FINISHER',icon:'🎩',formula:'X(C,A)',condition:'메이커 C≥70 / 해결사 A≥70',cross:[[['C',1]],[['A',1]]],roleLabels:['메이커','해결사'],gate:(a,b)=>a.C>=70&&b.A>=70},
 {id:'engines',name:'트윈 엔진',en:'TWIN ENGINES',icon:'🏃',formula:'H(W)',condition:'두 선수 W≥70',weights:[['W',1]],gate:(a,b)=>duoBoth(a,b,'W',70)},
 {id:'wall',name:'철벽 듀오',en:'DEFENSIVE WALL',icon:'🧱',formula:'H(0.65P+0.35F)',condition:'두 선수 P≥65, F≥60 · 파울 기록 충족',weights:[['P',.65],['F',.35]],gate:(a,b)=>duoBoth(a,b,'P',65)&&duoBoth(a,b,'F',60)},
 {id:'technicians',name:'테크니션 듀오',en:'TECHNICIANS',icon:'🎨',formula:'H(0.6C+0.4D)',condition:'두 선수 C≥65, D≥65',weights:[['C',.6],['D',.4]],gate:(a,b)=>duoBoth(a,b,'C',65)&&duoBoth(a,b,'D',65)},
 {id:'press',name:'압박 듀오',en:'HIGH PRESS',icon:'⚔️',formula:'H(0.4W+0.35S+0.25P)',condition:'두 선수 W≥65, S≥60, P≥55',weights:[['W',.4],['S',.35],['P',.25]],gate:(a,b)=>duoBoth(a,b,'W',65)&&duoBoth(a,b,'S',60)&&duoBoth(a,b,'P',55)},
 {id:'winners',name:'승리 듀오',en:'WINNING PAIR',icon:'👑',formula:'H(0.5W+0.5P)',condition:'동행≥10, 실제 승률≥70%',weights:[['W',.5],['P',.5]],gate:(a,b,p)=>p.p>=10&&p.winRate>=70},
 {id:'bond',name:'찰떡 듀오',en:'PERFECT BOND',icon:'❤️',formula:'0.6B+0.4H(W)',condition:'동행≥10, 기존 대칭 커플점수≥75, 동행비율≥50%',custom:(a,b,p)=>duoMean([[p.bondPercent,.6],[duoH(a.W,b.W),.4]]),gate:(a,b,p)=>p.p>=10&&p.chemRaw>=75&&p.bond>=.5},
 {id:'makers',name:'메이커 듀오',en:'DUAL CREATORS',icon:'🎯',formula:'H(C)',condition:'두 선수 C≥70',weights:[['C',1]],gate:(a,b)=>duoBoth(a,b,'C',70)},
 {id:'bulldozers',name:'불도저 듀오',en:'BULLDOZERS',icon:'💪',formula:'H(0.65P+0.35A)',condition:'두 선수 P≥70, A≥55',weights:[['P',.65],['A',.35]],gate:(a,b)=>duoBoth(a,b,'P',70)&&duoBoth(a,b,'A',55)},
 {id:'attack',name:'공격본능 듀오',en:'ATTACK INSTINCT',icon:'💥',formula:'H(G)',condition:'두 선수 G≥70',weights:[['G',1]],gate:(a,b)=>duoBoth(a,b,'G',70)},
 {id:'clean',name:'클린 듀오',en:'CLEAN DEFENCE',icon:'🛡️',formula:'H(0.5P+0.5F)',condition:'두 선수 F≥80, P≥50 · 파울 기록 충족',weights:[['P',.5],['F',.5]],gate:(a,b)=>duoBoth(a,b,'F',80)&&duoBoth(a,b,'P',50)},
 {id:'attendance',name:'개근 듀오',en:'ALWAYS TOGETHER',icon:'📅',formula:'H(T)',condition:'두 선수 실제 참석률≥85%, 동행≥10, 동행비율≥50%',weights:[['T',1]],gate:(a,b,p)=>a.attendance>=85&&b.attendance>=85&&p.p>=10&&p.bond>=.5},
 {id:'balance',name:'밸런스 듀오',en:'ALL ROUNDERS',icon:'⚖️',formula:'min(H(S),H(A),H(C),H(W),H(P))',condition:'두 선수 S/A/C/W/P 모두≥55',custom:(a,b)=>Math.min(...['S','A','C','W','P'].map(k=>duoH(a[k],b[k]))),gate:(a,b)=>['S','A','C','W','P'].every(k=>duoBoth(a,b,k,55))},
 {id:'delivery',name:'택배와 침투',en:'PASS & RUN',icon:'📦',formula:'X(C,S)',condition:'패서 C≥75 / 러너 S≥75',cross:[[['C',1]],[['S',1]]],roleLabels:['패서','러너'],gate:(a,b)=>a.C>=75&&b.S>=75},
 {id:'guardian',name:'수호자와 해결사',en:'GUARD & FINISH',icon:'🏰',formula:'X(P,A)',condition:'수호자 P≥75 / 해결사 A≥75',cross:[[['P',1]],[['A',1]]],roleLabels:['수호자','해결사'],gate:(a,b)=>a.P>=75&&b.A>=75},
 {id:'supply',name:'에너지 공급 듀오',en:'ENERGY SUPPLY',icon:'🔋',formula:'H(0.7W+0.3C)',condition:'두 선수 W≥75, C≥60',weights:[['W',.7],['C',.3]],gate:(a,b)=>duoBoth(a,b,'W',75)&&duoBoth(a,b,'C',60)},
 {id:'destroy',name:'파괴 듀오',en:'POWER ATTACK',icon:'🔥',formula:'H(0.4S+0.4A+0.2P)',condition:'두 선수 S≥65, A≥65, P≥60',weights:[['S',.4],['A',.4],['P',.2]],gate:(a,b)=>duoBoth(a,b,'S',65)&&duoBoth(a,b,'A',65)&&duoBoth(a,b,'P',60)}
];
let duoCache=null,duoReturnFocus=null;
function duoBuildContext(){
  const list=uniqueRecordMatches(chemMatches()),signature=JSON.stringify([chemYear,comp,DB.matches,DB.attendance,DB.goals,DB.fouls,DB.soccerbee,DB.roster,DB.settings]);
  if(duoCache?.signature===signature)return duoCache;
  const names=[...new Set(analysisAttendance(list).map(r=>String(r.player||'').trim()).filter(n=>n&&!isOwnGoalPlayer(n)))].sort(compareNamesKo),profiles=new Map(names.map(name=>[name,{name,parts:[],seasonProof:[]}]));
  const years=[...new Set(list.map(m=>normDate(m.date).slice(0,4)))].sort(),population=[];
  years.forEach(year=>{
    const ms=list.filter(m=>normDate(m.date).startsWith(year)),byId=new Map(ms.map(m=>[detailMatchKey(m.id),m])),end=ms.map(m=>normDate(m.date)).sort().pop();
    const seen=new Map();analysisAttendance(ms).forEach(r=>{const id=detailMatchKey(r.id),m=byId.get(id),name=String(r.player||'').trim(),team=String(r.team||'').trim();if(!m||!profiles.has(name)||![m.home,m.away].includes(team))return;const key=JSON.stringify([id,name]);if(!seen.has(key))seen.set(key,{id,name,teams:new Set()});seen.get(key).teams.add(team);});
    const entries=[...seen.values()].filter(x=>x.teams.size===1),raw=[];
    names.forEach(name=>{
      const own=entries.filter(r=>r.name===name),ids=new Set(own.map(r=>r.id));if(!ids.size)return;
      const key=normalizePlayerMatchKey(name),teamById=new Map(own.map(r=>[r.id,[...r.teams][0]]));
      const validRow=r=>normalizePlayerMatchKey(r.player)===key&&ids.has(detailMatchKey(r.id))&&(!String(r.team||'').trim()||String(r.team).trim()===teamById.get(detailMatchKey(r.id)));
      const goals=(DB.goals||[]).filter(validRow),fouls=(DB.fouls||[]).filter(validRow),recordedFouls=new Set(fouls.filter(r=>duoValid(r.fouls)).map(r=>detailMatchKey(r.id)));
      const teams=new Set(teamById.values());
      const expected=ms.filter(m=>{const assigned=squadPlayerTeams(m,name);return assigned.length?assigned.includes(m.home)||assigned.includes(m.away):teams.has(m.home)||teams.has(m.away);}).filter(m=>playerEligibleOn(name,m.date)).length;
      const g=goals.reduce((v,r)=>v+num(r.g),0),assistRecording=(DB.goals||[]).some(r=>byId.has(detailMatchKey(r.id))&&duoValid(r.a)),assists=assistRecording?goals.reduce((v,r)=>v+num(r.a),0):null;
      const ability=abilitySystemEnabled()?playerAbilityRecordAtDate(name,year,abilityHalfForDate(year,end),end,true):{};
      const sb=soccerBeePlayerRows(name,end).filter(r=>normDate(r.date).startsWith(year));
      const measured=k=>{const row=sb.slice().reverse().find(r=>duoValid(r[k])&&Number(r[k])>=0);return row?Number(row[k]):null;};
      const coverage=recordedFouls.size/ids.size;
      raw.push({name,games:ids.size,attendance:duoClamp(ids.size/Math.max(ids.size,expected)*100),gpg:g/ids.size,apg:duoValid(assists)?assists/ids.size:null,points:duoValid(assists)?(g+assists)/ids.size:null,foul:coverage>=.8?fouls.reduce((v,r)=>v+num(r.fouls),0)/recordedFouls.size:null,coverage,pac:ability.pac??null,sho:ability.sho??null,pas:ability.pas??null,dri:ability.dri??null,def:ability.def??null,phy:ability.phy??null,maxSpeed:measured('maxSpeed'),hpm:measured('hpm'),spm:measured('spm'),dpm:measured('dpm'),energy:measured('energy'),sbDate:sb.at(-1)?.date||''});
    });
    const pool=raw.filter(r=>r.games>=DUO_MIN_GAMES);population.push({year,players:pool.length,end});
    raw.forEach(r=>{
      const norm=k=>r.games>=5?duoPercentile(r[k],pool.map(v=>v[k]),k==='foul'):null;
      const n={};['pac','sho','pas','dri','def','phy','maxSpeed','hpm','spm','dpm','energy','gpg','apg','points','attendance','foul'].forEach(k=>n[k]=norm(k));
      const axes={S:duoMean([[n.maxSpeed,.35],[n.spm,.2],[n.pac,.3],[n.hpm,.15]]),W:duoMean([[n.dpm,.35],[n.energy,.2],[n.attendance,.25],[n.phy,.2]]),A:duoMean([[n.gpg,.5],[n.sho,.3],[n.points,.2]]),C:duoMean([[n.apg,.5],[n.pas,.3],[n.dri,.2]]),P:duoMean([[n.phy,.45],[n.def,.4],[n.dpm,.15]]),F:n.foul,D:n.dri,G:n.points,T:n.attendance};
      const profile=profiles.get(r.name);profile.parts.push({games:r.games,axes,raw:r});profile.seasonProof.push({year,population:pool.length,...r,axes});
    });
  });
  profiles.forEach(profile=>{for(const k of ['S','W','A','C','P','F','D','G','T'])profile[k]=duoMean(profile.parts.map(p=>[p.axes[k],p.games]));profile.games=profile.parts.reduce((s,p)=>s+p.games,0);profile.attendance=duoMean(profile.parts.map(p=>[p.raw.attendance,p.games]));profile.foulCoverage=duoMean(profile.parts.map(p=>[p.raw.coverage,p.games]));if(profile.foulCoverage<.8)profile.F=null;});
  const analyses=new Map(names.map(name=>[name,chemistry(name,list)])),pairs=new Map();
  names.forEach(a=>analyses.get(a).mates.forEach(row=>{const b=row.name;if(compareNamesKo(a,b)>=0||!profiles.has(b))return;const back=analyses.get(b)?.mates.find(r=>r.name===a);if(!back)return;
    pairs.set(JSON.stringify([a,b]),{a,b,p:row.p,w:row.w,d:row.d,l:row.l,goals:row.tg+row.mg,goalRate:(row.tg+row.mg)/Math.max(1,row.p),winRate:100*row.w/Math.max(1,row.p),chemRaw:(row.score+back.score)/2,bond:row.p/Math.max(1,analyses.get(a).base,analyses.get(b).base)});
  }));
  const pairPool=[...pairs.values()].filter(p=>p.p>=5);
  pairs.forEach(p=>{p.bondPercent=duoPercentile(p.bond,pairPool.map(x=>x.bond));p.chemPercent=duoPercentile(p.chemRaw,pairPool.map(x=>x.chemRaw));p.winPercent=duoPercentile(p.winRate,pairPool.map(x=>x.winRate));p.goalPercent=duoPercentile(p.goalRate,pairPool.map(x=>x.goalRate));p.K=duoMean([[p.chemPercent,.5],[p.winPercent,.3],[p.bondPercent,.2]]);p.performance=duoMean([[100*(p.w+.5*p.d+2.5)/(p.p+5),.6],[p.goalPercent,.4]]);});
  duoCache={signature,profiles,pairs,pairPool:pairPool.length,population,list};return duoCache;
}
function duoEvaluate(a,b,p){
  const candidates=DUO_TYPES.map((t,i)=>{
    let base=null,roles=null,qualified=false;
    if(t.cross){const hit=duoCross(a,b,...t.cross,t.gate);if(hit){base=hit.base;roles=hit.roles;qualified=true;}}
    else{qualified=t.gate(a,b,p);if(qualified)base=t.custom?t.custom(a,b,p):duoFormula(a,b,t.weights);}
    const score=duoValid(base)&&duoValid(p.performance)&&duoValid(p.K)?duoClamp(.7*base+.2*p.performance+.1*p.K):null;
    return {...t,index:i,base,roles,score,qualified:qualified&&base>=65&&duoValid(score)&&score>=65};
  }).sort((x,y)=>(y.score??-1)-(x.score??-1)||x.index-y.index);
  const eligible=candidates.filter(t=>t.qualified),main=p.p>=5?eligible[0]||null:null,sub=main?eligible.slice(1).find(t=>main.score-t.score<=10)||null:null;
  return {main,sub,candidates};
}
function duoResult(a,b){
  const names=[a,b].sort(compareNamesKo),context=duoBuildContext(),one=context.profiles.get(names[0]),two=context.profiles.get(names[1]),pair=context.pairs.get(JSON.stringify(names));
  if(!one||!two||!pair)return {names,context,one,two,pair:null,main:null,sub:null,candidates:[],reason:'같은 팀으로 함께 출전한 유효 경기가 없습니다.'};
  const evaluation=duoEvaluate(one,two,pair),hasProfile=[one,two].every(p=>['S','W','A','C','P'].some(k=>duoValid(p[k]))),ready=hasProfile&&context.pairPool>=4&&duoValid(pair.K);
  const reason=pair.p<5?'동행 5경기부터 유형을 판정합니다.':!ready?'백분위 비교 표본이 부족합니다. 시즌 선수·동행 조합의 유효 표본이 각각 4개 이상 필요합니다.':!evaluation.main?'현재 20종의 필수 조건과 65점 기준을 충족하는 유형이 없습니다.':'';
  return {names,context,one,two,pair,...evaluation,main:ready?evaluation.main:null,sub:ready?evaluation.sub:null,reason};
}
const duoNumber=v=>duoValid(v)?Number(v).toFixed(1):'—';
function duoDnaSvg(r){
  const values=[duoH(r.one?.S,r.two?.S),duoH(r.one?.A,r.two?.A),duoH(r.one?.C,r.two?.C),duoH(r.one?.W,r.two?.W),r.pair?.K??null],labels=['SPEED','ATTACK','CREATION','WORK','CHEMISTRY'];
  const point=(i,v)=>{const a=(-90+i*72)*Math.PI/180;return [170+Math.cos(a)*v,155+Math.sin(a)*v];},pts=v=>values.map((_,i)=>point(i,v).join(',')).join(' ');
  return '<svg class="duo-dna" viewBox="0 0 340 320" role="img" aria-label="DUO DNA · 숫자와 미측정 여부는 아래 목록에서 확인"><g fill="none" stroke="#cbd8e8">'+[25,50,75,100].map(v=>'<polygon points="'+pts(v)+'"/>').join('')+'</g><polygon fill="#245e9f33" stroke="#245e9f" stroke-width="2" points="'+values.map((v,i)=>point(i,duoValid(v)?v:0).join(',')).join(' ')+'"/>'+labels.map((l,i)=>{const p=point(i,129);return '<text x="'+p[0]+'" y="'+p[1]+'" text-anchor="middle" fill="#061f44" font-size="10" font-weight="700">'+l+'</text>';}).join('')+'</svg><div class="duo-dna-values">'+labels.map((label,i)=>'<div><span>'+label+'</span><b>'+duoNumber(values[i])+'</b></div>').join('')+'</div><small>—는 비교 자료 부족입니다. 그래프에서는 중심점으로 표시합니다.</small>';
}
function duoProfileHtml(p){return '<section><h4>'+esc(p.name)+'</h4><dl class="duo-profile">'+[['S','SPEED'],['A','ATTACK'],['C','CREATION'],['W','WORK'],['P','POWER'],['F','CLEAN']].map(([k,label])=>'<div><dt>'+label+'</dt><dd>'+duoNumber(p[k])+'</dd></div>').join('')+'</dl><p>'+p.games+'경기 · 참석률 '+duoNumber(p.attendance)+'%</p><details><summary>시즌별 원자료·표본 확인</summary>'+p.seasonProof.map(x=>'<p><b>'+x.year+' · 비교 '+x.population+'명</b><br>'+x.games+'경기 · 득점/경기 '+duoNumber(x.gpg)+' · 도움/경기 '+duoNumber(x.apg)+'<br>최고속도 '+duoNumber(x.maxSpeed)+' km/h · DPM '+duoNumber(x.dpm)+'<br>SoccerBee '+esc(x.sbDate||'측정 없음')+' · 파울 명시 기록 '+Math.round(x.coverage*100)+'%</p>').join('')+'</details></section>';}
function duoWhyHtml(main,one,two){
  const labels={S:'속도',A:'공격',C:'창출',W:'활동',P:'파워',F:'저파울',D:'드리블',G:'공격포인트',T:'참석률',B:'동행비율'};
  const used=[...new Set(main.formula.match(/[SACWPF DGTB]/g)||[])].filter(k=>labels[k]&&k!=='B');
  const condition=main.condition.replace(/\b[SACWPFDGTB]\b/g,k=>labels[k]);
  return '<p>'+esc(condition)+'</p><p>'+used.map(k=>esc(labels[k])+' · '+esc(one.name)+' '+duoNumber(one[k])+' / '+esc(two.name)+' '+duoNumber(two[k])).join('<br>')+'</p>';
}
function openDuoDialog(a,b){
  if(!a||!b||a===b)return;const r=duoResult(a,b),dialog=document.getElementById('duoDialog');duoReturnFocus=document.activeElement;
  const main=r.main,p=r.pair,label=!p||p.p<5?'분석중':main?main.icon+' '+main.name:'뚜렷한 유형 없음';
  const scope=chemYear==='ALL'?'전체 연도 · 시즌별 백분위 출전 가중평균':chemYear+' 시즌 백분위';
  const missing=[r.one,r.two].filter(Boolean).filter(x=>!x.seasonProof.some(y=>y.sbDate)).map(x=>x.name);
  document.getElementById('duoDialogContent').innerHTML='<header class="duo-heading"><span>GGFC DUO TYPE · v1</span><h2 id="duoTitle">'+esc(label)+'</h2><p>'+esc(r.names.join(' × '))+'</p><small>'+esc(scope)+' · '+esc(comp==='ALL'?'전체 대회':comp)+'</small></header>'+
    '<div class="duo-score"><strong>'+ (main?duoNumber(main.score):'—')+'</strong><span>'+(p?.p>=10?'STANDARD · 동행 10경기 이상':p?.p>=5?'LOW CONFIDENCE · 동행 5~9경기':'분석중 · 동행 5경기 필요')+'</span></div>'+(r.sub?'<p class="duo-sub">SUB TYPE · '+r.sub.icon+' '+esc(r.sub.name)+' '+duoNumber(r.sub.score)+'</p>':'')+
    (r.reason?'<p class="duo-notice">'+esc(r.reason)+'</p>':'')+(missing.length?'<p class="duo-notice">SoccerBee 미측정: '+esc(missing.join(', '))+'. 사용 가능한 경기기록·능력치로 가중치를 재배분했습니다.</p>':'')+
    (p?'<div class="duo-match-proof"><b>실제 동행 '+p.p+'경기</b><span>'+p.w+'승 '+p.d+'무 '+p.l+'패 · 승률 '+duoNumber(p.winRate)+'%</span><span>합산 '+p.goals+'골 · 동행 비율 '+duoNumber(p.bond*100)+'% · 기존 대칭 커플점수 '+duoNumber(p.chemRaw)+'</span></div>':'')+
    (r.one&&r.two?'<div class="duo-main-grid"><section><h3>DUO DNA</h3>'+duoDnaSvg(r)+'</section><section><h3>WHY THIS DUO?</h3>'+(main?duoWhyHtml(main,r.one,r.two)+'<p>'+esc(main.formula)+' · 특성 '+duoNumber(main.base)+'점</p>'+(main.roles?'<p>'+main.roles.map((n,i)=>esc(n)+' → '+esc(main.roleLabels[i])).join('<br>')+'</p>':'')+'<p>특성 '+duoNumber(main.base)+' × 70%<br>동행 성적 '+duoNumber(p.performance)+' × 20%<br>CHEMISTRY '+duoNumber(p.K)+' × 10%</p>':'<p>'+esc(r.reason||'자료를 확인해 주세요.')+'</p>')+'<p class="note">별명은 기록으로 추정한 스타일입니다. 패스 경로·위치 추적·실제 침투 장면을 증명하지 않으며 OVR과 카드 등급에 영향을 주지 않습니다.</p></section></div><div class="duo-profiles">'+duoProfileHtml(r.one)+duoProfileHtml(r.two)+'</div>':'')+
    '<details class="duo-rule-book"><summary>20종 계산식과 판정 기준</summary><p>S 속도 · A 공격 · C 창출 · W 활동 · P 파워 · F 저파울 백분위 · D DRI 백분위 · G 공격포인트/경기 백분위 · T 참석률 백분위 · B 동행비율 백분위.</p><p>H(x)=두 선수 중 낮은 값×60%+평균×40%. X는 역할을 바꿔 계산한 H 중 조건을 만족하는 높은 값입니다. 특성≥65, 최종≥65인 유형만 선정하며 서브는 메인과 10점 이내입니다. 조건은 초기 설계값입니다.</p><div class="duo-rules-table">'+tbl([{t:'유형'},{t:'특성 계산식'},{t:'필수 조건'}],DUO_TYPES.map(t=>[esc(t.icon+' '+t.name),esc(t.formula),esc(t.condition)]))+'</div></details>';
  if(!dialog.open)dialog.showModal();dialog.querySelector('[data-duo-close]').focus();
}
function bindDuoMap(){
  const map=document.getElementById('chemistryMap'),svg=map?.querySelector('svg');if(!svg||svg.dataset.duoBound)return;svg.dataset.duoBound='1';
  const lines=[...svg.querySelectorAll('[data-chem-a][data-chem-b]')],hits=document.createElementNS('http://www.w3.org/2000/svg','g');hits.setAttribute('class','duo-edge-hits');
  lines.forEach(line=>{
    const a=line.dataset.chemA,b=line.dataset.chemB;if(!a||!b||a===b)return;
    const hit=document.createElementNS('http://www.w3.org/2000/svg','line');['x1','y1','x2','y2'].forEach(k=>hit.setAttribute(k,line.getAttribute(k)));
    hit.setAttribute('class','duo-edge-hit');hit.setAttribute('tabindex','0');hit.setAttribute('role','button');hit.setAttribute('aria-label',a+' × '+b+' DUO TYPE 보기');
    const title=document.createElementNS('http://www.w3.org/2000/svg','title');title.textContent=a+' × '+b+' · 클릭하여 DUO TYPE 분석';hit.append(title);
    const run=()=>openDuoDialog(a,b);hit.addEventListener('click',run);hit.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();run();}});
    hit.addEventListener('pointerenter',()=>{line.classList.add('duo-edge-hover');});hit.addEventListener('pointerleave',()=>line.classList.remove('duo-edge-hover'));hits.append(hit);
  });
  // Place wide click targets above edges but beneath nodes so node clicks still rebase the map.
  svg.insertBefore(hits,svg.querySelector('.chem-map-best-node,.chem-map-node,.chem-map-center'));
}
const duoDialog=document.getElementById('duoDialog');
duoDialog.querySelector('[data-duo-close]').onclick=()=>duoDialog.close();
duoDialog.addEventListener('click',e=>{if(e.target===duoDialog){const r=duoDialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)duoDialog.close();}});
duoDialog.addEventListener('close',()=>{if(duoReturnFocus?.isConnected)duoReturnFocus.focus();});
bindDuoMap();
