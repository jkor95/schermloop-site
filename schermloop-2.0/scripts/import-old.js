'use strict';
// Voert standaard uitsluitend een analyse uit. --apply schrijft alleen in een leeg
// testscherm op de nieuwe PostgreSQL-database, nooit in de bronmap.
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {Pool}=require('pg');
const {inspectLegacyDirectory}=require('../legacy-audit');
const {collectLegacy,translateSettings,translateAnnouncements}=require('../legacy-import-utils');
const validId=x=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x||'');
async function main(){
 const source=process.argv[2],apply=process.argv.includes('--apply');
 if(!source)throw Error('Gebruik: node scripts/import-old.js /pad/naar-backup [--apply]');
 const report=inspectLegacyDirectory(source);
 console.log(JSON.stringify({dryRun:!apply,slides:report.slides.length,media:report.media,
  documentWarnings:report.warnings,oldNewsEnabled:report.supportsNews,announcements:report.messages},null,2));
 if(!apply)return;
 if(!report.media.ready)throw Error('Er ontbreken mediabestanden. Er is niets geïmporteerd.');
 const dir=fs.realpathSync(source);
 const read=name=>JSON.parse(fs.readFileSync(path.join(dir,'data',name),'utf8'));
 const playlist=read('playlist.json'),settings=read('live-settings.json'),bulletins=read('mededelingen.json');
 if(settings.news?.enabled&&!process.argv.includes('--test-without-news'))throw Error('De oude nieuwsbron is actief. Migratie gestopt totdat de nieuwsvoorziening is geregeld.');
 const org=process.env.TARGET_ORG_ID,screen=process.env.TARGET_SCREEN_ID,store=path.resolve(process.env.STORAGE_DIR||'/app/storage');
 if(!validId(org)||!validId(screen))throw Error('TARGET_ORG_ID en TARGET_SCREEN_ID moeten naar een leeg testbedrijf/scherm verwijzen.');
 const pool=new Pool(process.env.DATABASE_URL?{connectionString:process.env.DATABASE_URL}:{
  host:process.env.DB_HOST,port:Number(process.env.DB_PORT||5432),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME
 });
 const temp=await fs.promises.mkdtemp(path.join(os.tmpdir(),'sl2-import-'));
 const client=await pool.connect();
 let created=[];
 try{
  await client.query('BEGIN');
  const rows=await client.query('SELECT id,device_hash,announcements FROM screens WHERE id=$1 AND organization_id=$2 FOR UPDATE',[screen,org]);
  if(!rows.rows.length)throw Error('Het gekozen scherm hoort niet bij het gekozen bedrijf.');
  const target=rows.rows[0];
  const current=await client.query('SELECT count(*)::int AS count FROM items WHERE screen_id=$1',[screen]);
  if(target.device_hash||current.rows[0].count||(Array.isArray(target.announcements)&&target.announcements.length))throw Error('Het gekozen scherm bevat al inhoud of is gekoppeld. Import afgebroken.');
  await fs.promises.mkdir(store,{recursive:true});
  const result=await collectLegacy(dir,temp,store,playlist);created=result.created;
  for(const item of result.items){
   await client.query('INSERT INTO items(id,organization_id,screen_id,title,kind,storage_key,mime,duration,enabled,position) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
    [item.id,org,screen,item.title,item.kind,item.storageKey,item.mime,item.duration,item.enabled,item.position]);
  }
  await client.query('UPDATE screens SET settings=$1,announcements=$2 WHERE id=$3 AND organization_id=$4',
   [JSON.stringify(translateSettings(settings)),JSON.stringify(translateAnnouncements(bulletins)),screen,org]);
  await client.query('COMMIT');
  console.log(JSON.stringify({status:'imported',slides:result.items.length,announcements:translateAnnouncements(bulletins).length}));
 }catch(e){
  await client.query('ROLLBACK').catch(()=>{});
  for(const f of created)await fs.promises.rm(f,{force:true}).catch(()=>{});
  throw e;
 }finally{
  client.release();await pool.end();await fs.promises.rm(temp,{recursive:true,force:true});
 }
}
if(require.main===module)main().catch(e=>{console.error('Import mislukt:',e.message);process.exitCode=1;});
module.exports={main};
