'use strict';
const crypto=require('node:crypto');
const {rateLimit}=require('express-rate-limit');
const {parseRows}=require('./excel-announcements');
const fingerprint=token=>crypto.createHash('sha256').update(String(token).toLowerCase()).digest('hex');
module.exports=function registerExcelSync(app,{db,requireAuth,getScreen,owner,err,validUuid,publicUrl}){
 const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
 const noStore=(res,data)=>res.set('Cache-Control','no-store').json(data);
 app.get('/api/screens/:id/excel-sync',requireAuth,wrap(async(req,res)=>{
  owner(req);
  const screen=await getScreen(req,req.params.id);
  const query=await db('SELECT excel_sync_hash IS NOT NULL AS enabled,excel_last_sync_at FROM screens WHERE id=$1 AND organization_id=$2',[screen.id,screen.organization_id]);
  noStore(res,{enabled:query.rows[0]?.enabled===true,last_sync_at:query.rows[0]?.excel_last_sync_at||null,endpoint:new URL('/api/integrations/excel/'+screen.id,publicUrl).toString()});
 }));
 app.post('/api/screens/:id/excel-sync',requireAuth,wrap(async(req,res)=>{
  owner(req);
  if(req.body?.confirm!==true)throw err(400,'Bevestig dat een eventuele oude synchronisatiesleutel wordt ingetrokken.');
  const screen=await getScreen(req,req.params.id);
  const token=crypto.randomBytes(32).toString('hex');
  await db('UPDATE screens SET excel_sync_hash=$1 WHERE id=$2 AND organization_id=$3',[fingerprint(token),screen.id,screen.organization_id]);
  noStore(res,{enabled:true,token,endpoint:new URL('/api/integrations/excel/'+screen.id,publicUrl).toString()});
 }));
 app.delete('/api/screens/:id/excel-sync',requireAuth,wrap(async(req,res)=>{
  owner(req);
  if(req.body?.confirm!==true)throw err(400,'Bevestig dat automatische synchronisatie wordt uitgeschakeld.');
  const screen=await getScreen(req,req.params.id);
  await db('UPDATE screens SET excel_sync_hash=NULL WHERE id=$1 AND organization_id=$2',[screen.id,screen.organization_id]);
  noStore(res,{enabled:false});
 }));
 app.post('/api/integrations/excel/:id',rateLimit({windowMs:15*60*1000,limit:120,standardHeaders:'draft-7',legacyHeaders:false}),wrap(async(req,res)=>{
  const id=validUuid(req.params.id);
  const bearer=/^Bearer ([0-9a-f]{64})$/i.exec(req.get('authorization')||'');
  if(!bearer)throw err(401,'Synchronisatiesleutel ontbreekt.');
  if(!Array.isArray(req.body?.items)||req.body.items.length>50)throw err(400,'Stuur maximaal 50 Excelregels in items.');
  let items;
  try{items=parseRows(req.body.items);}catch(e){throw err(400,e.message);}
  if(!items.length&&req.body.allow_empty!==true)throw err(400,'Lege import geweigerd om onbedoeld wissen te voorkomen.');
  const result=await db('UPDATE screens SET announcements=$1,excel_last_sync_at=now() WHERE id=$2 AND excel_sync_hash=$3 RETURNING id',[JSON.stringify(items),id,fingerprint(bearer[1])]);
  if(!result.rows.length)throw err(401,'Synchronisatiesleutel ongeldig of ingetrokken.');
  noStore(res,{ok:true,imported:items.length});
 }));
};
