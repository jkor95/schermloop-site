'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {spawn,spawnSync}=require('node:child_process');
const {mkdtemp,rm}=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const base='http://127.0.0.1:3785';
async function request(route,{method='GET',body,cookie,token,form}={}){
 const headers={};
 if(cookie)headers.Cookie=cookie;
 if(token)headers.Authorization='Bearer '+token;
 if(body!==undefined)headers['Content-Type']='application/json';
 const r=await fetch(base+route,{method,headers,body:form|| (body!==undefined?JSON.stringify(body):undefined)});
 const contentType=r.headers.get('content-type')||'';
 let data=contentType.includes('application/json')?await r.json():await r.arrayBuffer();
 return {status:r.status,data,cookie:r.headers.get('set-cookie')?.split(';')[0]||null};
}
async function waitHealthy(child,log){
 for(let i=0;i<100;i++){
  if(child.exitCode!==null)throw Error('Server stopte voortijdig: '+log.join(''));
  try{const r=await request('/healthz');if(r.status===200)return;}catch{}
  await new Promise(resolve=>setTimeout(resolve,200));
 }
 throw Error('Server start niet: '+log.join(''));
}
test('SchermLoop SaaS: accounts, tenantisolatie, licenties, vervangen en uploads', {timeout:90000},async t=>{
 const folder=await mkdtemp(path.join(os.tmpdir(),'sl2test-')),log=[];
 const child=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{
  ...process.env,PORT:'3785',STORAGE_DIR:folder,PUBLIC_URL:base,
  NODE_ENV:'test',APP_SECRET:'SchermLoop-ci-secret-at-least-64-characters-1234567890123456789',
  ADMIN_EMAIL:'beheertest@example.test',ADMIN_PASSWORD:'Testpassword!12345',
  DATABASE_URL:'postgresql://postgres:postgres@127.0.0.1:5432/schermloop_ci',
  ENABLE_LEGACY_IMPORT:'true',LEGACY_SOURCE_DIR:path.join(folder,'legacy')
 }});
 child.stdout.on('data',data=>log.push(data.toString()));
 child.stderr.on('data',data=>log.push(data.toString()));
 t.after(async()=>{child.kill('SIGTERM');await rm(folder,{recursive:true,force:true});});
 await waitHealthy(child,log);
 const adminLogin=await request('/api/login',{method:'POST',body:{email:'beheertest@example.test',password:'Testpassword!12345'}});
 assert.equal(adminLogin.status,200);const admin=adminLogin.cookie;
 const passwordChange=await request('/api/change-password',{method:'POST',cookie:admin,body:{current_password:'Testpassword!12345',new_password:'UpdatedStrongPassword!123456'}});
 assert.equal(passwordChange.status,200,'Hoofdbeheer moet wachtwoord kunnen wijzigen');
 assert.equal((await request('/api/login',{method:'POST',body:{email:'beheertest@example.test',password:'Testpassword!12345'}})).status,401,'Oude wachtwoord werkt niet meer');
 assert.equal((await request('/api/login',{method:'POST',body:{email:'beheertest@example.test',password:'UpdatedStrongPassword!123456'}})).status,200);

 const orgA=await request('/api/organizations',{method:'POST',cookie:admin,body:{name:'Demo Onderneming A',email:'a@example.test',password:'A-strong-password-123'}});
 const orgB=await request('/api/organizations',{method:'POST',cookie:admin,body:{name:'Demo Onderneming B',email:'b@example.test',password:'B-strong-password-123'}});
 assert.equal(orgA.status,201);assert.equal(orgB.status,201);assert.notEqual(orgA.data.id,orgB.data.id);
 const aLogin=await request('/api/login',{method:'POST',body:{email:'a@example.test',password:'A-strong-password-123'}});
 const bLogin=await request('/api/login',{method:'POST',body:{email:'b@example.test',password:'B-strong-password-123'}});
 assert.equal(aLogin.status,200);assert.equal(bLogin.status,200);
 const A=aLogin.cookie,B=bLogin.cookie;
 const cityResults=await request('/api/weather/locations?q=Rotterdam',{cookie:A});
 assert.equal(cityResults.status,200);
 const selectedCity=cityResults.data.find(c=>c.name==='Rotterdam'&&c.country==='NL');
 assert.ok(selectedCity,'Rotterdam moet via de plaatszoeker beschikbaar zijn');
 const savedWeather=await request('/api/organization/weather',{method:'PATCH',cookie:A,body:{location:selectedCity}});
 assert.equal(savedWeather.status,200);
 assert.equal(savedWeather.data.location.name,'Rotterdam');
 assert.equal((await request('/api/organization/weather',{cookie:A})).data.location.name,'Rotterdam');
 assert.equal((await request('/api/organization/weather',{cookie:B})).data.location.name,'Dordrecht','Locatie van bedrijf B blijft onafhankelijk');
 const badWeather=await request('/api/organization/weather',{method:'PATCH',cookie:A,body:{location:{name:'Niet echt',country:'NL',lat:0,lon:0}}});
 assert.equal(badWeather.status,400,'Klanten mogen geen willekeurige stad verzinnen');

 const screen=await request('/api/screens',{method:'POST',cookie:A,body:{name:'Receptie A'}});
 assert.equal(screen.status,201);const id=screen.data.id;
 const supportRoute=base+'/api/support/organizations/'+orgA.data.id;
 const unauthorisedSupport=await fetch(supportRoute,{headers:{Cookie:A,'x-support-reason':'Hulp na melding van klant'}});
 assert.equal(unauthorisedSupport.status,403,'Klant krijgt geen toegang tot hoofdbeheersupport');
 const missingReason=await fetch(supportRoute,{headers:{Cookie:admin}});
 assert.equal(missingReason.status,400,'Hoofdbeheer moet een ondersteuningsreden vermelden');
 const supportAccess=await fetch(supportRoute,{headers:{Cookie:admin,'x-support-reason':'Klant vraagt hulp bij een presentatie'}});
 assert.equal(supportAccess.status,200);
 const supportOverview=await supportAccess.json();
 assert.equal(supportOverview.organization.id,orgA.data.id);
 assert.ok(supportOverview.screens.some(x=>x.id===id));
 assert.ok(!JSON.stringify(supportOverview).includes('password_hash'),'Geen wachtwoorden in supportoverzicht');

 assert.equal((await request('/api/screens',{method:'POST',cookie:A,body:{name:'Tweede scherm'}})).status,409,'Één scherm standaard');
 assert.equal((await request('/api/users',{method:'POST',cookie:A,body:{email:'staff@example.test',password:'Strong-Staff-1234'}})).status,409,'Één account standaard');
 assert.equal((await request('/api/screens/'+id+'/items',{cookie:B})).status,404,'Andere klant mag scherm niet zien');
 const msg=await request('/api/screens/'+id+'/items/text',{method:'POST',cookie:A,body:{title:'Mededeling',text:'Welkom bij Demo Onderneming A',duration:8}});
 assert.equal(msg.status,201);
 const secondView=await request('/api/screens/'+id+'/items',{cookie:A});assert.equal(secondView.status,200);assert.equal(secondView.data.length,1);
 const pairing=await request('/api/player/pair/request',{method:'POST',body:{}});assert.equal(pairing.status,201);
 const link=await request('/api/screens/'+id+'/pair',{method:'POST',cookie:A,body:{code:pairing.data.code}});assert.equal(link.status,200);
 const claim=await request('/api/player/pair/'+pairing.data.request_id,{token:pairing.data.claim_token});
 assert.equal(claim.status,200);assert.equal(claim.data.status,'paired');
 const firstToken=claim.data.device_token;
 const firstSession=await request('/api/player/session',{method:'POST',token:firstToken});
 assert.equal(firstSession.status,200);
 assert.equal((await request('/api/player/state',{token:firstSession.data.session_token})).status,200);
 const secondSession=await request('/api/player/session',{method:'POST',token:firstToken});
 assert.equal(secondSession.status,200,'Tweede apparaat kan actieve sessie overnemen');
 assert.equal((await request('/api/player/state',{token:firstSession.data.session_token})).status,401,'Eerste afspeelsessie wordt ingetrokken');
 assert.equal((await request('/api/player/state',{token:secondSession.data.session_token})).status,200);
 const again=await request('/api/player/pair/request',{method:'POST',body:{}});
 assert.equal((await request('/api/screens/'+id+'/pair',{method:'POST',cookie:A,body:{code:again.data.code}})).status,200);
 const claimedAgain=await request('/api/player/pair/'+again.data.request_id,{token:again.data.claim_token});
 assert.equal(claimedAgain.status,200);
 assert.equal((await request('/api/player/state',{token:secondSession.data.session_token})).status,401,'Nieuwe schermkoppeling trekt sessie in');
 assert.equal((await request('/api/player/session',{method:'POST',token:firstToken})).status,401,'Oude apparaatsleutel mag geen nieuwe sessie aanvragen');
 const session=await request('/api/player/session',{method:'POST',token:claimedAgain.data.device_token});
 assert.equal(session.status,200);
 const token=session.data.session_token;
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLJ7wAAAABJRU5ErkJggg==','base64');
 const form=new FormData();form.append('file',new Blob([png],{type:'image/png'}),'demo.png');form.append('duration','8');
 const uploaded=await request('/api/screens/'+id+'/items/upload',{method:'POST',cookie:A,form});
 assert.equal(uploaded.status,201,JSON.stringify(uploaded.data));assert.equal(uploaded.data.created,1);
 const state=await request('/api/player/state',{token});assert.equal(state.status,200);
 assert.equal(state.data.screen.weather_location.name,'Rotterdam','Scherm ontvangt bedrijfslocatie');
 const pic=state.data.items.find(x=>x.kind==='image');assert.ok(pic?.id);
 const media=await request('/api/player/media/'+pic.id,{token});
 assert.equal(media.status,200,'Uploadbestand moet na opslaan blijven bestaan');
 assert.equal((await request('/api/player/media/'+pic.id,{token:firstSession.data.session_token})).status,401,'Oude afspeelsessie mag geen mediabestanden meer ophalen');
 assert.equal(Buffer.from(media.data).toString('hex').slice(0,16),'89504e470d0a1a0a');
 assert.equal((await request('/api/media/'+pic.id,{cookie:B})).status,404,'Klant B mag geen media van A zien');
 const update=await request('/api/organizations/'+orgA.data.id+'/licenses',{method:'PATCH',cookie:admin,body:{user_limit:2,screen_limit:2}});
 assert.equal(update.status,200);
 assert.equal((await request('/api/users',{method:'POST',cookie:A,body:{email:'staff@example.test',password:'Strong-Staff-1234'}})).status,201);

 const migratedScreen=await request('/api/screens',{method:'POST',cookie:A,body:{name:'Tweede scherm'}});
 assert.equal(migratedScreen.status,201);
 // Real database migration test with synthetic source (never private media).
 const fileIO=require('node:fs/promises');
 const oldFixture=await mkdtemp(path.join(os.tmpdir(),'sl2-legacy-fixture-'));
 t.after(async()=>fileIO.rm(oldFixture,{recursive:true,force:true}));
 await fileIO.mkdir(path.join(oldFixture,'data'),{recursive:true});
 await fileIO.mkdir(path.join(oldFixture,'media'),{recursive:true});
 const sourceImage=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLJ7wAAAABJRU5ErkJggg==','base64');
 await fileIO.writeFile(path.join(oldFixture,'media','poster.png'),sourceImage);
 await fileIO.writeFile(path.join(oldFixture,'data','playlist.json'),JSON.stringify({items:[
  {type:'image',path:'media/poster.png',name:'Oude poster',duration:17},
  {type:'image',path:'media/poster.png',name:'Verborgen poster',enabled:false,duration:23}
 ]}));
 await fileIO.writeFile(path.join(oldFixture,'data','live-settings.json'),JSON.stringify({news:{enabled:false},weather:{enabled:true,duration:13},presentation:{backgroundMode:'blur'},cornerClock:true}));
 await fileIO.writeFile(path.join(oldFixture,'data','mededelingen.json'),JSON.stringify({items:[{title:'Oude tekst',text:'Welkom bij de migratieproef',duration:22}]}));
 const migrationEnv={...process.env,TARGET_ORG_ID:orgA.data.id,TARGET_SCREEN_ID:migratedScreen.data.id,STORAGE_DIR:folder,DATABASE_URL:'postgresql://postgres:postgres@127.0.0.1:5432/schermloop_ci'};
 const migratedFirst=spawnSync(process.execPath,['scripts/import-old.js',oldFixture,'--apply'],{cwd:path.join(__dirname,'..'),env:migrationEnv,encoding:'utf8',timeout:45000});
 assert.equal(migratedFirst.status,0,'Proefmigratie moet slagen: '+migratedFirst.stderr);
 const importedSlides=await request('/api/screens/'+migratedScreen.data.id+'/items',{cookie:A});
 assert.equal(importedSlides.status,200);
 assert.equal(importedSlides.data.length,2);
 assert.equal(importedSlides.data[0].duration,17);
 assert.equal(importedSlides.data[1].enabled,false);
 assert.deepEqual(await fileIO.readFile(path.join(oldFixture,'media','poster.png')),sourceImage,'Oude bron blijft onaangetast');
 const migratedRetry=spawnSync(process.execPath,['scripts/import-old.js',oldFixture,'--apply'],{cwd:path.join(__dirname,'..'),env:migrationEnv,encoding:'utf8',timeout:45000});
 assert.notEqual(migratedRetry.status,0,'Een tweede import op een gevuld scherm moet stoppen');
 // De hoofdbeheer-interface importeert dezelfde fictieve media via de API,
 // uitsluitend naar een derde, leeg testscherm.
 await fileIO.cp(oldFixture,path.join(folder,'legacy'),{recursive:true});
 const expanded=await request('/api/organizations/'+orgA.data.id+'/licenses',{method:'PATCH',cookie:admin,body:{user_limit:2,screen_limit:3}});
 assert.equal(expanded.status,200);
 const freshScreen=await request('/api/screens',{method:'POST',cookie:A,body:{name:'Gecontroleerde migratie'}});
 assert.equal(freshScreen.status,201);
 const sourceReady=await request('/api/release/legacy-status',{cookie:admin});
 assert.equal(sourceReady.status,200);
 assert.equal(sourceReady.data.sourceReady,true);
 assert.equal(sourceReady.data.slideCount,2);
 assert.equal((await request('/api/release/legacy-status',{cookie:A})).status,403);
 const importPayload={organization_id:orgA.data.id,screen_id:freshScreen.data.id,news_policy:'disable',confirm:true,current_password:'UpdatedStrongPassword!123456'};
 const importedViaApi=await request('/api/release/import-legacy',{cookie:admin,method:'POST',body:importPayload});
 assert.equal(importedViaApi.status,200);
 assert.equal(importedViaApi.data.imported,2);
 assert.equal(importedViaApi.data.screenEnabled,false);
 assert.equal((await request('/api/release/import-legacy',{cookie:admin,method:'POST',body:importPayload})).status,409);
 assert.equal((await request('/api/release/import-legacy',{cookie:A,method:'POST',body:importPayload})).status,403);
 const importedScreenData=await request('/api/screens/'+freshScreen.data.id+'/items',{cookie:A});
 assert.equal(importedScreenData.data.length,2);
 assert.equal(importedScreenData.data[1].enabled,false);
 assert.deepEqual(await fileIO.readFile(path.join(oldFixture,'media','poster.png')),sourceImage);


 const colleagues=await request('/api/users',{cookie:A});
 const staffId=colleagues.data.find(u=>u.email==='staff@example.test').id;
 const resetPath=base+'/api/support/organizations/'+orgA.data.id+'/users/'+staffId+'/reset-password';
 const reset=await fetch(resetPath,{method:'POST',headers:{Cookie:admin,'Content-Type':'application/json','x-support-reason':'Klant heeft herstel van medewerkersaccount aangevraagd'},body:JSON.stringify({confirm:true})});
 assert.equal(reset.status,200);
 const temporary=await reset.json();
 assert.equal(temporary.email,'staff@example.test');
 assert.ok(temporary.temporary_password.length>20);
 assert.equal((await request('/api/login',{method:'POST',body:{email:'staff@example.test',password:'Strong-Staff-1234'}})).status,401);
 assert.equal((await request('/api/login',{method:'POST',body:{email:'staff@example.test',password:temporary.temporary_password}})).status,200);
 const loggedActions=await request('/api/support-history',{cookie:A});
 assert.ok(loggedActions.data.some(x=>x.action==='reset_password'));
 assert.ok(!JSON.stringify(loggedActions.data).includes(temporary.temporary_password),'Het tijdelijke wachtwoord mag nooit in het auditlog staan');

 // Volledige 2FA-test: login krijgt nooit een sessie zonder tweede factor.
 const mfaBefore=await request('/api/mfa/status',{cookie:admin});
 assert.equal(mfaBefore.status,200);
 assert.equal(mfaBefore.data.enabled,false);
 assert.equal((await request('/api/mfa/status',{cookie:A})).status,403,'Bedrijfsbeheerder is geen superadmin');
 const mfaBegin=await request('/api/mfa/start',{method:'POST',cookie:admin,body:{current_password:'UpdatedStrongPassword!123456'}});
 assert.equal(mfaBegin.status,200);
 assert.match(mfaBegin.data.secret,/^[A-Z2-7]{32}$/);
 assert.ok(!JSON.stringify(mfaBegin.data).includes('UpdatedStrongPassword!123456'));
 const otp=require('../mfa').otpAt(mfaBegin.data.secret);
 assert.equal((await request('/api/mfa/confirm',{method:'POST',cookie:admin,body:{code:'000000'}})).status,401);
 const mfaFinish=await request('/api/mfa/confirm',{method:'POST',cookie:admin,body:{code:otp}});
 assert.equal(mfaFinish.status,200);
 assert.equal(mfaFinish.data.enabled,true);
 assert.equal(mfaFinish.data.recovery_codes.length,10);
 assert.equal((await request('/api/mfa/status',{cookie:admin})).data.enabled,true);
 const noFactor=await request('/api/login',{method:'POST',body:{email:'beheertest@example.test',password:'UpdatedStrongPassword!123456'}});
 assert.equal(noFactor.status,202,'Een wachtwoord alleen mag nooit een nieuwe superadmin-sessie maken');
 assert.equal(noFactor.data.mfa_required,true);
 assert.equal(noFactor.cookie,null,'Zonder tweede factor mag geen sessiecookie worden verstrekt');
 assert.equal((await request('/api/login',{method:'POST',body:{email:'beheertest@example.test',password:'UpdatedStrongPassword!123456',totp_code:'000000'}})).status,401);
 const withFactor=await request('/api/login',{method:'POST',body:{email:'beheertest@example.test',password:'UpdatedStrongPassword!123456',totp_code:otp}});
 assert.equal(withFactor.status,200);
 assert.ok(withFactor.cookie);
 const code=mfaFinish.data.recovery_codes[0];
 const recoveryLogin=await request('/api/login',{method:'POST',body:{email:'beheertest@example.test',password:'UpdatedStrongPassword!123456',recovery_code:code}});
 assert.equal(recoveryLogin.status,200,'Eenmalige herstelcode mag toegang geven');
 assert.equal((await request('/api/login',{method:'POST',body:{email:'beheertest@example.test',password:'UpdatedStrongPassword!123456',recovery_code:code}})).status,401,'Gebruikte herstelcode moet direct ongeldig zijn');
 assert.equal((await request('/api/mfa/disable',{method:'POST',cookie:admin,body:{current_password:'UpdatedStrongPassword!123456',code:otp,confirm:true}})).status,200);
 assert.equal((await request('/api/mfa/status',{cookie:admin})).data.enabled,false);
 assert.equal((await request('/api/login',{method:'POST',body:{email:'beheertest@example.test',password:'UpdatedStrongPassword!123456'}})).status,200,'Na bewust uitschakelen is 2FA niet meer vereist');


});
