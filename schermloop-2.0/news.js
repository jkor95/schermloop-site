'use strict';
// Rijksoverheid nieuwsberichten: tekst onder CC0, afbeeldingen NIET overnemen.
const NEWS_URL='https://www.rijksoverheid.nl/api/rss?query='+encodeURIComponent(JSON.stringify({filters:[{field:'content_type',values:['pro:newsDocument'],type:'all'}],resultSearchTerm:'',pageTitle:'Nieuws'}));
let cached=null,expiresAt=0,pending=null;
function entities(text){
 return String(text||'').replace(/&#(x[0-9a-f]+|\d+);/gi,(_,v)=>{
  const n=v[0]?.toLowerCase()==='x'?parseInt(v.slice(1),16):Number(v);
  return Number.isInteger(n)&&n>0&&n<=0x10ffff?String.fromCodePoint(n):'';
 }).replace(/&(?:amp|lt|gt|quot|apos|nbsp);/gi,m=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '}[m.toLowerCase()]||m));
}
function plain(text){
 return entities(String(text||'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi,'$1').replace(/<[^>]*>/g,'')).replace(/\s+/g,' ').trim().slice(0,180);
}
function parseNews(xml){
 if(typeof xml!=='string'||xml.length>2_000_000)throw Error('Onverwachte nieuwsfeed.');
 const result=[];
 const chunks=[...xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)];
 for(const found of chunks){
  const match=/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(found[2]);
  const title=plain(match?.[1]||'');
  if(title&&!result.includes(title))result.push(title);
  if(result.length>=12)break;
 }
 if(!result.length)throw Error('Geen nieuwsberichten ontvangen.');
 return result;
}
async function latestNews({fetchImpl=fetch,clock=Date.now}={}){
 const now=clock();
 if(cached&&now<expiresAt)return {...cached,stale:false};
 if(pending)return pending;
 pending=(async()=>{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  try{
   const r=await fetchImpl(NEWS_URL,{signal:controller.signal,headers:{'Accept':'application/rss+xml, application/xml, text/xml','User-Agent':'SchermLoop2.0/0.1 https://jkworks.nl'}});
   if(!r.ok)throw Error('Nieuwsbron tijdelijk niet bereikbaar.');
   const xml=await r.text();
   cached={source:'Rijksoverheid',license:'CC0 1.0 - tekst, geen afbeeldingen',headlines:parseNews(xml),updatedAt:new Date(now).toISOString()};
   expiresAt=now+30*60*1000;return {...cached,stale:false};
  }catch(e){
   if(cached&&now-Date.parse(cached.updatedAt)<4*60*60*1000)return {...cached,stale:true};
   throw e;
  }finally{clearTimeout(timer);}
 })();
 try{return await pending;}finally{pending=null;}
}
module.exports={NEWS_URL,plain,parseNews,latestNews};
