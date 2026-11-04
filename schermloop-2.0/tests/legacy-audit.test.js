'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {summarizeLegacy}=require('../legacy-audit');
test('Waarschuwt voor PDF dia-instellingen en bewaart broninstellingen',()=>{
 const source={items:[
  {name:'Poster',type:'image',path:'media/uploads/test.png',duration:25},
  {name:'Document',type:'pdf',path:'media/uploads/file.pdf',duration:10,slideDurations:[10,20,30],slideEnabled:[true,false,true]},
  {name:'Nieuws',type:'video',path:'media/uploads/movie.mp4',enabled:false,duration:35}
 ]};
 const r=summarizeLegacy(source,{weather:{enabled:true},news:{enabled:true},cornerClock:true},{items:[{title:'Test'}]});
 assert.equal(r.slides.length,3);
 assert.equal(r.slides[2].enabled,false);
 assert.equal(r.slides[1].pagesWithSpecialTiming,3);
 assert.equal(r.slides[1].pagesWithSpecialVisibility,3);
 assert.equal(r.messages,1);
 assert.equal(r.supportsNews,true);
 assert.equal(r.requiresManualReview,true);
});
test('Onbekend type krijgt een waarschuwing',()=>{
 const r=summarizeLegacy({items:[{type:'old-format',path:'test'}]},null,null);
 assert.equal(r.warnings.length,1);
});
test('Gewone presentatie hoeft niet handmatig beoordeeld te worden',()=>{
 const r=summarizeLegacy({items:[{type:'image',path:'x.png',duration:10}]},{},{items:[]});
 assert.equal(r.requiresManualReview,false);
});

test('Voorcontrole telt ontbrekende en onveilige oude mediapaden',()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sl2-legacy-'));
 try{
  fs.mkdirSync(path.join(dir,'media'),{recursive:true});
  fs.writeFileSync(path.join(dir,'media','ok.png'),Buffer.from('test'));
  const {checkMediaFiles}=require('../legacy-audit');
  const result=checkMediaFiles(dir,{items:[
   {path:'media/ok.png'},{path:'media/missing.pdf'},{path:'../../bad.txt'}
  ]});
  assert.equal(result.found,1);
  assert.equal(result.missing,1);
  assert.equal(result.unsafe,1);
  assert.equal(result.ready,false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('PDF-objectinstellingen uit bestaande privéomgeving geven migratiewaarschuwing',()=>{
 const source={items:[{name:'PDF',type:'pdf',path:'media/doc.pdf',slideDurations:{'1':17,'3':23},slideEnabled:{'2':false}}]};
 const report=summarizeLegacy(source,{news:{enabled:false},weather:{enabled:false}},{items:[]});
 assert.equal(report.slides[0].pagesWithSpecialTiming,2);
 assert.equal(report.slides[0].pagesWithSpecialVisibility,1);
 assert.equal(report.requiresManualReview,true);
 assert.equal(report.supportsNews,false);
});
