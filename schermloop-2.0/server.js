'use strict';
const express=require('express');
const helmet=require('helmet');
const cookieParser=require('cookie-parser');
const rateLimit=require('express-rate-limit');
const multer=require('multer');
const bcrypt=require('bcryptjs');
const {Pool}=require('pg');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {promisify}=require('node:util');
const {execFile}=require('node:child_process');
const {allowedExtensions,hasCapacity,normEmail,sanitizeSchedule}=require('./domain');
const exec=promisify(execFile);
const uuid=()=>crypto.randomUUID();
const random=()=>crypto.randomBytes(32).toString('hex');
const sha=x=>crypto.createHash('sha256').update(String(x)).digest('hex');
const env=process.env;
const port=Number(env.PORT||3000);
const storage=path.resolve(env.STORAGE_DIR||path.join(__dirname,'storage'));
const key=crypto.createHash('sha256').update(env.APP_SECRET||'').digest();
const pool=new Pool({connectionString:env.DATABASE_URL,ssl:env.DB_SSL==='true'?{rejectUnauthorized:true}:undefined});
function seal(plaintext){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);const raw=Buffer.concat([cipher.update(plaintext,'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),raw]).toString('base64');}
function unseal(encrypted){const data=Buffer.from(encrypted,'base64'),dec=crypto.createDecipheriv('aes-256-gcm',key,data.subarray(0,12));dec.setAuthTag(data.subarray(12,28));return Buffer.concat([dec.update(data.subarray(28)),dec.final()]).toString('utf8');}
function err(status,message){const e=new Error(message);e.status=status;return e;}
function asyncHandler(fn){return(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);}
function validatePassword(pass){if(typeof pass!=='string'||pass.length<12||pass.length>200)throw err(400,'Wachtwoord moet minimaal 12 tekens bevatten.');}
function validName(name){if(typeof name!=='string'||!name.trim()||name.length>120)throw err(400,'Ongeldige naam.');return name.trim();}
function validUuid(id){if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id||''))throw err(400,'Ongeldige identificatie.');return id;}
function safeEmail(value){const x=normEmail(value);if(x.length>254||!x.includes('@')||/\s/.test(x))throw err(400,'Ongeldig e-mailadres.');return x;}
function owner(req){if(req.user.role!=='owner')throw err(403,'Alleen bedrijfsbeheerder.');}
function asOrg(req){if(!req.user.organization_id)throw err(403,'Bedrijfsaccount vereist.');return req.user.organization_id;}
async function db(sql,args=[]){return pool.query(sql,args);}
const app=express();app.disable('x-powered-by');
app.set('trust proxy',1);
app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],baseUri:["'self'"],frameAncestors:["'none'"],imgSrc:["'self'","blob:","data:"],mediaSrc:["'self'","blob:"],scriptSrc:["'self'"],styleSrc:["'self'"],connectSrc:["'self'"],objectSrc:["'none'"]}}}));
app.use(express.json({limit:'100kb'}));app.use(cookieParser());
app.use((req,res,next)=>{if(['GET','HEAD','OPTIONS'].includes(req.method))return next();const origin=req.get('origin');if(origin&&origin!==env.PUBLIC_URL)return next(err(403,'Onjuiste herkomst.'));next();});
app.use('/api/login',rateLimit({windowMs:15*60*1000,limit:12,standardHeaders:'draft-7',legacyHeaders:false}));
app.use('/api/player/pair/request',rateLimit({windowMs:10*60*1000,limit:10,standardHeaders:'draft-7',legacyHeaders:false}));
app.use('/api/player/pair/',rateLimit({windowMs:10*60*1000,limit:100,standardHeaders:'draft-7',legacyHeaders:false}));
app.use(express.static(path.join(__dirname,'public'),{index:'index.html',maxAge:'1h'}));
app.get('/player',(req,res)=>res.sendFile(path.join(__dirname,'public/player.html')));
app.get('/healthz',asyncHandler(async(req,res)=>{await db('SELECT 1');res.json({ok:true});}));
async function requireAuth(req,res,next){try{const token=req.cookies.sl2sid;if(!token)return next(err(401,'Log eerst in.'));const r=await db('SELECT u.id,u.organization_id,u.email,u.role,u.active FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at>now()',[sha(token)]);if(!r.rows[0]?.active)return next(err(401,'Sessie verlopen.'));req.user=r.rows[0];next();}catch(e){next(e);}}
async function requireDevice(req,res,next){try{const raw=/^Bearer ([a-f0-9]{64})$/i.exec(req.get('authorization')||'');if(!raw)return next(err(401,'Scherm niet gekoppeld.'));const r=await db('SELECT id,organization_id,name,settings FROM screens WHERE session_hash=$1',[sha(raw[1])]);if(!r.rows.length)return next(err(401,'Schermkoppeling vervangen of ingetrokken.'));req.screen=r.rows[0];next();}catch(e){next(e);}}
async function getScreen(req,id){const r=await db('SELECT * FROM screens WHERE id=$1 AND organization_id=$2',[validUuid(id),asOrg(req)]);if(!r.rows.length)throw err(404,'Scherm niet gevonden.');return r.rows[0];}
app.post('/api/login',asyncHandler(async(req,res)=>{
 const email=safeEmail(req.body.email),password=String(req.body.password||'');
 const r=await db('SELECT id,role,organization_id,password_hash,active FROM users WHERE email=$1',[email]);
 const user=r.rows[0];
 if(!user||!user.active||!await bcrypt.compare(password,user.password_hash))throw err(401,'Onjuiste inloggegevens.');
 const token=random();await db("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')",[sha(token),user.id]);
 res.cookie('sl2sid',token,{httpOnly:true,secure:env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:7*24*3600*1000});
 res.json({ok:true,role:user.role});
}));
app.post('/api/logout',requireAuth,asyncHandler(async(req,res)=>{await db('DELETE FROM sessions WHERE token_hash=$1',[sha(req.cookies.sl2sid)]);res.clearCookie('sl2sid',{path:'/'});res.json({ok:true});}));
app.get('/api/me',requireAuth,asyncHandler(async(req,res)=>{let org=null;if(req.user.organization_id){const r=await db('SELECT id,name,user_limit,screen_limit FROM organizations WHERE id=$1',[req.user.organization_id]);org=r.rows[0]||null;}res.json({user:req.user,organization:org});}));
app.get('/api/organizations',requireAuth,asyncHandler(async(req,res)=>{if(req.user.role!=='superadmin')throw err(403,'Geen toegang.');res.json((await db("SELECT o.*, (SELECT count(*)::int FROM users u WHERE u.organization_id=o.id AND u.active) AS users_used,(SELECT count(*)::int FROM screens s WHERE s.organization_id=o.id) AS screens_used FROM organizations o ORDER BY o.created_at DESC")).rows);}));
app.post('/api/organizations',requireAuth,asyncHandler(async(req,res)=>{
 if(req.user.role!=='superadmin')throw err(403,'Geen toegang.');
 const name=validName(req.body.name),email=safeEmail(req.body.email),password=req.body.password;validatePassword(password);
 const client=await pool.connect();try{await client.query('BEGIN');const oid=uuid();await client.query('INSERT INTO organizations(id,name) VALUES($1,$2)',[oid,name]);await client.query("INSERT INTO users(id,organization_id,email,password_hash,role) VALUES($1,$2,$3,$4,'owner')",[uuid(),oid,email,await bcrypt.hash(password,12)]);await client.query('COMMIT');res.status(201).json({id:oid,name,email});}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}));
