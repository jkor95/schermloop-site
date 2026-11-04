'use strict';
// Read-only Microsoft Graph adapter. Credentials are supplied by a future
// OAuth connection; this module never stores or logs access tokens.
const {readXlsx}=require('./excel-announcements');
const MAX_BYTES=3*1024*1024;
function validId(value){
 return typeof value==='string'&&value.length>0&&value.length<=256&&/^[A-Za-z0-9._!~-]+$/.test(value);
}
function graphItemUrl(driveId,itemId){
 if(!validId(driveId)||!validId(itemId))throw Error('Ongeldige OneDrive-bestandsidentificatie.');
 return 'https://graph.microsoft.com/v1.0/drives/'+encodeURIComponent(driveId)+'/items/'+encodeURIComponent(itemId)+'/content';
}
async function readLimited(response,limit){
 const length=Number(response.headers?.get?.('content-length')||0);
 if(Number.isFinite(length)&&length>limit)throw Error('OneDrive-Excelbestand is te groot.');
 if(response.body?.getReader){
  const reader=response.body.getReader(),parts=[];let size=0;
  try{
   while(true){
    const {done,value}=await reader.read();
    if(done)break;
    size+=value.byteLength;
    if(size>limit)throw Error('OneDrive-Excelbestand is te groot.');
    parts.push(Buffer.from(value));
   }
  }finally{reader.releaseLock();}
  return Buffer.concat(parts,size);
 }
 const data=Buffer.from(await response.arrayBuffer());
 if(data.length>limit)throw Error('OneDrive-Excelbestand is te groot.');
 return data;
}
async function fetchExcel(driveId,itemId,accessToken,{fetchImpl=fetch,timeoutMs=15000}={}){
 if(typeof accessToken!=='string'||accessToken.length<20)throw Error('Geldige Microsoft-toegang ontbreekt.');
 const url=graphItemUrl(driveId,itemId),controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  const response=await fetchImpl(url,{method:'GET',redirect:'follow',headers:{Authorization:'Bearer '+accessToken,Accept:'application/octet-stream'},signal:controller.signal});
  if(response.status===401||response.status===403)throw Error('Microsoft-verbinding verlopen of onvoldoende bestandsrechten.');
  if(response.status===404)throw Error('Het geselecteerde OneDrive-bestand bestaat niet meer.');
  if(!response.ok)throw Error('Excel downloaden via Microsoft Graph mislukt ('+response.status+').');
  return await readXlsx(await readLimited(response,MAX_BYTES));
 }finally{clearTimeout(timer);}
}
module.exports={graphItemUrl,readLimited,fetchExcel};
