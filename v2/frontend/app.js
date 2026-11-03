(() => {
'use strict';
const $ = (id) => document.getElementById(id);
const state = { me:null, csrf:'', organizations:[], orgId:null, slides:[], screens:[], users:[], settings:{}, tab:'dashboard' };
const h = (s) => String(s??'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $form = (form, field) => form.elements.namedItem(field);
const flash = (message, error=false) => { const t=$('toast');t.textContent=message;t.classList.toggle('error',error);t.hidden=false;clearTimeout(flash.timer);flash.timer=setTimeout(()=>{t.hidden=true;},5500); };
async function request(url, options={}) {
 const opts={credentials:'same-origin',...options};
 opts.headers={...(options.body instanceof FormData ? {} : {'Content-Type':'application/json'}),...(options.headers||{})};
 if(opts.method && !['GET','HEAD'].includes(opts.method.toUpperCase()) && state.csrf) opts.headers['X-CSRF-Token']=state.csrf;
 const res=await fetch(url,opts);
 let data=null;try{data=await res.json();}catch(_){}
 if(!res.ok)throw new Error(typeof data?.detail==='string'?data.detail:'Er ging iets mis ('+res.status+')');
 return data;
}
const api=(path,opts={})=>request('/api'+path,opts);
const post=(path, obj)=>api(path,{method:'POST',body:JSON.stringify(obj)});
const put=(path,obj)=>api(path,{method:'PUT',body:JSON.stringify(obj)});
const patch=(path,obj)=>api(path,{method:'PATCH',body:JSON.stringify(obj)});
const company = () => state.organizations.find(x=>x.id===state.orgId);
const base = () => '/organizations/'+encodeURIComponent(state.orgId);
const isSuper = () => state.me?.role==='superadmin';
const editable=()=>isSuper()||state.me?.role==='org_admin'||state.me?.role==='editor';
const isOrgAdmin=()=>isSuper()||state.me?.role==='org_admin';
const limit=(n) => Number.isFinite(Number(n))?Number(n):0;
function showApp() {$('loginView').hidden=true;$('workspace').hidden=false;$('accountName').textContent=state.me.name+' · '+state.me.email;$('adminTabBtn').hidden=!isSuper();}
function showLogin() {$('loginView').hidden=false;$('workspace').hidden=true;}
async function initialize(){
 try { state.me=await api('/auth/me');state.csrf=state.me.csrf;showApp();await loadOrganizations(); }
 catch(e){showLogin();}
}
async function loadOrganizations(){
 state.organizations=await api('/organizations');
 if(!state.organizations.some(o=>o.id===state.orgId))state.orgId=state.organizations[0]?.id||null;
 $('companySelect').innerHTML=state.organizations.map(o=>`<option value="${h(o.id)}">${h(o.name)}</option>`).join('')+(isSuper()?'<option value="__admin">✦ Hoofdbeheer</option>':'');
 $('companySelect').value=state.orgId||'__admin';
 if(state.orgId)await loadCompanyData();else switchTab('admin');
}
async function loadCompanyData(){
 if(!state.orgId){switchTab('admin');return;}
 const data=await Promise.all([api(base()+'/slides'),api(base()+'/screens'),api(base()+'/users'),api(base()+'/settings')]);
 [state.slides,state.screens,state.users,state.settings]=data;
 const org=company();$('environmentName').textContent=org?.name||'Bedrijfsomgeving';
 switchTab(state.tab==='admin'?'dashboard':state.tab);
}
function switchTab(tab){
 if(tab==='admin'&&!isSuper())tab='dashboard';
 if(!state.orgId&&tab!=='admin')tab='admin';
 state.tab=tab;
 for(const node of document.querySelectorAll('.panel'))node.hidden=node.id!=='panel'+tab[0].toUpperCase()+tab.slice(1);
 for(const node of document.querySelectorAll('.nav-link'))node.classList.toggle('active',node.dataset.tab===tab);
 const names={dashboard:['Dashboard','Alles voor jouw digitale informatieschermen.'], slides:['Presentaties','Beheer wat er op je schermen wordt getoond.'], screens:['Schermen','Koppel een televisie met één eenvoudige code.'], users:['Gebruikers','Geef medewerkers veilige toegang.'], settings:['Instellingen','Pas de presentatie aan voor dit bedrijf.'], licenses:['Licenties','Jouw accounts en schermen in één overzicht.'], admin:['Hoofdbeheer','Bedrijven, licenties en toegang beheren.']};
 $('pageHeading').textContent=names[tab][0];$('pageSubtitle').textContent=names[tab][1];$('eyebrow').textContent=tab==='admin'?'JK WORKS':'SCHERMLOOP 2.0';
 render();
}
function render(){
 ({dashboard:renderDashboard,slides:renderSlides,screens:renderScreens,users:renderUsers,settings:renderSettings,licenses:renderLicenses,admin:renderAdmin})[state.tab]();
}
const stat=(title,num,foot)=>`<div class="stat-card"><div class="stat-title">${h(title)}</div><div class="stat-num">${h(num)}</div><div class="stat-foot">${h(foot)}</div></div>`;
function renderDashboard(){
 const o=company(),screenActive=state.screens.filter(x=>x.active),recent=screenActive.filter(x=>x.last_seen && Date.now()-new Date(x.last_seen).getTime()<120000);
 $('panelDashboard').innerHTML=`<div class="cards">${stat('Actieve schermen',screenActive.length,`van ${o?.max_screens||1} licenties`)}${stat('Recent online',recent.length,'afgelopen twee minuten')}${stat('Presentatiedia\'s',state.slides.filter(x=>x.enabled).length,`${state.slides.length} totaal`)}${stat('Gebruikers',state.users.filter(x=>x.active).length,`van ${o?.max_users||1} accounts`)}</div>
 <div class="grid-2"><div class="card"><div class="section-head"><h2>Gekoppelde schermen</h2><button class="secondary" data-go="screens">Beheren</button></div>${screenActive.length?'<div class="list">'+screenActive.map(s=>`<div class="item"><div class="item-main"><span class="item-title">▣ ${h(s.name)}</span><span class="item-meta">${s.last_seen?'Laatst gezien: '+h(new Date(s.last_seen).toLocaleString('nl-NL')):'Wacht op eerste verbinding'}</span></div><span class="tag ${recent.some(x=>x.id===s.id)?'success':'warn'}">${recent.some(x=>x.id===s.id)?'Online':'Niet recent online'}</span></div>`).join('')+'</div>':'<div class="empty">Nog geen scherm gekoppeld.<br>Open <strong>/player</strong> op je televisie.</div>'}</div>
 <div class="card"><div class="section-head"><h2>Presentatiebibliotheek</h2><button class="secondary" data-go="slides">Beheren</button></div>${state.slides.length?'<div class="list">'+state.slides.slice(0,6).map(s=>`<div class="item"><div class="item-main"><strong>${h(s.title)}</strong><span class="item-meta">${h(s.kind)} · ${s.duration} seconden</span></div><span class="tag ${s.enabled?'success':''}">${s.enabled?'Actief':'Verborgen'}</span></div>`).join('')+'</div>':'<div class="empty">Upload je eerste afbeelding, video of document.</div>'}</div></div>
 <div class="panel-note"><strong>Eén app, gescheiden bedrijven.</strong> Je schermen krijgen een eigen koppeling. Het beheeraccount wordt niet gebruikt om een tv aan te melden. Bij één schermlicentie wordt bij een nieuwe schermkoppeling de oude koppeling ongeldig.</div>`;
}
function renderSlides(){
 $('panelSlides').innerHTML=`<div class="grid-2"><div class="card"><h2>Bestand toevoegen</h2><form id="uploadForm" class="upload-box"><div><h3>Foto, video, PDF of PowerPoint</h3><p class="description">Maximaal 50 MB per bestand. PDF's en PowerPoints worden per pagina/dia omgezet. Originele PowerPoint-animaties blijven daarbij niet behouden.</p></div><label>Kies bestand<input type="file" name="file" accept=".jpg,.jpeg,.png,.webp,.gif,.mp4,.webm,.pdf,.pptx" required></label><label>Seconden per dia<input name="duration" type="number" min="2" max="600" value="10" required></label><button class="primary" type="submit">＋ Toevoegen</button></form></div>
 <div class="card"><h2>YouTube-link toevoegen</h2><p class="description">Voor online afspelen. De afspeelmogelijkheden verschillen per televisie; embed- en autoplayregels van YouTube blijven gelden.</p><form id="youtubeForm" class="list"><label>Naam<input name="title" placeholder="Bijvoorbeeld bedrijfsfilm" required></label><label>YouTube-URL<input name="url" type="url" placeholder="https://www.youtube.com/watch?v=..." required></label><label>Seconden op het scherm<input name="duration" type="number" min="5" max="600" value="40" required></label><button type="submit" class="secondary">＋ Link toevoegen</button></form></div></div>
 <div class="card"><div class="section-head"><h2>Dia's en afspeelvolgorde</h2><span class="muted">${state.slides.length} items</span></div>${state.slides.length?'<div class="list">'+state.slides.map((s,i)=>`<div class="item" data-slide="${h(s.id)}"><div class="item-main"><strong>${h(s.title)}</strong><span class="item-meta">${h(s.kind)} · ${s.duration} sec · volgorde ${s.sort_order}</span></div><div class="button-group"><button data-slide-action="toggle" class="secondary">${s.enabled?'Verbergen':'Tonen'}</button><button data-slide-action="duration" class="secondary">Tijd</button><button data-slide-action="up" class="secondary" ${i===0?'disabled':''}>↑</button><button data-slide-action="down" class="secondary" ${i===state.slides.length-1?'disabled':''}>↓</button><button data-slide-action="delete" class="danger">✕</button></div></div>`).join('')+'</div>':'<div class="empty">Nog geen presentaties toegevoegd.</div>'}</div>`;
 $('uploadForm').onsubmit=uploadForm; $('youtubeForm').onsubmit=youtubeForm;
}
async function uploadForm(event){event.preventDefault();const form=event.currentTarget;const button=form.querySelector('button');button.disabled=true;button.textContent='Verwerken…';try{const data=await api(base()+'/slides/upload',{method:'POST',body:new FormData(form)});flash(data.count+' dia(\'s) toegevoegd');await loadCompanyData();}catch(e){flash(e.message,true);}finally{button.disabled=false;button.textContent='＋ Toevoegen';}}
async function youtubeForm(event){event.preventDefault();const form=event.currentTarget;try{const d=Object.fromEntries(new FormData(form));d.duration=+d.duration;const result=await post(base()+'/slides/youtube',d);flash('YouTube-link toegevoegd. Test afspelen op het apparaat.');await loadCompanyData();}catch(e){flash(e.message,true);}}
function renderScreens(){
 const o=company();$('panelScreens').innerHTML=`<div class="cards">${stat('Schermlicenties',o.max_screens,'Totaal gekocht')}${stat('Actieve schermen',state.screens.filter(x=>x.active).length,'Momenteel gekoppeld')}${stat('Vrije licenties',Math.max(0,o.max_screens-state.screens.filter(x=>x.active).length),'Extra scherm koppelen')}${stat('Koppelcode','8 tekens','10 minuten geldig')}</div>
 <div class="grid-2"><div class="card"><h2>Nieuwe televisie koppelen</h2><p class="description">1. Open <strong>SchermLoop 2.0 /player</strong> in de browser van de televisie of mini-pc. 2. Vul de getoonde code in. 3. Geef het scherm een herkenbare naam.</p><form id="pairForm" class="list"><label>Koppelcode<input name="code" maxlength="8" minlength="8" placeholder="ABCD2345" autocomplete="off" class="code" required></label><label>Naam van het scherm<input name="name" placeholder="Receptie / Kantine / Gang" required minlength="2"></label><button class="primary" type="submit">Scherm koppelen</button></form><p class="hint">Als alle schermlicenties bezet zijn, wordt de oudste actieve koppeling automatisch uitgeschakeld. Dit voorkomt dat één licentie op twee tv's tegelijk wordt gebruikt.</p></div>
 <div class="card"><h2>Gekoppelde schermen</h2>${state.screens.filter(x=>x.active).length?'<div class="list">'+state.screens.filter(x=>x.active).map(s=>`<div class="item" data-screen="${h(s.id)}"><div class="item-main"><span class="item-title">▣ ${h(s.name)}</span><span class="item-meta">${s.last_seen?'Laatst gezien '+h(new Date(s.last_seen).toLocaleString('nl-NL')):'Nog niet online'}</span></div><div class="button-group"><button class="secondary" data-screen-action="schedule">Schema</button><button class="danger" data-screen-action="disconnect">Ontkoppel</button></div></div>`).join('')+'</div>':'<div class="empty">Er is nog geen actieve schermkoppeling.</div>'}</div></div>
 <div class="panel-note"><strong>Automatische tv-bediening:</strong> je kunt alvast een weekrooster instellen. Zonder gekoppelde HDMI-CEC-agent blijft de televisie fysiek aan; de speler kan wel buiten de ingestelde uren een zwart scherm tonen.</div>`;
 $('pairForm').onsubmit=async event=>{event.preventDefault();const d=Object.fromEntries(new FormData(event.currentTarget));if(state.screens.filter(x=>x.active).length>=o.max_screens&&!confirm('Er zijn geen vrije schermlicenties. Het oudste gekoppelde scherm wordt uitgelogd. Doorgaan?'))return;try{const result=await post(base()+'/screens/pair',d);flash(result.replaced_screen_id?'Scherm gekoppeld. De vorige schermkoppeling is ingetrokken.':'Scherm gekoppeld!');await loadCompanyData();}catch(e){flash(e.message,true);}};
}
function renderUsers(){
 const o=company(),can=isOrgAdmin();
 $('panelUsers').innerHTML=`<div class="card"><div class="section-head"><h2>Gebruikersaccounts</h2><span class="tag">${state.users.filter(u=>u.active).length} / ${o.max_users} actief</span></div>
 <p class="description">Medewerkers kunnen vanaf hun eigen laptop of telefoon beheren. De schermlicentie is onafhankelijk van het aantal beheerders.</p>
 ${state.users.length?'<div class="list">'+state.users.map(u=>`<div class="item" data-user="${h(u.id)}"><div class="item-main"><span class="item-title">${h(u.display_name)}</span><span class="item-meta">${h(u.email)} · ${u.role==='org_admin'?'Bedrijfsbeheerder':'Medewerker'}</span></div><div class="button-group"><span class="tag ${u.active?'success':''}">${u.active?'Actief':'Inactief'}</span>${can && u.active && u.id!==state.me.id?'<button class="danger" data-user-action="deactivate">Deactiveren</button>':''}</div></div>`).join('')+'</div>':''}</div>
 ${can?`<div class="card"><h2>Account toevoegen</h2><form id="userForm" class="form-grid"><label>Naam<input name="display_name" required></label><label>E-mailadres<input name="email" type="email" required></label><label>Rol<select name="role"><option value="editor">Medewerker (presentaties beheren)</option><option value="org_admin">Bedrijfsbeheerder</option></select></label><label>Tijdelijk wachtwoord (min. 16 tekens)<input name="password" type="password" minlength="16" required autocomplete="new-password"></label><div class="wide"><button type="submit" class="primary">Account aanmaken</button></div></form><p class="hint">Geef het tijdelijke wachtwoord alleen via een veilig kanaal aan de medewerker.</p></div>`:''}`;
 if(can)$('userForm').onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.currentTarget));try{await post(base()+'/users',d);flash('Account aangemaakt');await loadCompanyData();}catch(err){flash(err.message,true);}};
}
function renderSettings(){
 const s=state.settings; $('panelSettings').innerHTML=`<div class="grid-2"><div class="card"><h2>Presentatie-instellingen</h2><form id="settingsForm" class="list">
 <label class="checkrow"><input name="show_clock" type="checkbox" ${s.show_clock?'checked':''}> Digitale klok rechtsboven</label>
 <label class="checkrow"><input name="show_weather" type="checkbox" ${s.show_weather?'checked':''}> Weer (koppeling nog in ontwikkeling)</label>
 <label class="checkrow"><input name="show_news" type="checkbox" ${s.show_news?'checked':''}> Nieuws (koppeling nog in ontwikkeling)</label>
 <label>Achtergrond wanneer dia niet schermvullend is<select name="background_mode"><option value="black" ${s.background_mode==='black'?'selected':''}>Zwart</option><option value="color" ${s.background_mode==='color'?'selected':''}>Effen kleur</option><option value="blur" ${s.background_mode==='blur'?'selected':''}>Vervaagde kopie (in ontwikkeling)</option></select></label>
 <label>Gewenste achtergrondkleur<input name="background" type="color" value="${h(s.background||'#0b1624')}"></label>
 <label>Weerlocatie<input name="weather_location" value="${h(s.weather_location||'Dordrecht')}"></label>
 <label>Nieuwsweergave<select name="news_mode"><option value="ticker" ${s.news_mode==='ticker'?'selected':''}>Lichtkrant</option><option value="pages" ${s.news_mode==='pages'?'selected':''}>Aparte nieuwsdia</option></select></label>
 <button class="primary" type="submit">Instellingen opslaan</button></form></div>
 <div class="card"><h2>Beveiliging & account</h2><p class="description">Gebruik een uniek wachtwoord. Bij het wijzigen worden je overige ingelogde apparaten afgemeld.</p><form id="passwordForm" class="list"><label>Huidig wachtwoord<input name="old_password" type="password" autocomplete="current-password" required></label><label>Nieuw wachtwoord (min. 16 tekens)<input name="new_password" type="password" autocomplete="new-password" minlength="16" required></label><button class="secondary" type="submit">Wachtwoord wijzigen</button></form></div></div>
 <div class="panel-note">Je bedrijfsgegevens en mediabestanden zijn afgeschermd. Deze pilotversie is niet automatisch AVG-gecertificeerd; vóór gebruik met echte klantgegevens zijn een verwerkersovereenkomst, hersteltests en beveiligingsreview nodig.</div>`;
 $('settingsForm').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget;const d=Object.fromEntries(new FormData(f));for(const k of ['show_clock','show_weather','show_news'])d[k]=!!f.elements[k].checked;try{await put(base()+'/settings',d);flash('Instellingen opgeslagen');await loadCompanyData();}catch(err){flash(err.message,true);}};
 $('passwordForm').onsubmit=async e=>{e.preventDefault();try{await post('/auth/password',Object.fromEntries(new FormData(e.currentTarget)));e.currentTarget.reset();flash('Wachtwoord bijgewerkt');}catch(err){flash(err.message,true);}};
}
function renderLicenses(){
 const o=company();$('panelLicenses').innerHTML=`<div class="cards">${stat('Inbegrepen schermen',o.max_screens,'Eenmalige schermlicenties')}${stat('Gebruikers',o.max_users,'Actieve accounts maximaal')}${stat('Schermen in gebruik',state.screens.filter(x=>x.active).length,'Eén apparaat per licentie')}${stat('Gebruikers in gebruik',state.users.filter(x=>x.active).length,'Beheertoegang')}</div>
 <div class="card"><h2>Extra licenties</h2><p class="description">Basis: één beheeraccount en één scherm. Extra accounts en schermen kunnen afzonderlijk worden bijgekocht. In deze testversie registreert JK Works de aankoop handmatig en verhoogt het aantal licenties via hoofdbeheer. Er is nog geen online betaalprovider gekoppeld.</p><div class="panel-note"><strong>Anti-delen:</strong> een extra scherm aanmelden bij een volle licentie vervangt automatisch de oudste actieve schermkoppeling. Het oude scherm wordt bij de eerstvolgende online controle uitgelogd. Dit kan tijdens offline afspelen niet onmiddellijk worden afgedwongen.</div></div>`;
}
function renderAdmin(){
 $('panelAdmin').innerHTML=`<div class="cards">${stat('Bedrijven',state.organizations.length,'Alle bedrijfsomgevingen')}${stat('Schermlicenties',state.organizations.reduce((n,o)=>n+o.max_screens,0),'Gekocht/toegewezen')}${stat('Accounts',state.organizations.reduce((n,o)=>n+o.max_users,0),'Totaal beschikbaar')}${stat('Actieve bedrijven',state.organizations.filter(o=>o.active).length,'Nog in gebruik')}</div>
 <div class="grid-2"><div class="card"><h2>Nieuw bedrijf aanmaken</h2><p class="description">Een nieuwe klant krijgt standaard één beheeraccount en één schermlicentie.</p><form id="companyForm" class="list"><label>Bedrijfsnaam<input name="name" required minlength="2"></label><label>Unieke bedrijfsnaamcode<input name="slug" pattern="[a-z0-9][a-z0-9-]{2,49}" placeholder="voorbeeldbedrijf" required></label><label>Naam beheerder<input name="display_name" required></label><label>E-mailadres beheerder<input name="email" type="email" required></label><label>Tijdelijk wachtwoord (minimaal 16 tekens)<input name="password" type="password" minlength="16" required autocomplete="new-password"></label><button type="submit" class="primary">Bedrijf en beheeraccount maken</button></form></div>
 <div class="card"><h2>Klanten en licenties</h2>${state.organizations.length?'<div class="list">'+state.organizations.map(o=>`<div class="item" data-org="${h(o.id)}"><div class="item-main"><strong>${h(o.name)}</strong><span class="item-meta">${h(o.slug)} · ${o.users_used}/${o.max_users} accounts · ${o.screens_used}/${o.max_screens} schermen</span></div><div class="button-group"><button class="secondary" data-org-action="open">Open</button><button class="secondary" data-org-action="license">Licenties</button></div></div>`).join('')+'</div>':'<div class="empty">Nog geen bedrijven.</div>'}</div></div>
 <div class="panel-note">Geef een licentie pas vrij nadat de betaling buiten dit systeem is bevestigd. Deze versie bevat nog geen automatische betalingsverwerking of facturen.</div>`;
 $('companyForm').onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.currentTarget));try{await post('/organizations',d);flash('Bedrijf aangemaakt');await loadOrganizations();switchTab('admin');}catch(err){flash(err.message,true);}};
}
function modal(title, content, handler, confirm='Opslaan'){
 const dialog=$('dialog');$('dialogTitle').textContent=title;$('dialogBody').innerHTML=content;$('dialogConfirm').textContent=confirm;
 dialog.onclose=()=>{if(dialog.returnValue==='confirm')Promise.resolve(handler($('dialogBody'))).catch(e=>flash(e.message,true));};dialog.showModal();
}
async function slideAction(action,id){
 const item=state.slides.find(s=>s.id===id);if(!item)return;
 if(action==='delete'){if(!confirm(`Dia '${item.title}' verwijderen? De oorspronkelijke media blijft beschikbaar in back-ups.`))return;await api(base()+'/slides/'+id,{method:'DELETE'});}
 else if(action==='toggle')await patch(base()+'/slides/'+id,{enabled:!item.enabled});
 else if(action==='duration'){modal('Tijd aanpassen',`<label>Seconden<input name="duration" type="number" min="2" max="600" value="${item.duration}" required></label>`,async body=>{await patch(base()+'/slides/'+id,{duration:+body.querySelector('input').value});await loadCompanyData();flash('Dia bijgewerkt');});return;}
 else if(action==='up'||action==='down'){const i=state.slides.findIndex(s=>s.id===id),j=i+(action==='up'?-1:1);if(j<0||j>=state.slides.length)return;const other=state.slides[j];await patch(base()+'/slides/'+id,{sort_order:other.sort_order});await patch(base()+'/slides/'+other.id,{sort_order:item.sort_order});}
 await loadCompanyData();flash('Presentatie bijgewerkt');
}
function screenAction(action,id){
 const sc=state.screens.find(s=>s.id===id);if(!sc)return;
 if(action==='disconnect'){if(!confirm(`Scherm '${sc.name}' ontkoppelen? Het scherm stopt zodra het online controleert.`))return;api(base()+'/screens/'+id+'/disconnect',{method:'POST',body:'{}'}).then(async()=>{flash('Scherm ontkoppeld');await loadCompanyData();}).catch(e=>flash(e.message,true));return;}
 const schedule={enabled:false,timezone:'Europe/Amsterdam',days:[0,1,2,3,4],on:'07:30',off:'18:00',cec_enabled:false,...sc.schedule};
 modal('Weekrooster – '+sc.name,`<label class="checkbox-line"><input type="checkbox" name="enabled" ${schedule.enabled?'checked':''}> Weekrooster inschakelen</label><div class="form-grid"><label>Scherm aan<input type="time" name="on" value="${h(schedule.on)}"></label><label>Scherm zwart vanaf<input type="time" name="off" value="${h(schedule.off)}"></label></div><label>Dagen</label><div class="schedules">${['Ma','Di','Wo','Do','Vr','Za','Zo'].map((d,i)=>`<label class="schedule-chip"><input type="checkbox" data-day="${i}" ${schedule.days.includes(i)?'checked':''}> ${d}</label>`).join('')}</div><p class="hint">HDMI-CEC-bediening vraagt later een lokale hardware-agent. Deze instelling bestuurt nu de scherminhoud, niet de fysieke tv.</p>`,async body=>{
  const updated={enabled:body.querySelector('[name=enabled]').checked,timezone:'Europe/Amsterdam',days:[...body.querySelectorAll('[data-day]:checked')].map(x=>+x.dataset.day),on:body.querySelector('[name=on]').value,off:body.querySelector('[name=off]').value,cec_enabled:false};
  await put(base()+'/screens/'+id+'/schedule',updated);flash('Weekrooster opgeslagen');await loadCompanyData();});
}
function orgAction(action,id){
 const o=state.organizations.find(x=>x.id===id);if(!o)return;
 if(action==='open'){state.orgId=id;$('companySelect').value=id;loadCompanyData().catch(e=>flash(e.message,true));return;}
 modal('Licenties – '+o.name,`<p class="description">Verhoog het maximum na aankoop, of wijzig de actieve status van de bedrijfsomgeving.</p><label>Maximaal aantal accounts<input type="number" name="max_users" min="1" max="100" value="${o.max_users}"></label><label>Maximaal aantal schermen<input type="number" name="max_screens" min="1" max="100" value="${o.max_screens}"></label><label class="checkbox-line"><input type="checkbox" name="active" ${o.active?'checked':''}> Bedrijf actief</label>`,async body=>{await put('/organizations/'+id+'/licenses',{max_users:+body.querySelector('[name=max_users]').value,max_screens:+body.querySelector('[name=max_screens]').value,active:body.querySelector('[name=active]').checked});flash('Licenties aangepast');await loadOrganizations();switchTab('admin');});
}
$('mainNav').addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(b)switchTab(b.dataset.tab)});
$('companySelect').addEventListener('change',async e=>{const value=e.target.value;state.orgId=value==='__admin'?null:value;try{if(state.orgId)await loadCompanyData();else switchTab('admin');}catch(err){flash(err.message,true);}});
$('refreshBtn').onclick=async()=>{try{await loadOrganizations();flash('Gegevens vernieuwd');}catch(err){flash(err.message,true);}};
$('logoutBtn').onclick=async()=>{try{await api('/auth/logout',{method:'POST',body:'{}'});}catch(_){}state.me=null;state.csrf='';showLogin();};
$('loginForm').addEventListener('submit',async e=>{e.preventDefault();const email=$('loginEmail').value,password=$('loginPassword').value;try{const r=await post('/auth/login',{email,password});state.csrf=r.csrf;state.me=await api('/auth/me');$('loginPassword').value='';showApp();await loadOrganizations();if(state.me.must_change_password)flash('Wijzig je tijdelijke wachtwoord onder Instellingen.');}catch(err){flash(err.message,true);}});
document.addEventListener('click',e=>{
 const nav=e.target.closest('[data-go]');if(nav){switchTab(nav.dataset.go);return;}
 const sl=e.target.closest('[data-slide-action]');if(sl){slideAction(sl.dataset.slideAction,sl.closest('[data-slide]').dataset.slide).catch(err=>flash(err.message,true));return;}
 const sc=e.target.closest('[data-screen-action]');if(sc){screenAction(sc.dataset.screenAction,sc.closest('[data-screen]').dataset.screen);return;}
 const us=e.target.closest('[data-user-action]');if(us){const id=us.closest('[data-user]').dataset.user;if(confirm('Account deactiveren? De medewerker wordt uitgelogd.'))api(base()+'/users/'+id+'/deactivate',{method:'POST',body:'{}'}).then(async()=>{flash('Account gedeactiveerd');await loadCompanyData();}).catch(err=>flash(err.message,true));return;}
 const org=e.target.closest('[data-org-action]');if(org){orgAction(org.dataset.orgAction,org.closest('[data-org]').dataset.org);return;}
});
initialize();
})();
