'use strict';
const $=id=>document.getElementById(id);
const DEVICE_KEY='schermloop2-device-token';
let deviceToken=localStorage.getItem(DEVICE_KEY)||'';
let screenSessionToken='';
let activeScreen=null,slides=[],pos=0,manual=false,paused=false;
let slideTimeout=null,slideEpoch=0,pairTimer=null,pollTimer=null,lastManualInteraction=0;
let pairing=null;
const assetUrls=new Map();
const timeFormatter=new Intl.DateTimeFormat('nl-NL',{timeZone:'Europe/Amsterdam',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
function showOnly(id){for(const x of ['pairView','showView','disconnected'])$(x).hidden=x!==id;}
function setLabel(text){$('screenLabel').textContent=text||'SchermLoop 2.0';}
async function request(path,options={}){
 const r=await fetch('/api'+path,{method:options.method||'GET',cache:'no-store',headers:{...(options.token?{'Authorization':'Bearer '+options.token}:{}),...(options.body!==undefined?{'Content-Type':'application/json'}:{})},...(options.body!==undefined?{body:JSON.stringify(options.body)}:{})});
 if(options.blob){if(!r.ok)throw Error('Medium kon niet worden opgehaald ('+r.status+')');return r.blob();}
 let data={};try{data=await r.json();}catch{}
 if(!r.ok){const e=Error(data.error||'Serverfout ('+r.status+')');e.status=r.status;throw e;}
 return data;
}
function isScheduleActive(cfg,date=new Date()){
 if(!cfg?.enabled)return true;
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Amsterdam',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).filter(x=>['weekday','hour','minute'].includes(x.type)).map(x=>[x.type,x.value]));
 const day=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(parts.weekday);
 const minute=Number(parts.hour)*60+Number(parts.minute);
 const m=x=>Number((x||'00:00').slice(0,2))*60+Number((x||'00:00').slice(3,5));
 const a=m(cfg.on),b=m(cfg.off),selected=cfg.days||[];
 if(a===b)return false;
 if(a<b)return selected.includes(day)&&minute>=a&&minute<b;
 return (selected.includes(day)&&minute>=a)||(selected.includes((day+6)%7)&&minute<b);
}
function stopTimeout(){if(slideTimeout!==null)clearTimeout(slideTimeout);slideTimeout=null;}
function advance(direction=1){
 if(!slides.length||paused)return;
 pos=(pos+direction+slides.length)%slides.length;
 renderSlide();
}
function userAdvance(direction) {
 if(!activeScreen || !slides.length || paused)return;
 if(!manual){manual=true;$('toggleBtn').textContent='Automatisch';}
 lastManualInteraction=Date.now();
 advance(direction);
}
function jumpTo(index){
 if(!activeScreen || !slides.length || paused)return;
 if(!manual){manual=true;$('toggleBtn').textContent='Automatisch';}
 lastManualInteraction=Date.now();pos=index;renderSlide();
}
function failConnection(message){
 showOnly('disconnected');
 $('connectionMessage').textContent=message||'De speler probeert opnieuw verbinding te maken.';
}
async function createPairing(){
 clearInterval(pairTimer);pairTimer=null;pairing=null;
 showOnly('pairView');
 $('pairCodeDisplay').textContent='…';
 $('pairMessage').textContent='Nieuwe koppelcode aanvragen...';
 try{
  const p=await request('/player/pair/request',{method:'POST',body:{}});
  pairing=p;$('pairCodeDisplay').textContent=p.code;
  $('pairMessage').textContent='Geldig voor 10 minuten. Je kunt deze code gebruiken bij één scherm.';
  pairTimer=setInterval(checkPairing,7000);
  await checkPairing();
 }catch(e){
  $('pairMessage').textContent=e.message+' — probeer later opnieuw.';
  setTimeout(createPairing,20000);
 }
}
async function checkPairing(){
 if(!pairing)return;
 try{
  const r=await request('/player/pair/'+pairing.request_id,{token:pairing.claim_token});
  if(r.status!=='paired')return;
  clearInterval(pairTimer);pairTimer=null;pairing=null;
  deviceToken=r.device_token;screenSessionToken='';localStorage.setItem(DEVICE_KEY,deviceToken);
  await synchronize();
 }catch(e){
  if(e.status===410){clearInterval(pairTimer);pairTimer=null;await createPairing();}
  else $('pairMessage').textContent='Wachten op koppeling... ('+e.message+')';
 }
}
async function getAsset(item){
 if(assetUrls.has(item.id))return assetUrls.get(item.id);
 const blob=await request('/player/media/'+item.id,{token:screenSessionToken,blob:true});
 const url=URL.createObjectURL(blob);assetUrls.set(item.id,url);return url;
}
function clearExpiredAssets(){
 const ids=new Set(slides.map(x=>x.id));
 for(const [id,url] of assetUrls)if(!ids.has(id)){URL.revokeObjectURL(url);assetUrls.delete(id);}
}
function clearSlide(){
 stopTimeout();slideEpoch++;
 $('slide').replaceChildren();
}
async function renderSlide(){
 clearSlide();
 if(paused||!slides.length){
  if(!slides.length&&!paused){$('slide').append(document.createTextNode('Geen dia’s beschikbaar. Voeg inhoud toe in de beheeromgeving.'));}
  return;
 }
 const epoch=slideEpoch,item=slides[pos],slide=$('slide');
 const screenBackground=activeScreen?.settings?.background||'black';
 slide.style.backgroundColor=screenBackground==='color'?(activeScreen.settings.backgroundColor||'#172638'):'#000000';
 const duration=Math.max(2,Math.min(600,Number(item.duration)||10));
 if(item.kind==='text'){
  const p=document.createElement('div');p.className='slide-message';p.textContent=item.text_body||item.title;slide.append(p);
  if(!manual)slideTimeout=setTimeout(()=>advance(1),duration*1000);
  return;
 }
 if(item.kind==='video'||item.kind==='image'){
  try{
   const url=await getAsset(item);
   if(epoch!==slideEpoch)return;
   if(item.kind==='video'){
    const v=document.createElement('video');v.src=url;v.autoplay=true;v.playsInline=true;v.muted=!manual;v.controls=manual;v.preload='auto';
    v.addEventListener('ended',()=>{if(!manual)advance(1);});
    slide.append(v);
    v.play().catch(()=>{v.controls=true;});
    if(!manual)slideTimeout=setTimeout(()=>advance(1),duration*1000);
   }else{
    const img=document.createElement('img');img.src=url;img.alt=item.title||'Dia';
    if(screenBackground==='blur'){const blurred=document.createElement('img');blurred.className='slide-blurred-background';blurred.src=url;blurred.alt='';blurred.setAttribute('aria-hidden','true');slide.append(blurred);}
    img.className='slide-foreground';slide.append(img);
    if(!manual)slideTimeout=setTimeout(()=>advance(1),duration*1000);
   }
  }catch(e){
   if(epoch!==slideEpoch)return;
   const msg=document.createElement('div');msg.className='slide-message';msg.textContent='Dit onderdeel kon niet worden geladen.';slide.append(msg);
   if(!manual)slideTimeout=setTimeout(()=>advance(1),5000);
  }
 }
}
function updateTicker(){
 const settings=activeScreen?.settings||{},label=String(settings.tickerText||'').trim();
 const visible=settings.tickerEnabled===true&&label.length>0&&!paused;
 $('ticker').hidden=!visible;
 const track=$('tickerTrack');
 if(track.textContent!==label){
  track.textContent=label;
  track.style.animationDuration=Math.min(110,Math.max(22,Math.ceil(label.length*0.16+20)))+'s';
 }
}
function clock(){if(!activeScreen)return;$('playClock').hidden=activeScreen.settings?.clock===false;if(!$('playClock').hidden)$('playClock').textContent=timeFormatter.format(new Date());}
function setManual(v){
 manual=!!v;lastManualInteraction=manual?Date.now():0;$('toggleBtn').textContent=manual?'Automatisch':'Handmatig';renderSlide();
}
function applySchedule(){
 if(!activeScreen)return;
 const shouldPause=!isScheduleActive(activeScreen.settings);
 if(paused!==shouldPause){
  paused=shouldPause;$('pauseOverlay').hidden=!paused;
  renderSlide();
 }
 updateTicker();
}
async function synchronize(){
 if(!deviceToken)return createPairing();
 try{
  if(!screenSessionToken){const session=await request('/player/session',{method:'POST',token:deviceToken});screenSessionToken=session.session_token;}
  const r=await request('/player/state',{token:screenSessionToken});
  activeScreen=r.screen;setLabel(activeScreen.name);showOnly('showView');
  const signature=JSON.stringify(r.items);
  const prev=JSON.stringify(slides);
  slides=r.items||[];clearExpiredAssets();
  if(pos>=slides.length)pos=0;
  applySchedule();clock();updateTicker();
  if(signature!==prev&&!paused)renderSlide();
 }catch(e){
  if(e.status===401){deviceToken='';screenSessionToken='';localStorage.removeItem(DEVICE_KEY);activeScreen=null;slides=[];clearSlide();return createPairing();}
  if(activeScreen){setLabel(activeScreen.name+' · Offline');}
  else failConnection('Server niet bereikbaar. We proberen het opnieuw. '+e.message);
 }
}
function fullScreen(){if(!document.fullscreenElement){document.documentElement.requestFullscreen?.().catch(()=>{});}else document.exitFullscreen?.().catch(()=>{});}
document.addEventListener('DOMContentLoaded',async()=>{
 $('prevBtn').addEventListener('click',()=>userAdvance(-1));
 $('nextBtn').addEventListener('click',()=>userAdvance(1));
 $('toggleBtn').addEventListener('click',()=>setManual(!manual));
 $('fullBtn').addEventListener('click',fullScreen);
 document.addEventListener('keydown',e=>{
  const action=window.SchermLoopControls?.identifyKey(e);
  if(!action)return;
  e.preventDefault();
  if(action==='next')userAdvance(1);
  else if(action==='previous')userAdvance(-1);
  else if(action==='first')jumpTo(0);
  else if(action==='last')jumpTo(slides.length-1);
  else if(action==='toggle')setManual(!manual);
  else if(action==='automatic')setManual(false);
 });
 showOnly('pairView');
 if(deviceToken)await synchronize();else await createPairing();
 pollTimer=setInterval(()=>{if(deviceToken)synchronize();},10000);
 setInterval(()=>{clock();applySchedule();if(manual&&window.SchermLoopControls?.shouldResume(lastManualInteraction,Date.now()))setManual(false);},15000);
});
