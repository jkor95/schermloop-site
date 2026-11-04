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
module.exports={summarizeLegacy};
