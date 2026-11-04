'use strict';
/*
 Weather data: MET Norway Locationforecast 2.0 (CC BY 4.0, commercial use allowed).
 City reference data: GeoNames via cities.json (CC BY 4.0).
 No per-customer API tokens, no browser calls to weather providers.
*/
const DEFAULT_LOCATION=Object.freeze({name:'Dordrecht',country:'NL',lat:51.8133,lon:4.6901});
const WEATHER_SOURCE='MET Norway';
const cache=new Map();
let placeIndex=null;
function plain(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLocaleLowerCase('nl');}
function validCoords(lat,lon){return Number.isFinite(Number(lat))&&Number.isFinite(Number(lon))&&Number(lat)>=-90&&Number(lat)<=90&&Number(lon)>=-180&&Number(lon)<=180;}
function indexCities(){
 if(placeIndex)return placeIndex;
 const raw=require('cities.json');
 placeIndex=raw.filter(v=>v?.name&&validCoords(v.lat,v.lng))
 .map(v=>({name:String(v.name),country:String(v.country||'').toUpperCase(),lat:Number(v.lat),lon:Number(v.lng),normalized:plain(v.name)}));
 return placeIndex;
}
function searchCities(term,limit=12){
 const q=plain(term);if(q.length<2||q.length>80)return [];
 const found=[];
 for(const c of indexCities()){
  if(!c.normalized.includes(q))continue;
  const score=(c.normalized===q?0:c.normalized.startsWith(q)?1:2)+(c.country==='NL'?0:3);
  found.push({...c,score});
 }
 found.sort((a,b)=>a.score-b.score||a.name.localeCompare(b.name,'nl')||a.country.localeCompare(b.country));
 return found.slice(0,Math.max(1,Math.min(30,limit))).map(({name,country,lat,lon})=>({name,country,lat,lon}));
}
function validateSelectedCity(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Selecteer een plaats uit de zoekresultaten.');
 const name=String(input.name||'').trim(),country=String(input.country||'').toUpperCase();
 const lat=Number(input.lat),lon=Number(input.lon);
 if(name.length<2||name.length>100||!/^[A-Z]{2}$/.test(country)||!validCoords(lat,lon))throw new Error('Ongeldige weerlocatie.');
 const match=indexCities().find(c=>c.country===country&&c.name===name&&Math.abs(c.lat-lat)<0.00001&&Math.abs(c.lon-lon)<0.00001);
 if(!match)throw new Error('Selecteer een plaats uit de zoekresultaten.');
 return {name:match.name,country:match.country,lat:match.lat,lon:match.lon};
}
function symbolToDutch(code){
 const s=String(code||'');
 if(s.startsWith('clearsky'))return 'Helder';
 if(s.startsWith('fair'))return 'Vrij zonnig';
 if(s.startsWith('partlycloudy'))return 'Half bewolkt';
 if(s.startsWith('cloudy'))return 'Bewolkt';
 if(s.includes('thunder'))return 'Onweer';
 if(s.includes('snow')||s.includes('sleet'))return 'Sneeuw of natte sneeuw';
 if(s.includes('rain')||s.includes('drizzle'))return 'Regen';
 if(s.includes('fog'))return 'Mist';
 return 'Weersverwachting';
}
function intensity(mm){if(mm>=10)return 'Zwaar';if(mm>=2.5)return 'Matig';if(mm>=0.1)return 'Licht';return 'Droog';}
function transformForecast(payload,location,now=Date.now()){
 const entries=payload?.properties?.timeseries;
 if(!Array.isArray(entries)||!entries.length)throw new Error('Geen weersverwachting beschikbaar.');
 const forecast=[];
 for(const e of entries){
  const time=Date.parse(e.time);
  if(!Number.isFinite(time)||time<now-60*60*1000)continue;
  const details=e.data?.instant?.details||{};
  const next=e.data?.next_1_hours;
  const mm=next?.details?.precipitation_amount;
  forecast.push({
   time:new Date(time).toISOString(),
   temperature:Number.isFinite(details.air_temperature)?details.air_temperature:null,
   precipitationMm:Number.isFinite(mm)?Math.max(0,mm):null,
   rainIntensity:Number.isFinite(mm)?intensity(mm):'Onbekend',
   symbol:String(next?.summary?.symbol_code||e.data?.next_6_hours?.summary?.symbol_code||''),
   windMs:Number.isFinite(details.wind_speed)?details.wind_speed:null,
   humidity:Number.isFinite(details.relative_humidity)?details.relative_humidity:null
  });
  if(forecast.length>=36)break;
 }
 if(!forecast.length)throw new Error('Weerbericht niet beschikbaar.');
 const current=forecast[0];
 const rain=forecast.filter(e=>e.precipitationMm!==null).slice(0,8);
 return {
  source:WEATHER_SOURCE,
  attribution:'Weergegevens: MET Norway (CC BY 4.0)',
  location:{name:location.name,country:location.country},
  updatedAt:payload?.properties?.meta?.updated_at||null,
  current:{temperature:current.temperature,description:symbolToDutch(current.symbol),windMs:current.windMs,humidity:current.humidity,symbol:current.symbol},
  rain:rain.map(x=>({time:x.time,mmHour:x.precipitationMm,intensity:x.rainIntensity})),
  rainResolution:'1 hour'
 };
}
function parseExpiry(h,now){
 const date=Date.parse(h?.get?.('expires')||'');
 return Number.isFinite(date)&&date>now?Math.min(now+90*60*1000,Math.max(now+5*60*1000,date)):now+40*60*1000;
}
async function forecastFor(location,{fetchImpl=fetch,clock=Date.now,userAgent=process.env.MET_WEATHER_USER_AGENT||'SchermLoop2.0/0.1 https://jkworks.nl'}={}){
 if(!location||!validCoords(location.lat,location.lon))throw new Error('Ongeldige locatie.');
 const now=clock(),lat=Number(location.lat).toFixed(4),lon=Number(location.lon).toFixed(4),key=lat+':'+lon;
 const prior=cache.get(key);
 if(prior?.data && prior.expiresAt>now)return {...prior.data,location:{name:location.name,country:location.country},stale:false};
 if(prior?.promise)return prior.promise;
 const promise=(async()=>{
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),10000);
  try{
   const headers={'User-Agent':userAgent,'Accept':'application/json'};
   if(prior?.lastModified)headers['If-Modified-Since']=prior.lastModified;
   const url='https://api.met.no/weatherapi/locationforecast/2.0/compact?lat='+encodeURIComponent(lat)+'&lon='+encodeURIComponent(lon);
   const res=await fetchImpl(url,{headers,signal:controller.signal});
   if(res.status===304&&prior?.data){
    const data={...prior.data,location:{name:location.name,country:location.country},stale:false};
    cache.set(key,{data,expiresAt:parseExpiry(res.headers,now),lastModified:prior.lastModified});
    return data;
   }
   if(!res.ok)throw new Error('Weerdienst tijdelijk niet bereikbaar ('+res.status+').');
   const payload=await res.json(),data=transformForecast(payload,location,now);
   cache.set(key,{data,expiresAt:parseExpiry(res.headers,now),lastModified:res.headers.get('last-modified')||null});
   if(cache.size>300)cache.delete(cache.keys().next().value);
   return {...data,stale:false};
  }catch(e){
   if(prior?.data&&now-prior.expiresAt<3*60*60*1000)return {...prior.data,location:{name:location.name,country:location.country},stale:true};
   throw e;
  }finally{clearTimeout(timer);}
 })();
 cache.set(key,{...prior,promise});
 try{return await promise;}finally{const c=cache.get(key);if(c?.promise===promise)cache.delete(key);}
}
module.exports={DEFAULT_LOCATION,searchCities,validateSelectedCity,transformForecast,forecastFor,symbolToDutch,intensity};
