/* Card skin only. Shared preference is independent of career tiers and ratings. */
let cardDesignSettingsDirty=false;
const CARD_DESIGN_LABELS={classic:'기존 클래식',neon:'네온 실드',stadium:'스타디움 실드'};
function playerCardDesign(){return Object.hasOwn(CARD_DESIGN_LABELS,DB.settings?.playerCardDesign)?DB.settings.playerCardDesign:'classic';}
function applyPlayerCardDesign(card,design=playerCardDesign()){
  if(!card)return;
  card.dataset.design=Object.hasOwn(CARD_DESIGN_LABELS,design)?design:'classic';
  if(!card.querySelector('.neon-frame-art')){
    const art=document.createElement('img');art.className='neon-frame-art';art.src='assets/ggfc-neon-shield.svg';art.alt='';art.setAttribute('aria-hidden','true');card.prepend(art);
  }
  const frame=card.querySelector('.neon-frame-art');
  const frameSrc=card.dataset.design==='stadium'?'assets/ggfc-stadium-shield.svg':'assets/ggfc-neon-shield.svg';
  if(frame.getAttribute('src')!==frameSrc)frame.src=frameSrc;
  const name=card.querySelector('.ggfc-player-card-name');
  if(name)card.style.setProperty('--neon-name-size',Array.from(name.textContent).length>22?'23px':Array.from(name.textContent).length>16?'28px':'34px');
}
function renderPlayerCardDesignPreview(){
  const box=document.getElementById('cardDesignPreview'),source=document.querySelector('#playerCardContainer .ggfc-player-card');if(!box||!source)return;
  const card=source.cloneNode(true);card.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));
  card.removeAttribute('style');card.dataset.careerTier='NORMAL';
  card.querySelector('.ggfc-player-card-name').textContent='GGFC PLAYER';
  card.querySelector('.ggfc-player-card-ovr').textContent='80';card.querySelector('.ggfc-player-card-pos').textContent='AL';
  card.querySelector('.ggfc-player-card-edition strong').textContent='NORMAL';
  card.querySelectorAll('.ggfc-player-card-stat-value').forEach((el,i)=>el.textContent=[82,78,81,80,76,83][i]);
  const photo=card.querySelector('.ggfc-player-card-photo-wrap');photo.replaceChildren();
  const portrait=document.createElement('img');portrait.className='ggfc-player-card-photo';portrait.src='assets/ggfc-card-preview.svg';portrait.alt='디자인 확인용 선수 실루엣';photo.append(portrait);
  const club=card.querySelector('.ggfc-player-card-club');club.style.backgroundImage='none';club.textContent='GGFC';
  applyPlayerCardDesign(card,document.getElementById('cardDesignSelect').value);box.replaceChildren(card);
}
function renderPlayerCardDesignSettings(force=false){
  const box=document.getElementById('cardDesignSettings');if(!box)return;
  box.hidden=!admin;
  const current=document.querySelector('#playerCardContainer .ggfc-player-card');applyPlayerCardDesign(current);
  if(!admin)cardDesignSettingsDirty=false;
  const select=document.getElementById('cardDesignSelect');
  if(!cardDesignSettingsDirty||force)select.value=playerCardDesign();
  [select,document.getElementById('cardDesignSave'),document.getElementById('cardDesignCancel')].forEach(el=>el.disabled=!admin);
  select.onchange=()=>{if(!admin)return;cardDesignSettingsDirty=true;renderPlayerCardDesignPreview();GGFC.refreshUI();document.getElementById('cardDesignStatus').textContent='미리보기입니다. 디자인 저장을 누르면 회원 화면에 적용됩니다.';};
  document.getElementById('cardDesignSave').onclick=savePlayerCardDesign;
  document.getElementById('cardDesignCancel').onclick=()=>{if(!admin)return;cardDesignSettingsDirty=false;renderPlayerCardDesignSettings(true);GGFC.refreshUI();document.getElementById('cardDesignStatus').textContent='저장된 디자인으로 되돌렸습니다.';};
  if(admin)renderPlayerCardDesignPreview();
}
function savePlayerCardDesign(){
  const status=document.getElementById('cardDesignStatus');
  if(!admin||!GGFC.canEdit()){status.textContent='관리자 인증과 서버 연결을 확인해 주세요.';return false;}
  const value=document.getElementById('cardDesignSelect').value;
  if(!Object.hasOwn(CARD_DESIGN_LABELS,value)){status.textContent='카드 디자인을 다시 선택해 주세요.';return false;}
  DB.settings=DB.settings||{};const previous=DB.settings.playerCardDesign;DB.settings.playerCardDesign=value;
  try{const result=save();if(!result?.cloudPending)throw result?.error||new Error('공유 저장을 시작하지 못했습니다.');}
  catch(e){if(previous===undefined)delete DB.settings.playerCardDesign;else DB.settings.playerCardDesign=previous;status.textContent='저장 실패: '+e.message;return false;}
  cardDesignSettingsDirty=false;renderPlayerCardDesignSettings(true);GGFC.refreshUI();status.textContent=CARD_DESIGN_LABELS[value]+'를 적용했습니다. 상단에서 공유 저장 완료를 확인해 주세요.';return true;
}
