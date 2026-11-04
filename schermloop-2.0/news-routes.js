'use strict';
const {latestNews}=require('./news');
module.exports=function registerNews(app,{requireDevice,err}){
 app.get('/api/player/news',requireDevice,(req,res,next)=>{
  if(req.screen.settings?.newsEnabled!==true)return next(err(403,'Nieuws is op dit scherm uitgeschakeld.'));
  Promise.resolve(latestNews()).then(data=>res.set('Cache-Control','private, no-store').json(data)).catch(next);
 });
};
