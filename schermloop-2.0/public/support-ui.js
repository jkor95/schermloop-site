'use strict';
// Dit script wordt na dashboard.js ingeladen en gebruikt de bestaande veilige dashboardfuncties.
const supportState={id:null,reason:''};
async function supportCall(path='',opts={}){
 if(!supportState.id||supportState.reason.length<10)throw Error('Open de supportomgeving met een reden.');
 return api('/support/organizations/'+supportState.id+path,{...opts,headers:{'x-support-reason':supportState.reason}});
}
async function openSupport(org){
 modal('Bedrijf ondersteunen: '+org.name,[{name:'reason',label:'Reden van ondersteuning',value:'Technische hulp na melding van klant'}],async v=>{
  if(v.reason.trim().length<10)throw Error('Voer een duidelijke reden in.');
  supportState.id=org.id;supportState.reason=v.reason.trim();
  await refreshSupport();$('supportPanel').hidden=false;
  $('supportPanel').scrollIntoView({block:'start',behavior:'smooth'});
 },'Support openen');
}
async function refreshSupport(){
 const data=await supportCall();
 const legacy=await api('/release/legacy-status').catch(()=>null);
 $('supportCompanyTitle').textContent=data.organization.name;
 const screens=$('supportScreens');screens.replaceChildren();
 if(!data.screens.length)screens.append(node('p','muted','Geen schermen toegevoegd.'));
 for(const screen of data.screens){
  const row=node('div','list-row'),left=node('div','main'),actions=node('div','actions');
  const online=screen.last_seen_at&&Date.now()-new Date(screen.last_seen_at).getTime()<120000;
  left.append(node('strong','',screen.name),node('small','',screen.paired?(online?'Online':'Gekoppeld, offline'):'Niet gekoppeld'));
  actions.append(button('Naam aanpassen',()=>modal('Scherminstellingen',[{name:'name',label:'Schermnaam',value:screen.name}],async v=>{
   await supportCall('/screens/'+screen.id,{method:'PATCH',body:{name:v.name}});
   message('Schermnaam aangepast en geregistreerd.');await refreshSupport();
  }),true));
  actions.append(button('Koppeling intrekken',async()=>{
   if(!confirm('Het scherm '+screen.name+' wordt ontkoppeld en moet opnieuw worden gekoppeld. Doorgaan?'))return;
   await supportCall('/screens/'+screen.id+'/disconnect',{method:'POST',body:{}});
   message('Schermkoppeling ingetrokken en geregistreerd.');await refreshSupport();
  },true));
  if(legacy?.sourceReady&&!screen.paired&&!data.items.some(x=>x.screen_id===screen.id)){
   actions.append(button('Oude SchermLoop importeren',()=>modal(
    'Bestaande presentatie veilig importeren',[
     {name:'current_password',label:'Je hoofdbeheerwachtwoord',type:'password'},
     {name:'news_policy',label:'Nieuwsbron: typ RIJK voor Rijksoverheid of UIT om nieuws uit te schakelen'}
    ],async v=>{
     const choice=String(v.news_policy||'').trim().toUpperCase();
     const news_policy=choice==='RIJK'?'rijksoverheid':choice==='UIT'?'disable':null;
     if(!news_policy)throw Error('Typ RIJK of UIT voor de nieuwsbron.');
     if(!confirm('De oude presentatie uit de privé-back-up importeren naar het LEGE scherm '+screen.name+'? De oude versie blijft ongewijzigd.'))return;
     const result=await api('/release/import-legacy',{method:'POST',body:{
      organization_id:supportState.id,screen_id:screen.id,current_password:v.current_password,
      news_policy,confirm:true
     }});
     message(result.imported+' dia\'s geïmporteerd uit '+result.sourceSlides+' bronitems. Het scherm blijft voorlopig uitgeschakeld.');
     await refreshSupport();
    },'Import uitvoeren'),true));
  }
  row.append(left,actions);screens.append(row);
 }
 const users=$('supportUsers');users.replaceChildren();
 for(const user of data.users){
  const row=node('div','list-row'),left=node('div','main'),actions=node('div','actions');
  left.append(node('strong','',user.email),node('span','pill'+(user.active?' good':' bad'),user.role==='owner'?'Bedrijfsbeheerder':user.active?'Actief':'Uitgeschakeld'));
  actions.append(button('Wachtwoord herstellen',async()=>{
   if(!confirm('Wachtwoord van '+user.email+' opnieuw instellen? Alle bestaande sessies worden ingetrokken.'))return;
   const result=await supportCall('/users/'+user.id+'/reset-password',{method:'POST',body:{confirm:true}});
   showOneTimeCredentials(result.email,result.temporary_password);
   message('Eenmalig herstelwachtwoord gemaakt. Geef dit uitsluitend veilig aan de klant.');
   await refreshSupport();
  },true));
  row.append(left,actions);users.append(row);
 }
 const items=$('supportItems');items.replaceChildren();
 if(!data.items.length)items.append(node('p','muted','Geen dia’s.'));
 for(const item of data.items){
  const row=node('div','list-row'),left=node('div','main'),actions=node('div','actions');
  const screen=data.screens.find(x=>x.id===item.screen_id);
  left.append(node('strong','',item.title),node('small','',(screen?.name||'Scherm')+' · '+item.duration+' sec · '+(item.enabled?'Zichtbaar':'Verborgen')));
  actions.append(button('Bewerken',()=>modal('Dia corrigeren',[{name:'title',label:'Titel',value:item.title},{name:'duration',label:'Duur in seconden',type:'number',min:2,max:600,value:item.duration}],async v=>{
   await supportCall('/items/'+item.id,{method:'PATCH',body:v});
   message('Dia aangepast en geregistreerd.');await refreshSupport();
  }),true));
  actions.append(button(item.enabled?'Verbergen':'Tonen',async()=>{
   await supportCall('/items/'+item.id,{method:'PATCH',body:{enabled:!item.enabled}});
   message('Dia-instelling gewijzigd en geregistreerd.');await refreshSupport();
  },true));
  row.append(left,actions);items.append(row);
 }
 const audit=$('supportAudit');audit.replaceChildren();
 if(!data.audit.length)audit.append(node('p','muted','Nog geen eerdere supportacties.'));
 for(const entry of data.audit){
  const row=node('div','list-row'),who=node('div','main');
  who.append(node('strong','',entry.action),node('small','',new Date(entry.created_at).toLocaleString('nl-NL')+' · '+entry.actor_email+' · '+(entry.details?.reason||'')));
  row.append(who);audit.append(row);
 }
}
document.addEventListener('DOMContentLoaded',()=>{
 $('supportRefresh').addEventListener('click',()=>refreshSupport().catch(e=>message(e.message,true)));
 $('closeSupport').addEventListener('click',()=>{$('supportPanel').hidden=true;supportState.id=null;supportState.reason='';});
});
