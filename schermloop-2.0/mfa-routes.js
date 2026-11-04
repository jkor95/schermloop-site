'use strict';
const crypto=require('node:crypto');
const bcrypt=require('bcryptjs');
const mfa=require('./mfa');
const recoveryHash=(value,secret)=>crypto.createHmac('sha256',String(secret)).update('SchermLoop-2-recovery:'+String(value||'').trim().toLowerCase()).digest('hex');
function makeRecoveryCodes(){return Array.from({length:10},()=>crypto.randomBytes(10).toString('hex'));}
module.exports=function registerMfaRoutes(app,{pool,requireAuth,err,env,sha}){
 const handler=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
 const requireAdmin=(req,res,next)=>{
  if(req.user?.role!=='superadmin')return next(err(403,'Alleen voor de opperhoofdbeheerder.'));
  next();
 };
 const noStore=(res,value)=>res.set('Cache-Control','no-store').json(value);
 app.get('/api/mfa/status',requireAuth,requireAdmin,handler(async(req,res)=>{
  const record=await pool.query('SELECT mfa_secret_enc IS NOT NULL AS enabled FROM users WHERE id=$1',[req.user.id]);
  noStore(res,{enabled:record.rows[0]?.enabled===true});
 }));
 app.post('/api/mfa/start',requireAuth,requireAdmin,handler(async(req,res)=>{
  const password=String(req.body?.current_password||'');
  const record=await pool.query('SELECT email,password_hash,mfa_secret_enc FROM users WHERE id=$1 AND active=true',[req.user.id]);
  const user=record.rows[0];
  if(!user||!await bcrypt.compare(password,user.password_hash))throw err(401,'Huidig wachtwoord is onjuist.');
  if(user.mfa_secret_enc)throw err(409,'Tweestapsverificatie staat al aan.');
  const secret=mfa.newSecret();
  const enc=mfa.seal(secret,env.APP_SECRET);
  await pool.query('UPDATE users SET mfa_pending_enc=$1,mfa_pending_at=now() WHERE id=$2 AND mfa_secret_enc IS NULL',[enc,req.user.id]);
  noStore(res,{secret,otpauth_uri:mfa.uri(user.email,secret),expires_in_seconds:600});
 }));
 app.post('/api/mfa/confirm',requireAuth,requireAdmin,handler(async(req,res)=>{
  const client=await pool.connect();
  try{
   await client.query('BEGIN');
   const record=await client.query('SELECT mfa_secret_enc,mfa_pending_enc,mfa_pending_at FROM users WHERE id=$1 FOR UPDATE',[req.user.id]);
   const user=record.rows[0];
   if(!user||user.mfa_secret_enc||!user.mfa_pending_enc)throw err(409,'Start eerst een nieuwe 2FA-koppeling.');
   if(!user.mfa_pending_at||Date.now()-new Date(user.mfa_pending_at).getTime()>600000)throw err(410,'De installatie is verlopen. Begin opnieuw.');
   const secret=mfa.open(user.mfa_pending_enc,env.APP_SECRET);
   if(!mfa.verify(secret,req.body?.code))throw err(401,'Ongeldige code uit de authenticator-app.');
   const codes=makeRecoveryCodes();
   await client.query('UPDATE users SET mfa_secret_enc=$1,mfa_pending_enc=NULL,mfa_pending_at=NULL WHERE id=$2',[user.mfa_pending_enc,req.user.id]);
   await client.query('DELETE FROM mfa_recovery_codes WHERE user_id=$1',[req.user.id]);
   for(const code of codes)await client.query('INSERT INTO mfa_recovery_codes(user_id,code_hash) VALUES($1,$2)',[req.user.id,recoveryHash(code,env.APP_SECRET)]);
   await client.query('DELETE FROM sessions WHERE user_id=$1 AND token_hash<>$2',[req.user.id,sha(req.cookies.sl2sid)]);
   await client.query('COMMIT');
   noStore(res,{enabled:true,recovery_codes:codes});
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
 }));
 app.post('/api/mfa/disable',requireAuth,requireAdmin,handler(async(req,res)=>{
  if(req.body?.confirm!==true)throw err(400,'Bevestig dat tweestapsverificatie uit moet.');
  const client=await pool.connect();
  try{
   await client.query('BEGIN');
   const record=await client.query('SELECT password_hash,mfa_secret_enc FROM users WHERE id=$1 FOR UPDATE',[req.user.id]);
   const user=record.rows[0];
   if(!user||!user.mfa_secret_enc)throw err(409,'Tweestapsverificatie staat niet aan.');
   if(!await bcrypt.compare(String(req.body?.current_password||''),user.password_hash))throw err(401,'Huidig wachtwoord is onjuist.');
   let valid=false;
   if(mfa.verify(mfa.open(user.mfa_secret_enc,env.APP_SECRET),req.body?.code))valid=true;
   if(!valid&&typeof req.body?.recovery_code==='string'){
    const hash=recoveryHash(req.body.recovery_code,env.APP_SECRET);
    const consumed=await client.query('DELETE FROM mfa_recovery_codes WHERE user_id=$1 AND code_hash=$2 RETURNING code_hash',[req.user.id,hash]);
    valid=consumed.rowCount===1;
   }
   if(!valid)throw err(401,'Geldige authenticator- of herstelcode vereist.');
   await client.query('UPDATE users SET mfa_secret_enc=NULL,mfa_pending_enc=NULL,mfa_pending_at=NULL WHERE id=$1',[req.user.id]);
   await client.query('DELETE FROM mfa_recovery_codes WHERE user_id=$1',[req.user.id]);
   await client.query('DELETE FROM sessions WHERE user_id=$1 AND token_hash<>$2',[req.user.id,sha(req.cookies.sl2sid)]);
   await client.query('COMMIT');
   noStore(res,{enabled:false});
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
 }));
};
module.exports.recoveryHash=recoveryHash;
