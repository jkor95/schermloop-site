'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const support=require('../support');

function harness(resolver=()=>({rows:[]})){
 const routes=new Map(),calls=[],executed=[];
 const app={get:(url,...fns)=>routes.set('GET '+url,fns),patch:(url,...fns)=>routes.set('PATCH '+url,fns),post:(url,...fns)=>routes.set('POST '+url,fns)};
 const client={
  query:async(sql,args=[])=>{calls.push({sql,args});return resolver(sql,args,calls);},
  release:()=>{}
 };
 const pool={connect:async()=>client,query:async(sql,args=[])=>{calls.push({sql,args});return resolver(sql,args,calls);}};
 const deps={
  pool,requireAuth:(_req,_res,next)=>next(),uuid:()=> '12345678-1234-4123-8123-123456789abc',
  err:(status,message)=>Object.assign(new Error(message),{status}),
  validUuid:x=>{if(typeof x!=='string'||!/^[-0-9a-f]{36}$/.test(x))throw Object.assign(new Error('Ongeldig ID'),{status:400});return x;},
  validName:x=>{if(!x||typeof x!=='string')throw Object.assign(new Error('Ongeldige naam'),{status:400});return x.trim();},
  sanitizeSchedule:x=>x
 };
 support(app,deps);
 async function call(method,url,{role='superadmin',reason='Probleem onderzocht op verzoek klant',params={},body={},orgId=null}={}){
  const middlewares=routes.get(method+' '+url);assert.ok(middlewares,'Missing route '+method+' '+url);
  const req={
   user:{id:'9aaaaaaa-1111-4111-8111-111111111111',role,organization_id:orgId},
   params,body,
   get:key=>key.toLowerCase()==='x-support-reason'?reason:null
  };
  const response={statusCode:200,result:null,headers:{},json(x){this.result=x;return this;},set(k,v){this.headers[k]=v;return this;}};
  let error=null;
  async function nextAt(i){
   if(i>=middlewares.length)return;
   const fn=middlewares[i],pending=[];
   const next=e=>{if(e)error=e;else pending.push(nextAt(i+1));};
   const result=fn(req,response,next);
   if(result&&typeof result.then==='function')await result;
   await Promise.all(pending);
  }
  await nextAt(0);
  return {error,response};
 }
 return {routes,call,calls};
}
const organization='12345678-1234-4123-8123-123456789abc';
const screenId='22345678-1234-4123-8123-123456789abc';
const itemId='32345678-1234-4123-8123-123456789abc';
const root='/api/support/organizations/:orgId';

test('supportmodule registreert routes',()=>{
 const h=harness();
 for(const k of ['GET '+root,'PATCH '+root+'/screens/:screenId','PATCH '+root+'/items/:itemId','POST '+root+'/screens/:screenId/disconnect','GET /api/support-history'])assert.ok(h.routes.has(k),k);
});
test('bedrijfsbeheerder mag geen supportrechten krijgen',async()=>{
 const h=harness();
 const {error}=await h.call('GET',root,{role:'owner',params:{orgId:organization}});
 assert.equal(error?.status,403);
 assert.equal(h.calls.length,0);
});
test('superadmin moet altijd een reden geven',async()=>{
 const h=harness();
 const {error}=await h.call('GET',root,{reason:'',params:{orgId:organization}});
 assert.equal(error?.status,400);
 assert.equal(h.calls.length,0);
});
test('supportinzage is bedrijfsspecifiek en wordt geregistreerd',async()=>{
 const h=harness((sql,args)=>{
  if(sql.includes('SELECT id,name,user_limit'))return {rows:[{id:organization,name:'Bedrijf A',user_limit:1,screen_limit:1}]};
  if(sql.includes('FROM users WHERE organization_id'))return {rows:[{email:'a@example.test',role:'owner'}]};
  if(sql.includes('FROM screens WHERE organization_id'))return {rows:[{id:screenId,name:'Receptie'}]};
  if(sql.includes('FROM items WHERE organization_id'))return {rows:[{id:itemId,title:'Welkomstscherm'}]};
  if(sql.includes('FROM support_events a JOIN'))return {rows:[]};
  return {rows:[]};
 });
 const {error,response}=await h.call('GET',root,{params:{orgId:organization}});
 assert.equal(error,null);
 assert.equal(response.result.organization.id,organization);
 assert.equal(response.result.screens.length,1);
 assert.ok(h.calls.some(c=>c.sql.startsWith('INSERT INTO support_events')));
 assert.equal(response.headers['Cache-Control'],'no-store');
});
test('support kan geen scherm van ander bedrijf wijzigen',async()=>{
 const h=harness((sql)=>{
  if(sql.includes('SELECT id,name,user_limit'))return {rows:[{id:organization}]};
  if(sql.includes('SELECT id,name,settings FROM screens'))return {rows:[]};
  return {rows:[]};
 });
 const {error}=await h.call('PATCH',root+'/screens/:screenId',{params:{orgId:organization,screenId},body:{name:'Nieuw'}});
 assert.equal(error?.status,404);
 assert.ok(!h.calls.some(c=>c.sql.includes('INSERT INTO support_events')));
 assert.ok(h.calls.some(c=>c.sql==='ROLLBACK'));
});
test('supportgeschiedenis hoort alleen bij de eigen organisatie',async()=>{
 const h=harness();
 const denied=await h.call('GET','/api/support-history',{role:'superadmin'});
 assert.equal(denied.error?.status,403);
 const allowed=await h.call('GET','/api/support-history',{role:'owner',orgId:organization});
 assert.equal(allowed.error,null);
 assert.equal(allowed.response.headers['Cache-Control'],'no-store');
 assert.ok(h.calls.some(c=>c.sql.includes('FROM support_events')&&c.args[0]===organization));
});
