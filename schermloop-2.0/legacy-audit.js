'use strict';
function summarizeLegacy(playlist,settings,bulletins){
 const slides=Array.isArray(playlist?.items)?playlist.items:[];
 const messages=Array.isArray(bulletins?.items)?bulletins.items:[];
 const warnings=[];
 const byType={};
 const mapped=slides.map((slide,index)=>{
  const type=String(slide.type||'unknown').toLowerCase();
  byType[type]=(byType[type]||0)+1;
  const duration=Number(slide.duration)||10;
  const customTimes=Array.isArray(slide.slideDurations)?slide.slideDurations:[];
  const pageEnabled=Array.isArray(slide.slideEnabled)?slide.slideEnabled:[];
  if(customTimes.length||pageEnabled.length)warnings.push('Document '+(index+1)+' heeft eigen pagina-instellingen.');
  if(!['image','video','pdf','pptx','text'].includes(type))warnings.push('Dia '+(index+1)+' heeft een onbekend bestandstype.');
  return {index,type,name:String(slide.name||''),enabled:slide.enabled!==false,
    duration:Math.min(600,Math.max(2,duration)),
    mediaPresent:Boolean(slide.path),pagesWithSpecialTiming:customTimes.length,
    pagesWithSpecialVisibility:pageEnabled.length};
 });
 return {slides:mapped,byType,messages:messages.length,
  supportsWeather:Boolean(settings?.weather),
  supportsNews:Boolean(settings?.news),
  supportsClock:typeof settings?.cornerClock==='boolean',
  warnings,requiresManualReview:warnings.length>0};
}
const fs=require('node:fs');
const path=require('node:path');
function checkMediaFiles(root,playlist){
 const base=fs.realpathSync(root),slides=Array.isArray(playlist?.items)?playlist.items:[];
 let found=0,missing=0,unsafe=0,bytes=0;
 const issues=[];
 for(const [i,slide] of slides.entries()){
  const rel=String(slide.path||'').replace(/^\/+/,''),full=path.resolve(base,rel);
  if(!rel||!full.startsWith(base+path.sep)){unsafe++;issues.push('Onveilig mediapad bij dia '+(i+1));continue;}
  try{
   const target=fs.realpathSync(full);
   if(!target.startsWith(base+path.sep)){unsafe++;issues.push('Mediapad verwijst buiten bronmap bij dia '+(i+1));continue;}
   const stat=fs.statSync(target);
   if(!stat.isFile())throw Error('Geen bestand');
   found++;bytes+=stat.size;
  }catch{missing++;issues.push('Ontbrekend mediabestand bij dia '+(i+1));}
 }
 return {found,missing,unsafe,bytes,issues,ready:missing===0&&unsafe===0};
}
function inspectLegacyDirectory(directory){
 const base=fs.realpathSync(directory);
 const read=name=>JSON.parse(fs.readFileSync(path.join(base,'data',name),'utf8'));
 const playlist=read('playlist.json');
 return {...summarizeLegacy(playlist,read('live-settings.json'),read('mededelingen.json')),media:checkMediaFiles(base,playlist)};
}
module.exports={summarizeLegacy,checkMediaFiles,inspectLegacyDirectory};
