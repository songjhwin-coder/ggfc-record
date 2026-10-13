/* Historical snapshots: independent of active roster, league filters and career ratings. */
const AT_METRICS=[{key:'goals',label:'통합 득점',unit:'골'},{key:'games',label:'통합 경기수',unit:'경기'},{key:'titles',label:'통합 우승',unit:'회'},{key:'league',label:'리그 우승',unit:'회'},{key:'fa',label:'FA컵 우승',unit:'회'},{key:'champs',label:'챔스 우승',unit:'회'}];
const atState={metric:'goals',search:''};
function atHeader(v){return String(v||'').normalize('NFKC').replace(/\s/g,'');}
function validateAllTimeHeaders(headers){
 const set=new Set(headers.map(atHeader));
 const missing=['통합경기수','통합득점','리그우승','FA컵우승','챔스우승'].filter(k=>!set.has(k));
 if(!['선수','선수명','이름'].some(k=>set.has(k)))missing.unshift('선수');
 if(missing.length)throw Error('역대기록 필수 열 확인: '+missing.join(', '));
}
function atCount(value,label,blank=null){
 const raw=String(value??'').trim();if(!raw||raw==='-')return blank;
 if(!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(raw))throw Error('역대기록 '+label+': 0 이상의 정수를 입력하세요 ('+raw+'). 엑셀 수식 오류도 확인하세요.');
 const n=Number(raw.replace(/,/g,''));if(!Number.isSafeInteger(n))throw Error('역대기록 '+label+': 수치가 너무 큽니다.');return n;
}
function applyAllTimeRows(objs){
 if(objs.length)validateAllTimeHeaders(Object.keys(objs[0]));
 const rows=[],seen=new Set(),years=new Set(),warnings=[];
 for(const o of objs){
  const player=String(pick(o,'선수','선수명','이름')).normalize('NFKC').trim(),key=normalizePlayerMatchKey(player);
  if(!player||isOwnGoalPlayer(player)||/^(전체경기수|총경기수|전체|총계|합계|소계)$/.test(atHeader(player)))continue;
  if(seen.has(key))throw Error('역대기록 선수 이름 중복: '+player+'. 동명이인은 구분된 이름을 사용하세요.');seen.add(key);
  const annual=[];
  for(const [header,value] of Object.entries(o)){const m=atHeader(header).match(/^((?:19|20)\d{2})(경기수|득점)$/);if(m){years.add(m[1]);annual.push({year:m[1],key:m[2]==='경기수'?'games':'goals',value:atCount(value,player+' '+header)});}}
  const total=(header,key)=>{const v=atCount(pick(o,header),player+' '+header),valid=annual.filter(r=>r.key===key&&r.value!==null),sum=valid.reduce((s,r)=>s+r.value,0);if(v!==null){if(valid.length&&sum!==v)warnings.push(player+' · '+header+': 입력 '+v+' / 연도별 합계 '+sum+' (입력값 적용)');return v;}return valid.length?sum:null;};
  const league=atCount(pick(o,'리그우승'),player+' 리그 우승',0),fa=atCount(pick(o,'FA컵우승'),player+' FA컵 우승',0),champs=atCount(pick(o,'챔스우승'),player+' 챔스 우승',0);
  rows.push({player,joined:String(pick(o,'입단','입단연도')||''),games:total('통합경기수','games'),goals:total('통합득점','goals'),league,fa,champs,titles:league+fa+champs,career:String(pick(o,'통합우승경력')||''),photo:readPlayerPhotoCell(o),photoCutout:readPlayerPhotoCell(o,true)});
 }
 DB.settings=DB.settings||{};
 DB.settings.allTimeRecords={rows,warnings,sourceRows:objs,headers:objs.length?Object.keys(objs[0]):[],years:[...years].sort(),updatedAt:new Date().toISOString()};
 return rows.length;
}
function allTimeRows(){const rows=DB.settings?.allTimeRecords?.rows;return Array.isArray(rows)?rows:[];}
function exportAllTimeSheet(){
 const data=DB.settings?.allTimeRecords||{},headers=data.headers?.length?data.headers:['No.','선수','입단','통합 경기수','통합 득점','리그 우승','FA컵 우승','챔스 우승','통합 우승 경력','사진(URL)','사진(URL) 배경삭제'];
 return {name:'역대기록',head:headers.join(','),rows:(data.sourceRows||[]).map(r=>headers.map(h=>r[h]??''))};
}
function atRanked(){
 const key=atState.metric;let previous=null,rank=0;
 return allTimeRows().slice().sort((a,b)=>(b[key]??-1)-(a[key]??-1)||compareNamesKo(a.player,b.player)).map((r,i)=>{const value=r[key];if(value!==null&&value!==undefined){if(value!==previous)rank=i+1;previous=value;}return {...r,rank:value==null?null:rank};});
}
function atPhoto(p){
 const candidates=(DB.roster||[]).filter(r=>normalizePlayerMatchKey(r.player)===normalizePlayerMatchKey(p.player)).sort((a,b)=>String(b.year||'').localeCompare(String(a.year||'')));
 const rosterPhoto=candidates.map(r=>normalizePlayerPhotoUrl(r.photo)).find(Boolean),rosterCutout=candidates.map(r=>normalizePlayerPhotoUrl(r.photoCutout)).find(Boolean);
 const urls=[p.photo,p.photoCutout,rosterPhoto,rosterCutout].map(normalizePlayerPhotoUrl).filter(Boolean),photo=urls[0],fallback=urls.find(u=>u!==photo);
 return '<span class="at-avatar"><span aria-hidden="true">'+esc(p.player.slice(0,1))+'</span>'+(photo?'<img src="'+esc(photo)+'" '+(fallback?'data-at-fallback="'+esc(fallback)+'"':'')+' alt="'+esc(p.player)+' 사진" loading="lazy" referrerpolicy="no-referrer" onerror="atPhotoError(this)">':'')+'</span>';
}
function atPhotoError(img){const fallback=img.dataset.atFallback;delete img.dataset.atFallback;if(fallback){img.src=fallback;return;}img.hidden=true;}
function atValue(v){return v==null?'—':Number(v).toLocaleString('ko-KR');}
function atResultsHtml(){
 const ranked=atRanked(),metric=AT_METRICS.find(m=>m.key===atState.metric),query=normalizePlayerMatchKey(atState.search),filtered=ranked.filter(p=>normalizePlayerMatchKey(p.player).includes(query)),top=ranked.filter(p=>p.rank!==null).slice(0,3);
 return '<div class="at-podium">'+top.map((p,i)=>'<article class="at-podium-card place-'+i+'"><span class="at-rank">'+p.rank+'위</span>'+atPhoto(p)+'<h3>'+esc(p.player)+'</h3><strong>'+atValue(p[metric.key])+' <small>'+metric.unit+'</small></strong><p>'+metric.label+'</p></article>').join('')+'</div><div class="at-table-caption"><h3>'+metric.label+' · 전체 랭킹</h3><span>검색 '+filtered.length+' / 전체 '+ranked.length+'명</span></div><div class="at-table-wrap" tabindex="0" role="region" aria-label="역대기록 랭킹 표, 좌우 스크롤 가능"><table class="at-table"><thead><tr><th scope="col">순위</th><th scope="col">선수</th><th scope="col">입단</th>'+AT_METRICS.map(m=>'<th scope="col" '+(m.key===metric.key?'class="at-active"':'')+'>'+m.label+'</th>').join('')+'</tr></thead><tbody>'+filtered.map(p=>'<tr><td><b>'+ (p.rank===null?'—':p.rank)+'</b></td><th scope="row"><span class="at-player">'+atPhoto(p)+'<span>'+esc(p.player)+'</span></span></th><td>'+esc(p.joined||'—')+'</td>'+AT_METRICS.map(m=>'<td '+(m.key===metric.key?'class="at-active"':'')+'>'+atValue(p[m.key])+'</td>').join('')+'</tr>').join('')+'</tbody></table>'+(filtered.length?'':'<p class="empty">검색 결과가 없습니다.</p>')+'</div>';
}
function renderAllTimeRecords(){
 const root=document.getElementById('allTimeContent');if(!root)return;
 const data=DB.settings?.allTimeRecords,rows=allTimeRows(),years=data?.years||[];
 if(!rows.length){root.innerHTML='<div class="at-empty"><b>아직 등록된 역대기록이 없습니다.</b><p>관리자 모드 → 데이터 관리에서 역대기록 시트가 포함된 엑셀을 업로드하세요.</p></div>';return;}
 root.innerHTML='<div class="at-hero"><div><span>GGFC · ALL-TIME RECORDS</span><h3>함께 쌓아 온 기록</h3><p>현재 선수명단 등록 여부와 관계없이 역대기록의 모든 선수를 표시합니다.</p></div><strong>'+rows.length+'<small>역대 선수</small></strong></div><div class="at-scope"><b>집계 기준 · 역대기록 시트</b><p>엑셀 통합값 기준이며 현재 경기기록과 자동 합산하지 않습니다. 시즌·대회 조회 필터의 영향을 받지 않습니다.'+(years.length?' 연도별 열: '+esc(years[0])+'~'+esc(years[years.length-1])+'년.':'')+'</p></div><div class="at-filters" role="group" aria-label="역대기록 순위 기준">'+AT_METRICS.map(m=>'<button type="button" data-at-metric="'+m.key+'" aria-pressed="'+(m.key===atState.metric)+'">'+m.label+'</button>').join('')+'</div><label class="at-search">선수 이름 검색<input type="search" id="atSearch" placeholder="전체 역대 선수 검색" value="'+esc(atState.search)+'"></label><div id="atResults">'+atResultsHtml()+'</div><p class="at-footnote">동일 기록은 공동 순위(1·2·2·4), 동점 내 이름순으로 표시합니다. 상단은 정렬된 첫 3명입니다. 우승 합계는 리그 + FA컵 + 챔스이며 빈 우승 칸은 0회입니다. 경기수·득점 미입력은 연도별 값이 있으면 합산하고, 모두 없으면 —로 표시합니다. 사진이 없거나 불러오지 못하면 이름 첫 글자를 표시합니다.</p>';
 if(admin&&data.warnings?.length)root.insertAdjacentHTML('beforeend','<details class="at-audit"><summary>관리자 · 원본 수치 확인 '+data.warnings.length+'건</summary><ul>'+data.warnings.map(w=>'<li>'+esc(w)+'</li>').join('')+'</ul></details>');
 root.onclick=e=>{const b=e.target.closest('[data-at-metric]');if(!b)return;atState.metric=b.dataset.atMetric;renderAllTimeRecords();root.querySelector('[data-at-metric="'+atState.metric+'"]').focus({preventScroll:true});};
 root.oninput=e=>{if(e.target.id==='atSearch'){atState.search=e.target.value;document.getElementById('atResults').innerHTML=atResultsHtml();}};
}
