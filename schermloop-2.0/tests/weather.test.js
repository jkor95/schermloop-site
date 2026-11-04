'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {searchCities,validateSelectedCity,transformForecast,forecastFor,intensity,DEFAULT_LOCATION}=require('../weather');
const {sanitizeSchedule}=require('../domain');
const fixed=Date.parse('2026-11-04T08:00:00Z');
const sample={properties:{
 meta:{updated_at:'2026-11-04T07:30:00Z'},
 timeseries:Array.from({length:8},(_,n)=>({
  time:new Date(fixed+n*3600000).toISOString(),
  data:{instant:{details:{air_temperature:12+n,wind_speed:3.5,relative_humidity:82}},
  next_1_hours:{summary:{symbol_code:n<2?'partlycloudy_day':'rain'},details:{precipitation_amount:[0,0.3,3,11,0,0,0,0][n]}}}
 }))
}};
test('Plaatszoeker herkent een Nederlandse stad zonder externe dienst',()=>{
 const list=searchCities('Dordrecht');
 assert.ok(list.some(c=>c.name==='Dordrecht'&&c.country==='NL'));
 const city=list.find(c=>c.name==='Dordrecht'&&c.country==='NL');
 assert.deepEqual(validateSelectedCity(city),city);
});
test('De plaatszoeker voorkomt eigen willekeurige locatiepayloads',()=>{
 assert.throws(()=>validateSelectedCity({name:'Nepplaats',country:'NL',lat:90,lon:180}),/Selecteer/);
 assert.throws(()=>validateSelectedCity({name:'Dordrecht',country:'NL',lat:0,lon:0}),/Selecteer/);
});
test('Het weerbericht toont uurlijkse regen in de juiste classificaties',()=>{
 const data=transformForecast(sample,DEFAULT_LOCATION,fixed);
 assert.equal(data.source,'MET Norway');
 assert.equal(data.location.name,'Dordrecht');
 assert.equal(data.current.temperature,12);
 assert.equal(data.rain.length,8);
 assert.deepEqual(data.rain.slice(0,4).map(x=>x.intensity),['Droog','Licht','Matig','Zwaar']);
 assert.equal(data.rainResolution,'1 hour');
});
test('Weerinstellingen per scherm zijn standaard uit en worden begrensd',()=>{
 const blank=sanitizeSchedule({});
 assert.equal(blank.weatherPage,false);
 assert.equal(blank.weatherCorner,false);
 assert.equal(blank.weatherDuration,20);
 const cfg=sanitizeSchedule({weatherPage:true,weatherCorner:true,weatherDuration:999});
 assert.equal(cfg.weatherPage,true);
 assert.equal(cfg.weatherCorner,true);
 assert.equal(cfg.weatherDuration,600);
});
test('Server vraagt een keer weerdata op en hergebruikt de cache zonder token',async()=>{
 let calls=0;
 const impl=async(_url,opts)=>{calls++;assert.ok(opts.headers['User-Agent'].includes('SchermLoop'));return {ok:true,status:200,headers:{get:()=>null},json:async()=>sample};};
 const city={name:'Teststad',country:'NL',lat:18.1234,lon:-12.4567};
 const first=await forecastFor(city,{fetchImpl:impl,clock:()=>fixed,userAgent:'SchermLoop-Tests/1.0 https://jkworks.nl'});
 const second=await forecastFor({...city,name:'Andere naam'},{fetchImpl:impl,clock:()=>fixed+60000,userAgent:'SchermLoop-Tests/1.0 https://jkworks.nl'});
 assert.equal(calls,1);assert.equal(first.location.name,'Teststad');assert.equal(second.location.name,'Andere naam');
});
test('Regenclassificatie en temperatuur ontbreken zonder misleidende waarden',()=>{
 assert.equal(intensity(0.01),'Droog');assert.equal(intensity(0.2),'Licht');assert.equal(intensity(2.5),'Matig');assert.equal(intensity(10),'Zwaar');
 const data=JSON.parse(JSON.stringify(sample));delete data.properties.timeseries[0].data.instant.details.air_temperature;
 const wx=transformForecast(data,DEFAULT_LOCATION,fixed);assert.equal(wx.current.temperature,null);
});
