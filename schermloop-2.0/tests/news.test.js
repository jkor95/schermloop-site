'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {parseNews,plain,latestNews}=require('../news');
const sample='<?xml version="1.0"?><rss><channel><item><title><![CDATA[Minister kondigt nieuwe plannen aan]]></title></item><item><title>Veiligheid &amp; bereikbaarheid</title></item></channel></rss>';
test('CC0 nieuws RSS wordt zonder HTML en afbeeldingen gelezen',()=>{
 const titles=parseNews(sample);
 assert.deepEqual(titles,['Minister kondigt nieuwe plannen aan','Veiligheid & bereikbaarheid']);
 assert.equal(plain('<b>Test</b> &amp; nieuws'),'Test & nieuws');
 assert.throws(()=>parseNews('<html>geen berichten</html>'),/Geen nieuws/);
});
test('Nieuwsbrongegevens worden 30 minuten op server gecachet',async()=>{
 let count=0;
 const mock=async()=>({ok:true,text:async()=>{count++;return sample;}});
 const a=await latestNews({fetchImpl:mock,clock:()=>Date.parse('2026-11-04T12:00:00Z')});
 const b=await latestNews({fetchImpl:mock,clock:()=>Date.parse('2026-11-04T12:02:00Z')});
 assert.equal(a.source,'Rijksoverheid');
 assert.equal(a.headlines.length,2);
 assert.equal(b.headlines.length,2);
 assert.equal(count,1);
});
