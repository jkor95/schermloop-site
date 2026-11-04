'use strict';
const {DEFAULT_LOCATION,searchCities,validateSelectedCity,forecastFor}=require('./weather');
module.exports=function registerWeather(app,{requireAuth,requireDevice,asOrg,owner,err,db}){
 const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
 app.get('/api/weather/locations',requireAuth,wrap(async(req,res)=>{
  const q=String(req.query.q||'').trim();
  if(q.length<2||q.length>80)throw err(400,'Vul ten minste twee letters van de plaatsnaam in.');
  res.set('Cache-Control','private, max-age=120').json(searchCities(q,15));
 }));
 app.get('/api/organization/weather',requireAuth,wrap(async(req,res)=>{
  const r=await db('SELECT weather_location FROM organizations WHERE id=$1',[asOrg(req)]);
  res.set('Cache-Control','no-store').json({location:r.rows[0]?.weather_location||DEFAULT_LOCATION});
 }));
 app.patch('/api/organization/weather',requireAuth,wrap(async(req,res)=>{
  owner(req);
  let location;
  try{location=validateSelectedCity(req.body?.location);}catch(e){throw err(400,e.message);}
  const r=await db('UPDATE organizations SET weather_location=$1 WHERE id=$2 RETURNING weather_location',[location,asOrg(req)]);
  res.set('Cache-Control','no-store').json({location:r.rows[0].weather_location});
 }));
 app.get('/api/player/weather',requireDevice,wrap(async(req,res)=>{
  const r=await db('SELECT weather_location FROM organizations WHERE id=$1',[req.screen.organization_id]);
  const location=r.rows[0]?.weather_location||DEFAULT_LOCATION;
  const weather=await forecastFor(location);
  res.set('Cache-Control','private, no-store').json(weather);
 }));
};
