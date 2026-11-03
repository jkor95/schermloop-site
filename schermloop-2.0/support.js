'use strict';

// Hoofdbeheer werkt onder het eigen account: nooit inloggen als een klant.
module.exports = function registerSupport(app, deps) {
  const { pool, requireAuth, err, validUuid, validName, sanitizeSchedule, uuid } = deps;
  const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
  function authorized(req, res, next) {
    if (req.user.role !== 'superadmin') return next(err(403, 'Alleen de hoofdbeheerder heeft supporttoegang.'));
    const reason = String(req.get('x-support-reason') || '').trim();
    if (reason.length < 10 || reason.length > 300) return next(err(400, 'Vermeld een supportreden van 10 tot 300 tekens.'));
    req.supportReason = reason;
    next();
  }
  async function record(client, req, orgId, action, type, targetId, details = {}) {
    await client.query(
      'INSERT INTO support_events(id,organization_id,actor_id,action,target_kind,target_id,details) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [uuid(),orgId,req.user.id,action,type,targetId || null,{...details,reason:req.supportReason}]
    );
  }
  async function organization(client, id) {
    const found = await client.query('SELECT id,name,user_limit,screen_limit FROM organizations WHERE id=$1', [id]);
    if (!found.rows[0]) throw err(404, 'Bedrijf niet gevonden.');
    return found.rows[0];
  }
  app.get('/api/support/organizations/:orgId', requireAuth, authorized, wrap(async (req,res) => {
    const id=validUuid(req.params.orgId),client=await pool.connect();
    try {
      const org=await organization(client,id);
      const users=await client.query('SELECT id,email,role,active,created_at FROM users WHERE organization_id=$1 ORDER BY email',[id]);
      const screens=await client.query('SELECT id,name,settings,last_seen_at,device_hash IS NOT NULL AS paired FROM screens WHERE organization_id=$1 ORDER BY name',[id]);
      const items=await client.query('SELECT id,screen_id,title,kind,text_body,duration,enabled,position FROM items WHERE organization_id=$1 ORDER BY screen_id,position',[id]);
      const audit=await client.query('SELECT a.action,a.target_kind,a.target_id,a.details,a.created_at,u.email AS actor_email FROM support_events a JOIN users u ON u.id=a.actor_id WHERE a.organization_id=$1 ORDER BY a.created_at DESC LIMIT 40',[id]);
      await record(client,req,id,'view_company','organization',id);
      res.set('Cache-Control','no-store').json({organization:org,users:users.rows,screens:screens.rows,items:items.rows,audit:audit.rows});
    } finally {client.release();}
  }));
  app.patch('/api/support/organizations/:orgId/screens/:screenId',requireAuth,authorized,wrap(async (req,res) => {
    const org=validUuid(req.params.orgId),id=validUuid(req.params.screenId),client=await pool.connect();
    try {
      await client.query('BEGIN');
      await organization(client,org);
      const old=await client.query('SELECT id,name,settings FROM screens WHERE id=$1 AND organization_id=$2 FOR UPDATE',[id,org]);
      if (!old.rows[0]) throw err(404,'Scherm niet gevonden.');
      const before=old.rows[0];
      const name=req.body.name===undefined?before.name:validName(req.body.name);
      const settings=req.body.settings===undefined?before.settings:sanitizeSchedule(req.body.settings);
      const result=await client.query('UPDATE screens SET name=$1,settings=$2 WHERE id=$3 AND organization_id=$4 RETURNING id,name,settings',[name,settings,id,org]);
      await record(client,req,org,'update_screen','screen',id,{before,after:{name,settings}});
      await client.query('COMMIT');
      res.json(result.rows[0]);
    } catch(e) {await client.query('ROLLBACK');throw e;} finally {client.release();}
  }));
  app.patch('/api/support/organizations/:orgId/items/:itemId',requireAuth,authorized,wrap(async (req,res) => {
    const org=validUuid(req.params.orgId),id=validUuid(req.params.itemId),client=await pool.connect();
    try {
      await client.query('BEGIN');
      await organization(client,org);
      const old=await client.query('SELECT id,title,kind,text_body,duration,enabled FROM items WHERE id=$1 AND organization_id=$2 FOR UPDATE',[id,org]);
      if (!old.rows[0]) throw err(404,'Dia niet gevonden.');
      const before=old.rows[0];
      const title=req.body.title===undefined?before.title:validName(req.body.title);
      const duration=req.body.duration===undefined?before.duration:Number(req.body.duration);
      if (!Number.isInteger(duration)||duration<2||duration>600) throw err(400,'Duur moet 2 tot 600 seconden zijn.');
      const enabled=req.body.enabled===undefined?before.enabled:req.body.enabled===true;
      let body=before.text_body;
      if (req.body.text_body!==undefined) {
        if (before.kind!=='text') throw err(400,'Alleen tekstmededelingen kunnen tekst bevatten.');
        body=String(req.body.text_body).trim();
        if (!body||body.length>5000) throw err(400,'Tekst moet 1 tot 5000 tekens bevatten.');
      }
      const result=await client.query('UPDATE items SET title=$1,duration=$2,enabled=$3,text_body=$4 WHERE id=$5 AND organization_id=$6 RETURNING id,title,kind,text_body,duration,enabled',[title,duration,enabled,body,id,org]);
      await record(client,req,org,'update_item','item',id,{before:{title:before.title,duration:before.duration,enabled:before.enabled},after:{title,duration,enabled},text_changed:body!==before.text_body});
      await client.query('COMMIT');
      res.json(result.rows[0]);
    } catch(e) {await client.query('ROLLBACK');throw e;} finally {client.release();}
  }));
  app.post('/api/support/organizations/:orgId/screens/:screenId/disconnect',requireAuth,authorized,wrap(async (req,res) => {
    const org=validUuid(req.params.orgId),id=validUuid(req.params.screenId),client=await pool.connect();
    try {
      await client.query('BEGIN');
      await organization(client,org);
      const result=await client.query('UPDATE screens SET device_hash=NULL,device_version=device_version+1,last_seen_at=NULL WHERE id=$1 AND organization_id=$2 RETURNING id,name',[id,org]);
      if (!result.rows[0]) throw err(404,'Scherm niet gevonden.');
      await record(client,req,org,'disconnect_screen','screen',id,{name:result.rows[0].name});
      await client.query('COMMIT');
      res.json({ok:true});
    } catch(e) {await client.query('ROLLBACK');throw e;} finally {client.release();}
  }));
  app.get('/api/support-history',requireAuth,wrap(async(req,res) => {
    if (!req.user.organization_id) throw err(403,'Alleen bedrijfsaccounts.');
    const r=await pool.query('SELECT a.action,a.target_kind,a.created_at,a.details,u.email AS actor_email FROM support_events a JOIN users u ON u.id=a.actor_id WHERE a.organization_id=$1 ORDER BY a.created_at DESC LIMIT 60',[req.user.organization_id]);
    res.set('Cache-Control','no-store').json(r.rows);
  }));
};
