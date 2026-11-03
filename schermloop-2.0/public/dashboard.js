'use strict';
const $=id=>document.getElementById(id);
const state={me:null,organizations:[],screens:[],users:[],items:[],selected:null};
const days=[['Ma',1],['Di',2],['Wo',3],['Do',4],['Vr',5],['Za',6],['Zo',0]];
async function api(url,opts={}){
 const init={method:opts.method||'GET',credentials:'same-origin',headers:{}};
 if(opts.body instanceof FormData)init.body=opts.body;
 else if(opts.body!==undefined){init.body=JSON.stringify(opts.body);init.headers['Content-Type']='application/json';}
 const r=await fetch('/api'+url,init);
 let result={};try{result=await r.json();}catch{}
 if(!r.ok)throw Error(result.error||'Verzoek mislukt ('+r.status+')');
 return result;
}
function message(value,isError=false){
 const el=$('notice');el.hidden=false;el.textContent=value;el.classList.toggle('failed',!!isError);
 el.scrollIntoView({block:'nearest',behavior:'smooth'});
}
function node(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
function stats(target,items){target.replaceChildren();items.forEach(([label,value])=>{const box=node('div','stat'),strong=node('strong','',String(value)),small=node('small','',label);box.append(strong,small);target.append(box);});}
function button(text,handler,outline=false){const b=node('button','btn '+(outline?'outline':'primary')+' small',text);b.type='button';b.addEventListener('click',()=>Promise.resolve(handler()).catch(e=>message(e.message,true)));return b;}
function randomPassword(){const chars='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';const bytes=crypto.getRandomValues(new Uint8Array(20));return Array.from(bytes,x=>chars[x%chars.length]).join('');}
function modal(title,fields,action,submitText='Opslaan'){
 const d=$('dialog'),box=$('dialogFields'),form=$('dialogForm');box.replaceChildren();
 $('dialogTitle').textContent=title;$('dialogSubmit').textContent=submitText;$('dialogError').textContent='';
 const refs={};for(const def of fields){const l=node('label','',def.label),input=node('input');input.name=def.name;input.type=def.type||'text';input.value=def.value??'';input.required=def.required!==false;if(def.min!==undefined)input.min=String(def.min);if(def.max!==undefined)input.max=String(def.max);if(def.step!==undefined)input.step=String(def.step);l.append(input);box.append(l);refs[def.name]=input;}
 const previous=form.onsubmit;form.onsubmit=async e=>{e.preventDefault();const values=Object.fromEntries(Object.entries(refs).map(([k,v])=>[k,v.type==='number'?Number(v.value):v.value]));$('dialogSubmit').disabled=true;try{await action(values);d.close();$('dialogError').textContent='';}catch(ex){$('dialogError').textContent=ex.message;}finally{$('dialogSubmit').disabled=false;}};
 $('dialogCancel').onclick=()=>d.close();
 d.addEventListener('close',()=>{form.onsubmit=previous;},{once:true});
 d.showModal();
}
function showLoggedOut(){$('login').hidden=false;$('app').hidden=true;$('logout').hidden=true;$('who').textContent='';}
async function refresh(){
 try{state.me=await api('/me');$('login').hidden=true;$('app').hidden=false;$('logout').hidden=false;$('who').textContent=state.me.user.email;
 $('appTitle').textContent=state.me.organization?.name||'Hoofdbeheer';$('appSubtitle').textContent=state.me.user.role==='superadmin'?'Beheer bedrijfsomgevingen en toegekende licenties.':'Beheer de schermen en presentaties van jouw organisatie.';
 $('adminArea').hidden=state.me.user.role!=='superadmin';$('companyArea').hidden=state.me.user.role==='superadmin';
 if(state.me.user.role==='superadmin')await loadAdmin();else await loadCompany();
 }catch(e){if(String(e.message).includes('Log eerst in.')||String(e.message).includes('Sessie verlopen.'))showLoggedOut();else{showLoggedOut();$('loginError').textContent=e.message;}}
}
async function loadAdmin(){
 state.organizations=await api('/organizations');
 stats($('adminStats'),[['Bedrijven',state.organizations.length],['Actieve accounts',state.organizations.reduce((n,x)=>n+x.users_used,0)],['Gekoppelde schermen',state.organizations.reduce((n,x)=>n+x.screens_used,0)]]);
 const box=$('organizations');box.replaceChildren();
 if(!state.organizations.length){box.append(node('p','muted','Nog geen bedrijven toegevoegd.'));return;}
 for(const org of state.organizations){
 const r=node('div','list-row'),left=node('div','main');
 left.append(node('strong','',org.name),node('small','',org.users_used+'/'+org.user_limit+' accounts · '+org.screens_used+'/'+org.screen_limit+' schermen'));
 const actions=node('div','actions');
 actions.append(button('Licenties aanpassen',()=>modal('Licenties: '+org.name,[{name:'user_limit',label:'Maximaal aantal accounts',type:'number',min:1,max:500,value:org.user_limit},{name:'screen_limit',label:'Maximaal aantal schermen',type:'number',min:1,max:500,value:org.screen_limit}],async v=>{await api('/organizations/'+org.id+'/licenses',{method:'PATCH',body:v});message('Licenties bijgewerkt.');await loadAdmin();}),true));
 r.append(left,actions);box.append(r);
 }
}
async function loadCompany(){
 const [screens,users]=await Promise.all([api('/screens'),api('/users')]);state.screens=screens;state.users=users;
 const org=state.me.organization;stats($('companyStats'),[['Schermen',screens.length+' / '+org.screen_limit],['Accounts',users.filter(u=>u.active).length+' / '+org.user_limit],['Online apparaten',screens.filter(s=>s.last_seen_at&&Date.now()-new Date(s.last_seen_at).getTime()<120000).length]]);
 const isOwner=state.me.user.role==='owner';$('addScreenBtn').disabled=!isOwner||screens.length>=org.screen_limit;$('addUserBtn').disabled=!isOwner||users.filter(u=>u.active).length>=org.user_limit;
 const box=$('screens');box.replaceChildren();
 if(!screens.length)box.append(node('p','muted','Er is nog geen presentatiescherm aangemaakt.'));
 for(const s of screens){
 const row=node('div','list-row'+(s.id===state.selected?' selected':'')),left=node('div','main');
 const live=s.last_seen_at&&Date.now()-new Date(s.last_seen_at).getTime()<120000;
 left.append(node('strong','',s.name),node('small','',s.paired?(live?'● Online':'Gekoppeld, nu offline'):'Nog niet gekoppeld'));
 const acts=node('div','actions');acts.append(button('Beheren',async()=>{state.selected=s.id;await loadCompany();await selectScreen();},true));
 row.append(left,acts);box.append(row);
 }
 const ub=$('users');ub.replaceChildren();for(const u of users){const row=node('div','list-row');row.append(node('strong','',u.email),node('span','pill',u.role==='owner'?'Beheerder':'Medewerker'));ub.append(row);}
 if(state.selected&&!screens.find(s=>s.id===state.selected)){state.selected=null;$('screenPanel').hidden=true;}
 if(state.selected)await selectScreen();
}
async function selectScreen(){
 const screen=state.screens.find(s=>s.id===state.selected);if(!screen)return;
 $('screenPanel').hidden=false;$('screenName').textContent=screen.name;
 $('pairStatus').textContent=screen.paired?'Gekoppeld. Een nieuwe koppeling trekt de huidige toegang automatisch in.':'Nog niet gekoppeld. Open eerst de schermspeler op het afspeelapparaat.';
 const cfg=screen.settings||{};$('scheduleEnabled').checked=!!cfg.enabled;$('scheduleOn').value=cfg.on||'07:30';$('scheduleOff').value=cfg.off||'18:00';$('clockEnabled').checked=cfg.clock!==false;$('backgroundMode').value=cfg.background||'black';$('backgroundColor').value=cfg.backgroundColor||'#172638';
 const daybox=$('days');daybox.replaceChildren();for(const [name,num] of days){const label=node('label'),cb=node('input');cb.type='checkbox';cb.value=String(num);cb.checked=(cfg.days||[1,2,3,4,5]).includes(num);label.append(cb,document.createTextNode(name));daybox.append(label);}
 $('settingsForm').querySelector('button[type=submit]').disabled=state.me.user.role!=='owner';
 state.items=await api('/screens/'+screen.id+'/items');renderItems();
}
function renderItems(){
 const box=$('items');box.replaceChildren();$('itemsCount').textContent=state.items.length+' dia(’s)';
 if(!state.items.length){box.append(node('p','muted','Nog geen dia’s. Voeg een afbeelding, filmpje, PowerPoint of mededeling toe.'));return;}
 for(const item of state.items){
 const row=node('div','list-row'),left=node('div','main'),actions=node('div','actions');
 const label=node('div','item-label');label.append(node('span','item-icon',item.kind==='video'?'▶':item.kind==='text'?'✎':'▧'),node('strong','',item.title));left.append(label,node('small','',(item.kind==='video'?'Video':item.kind==='text'?'Tekst':'Afbeelding')+' · '+item.duration+' sec'));
 actions.append(button('▲',async()=>{await api('/items/'+item.id+'/move',{method:'POST',body:{direction:-1}});await selectScreen();},true));
 actions.append(button('▼',async()=>{await api('/items/'+item.id+'/move',{method:'POST',body:{direction:1}});await selectScreen();},true));
 actions.append(button(item.enabled?'Verbergen':'Tonen',async()=>{await api('/items/'+item.id,{method:'PATCH',body:{enabled:!item.enabled}});await selectScreen();},true));
 actions.append(button('Tijd',()=>modal('Duur van '+item.title,[{name:'duration',label:'Seconden',type:'number',min:2,max:600,value:item.duration}],async v=>{await api('/items/'+item.id,{method:'PATCH',body:v});await selectScreen();}),true));
 actions.append(button('Verwijderen',async()=>{if(confirm('Weet je zeker dat je deze dia wilt verwijderen?')){await api('/items/'+item.id,{method:'DELETE'});await selectScreen();}},true));
 if(!item.enabled)row.style.opacity='.55';row.append(left,actions);box.append(row);
 }
}
document.addEventListener('DOMContentLoaded',()=>{
 $('loginForm').addEventListener('submit',async e=>{e.preventDefault();$('loginError').textContent='';try{await api('/login',{method:'POST',body:{email:$('email').value,password:$('password').value}});$('password').value='';await refresh();}catch(ex){$('loginError').textContent=ex.message;}});
 $('logout').addEventListener('click',async()=>{try{await api('/logout',{method:'POST'});}catch{}state.me=null;state.selected=null;showLoggedOut();});
 $('addOrgBtn').addEventListener('click',()=>modal('Nieuw bedrijf',[{name:'name',label:'Bedrijfsnaam'},{name:'email',label:'Beheeraccount (e-mail)',type:'email'},{name:'password',label:'Tijdelijk wachtwoord (veilig doorgeven)',value:randomPassword()}],async v=>{const r=await api('/organizations',{method:'POST',body:v});message('Bedrijf '+r.name+' aangemaakt. Geef het wachtwoord veilig door aan de beheerder.');await loadAdmin();},'Bedrijf aanmaken'));
 $('addScreenBtn').addEventListener('click',()=>modal('Scherm toevoegen',[{name:'name',label:'Schermnaam',value:'Receptie'}],async v=>{const r=await api('/screens',{method:'POST',body:v});state.selected=r.id;message('Scherm toegevoegd.');await loadCompany();}));
 $('addUserBtn').addEventListener('click',()=>modal('Medewerker uitnodigen',[{name:'email',label:'E-mailadres',type:'email'},{name:'password',label:'Tijdelijk wachtwoord (veilig doorgeven)',value:randomPassword()}],async v=>{await api('/users',{method:'POST',body:v});message('Medewerker aangemaakt. Geef het wachtwoord veilig door.');await loadCompany();},'Medewerker toevoegen'));
 $('pairForm').addEventListener('submit',async e=>{e.preventDefault();if(!state.selected)return;try{await api('/screens/'+state.selected+'/pair',{method:'POST',body:{code:$('pairCode').value}});$('pairCode').value='';message('Scherm veilig gekoppeld.');await loadCompany();}catch(ex){message(ex.message,true);}});
 $('settingsForm').addEventListener('submit',async e=>{e.preventDefault();try{const selectedDays=[...$('days').querySelectorAll('input:checked')].map(x=>Number(x.value));const cfg={...state.screens.find(x=>x.id===state.selected).settings,enabled:$('scheduleEnabled').checked,days:selectedDays,on:$('scheduleOn').value,off:$('scheduleOff').value,clock:$('clockEnabled').checked,background:$('backgroundMode').value,backgroundColor:$('backgroundColor').value};await api('/screens/'+state.selected,{method:'PATCH',body:{settings:cfg}});message('Presentatieplanning opgeslagen.');await loadCompany();}catch(ex){message(ex.message,true);}});
 $('uploadForm').addEventListener('submit',async e=>{e.preventDefault();if(!state.selected)return;const file=$('uploadFile').files[0];if(!file)return;if(file.size>50*1024*1024){message('Bestand mag maximaal 50 MB zijn.',true);return;}const btn=$('uploadBtn');btn.disabled=true;btn.textContent='Bestand verwerken...';try{const form=new FormData();form.append('file',file);form.append('duration',$('uploadDuration').value);const r=await api('/screens/'+state.selected+'/items/upload',{method:'POST',body:form});$('uploadFile').value='';message(r.created+' dia(’s) toegevoegd.');await selectScreen();}catch(ex){message(ex.message,true);}finally{btn.disabled=false;btn.textContent='Bestand uploaden';}});
 $('textForm').addEventListener('submit',async e=>{e.preventDefault();if(!state.selected)return;try{await api('/screens/'+state.selected+'/items/text',{method:'POST',body:{title:$('textTitle').value,text:$('textBody').value,duration:Number($('textDuration').value)}});$('textTitle').value='';$('textBody').value='';message('Mededeling toegevoegd.');await selectScreen();}catch(ex){message(ex.message,true);}});
 $('refreshItems').addEventListener('click',()=>selectScreen().catch(e=>message(e.message,true)));
 refresh();
});
