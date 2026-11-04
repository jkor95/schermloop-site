'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const ExcelJS=require('exceljs');
const {parseRows,readXlsx}=require('../excel-announcements');
test('Leest echte Excel met Titel Tekst Seconden Tonen',async()=>{
 const wb=new ExcelJS.Workbook(),ws=wb.addWorksheet('Berichten');
 ws.addRow(['Titel','Tekst','Seconden','Tonen']);
 ws.addRow(['Open Leer Centrum','Stilte tijdens toetsweek',15,'Ja']);
 ws.addRow(['Verborgen','Niet tonen',20,'Nee']);
 ws.addRow(['Kantoor','Meld je bij de balie',200,'Ja']);
 const list=await readXlsx(Buffer.from(await wb.xlsx.writeBuffer()));
 assert.equal(list.length,2);
 assert.deepEqual(list[0],{title:'Open Leer Centrum',text:'Stilte tijdens toetsweek',duration:15});
 assert.equal(list[1].duration,120);
});
test('Verbergt regels, beperkt lengtes en kiest veilige duur',()=>{
 const data=parseRows([{Titel:'X'.repeat(500),Tekst:'A'.repeat(3000),Seconden:0,Tonen:'Ja'},{Titel:'B',Tekst:'Nee',Tonen:'Uit'}]);
 assert.equal(data.length,1);
 assert.equal(data[0].title.length,140);
 assert.equal(data[0].text.length,1800);
 assert.equal(data[0].duration,20);
});
test('Excel met meer dan 50 actieve regels wordt geweigerd',()=>{
 assert.throws(()=>parseRows(Array.from({length:51},(_,i)=>({Titel:'Nr '+i,Tekst:'Test',Tonen:'Ja'}))),/50/);
});
test('Excel zonder Tekst-kolom wordt geweigerd',async()=>{
 const wb=new ExcelJS.Workbook(),ws=wb.addWorksheet('Berichten');
 ws.addRow(['Titel','Seconden']);ws.addRow(['Test',30]);
 await assert.rejects(readXlsx(Buffer.from(await wb.xlsx.writeBuffer())),/Tekst/);
});
