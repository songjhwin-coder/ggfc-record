/* Administrator password changes use Firebase Auth only; no password is stored in the record/settings DB. */
window.GGFCAdminPassword=(()=>{
 'use strict';
 const q=id=>document.getElementById(id),fields=['adminPasswordCurrent','adminPasswordNew','adminPasswordConfirm'];
 let working=false,completed=false;
 const administrator=()=>typeof admin!=='undefined'&&admin&&GGFC.authorized&&window.GGFC_MEMBER_PREVIEW!==true;
 function status(message,error=false){const el=q('adminPasswordChangeStatus');el.textContent=message;el.classList.toggle('is-error',error);}
 function clear(){fields.forEach(id=>{q(id).value='';q(id).type='password';});q('adminPasswordShowValues').checked=false;}
 function controls(){q('adminPasswordChangeForm').setAttribute('aria-busy',String(working));for(const id of [...fields,'adminPasswordChangeSubmit','adminPasswordShowValues'])q(id).disabled=working||completed;q('adminPasswordChangeSubmit').hidden=completed;q('adminPasswordChangeCancel').disabled=working;q('adminPasswordChangeCancel').textContent=completed?'닫기':'취소';}
 function refreshUI(){
  const panel=q('adminPasswordSettings'),dialog=q('adminPasswordDialog');if(!panel||!dialog)return;
  panel.hidden=!administrator();q('adminPasswordOpen').disabled=!administrator()||working||GGFC.passwordChanging;
  if(!administrator()){if(!working){clear();if(dialog.open)dialog.close();}q('adminPasswordPanelStatus').textContent='';return;}
  const permission=GGFC.adminPasswordStatus();q('adminPasswordPanelStatus').textContent=permission.allowed?'변경 후에도 현재 로그인은 유지되며, 다음 로그인부터 새 비밀번호를 사용합니다.':permission.reason;
 }
 function open(){
  const permission=GGFC.adminPasswordStatus();if(!permission.allowed){q('adminPasswordPanelStatus').textContent=permission.reason;toast(permission.reason);return false;}
  completed=false;clear();controls();status('');q('adminPasswordDialog').showModal();q('adminPasswordCurrent').focus();return true;
 }
 function close(){if(working)return;clear();status('');q('adminPasswordDialog').close();q('adminPasswordOpen').focus();}
 function errorMessage(error){
  const messages={
   'auth/wrong-password':'현재 비밀번호가 올바르지 않습니다.',
   'auth/invalid-credential':'현재 비밀번호를 확인해 주세요.',
   'auth/invalid-login-credentials':'현재 비밀번호를 확인해 주세요.',
   'auth/weak-password':'새 비밀번호가 Firebase의 비밀번호 조건을 충족하지 않습니다.',
   'auth/password-does-not-meet-requirements':'새 비밀번호가 Firebase의 비밀번호 정책을 충족하지 않습니다.',
   'auth/requires-recent-login':'인증 유효시간이 지났습니다. 관리자 로그아웃 후 다시 로그인해 변경하세요.',
   'auth/too-many-requests':'요청이 많습니다. 잠시 후 다시 시도하세요.',
   'auth/network-request-failed':'인터넷 연결을 확인하세요. 변경 결과가 불확실하면 새 비밀번호로 로그인을 확인하세요.',
   'auth/user-disabled':'관리자 계정이 중지되어 있습니다. Firebase Authentication에서 확인하세요.',
   'auth/user-token-expired':'관리자 인증이 만료되었습니다. 다시 로그인하세요.',
   'auth/operation-not-allowed':'Firebase Authentication의 이메일/비밀번호 로그인을 확인하세요.'
  };
  return messages[error?.code]||(String(error?.code||'').startsWith('ggfc/')?error.message:'비밀번호를 변경하지 못했습니다. 로그인과 서버 연결을 확인한 뒤 다시 시도하세요.');
 }
 async function submit(event){
  event?.preventDefault();if(working)return;
  const permission=GGFC.adminPasswordStatus();if(!permission.allowed){status(permission.reason,true);return;}
  let current=q(fields[0]).value,next=q(fields[1]).value,confirmation=q(fields[2]).value;
  if(!current){status('현재 비밀번호를 입력하세요.',true);return;}
  if(next.length<8||next.length>128){status('새 비밀번호는 8~128자로 입력하세요.',true);return;}
  if(next!==confirmation){status('새 비밀번호와 확인 값이 일치하지 않습니다.',true);return;}
  if(next===current){status('현재 비밀번호와 다른 새 비밀번호를 입력하세요.',true);return;}
  working=true;clear();controls();status('현재 비밀번호 확인 및 변경 중…');
  try{
   await GGFC.changeAdminPassword(current,next);
   completed=true;
   status('관리자 비밀번호 변경 완료 · 다음 로그인부터 새 비밀번호를 사용하세요.');
   q('adminPasswordPanelStatus').textContent='관리자 비밀번호 변경 완료 · 다음 로그인부터 새 비밀번호를 사용하세요.';
   toast('관리자 비밀번호를 변경했습니다. 다음 로그인부터 새 비밀번호를 사용하세요.');
  }catch(error){status(errorMessage(error),true);}
  finally{current='';next='';confirmation='';working=false;controls();clear();if(!administrator()){if(q('adminPasswordDialog').open)q('adminPasswordDialog').close();toast('관리자 인증을 다시 확인하세요.');}}
 }
 q('adminPasswordOpen').onclick=open;q('adminPasswordChangeCancel').onclick=close;q('adminPasswordChangeForm').onsubmit=submit;
 q('adminPasswordShowValues').onchange=e=>fields.forEach(id=>q(id).type=e.target.checked?'text':'password');
 q('adminPasswordDialog').addEventListener('cancel',e=>{if(working)e.preventDefault();else{clear();status('');}});
 q('adminPasswordDialog').addEventListener('close',()=>{if(!working)clear();});
 window.addEventListener('pagehide',clear);refreshUI();
 return {open,refreshUI,get pending(){return working;}};
})();
