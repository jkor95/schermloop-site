'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {collectLegacy,translateSettings,translateAnnouncements,safeRead}=require('../legacy-import-utils');
test('Oude afbeeldingsdia wordt gekopieerd met tijd, volgorde en zichtbaarheid',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sl2-original-'));
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'sl2-page-'));
 const store=fs.mkdtempSync(path.join(os.tmpdir(),'sl2-store-'));
 try{
  fs.mkdirSync(path.join(dir,'media'),{recursive:true});
  fs.writeFileSync(path.join(dir,'media','poster.png'),Buffer.from('PNGTEST'));
  const result=await collectLegacy(dir,temp,store,{items:[{type:'image',path:'media/poster.png',name:'Posterdia',duration:25,enabled:false}]});
  assert.equal(result.items.length,1);
  assert.equal(result.items[0].duration,25);
  assert.equal(result.items[0].enabled,false);
  assert.equal(result.items[0].mime,'image/png');
  assert.equal(fs.readFileSync(path.join(store,result.items[0].storageKey),'utf8'),'PNGTEST');
  assert.equal(fs.readFileSync(path.join(dir,'media','poster.png'),'utf8'),'PNGTEST');
 }finally{for(const d of [dir,temp,store])fs.rmSync(d,{recursive:true,force:true});}
});
test('Instellingen en Excel-mededelingen worden vertaald zonder auteursrechtelijk nieuws',()=>{
 const settings=translateSettings({presentation:{backgroundMode:'blur'},cornerClock:true,weather:{enabled:true,duration:11},cornerWeather:true});
 assert.equal(settings.background,'blur');
 assert.equal(settings.weatherPage,true);
 assert.equal(settings.weatherDuration,11);
 assert.equal(settings.tickerEnabled,false);
 const messages=translateAnnouncements({items:[{title:'Stilte',text:'Toetsweek',duration:20}]});
 assert.equal(messages.length,1);
 assert.equal(messages[0].text,'Toetsweek');
});
test('Migratie mag geen bronbestanden buiten de bronmap lezen',()=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'sl2-src-'));
 try{assert.throws(()=>safeRead(base,'../../other-place'),/ENOENT|Ongeldig/);}
 finally{fs.rmSync(base,{recursive:true,force:true});}
});

test('NU.nl wordt niet stilzwijgend overgenomen maar expliciet vervangen',()=>{
 const old={news:{enabled:true,mode:'slides',duration:21,speed:80}};
 const unchanged=translateSettings(old);
 const replaced=translateSettings(old,{replaceNews:true});
 assert.equal(unchanged.newsEnabled,false);
 assert.equal(replaced.newsEnabled,true);
 assert.equal(replaced.newsMode,'slides');
 assert.equal(replaced.newsDuration,21);
});
