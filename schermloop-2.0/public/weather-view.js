'use strict';
// Weergave is provider-onafhankelijk: alleen gevalideerde servergegevens als tekst.
(function(root){
 function element(tag,cls,text){
  const el=document.createElement(tag);
  if(cls)el.className=cls;
  if(text!==undefined)el.textContent=String(text);
  return el;
 }
 const fmt=new Intl.DateTimeFormat('nl-NL',{timeZone:'Europe/Amsterdam',hour:'2-digit',minute:'2-digit'});
 function temp(value){return Number.isFinite(value)?Math.round(value)+'°C':'--°C';}
 function rainClass(mm){if(!Number.isFinite(mm))return 'unknown';if(mm>=10)return 'heavy';if(mm>=2.5)return 'moderate';if(mm>=0.1)return 'light';return 'dry';}
 function addRainChart(into,data){
  const section=element('section','weather-rain');
  section.append(element('h3','', 'Neerslagverwachting komende uren'));
  const bars=element('div','weather-bars');
  const points=Array.isArray(data?.rain)?data.rain.slice(0,8):[];
  if(!points.length){section.append(element('p','muted','Neerslagverwachting niet beschikbaar.'));into.append(section);return;}
  const max=Math.max(1,10,...points.map(x=>Number.isFinite(x.mmHour)?x.mmHour:0));
  for(const point of points){
   const col=element('div','weather-rain-column');
   const value=Number.isFinite(point.mmHour)?point.mmHour:null;
   col.append(element('strong','weather-bar-value',value===null?'?':value.toLocaleString('nl-NL',{maximumFractionDigits:1})+' mm'));
   const frame=element('div','weather-bar-frame'),bar=element('div','weather-bar '+rainClass(value));
   bar.style.height=(value===null?6:Math.max(4,Math.min(100,value/max*100)))+'%';
   frame.append(bar);col.append(frame);
   const time=Date.parse(point.time);
   col.append(element('span','weather-hour',Number.isFinite(time)?fmt.format(time):'--:--'));
   bars.append(col);
  }
  section.append(bars);
  const legend=element('div','weather-legend');
  for(const [className,label] of [['dry','Droog'],['light','Licht'],['moderate','Matig'],['heavy','Zwaar']]){
   const span=element('span','');span.append(element('i','weather-legend-dot '+className),document.createTextNode(label));legend.append(span);
  }
  section.append(legend,element('p','weather-disclaimer','Uurlijkse verwachting (mm per uur), geen live vijfminutenradar.'));
  into.append(section);
 }
 function renderPage(into,data){
  into.replaceChildren();
  const wrap=element('section','weather-slide-page');
  wrap.append(element('div','weather-eyebrow','LOKAAL WEERBERICHT'));
  wrap.append(element('h2','weather-location',(data?.location?.name||'Weer')+' · '+(data?.location?.country||'')));
  const current=element('div','weather-current-line');
  current.append(element('strong','weather-temperature',temp(data?.current?.temperature)));
  const detail=element('div','weather-current-detail');
  detail.append(element('h3','',data?.current?.description||'Verwachting'));
  if(Number.isFinite(data?.current?.windMs))detail.append(element('p','', 'Wind '+Math.round(data.current.windMs*3.6)+' km/u'));
  if(Number.isFinite(data?.current?.humidity))detail.append(element('p','', 'Luchtvochtigheid '+Math.round(data.current.humidity)+'%'));
  current.append(detail);wrap.append(current);
  addRainChart(wrap,data);
  wrap.append(element('p','weather-attribution',(data?.stale?'Laatst bekende verwachting · ':'')+'Weergegevens: MET Norway · CC BY 4.0 · Plaatsnamen: GeoNames'));
  into.append(wrap);
 }
 function renderCorner(into,data){
  into.replaceChildren();
  const name=data?.location?.name||'Weer';
  into.append(element('strong','',name+' · '+temp(data?.current?.temperature)));
  into.append(element('span','',data?.current?.description||'Weersverwachting'));
  into.hidden=false;
 }
 root.SchermLoopWeatherView={renderPage,renderCorner,rainClass};
})(typeof window==='object'?window:globalThis);