app.patch('/api/organizations/:id/licenses',requireAuth,asyncHandler(async(req,res)=>{
 if(req.user.role!=='superadmin')throw err(403,'Geen toegang.');
 const id=validUuid(req.params.id),u=Number(req.body.user_limit),s=Number(req.body.screen_limit);
 if(!Number.isInteger(u)||!Number.isInteger(s)||u<1||s<1||u>500||s>500)throw err(400,'Ongeldige licentiewaarden.');
 const counts=await db('SELECT (SELECT count(*)::int FROM users WHERE organization_id=$1 AND active) AS users,(SELECT count(*)::int FROM screens WHERE organization_id=$1) AS screens',[id]);
 if(u<counts.rows[0].users||s<counts.rows[0].screens)throw err(409,'Verwijder eerst ongebruikte accounts of schermen.');
 const r=await db('UPDATE organizations SET user_limit=$1,screen_limit=$2 WHERE id=$3 RETURNING id,name,user_limit,screen_limit',[u,s,id]);if(!r.rows.length)throw err(404,'Bedrijf onbekend.');res.json(r.rows[0]);
}));
app.get('/api/users',requireAuth,asyncHandler(async(req,res)=>{const org=asOrg(req);res.json((await db('SELECT id,email,role,active,created_at FROM users WHERE organization_id=$1 ORDER BY created_at',[org])).rows);}));
app.post('/api/users',requireAuth,asyncHandler(async(req,res)=>{
 owner(req);const org=asOrg(req),email=safeEmail(req.body.email),password=req.body.password;validatePassword(password);
 const client=await pool.connect();try{await client.query('BEGIN');const r=await client.query('SELECT user_limit FROM organizations WHERE id=$1 FOR UPDATE',[org]);const n=await client.query('SELECT count(*)::int AS n FROM users WHERE organization_id=$1 AND active',[org]);if(!hasCapacity(r.rows[0].user_limit,n.rows[0].n))throw err(409,'Accountlimiet bereikt.');await client.query("INSERT INTO users(id,organization_id,email,password_hash,role) VALUES($1,$2,$3,$4,'staff')",[uuid(),org,email,await bcrypt.hash(password,12)]);await client.query('COMMIT');res.status(201).json({ok:true,email});}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}));
