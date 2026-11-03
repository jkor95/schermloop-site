'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
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
  DATABASE_URL:'postgresql://postgres:postgres@127.0.0.1:5432/schermloop_ci'
 }});
 child.stdout.on('data',data=>log.push(data.toString()));
 child.stderr.on('data',data=>log.push(data.toString()));
 t.after(async()=>{child.kill('SIGTERM');await rm(folder,{recursive:true,force:true});});
 await waitHealthy(child,log);
 const adminLogin=await request('/api/login',{method:'POST',body:{email:'beheertest@example.test',password:'Testpassword!12345'}});
 assert.equal(adminLogin.status,200);const admin=adminLogin.cookie;
 const orgA=await request('/api/organizations',{method:'POST',cookie:admin,body:{name:'Demo Onderneming A',email:'a@example.test',password:'A-strong-password-123'}});
 const orgB=await request('/api/organizations',{method:'POST',cookie:admin,body:{name:'Demo Onderneming B',email:'b@example.test',password:'B-strong-password-123'}});
 assert.equal(orgA.status,201);assert.equal(orgB.status,201);assert.notEqual(orgA.data.id,orgB.data.id);
 const aLogin=await request('/api/login',{method:'POST',body:{email:'a@example.test',password:'A-strong-password-123'}});
 const bLogin=await request('/api/login',{method:'POST',body:{email:'b@example.test',password:'B-strong-password-123'}});
 assert.equal(aLogin.status,200);assert.equal(bLogin.status,200);
 const A=aLogin.cookie,B=bLogin.cookie;
 const screen=await request('/api/screens',{method:'POST',cookie:A,body:{name:'Receptie A'}});
 assert.equal(screen.status,201);const id=screen.data.id;
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
 const pic=state.data.items.find(x=>x.kind==='image');assert.ok(pic?.id);
 const media=await request('/api/player/media/'+pic.id,{token});
 assert.equal(media.status,200,'Uploadbestand moet na opslaan blijven bestaan');
 assert.equal(Buffer.from(media.data).toString('hex').slice(0,16),'89504e470d0a1a0a');
 assert.equal((await request('/api/media/'+pic.id,{cookie:B})).status,404,'Klant B mag geen media van A zien');
 const update=await request('/api/organizations/'+orgA.data.id+'/licenses',{method:'PATCH',cookie:admin,body:{user_limit:2,screen_limit:2}});
 assert.equal(update.status,200);
 assert.equal((await request('/api/users',{method:'POST',cookie:A,body:{email:'staff@example.test',password:'Strong-Staff-1234'}})).status,201);
 assert.equal((await request('/api/screens',{method:'POST',cookie:A,body:{name:'Tweede scherm'}})).status,201);
});
