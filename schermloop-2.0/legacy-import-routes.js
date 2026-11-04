'use strict';
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const bcrypt=require('bcryptjs');
const crypto=require('node:crypto');
const {inspectLegacyDirectory}=require('./legacy-audit');
const {collectLegacy,translateSettings,translateAnnouncements}=require('./legacy-import-utils');
module.exports=function registerLegacyImport(app,{pool,requireAuth,err,validUuid,storage,env}){
 const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
 const allowed=req=>req.user.role==='superadmin'&&env.ENABLE_LEGACY_IMPORT==='true'&&!!env.LEGACY_SOURCE_DIR;
 function sourceDir(req){if(!allowed(req))throw err(403,'Oude presentatie-import is niet ingeschakeld.');return fs.realpathSync(env.LEGACY_SOURCE_DIR);}
 app.get('/api/release/legacy-status',requireAuth,wrap(async(req,res)=>{
  const dir=sourceDir(req);
  const report=inspectLegacyDirectory(dir);
  res.set('Cache-Control','private, no-store').json({
   enabled:true,slideCount:report.slides.length,missing:report.media.missing,
   unsafe:report.media.unsafe,announcements:report.messages,newsWasEnabled:report.supportsNews,
   sourceReady:report.media.ready,warnings:report.warnings
  });
 }));
 app.post('/api/release/import-legacy',requireAuth,wrap(async(req,res)=>{
  const dir=sourceDir(req);
  const org=validUuid(req.body?.organization_id),screen=validUuid(req.body?.screen_id);
  if(req.body?.confirm!==true)throw err(400,'Bevestig expliciet dat deze proefimport is toegestaan.');
  if(!['rijksoverheid','disable'].includes(req.body?.news_policy))throw err(400,'Kies een expliciet nieuwsbeleid.');
  const user=await pool.query('SELECT password_hash FROM users WHERE id=$1 AND active=true',[req.user.id]);
  if(!user.rows.length||!await bcrypt.compare(String(req.body?.current_password||''),user.rows[0].password_hash))throw err(401,'Huidig hoofdbeheerwachtwoord onjuist.');
  const report=inspectLegacyDirectory(dir);
  if(!report.media.ready||!report.slides.length)throw err(409,'De bronpresentatie is niet volledig. Er is niets overgezet.');
  const get=name=>JSON.parse(fs.readFileSync(path.join(dir,'data',name),'utf8'));
  const playlist=get('playlist.json'),settings=get('live-settings.json'),notes=get('mededelingen.json');
  const tmp=await fs.promises.mkdtemp(path.join(os.tmpdir(),'schermloop-legacy-'));
  const client=await pool.connect();
  let created=[];
  try{
   await client.query('BEGIN');
   const current=await client.query('SELECT id,device_hash,session_hash,announcements FROM screens WHERE id=$1 AND organization_id=$2 FOR UPDATE',[screen,org]);
   if(!current.rows.length)throw err(404,'Het scherm hoort niet bij het gekozen bedrijf.');
   const target=current.rows[0];
   const count=await client.query('SELECT count(*)::int AS n FROM items WHERE screen_id=$1 AND organization_id=$2',[screen,org]);
   if(target.device_hash||target.session_hash||count.rows[0].n>0||(Array.isArray(target.announcements)&&target.announcements.length))throw err(409,'Import is alleen mogelijk in een leeg, ongekoppeld scherm.');
   const copied=await collectLegacy(dir,tmp,storage,playlist);created=copied.created;
   for(const item of copied.items){
    await client.query('INSERT INTO items(id,organization_id,screen_id,title,kind,storage_key,mime,duration,enabled,position) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[
     item.id,org,screen,item.title,item.kind,item.storageKey,item.mime,item.duration,item.enabled,item.position
    ]);
   }
   const replacement=req.body.news_policy==='rijksoverheid';
   const cfg=translateSettings(settings,{replaceNews:replacement});
   // Houd het scherm uitgeschakeld tot de beheerder na controle het schema aanzet.
   cfg.enabled=false;
   const announcements=translateAnnouncements(notes);
   await client.query('UPDATE screens SET settings=$1,announcements=$2 WHERE id=$3 AND organization_id=$4',[
    JSON.stringify(cfg),JSON.stringify(announcements),screen,org
   ]);
   await client.query('INSERT INTO support_events(id,organization_id,actor_id,action,target_kind,target_id,details) VALUES($1,$2,$3,$4,$5,$6,$7)',[
    crypto.randomUUID(),org,req.user.id,'legacy_import','screen',screen,
    JSON.stringify({slides:copied.items.length,old_slides:report.slides.length,announcements:announcements.length,news_policy:req.body.news_policy})
   ]);
   await client.query('COMMIT');
   res.set('Cache-Control','no-store').json({ok:true,imported:copied.items.length,sourceSlides:report.slides.length,announcements:announcements.length,newsPolicy:req.body.news_policy,screenEnabled:false});
  }catch(e){
   await client.query('ROLLBACK').catch(()=>{});
   for(const file of created)await fs.promises.rm(file,{force:true}).catch(()=>{});
   throw e;
  }finally{client.release();await fs.promises.rm(tmp,{recursive:true,force:true});}
 }));
};
