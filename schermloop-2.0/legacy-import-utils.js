'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {promisify}=require('node:util');
const {execFile}=require('node:child_process');
const {sanitizeSchedule}=require('./domain');
const exec=promisify(execFile);
const id=()=>crypto.randomUUID();
const mime={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.mp4':'video/mp4','.webm':'video/webm'};
function safeRead(root,relative){
 const base=fs.realpathSync(root),full=fs.realpathSync(path.resolve(base,String(relative||'').replace(/^\/+/,'')));
 if(!full.startsWith(base+path.sep)||!fs.statSync(full).isFile())throw Error('Ongeldig mediabestand in de bron.');
 return full;
}
function duration(v,fallback=10){const n=Number(v);return Number.isFinite(n)&&n>0?Math.max(2,Math.min(600,Math.round(n))):fallback;}
async function toPages(file,folder){
 const info=await exec('pdfinfo',[file],{timeout:15000});
 const pages=Number(/Pages:\s+(\d+)/.exec(info.stdout)?.[1]||0);
 if(!pages||pages>60)throw Error('PDF heeft geen pagina’s of meer dan 60 pagina’s.');
 const prefix=path.join(folder,id());
 await exec('pdftoppm',['-scale-to','1600','-png',file,prefix],{timeout:120000,maxBuffer:1024*1024});
 const name=path.basename(prefix);
 const files=(await fs.promises.readdir(folder)).filter(x=>x.startsWith(name+'-')&&x.endsWith('.png')).sort((a,b)=>Number(a.match(/-(\d+)\.png$/)?.[1])-Number(b.match(/-(\d+)\.png$/)?.[1]));
 if(files.length!==pages)throw Error('Niet alle PDF-pagina’s konden worden geconverteerd.');
 return files.map(x=>path.join(folder,x));
}
function translateSettings(old){
 const p=old?.presentation||{};
 return sanitizeSchedule({
  enabled:false,
  clock:old?.cornerClock!==false,
  background:['black','blur','color'].includes(p.backgroundMode)?p.backgroundMode:'black',
  backgroundColor:p.backgroundColor||'#172638',
  weatherPage:old?.weather?.enabled===true,
  weatherCorner:old?.cornerWeather===true,
  weatherDuration:old?.weather?.duration||20,
  tickerEnabled:false
 });
}
function translateAnnouncements(old){
 const rows=Array.isArray(old?.items)?old.items:[];
 if(rows.length>50)throw Error('De bron bevat meer dan 50 mededelingen.');
 return rows.map(x=>({title:String(x.title||'Mededeling').slice(0,140),text:String(x.text||'').slice(0,1800),duration:duration(x.duration,20)})).filter(x=>x.text);
}
async function collectLegacy(root,temp,store,playlist){
 const output=[],files=[];
 try{
  for(const [index,item] of playlist.items.entries()){
   const full=safeRead(root,item.path),ext=path.extname(full).toLowerCase();
   const isPdf=ext==='.pdf',type=String(item.type||'').toLowerCase();
   if(!isPdf&&!mime[ext])throw Error('Niet-ondersteund mediatype bij dia '+(index+1));
   const parts=isPdf?await toPages(full,temp):[full];
   for(const [num,source] of parts.entries()){
    const extension=isPdf?'.png':ext,key=id()+extension;
    const destination=path.join(store,key);
    await fs.promises.copyFile(source,destination);files.push(destination);
    output.push({
     id:id(),title:parts.length>1?String(item.name||'Document').slice(0,100)+' ('+(num+1)+'/'+parts.length+')':String(item.name||'Dia').slice(0,120),
     kind:['.mp4','.webm'].includes(extension)?'video':'image',
     storageKey:key,mime:mime[extension],
     duration:duration(Array.isArray(item.slideDurations)?item.slideDurations[num]:undefined,duration(item.duration)),
     enabled:item.enabled!==false&&(!Array.isArray(item.slideEnabled)||item.slideEnabled[num]!==false),
     position:output.length+1
    });
   }
  }
  return {items:output,created:files};
 }catch(e){for(const f of files)await fs.promises.rm(f,{force:true});throw e;}
}
module.exports={safeRead,duration,toPages,translateSettings,translateAnnouncements,collectLegacy};
