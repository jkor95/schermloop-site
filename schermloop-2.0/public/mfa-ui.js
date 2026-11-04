'use strict';
(function(){
 let enabled=false,otpauthLink='';
 const el=id=>document.getElementById(id);
 function fail(text){el('mfaError').textContent=text||'';}
 function clearSecrets(){
  el('mfaSetup').hidden=true;el('mfaSecret').textContent='';el('mfaConfirmCode').value='';
  el('mfaOpenApp').removeAttribute('href');otpauthLink='';
  el('mfaRecovery').hidden=true;el('mfaRecoveryCodes').textContent='';
 }
 async function refreshStatus(){
  const result=await api('/mfa/status');
  enabled=result.enabled===true;
  el('mfaStatus').textContent=enabled?'Actief: nieuwe aanmeldingen vereisen een authenticatorcode.':'Nog niet actief. Schakel 2FA in voordat de app voor klanten wordt gebruikt.';
  el('mfaManageBtn').textContent=enabled?'Tweestapsverificatie uitschakelen':'Tweestapsverificatie instellen';
  return enabled;
 }
 function showRecovery(codes){
  el('mfaRecoveryCodes').textContent=codes.join('\n');
  el('mfaRecovery').hidden=false;
  el('mfaRecovery').scrollIntoView({block:'nearest',behavior:'smooth'});
 }
 async function begin(){
  modal('Authenticatorkoppeling starten',[
   {name:'password',label:'Bevestig je huidige hoofdbeheerwachtwoord',type:'password'}
  ],async values=>{
   fail('');
   const result=await api('/mfa/start',{method:'POST',body:{current_password:values.password}});
   clearSecrets();
   el('mfaSecret').textContent=result.secret;
   otpauthLink=result.otpauth_uri;
   el('mfaOpenApp').href=otpauthLink;
   el('mfaSetup').hidden=false;
   el('mfaConfirmCode').focus();
   message('Voeg SchermLoop 2.0 toe aan je authenticator en bevestig met de code.');
  },'Begin met 2FA');
 }
 async function disable(){
  modal('Tweestapsverificatie uitschakelen',[
   {name:'password',label:'Huidig hoofdbeheerwachtwoord',type:'password'},
   {name:'code',label:'Code uit je authenticator of herstelcode'}
  ],async values=>{
   const code=String(values.code||'').trim().replace(/[\s-]/g,'');
   const body={current_password:values.password,confirm:true};
   if(/^\d{6}$/.test(code))body.code=code;
   else body.recovery_code=code;
   if(!confirm('Tweestapsverificatie echt uitschakelen? Hierdoor is je hoofdaccount tijdelijk minder veilig.'))return;
   await api('/mfa/disable',{method:'POST',body});
   clearSecrets();await refreshStatus();
   message('Tweestapsverificatie is uitgeschakeld. Schakel dit opnieuw in met een nieuwe authenticator.');
  },'2FA uitschakelen');
 }
 document.addEventListener('DOMContentLoaded',()=>{
  el('mfaManageBtn').addEventListener('click',()=>{
   (enabled?disable():begin()).catch(e=>fail(e.message));
  });
  el('mfaConfirmForm').addEventListener('submit',async event=>{
   event.preventDefault();fail('');
   const button=event.currentTarget.querySelector('[type=submit]');button.disabled=true;
   try{
    const result=await api('/mfa/confirm',{method:'POST',body:{code:el('mfaConfirmCode').value.trim()}});
    clearSecrets();showRecovery(result.recovery_codes);await refreshStatus();
    message('Tweestapsverificatie is ingeschakeld. Bewaar alle herstelcodes op een veilige plaats.');
   }catch(e){fail(e.message);}finally{button.disabled=false;}
  });
  el('mfaCopyCodes').addEventListener('click',async()=>{
   try{
    await navigator.clipboard.writeText(el('mfaRecoveryCodes').textContent);
    message('Herstelcodes gekopieerd. Bewaar ze buiten dit apparaat op een veilige plek.');
   }catch(e){fail('Kopiëren mislukt. Selecteer de herstelcodes handmatig.');}
  });
  el('mfaHideCodes').addEventListener('click',()=>{
   el('mfaRecoveryCodes').textContent='';el('mfaRecovery').hidden=true;
   message('Herstelcodes verborgen. Ze zijn hier niet opnieuw op te vragen.');
  });
 });
 window.SchermLoopMfaUI={refreshStatus,reset(){clearSecrets();fail('');}};
})();