app.get('/api/screens',requireAuth,asyncHandler(async(req,res)=>{const org=asOrg(req);res.json((await db('SELECT id,name,device_version,last_seen_at,settings,device_hash IS NOT NULL AS paired FROM screens WHERE organization_id=$1 ORDER BY created_at',[org])).rows);}));
app.post('/api/screens',requireAuth,asyncHandler(async(req,res)=>{
 owner(req);const org=asOrg(req),name=validName(req.body.name);
 const client=await pool.connect();try{await client.query('BEGIN');const r=await client.query('SELECT screen_limit FROM organizations WHERE id=$1 FOR UPDATE',[org]);const n=await client.query('SELECT count(*)::int AS n FROM screens WHERE organization_id=$1',[org]);if(!hasCapacity(r.rows[0].screen_limit,n.rows[0].n))throw err(409,'Schermlimiet bereikt.');const id=uuid();await client.query('INSERT INTO screens(id,organization_id,name) VALUES($1,$2,$3)',[id,org,name]);await client.query('COMMIT');res.status(201).json({id,name});}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}));
app.patch('/api/screens/:id',requireAuth,asyncHandler(async(req,res)=>{
 owner(req);const screen=await getScreen(req,req.params.id),name=req.body.name===undefined?screen.name:validName(req.body.name),settings=req.body.settings===undefined?screen.settings:sanitizeSchedule(req.body.settings);
 const r=await db('UPDATE screens SET name=$1,settings=$2 WHERE id=$3 RETURNING id,name,settings',[name,settings,screen.id]);res.json(r.rows[0]);
}));
app.post('/api/player/pair/request',asyncHandler(async(req,res)=>{
 const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let code='';for(let i=0;i<10;i++)code+=alphabet[crypto.randomInt(alphabet.length)];
 const claim=random(),id=uuid();
 await db("INSERT INTO pairing_requests(id,code_hash,claim_hash,expires_at) VALUES($1,$2,$3,now()+interval '10 minutes')",[id,sha(env.APP_SECRET+':'+code),sha(claim)]);
 res.status(201).json({request_id:id,code,claim_token:claim,expires_in_seconds:600});
}));
app.get('/api/player/pair/:id',asyncHandler(async(req,res)=>{
 const id=validUuid(req.params.id),raw=/^Bearer ([a-f0-9]{64})$/i.exec(req.get('authorization')||'');if(!raw)throw err(401,'Ongeldige koppelcode.');
 const client=await pool.connect();try{await client.query('BEGIN');
 const q=await client.query('SELECT * FROM pairing_requests WHERE id=$1 FOR UPDATE',[id]);const p=q.rows[0];
 if(!p||p.claim_hash!==sha(raw[1]))throw err(401,'Onbekende koppeling.');
 if(new Date(p.expires_at).getTime()<Date.now())throw err(410,'Koppelcode verlopen.');
 if(!p.paired_screen_id){await client.query('COMMIT');return res.json({status:'pending'});}
 if(p.claimed_at)throw err(410,'Code al gebruikt.');
 const token=unseal(p.encrypted_device_token);
 await client.query('UPDATE pairing_requests SET claimed_at=now(),encrypted_device_token=NULL WHERE id=$1',[id]);
 await client.query('COMMIT');res.json({status:'paired',device_token:token});
 }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}finally{client.release();}
}));
app.post('/api/screens/:id/pair',requireAuth,asyncHandler(async(req,res)=>{
 owner(req);const screen=await getScreen(req,req.params.id),code=String(req.body.code||'').trim().toUpperCase();
 if(!/^[A-HJ-NP-Z2-9]{10}$/.test(code))throw err(400,'Koppelcode moet tien tekens bevatten.');
 const hash=sha(env.APP_SECRET+':'+code),token=random(),client=await pool.connect();
 try{await client.query('BEGIN');const r=await client.query('SELECT * FROM pairing_requests WHERE code_hash=$1 FOR UPDATE',[hash]);const p=r.rows[0];
 if(!p||p.paired_screen_id||p.claimed_at||new Date(p.expires_at).getTime()<Date.now())throw err(404,'Koppelcode onbekend of verlopen.');
 await client.query('UPDATE screens SET device_hash=$1,session_hash=NULL,session_started_at=NULL,device_version=device_version+1,last_seen_at=NULL WHERE id=$2 AND organization_id=$3',[sha(token),screen.id,screen.organization_id]);
 await client.query('UPDATE pairing_requests SET encrypted_device_token=$1,paired_screen_id=$2 WHERE id=$3',[seal(token),screen.id,p.id]);
 await client.query('COMMIT');res.json({ok:true,message:'Scherm gekoppeld. Eerdere afspeelsessie is ingetrokken.'});
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}));
app.post('/api/player/session',asyncHandler(async(req,res)=>{
 const raw=/^Bearer ([a-f0-9]{64})$/i.exec(req.get('authorization')||'');
 if(!raw)throw err(401,'Scherm niet gekoppeld.');
 const token=random();
 const r=await db('UPDATE screens SET session_hash=$1,session_started_at=now(),last_seen_at=now() WHERE device_hash=$2 RETURNING id,name',[sha(token),sha(raw[1])]);
 if(!r.rows.length)throw err(401,'Schermkoppeling ongeldig. Koppel het scherm opnieuw.');
 res.set('Cache-Control','no-store').json({session_token:token,screen_id:r.rows[0].id});
}));
app.get('/api/player/state',requireDevice,asyncHandler(async(req,res)=>{
 await db('UPDATE screens SET last_seen_at=now() WHERE id=$1',[req.screen.id]);
 const items=(await db("SELECT id,title,kind,text_body,duration,enabled,position,settings FROM items WHERE screen_id=$1 AND organization_id=$2 AND enabled=true ORDER BY position,created_at",[req.screen.id,req.screen.organization_id])).rows;
 res.set('Cache-Control','no-store').json({screen:{id:req.screen.id,name:req.screen.name,settings:req.screen.settings},items,server_time:new Date().toISOString()});
}));
app.get('/api/player/media/:id',requireDevice,asyncHandler(async(req,res)=>{
 const r=await db('SELECT storage_key,mime FROM items WHERE id=$1 AND screen_id=$2 AND organization_id=$3 AND enabled=true',[validUuid(req.params.id),req.screen.id,req.screen.organization_id]);if(!r.rows.length)throw err(404,'Bestand niet beschikbaar.');
 const item=r.rows[0];if(!/^[a-f0-9-]{36}\.(png|jpg|jpeg|gif|webp|mp4|webm)$/i.test(item.storage_key))throw err(500,'Ongeldige opslag.');
 res.set('Cache-Control','private, no-store').type(item.mime).sendFile(path.join(storage,item.storage_key));
}));
app.get('/api/media/:id',requireAuth,asyncHandler(async(req,res)=>{
 const r=await db('SELECT storage_key,mime FROM items WHERE id=$1 AND organization_id=$2',[validUuid(req.params.id),asOrg(req)]);if(!r.rows.length)throw err(404,'Bestand onbekend.');
 const item=r.rows[0];if(!/^[a-f0-9-]{36}\.(png|jpg|jpeg|gif|webp|mp4|webm)$/i.test(item.storage_key))throw err(500,'Ongeldige opslag.');
 res.set('Cache-Control','private, no-store').type(item.mime).sendFile(path.join(storage,item.storage_key));
}));
app.get('/api/screens/:id/items',requireAuth,asyncHandler(async(req,res)=>{
 const screen=await getScreen(req,req.params.id);res.json((await db('SELECT id,title,kind,text_body,duration,enabled,position,settings FROM items WHERE screen_id=$1 AND organization_id=$2 ORDER BY position,created_at',[screen.id,screen.organization_id])).rows);
}));
app.post('/api/screens/:id/items/text',requireAuth,asyncHandler(async(req,res)=>{
 const screen=await getScreen(req,req.params.id),title=validName(req.body.title),body=String(req.body.text||'').trim();
 if(!body||body.length>5000)throw err(400,'Mededeling mag maximaal 5000 tekens bevatten.');
 const seconds=Math.max(2,Math.min(600,Number(req.body.duration)||15));
 const order=await db('SELECT coalesce(max(position),0)+1 AS n FROM items WHERE screen_id=$1',[screen.id]);
 const r=await db("INSERT INTO items(id,organization_id,screen_id,title,kind,text_body,duration,position) VALUES($1,$2,$3,$4,'text',$5,$6,$7) RETURNING id",[uuid(),screen.organization_id,screen.id,title,body,seconds,order.rows[0].n]);res.status(201).json(r.rows[0]);
}));
const mimeMap={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.mp4':'video/mp4','.webm':'video/webm'};
const upload=multer({storage:multer.diskStorage({destination:(_req,_file,cb)=>cb(null,storage),filename:(_req,file,cb)=>{const ext=path.extname(file.originalname).toLowerCase();cb(null,uuid()+ext);}}),limits:{fileSize:50*1024*1024,files:1},fileFilter:(_req,file,cb)=>{if(!allowedExtensions.has(path.extname(file.originalname).toLowerCase()))return cb(err(415,'Dit bestandstype wordt niet ondersteund.'));cb(null,true);}});
async function assertMagic(file,ext){
 const handle=await fs.promises.open(file,'r');let b=Buffer.alloc(12);try{await handle.read(b,0,12,0);}finally{await handle.close();}
 const prefix=b.toString('hex'),ascii=b.toString('latin1');
 const ok=ext==='.png'?prefix.startsWith('89504e470d0a1a0a'):ext==='.jpg'||ext==='.jpeg'?prefix.startsWith('ffd8ff'):ext==='.gif'?ascii.startsWith('GIF8'):ext==='.webp'?ascii.startsWith('RIFF')&&ascii.slice(8,12)==='WEBP':ext==='.mp4'?ascii.slice(4,8)==='ftyp':ext==='.webm'?prefix.startsWith('1a45dfa3'):ext==='.pdf'?ascii.startsWith('%PDF-'):ext==='.pptx'?prefix.startsWith('504b0304'):false;
 if(!ok)throw err(415,'Bestandsinhoud past niet bij de extensie.');
}
async function createPages(file,ext){
 if(ext!=='.pdf'&&ext!=='.pptx')return [{key:path.basename(file),mime:mimeMap[ext],kind:ext==='.mp4'||ext==='.webm'?'video':'image'}];
 const dir=await fs.promises.mkdtemp(path.join(os.tmpdir(),'schermloop-pdf-'));const produced=[];
 try{
 let pdf=file;
 if(ext==='.pptx'){await exec('libreoffice',['-env:UserInstallation=file://'+path.join(dir,'lo'),'--headless','--convert-to','pdf','--outdir',dir,file],{timeout:90000});pdf=path.join(dir,path.basename(file,'.pptx')+'.pdf');}
 if(!fs.existsSync(pdf))throw err(415,'Document kon niet naar dia’s worden omgezet.');
 const info=(await exec('pdfinfo',[pdf],{timeout:15000})).stdout;const pages=Number(/Pages:\s+(\d+)/.exec(info)?.[1]||0);
 if(!pages||pages>60)throw err(415,'Document mag maximaal 60 pagina’s bevatten.');
 await exec('pdftoppm',['-f','1','-l',String(pages),'-scale-to','1600','-png',pdf,path.join(dir,'dia')],{timeout:90000,maxBuffer:1024*1024});
 const png=(await fs.promises.readdir(dir)).filter(n=>/^dia-\d+\.png$/.test(n)).sort((a,b)=>Number(a.match(/\d+/)[0])-Number(b.match(/\d+/)[0]));
 if(png.length!==pages)throw err(500,'Niet alle dia’s konden worden omgezet.');
 for(const name of png){const key=uuid()+'.png';await fs.promises.copyFile(path.join(dir,name),path.join(storage,key));produced.push({key,mime:'image/png',kind:'image'});}
 return produced;
 }catch(e){for(const p of produced)await fs.promises.rm(path.join(storage,p.key),{force:true});throw e;}finally{await fs.promises.rm(dir,{recursive:true,force:true});}
}
app.post('/api/screens/:id/items/upload',requireAuth,upload.single('file'),asyncHandler(async(req,res)=>{
 if(!req.file)throw err(400,'Kies een bestand.');
 let created=[],pages=[],uploadCommitted=false;try{
 const screen=await getScreen(req,req.params.id),ext=path.extname(req.file.originalname).toLowerCase();
 await assertMagic(req.file.path,ext);pages=await createPages(req.file.path,ext);
 const title=String(req.body.title||path.basename(req.file.originalname,ext)).trim().slice(0,120)||'Presentatie';
 const duration=Math.max(2,Math.min(600,Number(req.body.duration)||10));
 const client=await pool.connect();try{await client.query('BEGIN');const n=await client.query('SELECT coalesce(max(position),0) AS n FROM items WHERE screen_id=$1',[screen.id]);
 for(let i=0;i<pages.length;i++){const p=pages[i],id=uuid(),label=pages.length===1?title:title+' ('+(i+1)+'/'+pages.length+')';
 await client.query('INSERT INTO items(id,organization_id,screen_id,title,kind,storage_key,mime,duration,position) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id,screen.organization_id,screen.id,label,p.kind,p.key,p.mime,duration,n.rows[0].n+i+1]);created.push(id);}
 await client.query('COMMIT');uploadCommitted=true;}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
 res.status(201).json({created:created.length,ids:created});
 }catch(e){for(const p of pages)if(p.key!==path.basename(req.file.path))await fs.promises.rm(path.join(storage,p.key),{force:true});throw e;}
 finally{if(req.file&&(!uploadCommitted||['.pdf','.pptx'].includes(path.extname(req.file.originalname).toLowerCase())))await fs.promises.rm(req.file.path,{force:true});}
}));
app.patch('/api/items/:id',requireAuth,asyncHandler(async(req,res)=>{
 const org=asOrg(req),id=validUuid(req.params.id),prior=await db('SELECT * FROM items WHERE id=$1 AND organization_id=$2',[id,org]);if(!prior.rows.length)throw err(404,'Dia onbekend.');
 const old=prior.rows[0];
 const title=req.body.title===undefined?old.title:validName(req.body.title);
 const duration=req.body.duration===undefined?old.duration:Number(req.body.duration);
 if(!Number.isInteger(duration)||duration<2||duration>600)throw err(400,'Duur moet tussen 2 en 600 seconden zijn.');
 const enabled=req.body.enabled===undefined?old.enabled:req.body.enabled===true;
 const r=await db('UPDATE items SET title=$1,duration=$2,enabled=$3 WHERE id=$4 AND organization_id=$5 RETURNING id,title,duration,enabled',[title,duration,enabled,id,org]);res.json(r.rows[0]);
}));
app.post('/api/items/:id/move',requireAuth,asyncHandler(async(req,res)=>{
 const org=asOrg(req),id=validUuid(req.params.id),dir=Number(req.body.direction);
 if(![-1,1].includes(dir))throw err(400,'Ongeldige richting.');
 const client=await pool.connect();try{await client.query('BEGIN');
 const item=await client.query('SELECT * FROM items WHERE id=$1 AND organization_id=$2',[id,org]);if(!item.rows.length)throw err(404,'Dia onbekend.');
 await client.query('SELECT id FROM screens WHERE id=$1 FOR UPDATE',[item.rows[0].screen_id]);
 const list=await client.query('SELECT id FROM items WHERE screen_id=$1 AND organization_id=$2 ORDER BY position,created_at',[item.rows[0].screen_id,org]);
 const i=list.rows.findIndex(x=>x.id===id),j=i+dir;if(j>=0&&j<list.rows.length){const pair=list.rows[i];list.rows[i]=list.rows[j];list.rows[j]=pair;for(let k=0;k<list.rows.length;k++)await client.query('UPDATE items SET position=$1 WHERE id=$2',[k+1,list.rows[k].id]);}
 await client.query('COMMIT');res.json({ok:true});
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}));
app.delete('/api/items/:id',requireAuth,asyncHandler(async(req,res)=>{
 const r=await db('DELETE FROM items WHERE id=$1 AND organization_id=$2 RETURNING storage_key',[validUuid(req.params.id),asOrg(req)]);if(!r.rows.length)throw err(404,'Dia onbekend.');
 const key=r.rows[0].storage_key;if(key&&/^[a-f0-9-]{36}\.[a-z0-9]+$/i.test(key))await fs.promises.rm(path.join(storage,key),{force:true});
 res.json({ok:true});
}));
app.use((error,req,res,next)=>{
 if(res.headersSent)return next(error);
 const status=error.code==='23505'?409:error instanceof multer.MulterError?400:error.status||500;
 if(status>=500)console.error('SchermLoop fout:',error);
 res.status(status).json({error:status>=500?'Interne fout. Controleer de serverlogs.':error.code==='23505'?'Deze waarde is al in gebruik.':error.message});
});
async function start(){
 for(const keyName of ['DATABASE_URL','APP_SECRET','ADMIN_EMAIL','ADMIN_PASSWORD','PUBLIC_URL'])if(!env[keyName])throw Error('Vereiste configuratie ontbreekt: '+keyName);
 if(env.APP_SECRET.length<32)throw Error('APP_SECRET moet minstens 32 tekens bevatten.');
 validatePassword(env.ADMIN_PASSWORD);
 await fs.promises.mkdir(storage,{recursive:true});
 await db(fs.readFileSync(path.join(__dirname,'schema.sql'),'utf8'));
 const email=safeEmail(env.ADMIN_EMAIL);
 const exists=await db('SELECT id FROM users WHERE email=$1',[email]);
 if(!exists.rows.length){await db("INSERT INTO users(id,email,password_hash,role) VALUES($1,$2,$3,'superadmin')",[uuid(),email,await bcrypt.hash(env.ADMIN_PASSWORD,12)]);console.log('Superbeheeraccount aangemaakt.');}
 app.listen(port,'0.0.0.0',()=>console.log('SchermLoop 2.0 bereikbaar op poort '+port));
}
if(require.main===module)start().catch(e=>{console.error(e);process.exit(1);});
module.exports={app,start};
