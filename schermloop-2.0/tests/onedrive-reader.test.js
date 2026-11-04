'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const ExcelJS=require('exceljs');
const {graphItemUrl,fetchExcel}=require('../onedrive-reader');
test('Microsoft Graph URL is bound to a selected drive and item',()=>{
 assert.equal(graphItemUrl('b!DemoDrive','01ABCD123'),'https://graph.microsoft.com/v1.0/drives/b!DemoDrive/items/01ABCD123/content');
 assert.throws(()=>graphItemUrl('https://localhost','file'),/Ongeldige/);
 assert.throws(()=>graphItemUrl('drive','../../other'),/Ongeldige/);
});
test('OneDrive lezer verwerkt XLSX zonder klanttoken te loggen',async()=>{
 const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Mededelingen');
 sheet.addRow(['Titel','Tekst','Seconden','Tonen']);
 sheet.addRow(['OLC','Stilte in de toetsweek',20,'Ja']);
 sheet.addRow(['Verborgen','Niet tonen',20,'Nee']);
 const data=Buffer.from(await book.xlsx.writeBuffer()),token='long-delegated-token-for-testing-only';
 let calls=0;
 const fake=async(url,options)=>{
  calls++;
  assert.match(url,/^https:\/\/graph\.microsoft\.com\/v1\.0\/drives\//);
  assert.equal(options.headers.Authorization,'Bearer '+token);
  assert.equal(options.method,'GET');
  return {ok:true,status:200,headers:{get:()=>String(data.length)},arrayBuffer:async()=>data};
 };
 const rows=await fetchExcel('b!SomeDrive','01FILE234',token,{fetchImpl:fake});
 assert.equal(calls,1);assert.deepEqual(rows,[{title:'OLC',text:'Stilte in de toetsweek',duration:20}]);
});
test('OneDrive fouten blijven herkenbaar en bestanden blijven begrensd',async()=>{
 const token='long-delegated-token-for-testing-only';
 await assert.rejects(fetchExcel('drive','item',token,{fetchImpl:async()=>({status:401,ok:false})}),/verbinding verlopen/);
 await assert.rejects(fetchExcel('drive','item',token,{fetchImpl:async()=>({status:200,ok:true,headers:{get:()=>String(4*1024*1024)}})}),/te groot/);
});
