'use strict';
const multer=require('multer');
const {readXlsx}=require('./excel-announcements');
module.exports=function registerExcelAnnouncements(app,{requireAuth,getScreen,err,db}){
 const handle=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
 const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:3*1024*1024,files:1},
  fileFilter:(_req,file,done)=>done(null,/\.xlsx$/i.test(file.originalname))});
 app.get('/api/screens/:id/announcements',requireAuth,handle(async(req,res)=>{
  const screen=await getScreen(req,req.params.id);
  const rows=await db('SELECT announcements FROM screens WHERE id=$1 AND organization_id=$2',[screen.id,screen.organization_id]);
  res.set('Cache-Control','private, no-store').json({items:rows.rows[0]?.announcements||[]});
 }));
 app.post('/api/screens/:id/announcements/excel',requireAuth,upload.single('file'),handle(async(req,res)=>{
  const screen=await getScreen(req,req.params.id);
  if(!req.file?.buffer)throw err(400,'Kies een .xlsx-bestand.');
  if(req.body.confirmReplace!=='true')throw err(400,'Bevestig dat de vorige Excel-mededelingen worden vervangen.');
  let items;
  try{items=await readXlsx(req.file.buffer);}
  catch(e){throw err(400,'Excel kan niet worden verwerkt: '+e.message);}
  const result=await db('UPDATE screens SET announcements=$1 WHERE id=$2 AND organization_id=$3 RETURNING id',[JSON.stringify(items),screen.id,screen.organization_id]);
  if(!result.rows.length)throw err(404,'Scherm niet gevonden.');
  res.set('Cache-Control','no-store').json({ok:true,imported:items.length,message:'Alleen de eerdere Excel-import is vervangen. Handmatige dia’s blijven staan.'});
 }));
};
