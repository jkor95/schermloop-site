'use strict';
const allowedExtensions = new Set(['.png','.jpg','.jpeg','.webp','.gif','.mp4','.webm','.pdf','.pptx']);
function hasCapacity(limit,count){return Number.isInteger(limit)&&Number.isInteger(count)&&limit>count;}
function normEmail(value){return String(value||'').trim().toLowerCase();}
function validTime(value){return typeof value==='string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);}
function sanitizeSchedule(input){
 const x=input && typeof input==='object' ? input : {};
 const days=Array.isArray(x.days)?[...new Set(x.days.map(Number).filter(n=>Number.isInteger(n)&&n>=0&&n<=6))]:[1,2,3,4,5];
 return {enabled:x.enabled===true,days,on:validTime(x.on)?x.on:'07:30',off:validTime(x.off)?x.off:'18:00',clock:x.clock!==false,background:['black','blur','color'].includes(x.background)?x.background:'black',backgroundColor:/^#[0-9A-Fa-f]{6}$/.test(x.backgroundColor||'')?x.backgroundColor:'#172638',tickerEnabled:x.tickerEnabled===true,tickerText:typeof x.tickerText==='string'?x.tickerText.slice(0,500):'',weatherPage:x.weatherPage===true,weatherCorner:x.weatherCorner===true,weatherDuration:Number.isInteger(Number(x.weatherDuration))?Math.min(600,Math.max(5,Number(x.weatherDuration))):20};
}
function isScheduleActive(settings,date=new Date()){
 if(!settings?.enabled)return true;
 const dtf=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Amsterdam',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 const parts=Object.fromEntries(dtf.formatToParts(date).filter(p=>['weekday','hour','minute'].includes(p.type)).map(p=>[p.type,p.value]));
 const day=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(parts.weekday);
 const minutes=Number(parts.hour)*60+Number(parts.minute);
 const conv=x=>Number(x.split(':')[0])*60+Number(x.split(':')[1]);
 const start=conv(settings.on||'07:30'),end=conv(settings.off||'18:00');
 if(start===end)return false;
 if(start<end)return (settings.days||[]).includes(day)&&minutes>=start&&minutes<end;
 const previous=(day+6)%7;
 return ((settings.days||[]).includes(day)&&minutes>=start)||((settings.days||[]).includes(previous)&&minutes<end);
}
module.exports={allowedExtensions,hasCapacity,normEmail,validTime,sanitizeSchedule,isScheduleActive};
