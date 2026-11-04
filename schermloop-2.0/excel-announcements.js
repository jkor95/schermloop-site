'use strict';
const ExcelJS=require('exceljs');
function cellText(value){
 if(value==null)return '';
 if(typeof value==='object'){
  if(Array.isArray(value.richText))return value.richText.map(x=>String(x.text||'')).join('');
  if(Object.hasOwn(value,'result'))return cellText(value.result);
  if(Object.hasOwn(value,'text'))return cellText(value.text);
  if(value instanceof Date)return value.toISOString().slice(0,10);
  return '';
 }
 return String(value).replace(/\0/g,'').trim();
}
function parseRows(rows){
 if(!Array.isArray(rows))throw Error('Ongeldige mededelingen.');
 const items=[];
 for(const row of rows){
  if(!row||typeof row!=='object')continue;
  const show=cellText(row.Tonen||'Ja').toLocaleLowerCase('nl');
  if(['nee','no','false','0','off','uit'].includes(show))continue;
  const title=cellText(row.Titel).slice(0,140)||'Mededeling';
  const text=cellText(row.Tekst).slice(0,1800);
  if(!text)continue;
  const num=Number(cellText(row.Seconden));
  const duration=Number.isFinite(num)&&num>0?Math.min(120,Math.max(5,Math.round(num))):20;
  items.push({title,text,duration});
  if(items.length>50)throw Error('Maximaal 50 actieve Excel-mededelingen.');
 }
 return items;
}
async function readXlsx(buffer){
 if(!Buffer.isBuffer(buffer)||buffer.length>3*1024*1024)throw Error('Excelbestand is te groot.');
 const wb=new ExcelJS.Workbook();
 await wb.xlsx.load(buffer);
 const ws=wb.worksheets[0];
 if(!ws)throw Error('Het Excelbestand heeft geen werkblad.');
 const columns={};
 ws.getRow(1).eachCell((cell,i)=>{const key=cellText(cell.value).toLocaleLowerCase('nl');if(key)columns[key]=i;});
 if(!columns.tekst)throw Error('Excel moet een kolom Tekst bevatten.');
 const records=[];
 for(let index=2;index<=Math.min(ws.rowCount,502);index++){
  const row=ws.getRow(index);
  const val=key=>columns[key]?cellText(row.getCell(columns[key]).value):'';
  if(!val('tekst')&&!val('titel'))continue;
  records.push({Titel:val('titel'),Tekst:val('tekst'),Seconden:val('seconden'),Tonen:val('tonen')});
  if(records.length>50)throw Error('Er mogen maximaal 50 Excelregels worden geïmporteerd.');
 }
 if(ws.rowCount>502)throw Error('Het Excelbestand heeft te veel regels.');
 return parseRows(records);
}
module.exports={cellText,parseRows,readXlsx};
