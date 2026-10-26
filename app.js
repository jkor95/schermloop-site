const REPO='jkor95/schermloop-private',API='https://api.github.com/repos/'+REPO+'/contents/',KEY='schermloop-viewer-token';let token='',items=[],objects=new Map(),running=false,sequence=0;const $=id=>document.getElementById(id),admin=document.body.dataset.mode==='admin';const status=s=>{$('status').textContent=s};const encode=p=>p.split('/').map(encodeURIComponent).join('/');async function request(path,method='GET',body){let r=await fetch(API+encode(path),{method,headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store'});if(!r.ok)throw Error('GitHub '+r.status+': '+(r.status===401||r.status===403||r.status===404?'geen toegang of bestand ontbreekt':await r.text()).slice(0,180));return r.json()}async function bytes(path){let r=await request(path);if(!r.content&&r.sha){const res=await fetch('https://api.github.com/repos/'+REPO+'/git/blobs/'+encodeURIComponent(r.sha),{headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token},cache:'no-store'});if(!res.ok)throw Error('GitHub-bestand niet bereikbaar: '+res.status);r=await res.json()}if(!r.content||r.encoding!=='base64')throw Error('GitHub levert geen inhoud voor '+path);const raw=atob(r.content.replace(/\s/g,''));const b=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)b[i]=raw.charCodeAt(i);return new Blob([b])}async function json(path){return JSON.parse(await(await bytes(path)).text())}const VAULT='schermloop-vault-'+(admin?'admin':'viewer');const OLDKEY='schermloop-viewer-token';localStorage.removeItem(OLDKEY);
function say(s){status(s)}
async function derive(pass,salt){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(pass),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:250000,hash:'SHA-256'},key,{name:'AES-GCM',length:256},false,['encrypt','decrypt'])}
function b64(bytes){return btoa(String.fromCharCode(...bytes))}
function un64(v){return Uint8Array.from(atob(v),x=>x.charCodeAt(0))}
async function storePassword(pass,githubToken){const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12)),key=await derive(pass,salt),cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(githubToken)));localStorage.setItem(VAULT,JSON.stringify({salt:b64(salt),iv:b64(iv),cipher:b64(cipher)}))}
async function unlockPassword(pass){let v=JSON.parse(localStorage.getItem(VAULT));try{let key=await derive(pass,un64(v.salt)),plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:un64(v.iv)},key,un64(v.cipher));return new TextDecoder().decode(plain)}catch(e){throw Error('Onjuist wachtwoord')}}
function buildLogin(){const login=$('login'),row=$('token').parentElement,field=$('token');let vault=localStorage.getItem(VAULT);if(vault){login.querySelector('h2').textContent=admin?'Beheerder aanmelden':'Presentatiescherm aanmelden';login.querySelector('.muted').textContent='Voer het persoonlijke SchermLoop-wachtwoord van dit apparaat in.';field.placeholder='SchermLoop wachtwoord';$('connect').textContent='Inloggen';const btn=document.createElement('button');btn.textContent='Opnieuw koppelen met GitHub-code';btn.onclick=()=>{localStorage.removeItem(VAULT);location.reload()};row.after(btn);$('connect').onclick=async()=>{try{let t=await unlockPassword(field.value);field.value='';await connect(t)}catch(e){say(e.message)}}}else{login.querySelector('.muted').textContent='Eenmalig: vul de GitHub-code in en kies een eigen SchermLoop-wachtwoord . De code wordt versleuteld opgeslagen op dit apparaat.';const pass=document.createElement('input');pass.type='password';pass.placeholder='Kies je SchermLoop wachtwoord ';pass.autocomplete='new-password';pass.id='newpassword';row.after(pass);const hint=document.createElement('p');hint.className='muted';hint.textContent='Dit wachtwoord geldt alleen op dit apparaat. Op de vaste schermcomputer maak je een ander wachtwoord aan.';pass.after(hint);$('connect').onclick=async()=>{try{const t=field.value.trim(),p=pass.value;await connect(t);await storePassword(p,t);field.value='';pass.value='';say('Dit apparaat is gekoppeld. Volgende keer kun je inloggen met je wachtwoord.')}catch(e){say(e.message)}}}}
$('token').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('connect').click()}});
const to64=async file=>{try{return await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(reader.error||new Error('Bestand kon niet gelezen worden'));reader.onload=()=>{const result=String(reader.result||'');const part=result.split(',')[1];part?resolve(part):reject(new Error('Bestand is leeg of onleesbaar'))};reader.readAsDataURL(file)})}catch(e){throw new Error('Bestand kan niet vanaf dit apparaat gelezen worden ('+(e.message||e)+'). Bewaar het eerst lokaal (bijvoorbeeld Downloads) en selecteer het opnieuw.')}};async function write(path,content){let sha;try{sha=(await request(path)).sha}catch(e){if(!String(e).includes('404'))throw e}return request(path,'PUT',{message:'SchermLoop: '+path,content, ...(sha?{sha}:{})})}const writeJson=(path,data)=>write(path,btoa(unescape(encodeURIComponent(JSON.stringify(data,null,2)))));async function connect(t){token=t.trim();if(!token)throw Error('Vul een token in');await request('data/playlist.json');$('login').hidden=true;$('workspace').hidden=false;if(admin){await loadAdmin()}else{await loadPlaylist();await pollLive();setInterval(refresh,60000);setInterval(pollLive,180000)}}
let bulletinSlides=[],bulletinLoadError='';
function splitBulletWords(text,limit){const words=String(text||'').trim().split(/\s+/).filter(Boolean);const parts=[];let line='';for(const raw of words){let word=raw;while(word.length>limit){if(line){parts.push(line);line=''}parts.push(word.slice(0,limit));word=word.slice(limit)}if(!word)continue;if(line&&line.length+word.length+1>limit){parts.push(line);line=''}line+=(line?' ':'')+word}if(line)parts.push(line);return parts}
function wrapBulletin(text,maxLength=650){const lines=String(text??'').replace(/\r\n?/g,'\n').split('\n').map(line=>line.trim()).filter(Boolean);if(!lines.length)return [{body:'',points:null}];if(lines.length===1)return splitBulletWords(lines[0],maxLength).map(body=>({body,points:null}));const points=lines.flatMap(line=>splitBulletWords(line.replace(/^(?:[•●▪◦]\s*|[-*]\s+|\d+[.)]\s+)/,'').trim(),260));const pages=[];let group=[],count=0,rows=0;for(const point of points){const needed=Math.max(1,Math.ceil((point.length+2)/56));if(group.length&&(group.length>=8||count+point.length>maxLength||rows+needed>10)){pages.push({body:'',points:group});group=[];count=0;rows=0}group.push(point);count+=point.length;rows+=needed}if(group.length)pages.push({body:'',points:group});return pages}
async function loadBulletins(){try{const data=await json('data/mededelingen.json');const result=[];for(const [i,entry] of (Array.isArray(data.items)?data.items:[]).entries()){const pieces=wrapBulletin(entry.text);pieces.forEach((part,index)=>result.push({type:'live-bulletin',path:'live:bulletin:'+i+':'+index,title:String(entry.title||'Mededeling'),body:part.body,points:part.points,part:index+1,parts:pieces.length,duration:Number(entry.duration)||20}))}bulletinSlides=result;bulletinLoadError=''}catch(e){bulletinLoadError='Excel-mededelingen konden niet worden opgehaald: '+e.message;console.warn(bulletinLoadError,e)}}
let liveSettings={news:{enabled:true,duration:25,mode:'pages',speed:80},weather:{enabled:true,duration:20},cornerWeather:true,place:'Dordrecht'},liveSnapshot=null;
async function loadLiveSettings(){try{let v=await json('data/live-settings.json');liveSettings={...liveSettings,...v,news:{...liveSettings.news,...v.news},weather:{...liveSettings.weather,...v.weather}}}catch(e){console.warn('Live instellingen niet bereikbaar',e)}}
function addLiveSlides(slides){let all=[...slides,...bulletinSlides];if(liveSettings.news.enabled&&liveSettings.news.mode!=='ticker'){for(let page=0;page<3;page++)all.push({type:'live-news',newsPage:page,duration:liveSettings.news.duration||25,path:'live:news:'+page})}if(liveSettings.weather.enabled)all.push({type:'live-weather',duration:liveSettings.weather.duration||20,path:'live:weather'});return all}

let tickerSignature='';
function tickerIsSelected(){return !!liveSettings.news.enabled&&liveSettings.news.mode==='ticker'}
function newsTickerSpeed(){return Math.max(30,Math.min(180,Number(liveSettings.news.speed)||80))}
function updateTickerTiming(){
  const ticker=$('news-ticker'),track=$('news-ticker-track');
  if(!ticker||ticker.hidden||!track?.firstElementChild)return;
  const length=track.firstElementChild.getBoundingClientRect().width;
  if(length>0)track.style.animationDuration=Math.max(8,length/newsTickerSpeed()).toFixed(2)+'s'
}
function updateTicker(){
  const ticker=$('news-ticker'),screen=$('screen'),track=$('news-ticker-track');
  if(!ticker||!screen||!track)return;
  const visible=running&&tickerIsSelected();
  ticker.hidden=!visible;
  screen.classList.toggle('with-news-ticker',visible);
  if(!visible){tickerSignature='';return}
  const titles=(liveSnapshot?.news?.headlines||[]).map(e=>String(e.title||'').trim()).filter(Boolean).slice(0,7);
  if(!titles.length)titles.push('Het laatste nieuws wordt opgehaald');
  const signature=JSON.stringify(titles);
  if(signature!==tickerSignature){
    track.replaceChildren();
    for(let copy=0;copy<2;copy++){
      const group=document.createElement('div');
      group.className='news-ticker-copy';
      if(copy===1)group.setAttribute('aria-hidden','true');
      for(const title of titles){
        const text=document.createElement('span');
        text.className='news-ticker-headline';
        text.textContent=title;group.append(text)
      }
      track.append(group)
    }
    tickerSignature=signature
  }
  requestAnimationFrame(updateTickerTiming)
}
function currentRainPoints(weather){
  const stamp=Date.parse(weather?.rainUpdatedAt||'');
  if(!Number.isFinite(stamp)||stamp>Date.now()+60000||Date.now()-stamp>35*60000)return [];
  const points=Array.isArray(weather?.rain)?weather.rain:[];
  const elapsed=Math.max(0,Math.floor((Date.now()-stamp)/300000));
  return points.slice(Math.min(elapsed,points.length))
}
function rainDescription(rain){if(!Array.isArray(rain)||!rain.length)return 'Regenverwachting tijdelijk niet beschikbaar';const peak=Math.max(0,...rain.map(point=>Math.max(0,Number(point.mmHour)||0)));if(peak<0.1)return 'Voorlopig geen regen verwacht';if(peak>=10)return 'Zware regen verwacht';if(peak>=2.5)return 'Matige regen verwacht';return 'Lichte regen verwacht'}
function updateWeatherCorner(){let el=$('weather-corner');if(!el)return;el.hidden=!liveSettings.cornerWeather;if(el.hidden)return;const w=liveSnapshot?.weather||{};el.replaceChildren();let title=document.createElement('b');title.textContent='Dordrecht · Buienradar';let current=document.createElement('div');current.textContent=w.temperature==null?'Weer wordt bijgewerkt':Math.round(Number(w.temperature))+' °C · '+(w.description||'Actueel weer');let rain=document.createElement('small');rain.textContent=rainDescription(currentRainPoints(w));el.append(title,current,rain)}
async function getDirectRain(){
  const endpoint='https://gpsgadget.buienradar.nl/data/raintext/?lat=51.79103&lon=4.68571';
  const response=await fetch(endpoint,{mode:'cors',cache:'no-store',signal:AbortSignal.timeout(3500)});
  if(!response.ok)throw Error('Regenbron HTTP '+response.status);
  const raw=await response.text(),points=[];
  for(const line of raw.split(/\r?\n/)){
    const m=line.trim().match(/^(\d{1,3})\|(\d{2}:\d{2})$/);
    if(!m)continue;
    const amount=Math.min(255,Math.max(0,Number(m[1])));
    const mmHour=amount?Math.round(100*10**((amount-109)/32))/100:0;
    points.push({time:m[2],mmHour})
  }
  if(points.length<10)throw Error('Neerslaggegevens ontbreken');
  const [hour,minute]=points[0].time.split(':').map(Number);
  const first=new Date();first.setHours(hour,minute,0,0);
  const diff=first.getTime()-Date.now();
  if(diff>12*3600000)first.setDate(first.getDate()-1);
  if(diff< -12*3600000)first.setDate(first.getDate()+1);
  if(Math.abs(first.getTime()-Date.now())>20*60000)throw Error('Directe regenbron heeft oude tijden');
  const elapsedSlots=Math.max(0,Math.floor((Date.now()-first.getTime())/300000));
  return {rain:points.slice(Math.min(elapsedSlots,points.length-2),26),rainUpdatedAt:new Date().toISOString()}
}
let lastLivePoll=0;
async function pollLive(){try{lastLivePoll=Date.now();const previousRainVersion=liveSnapshot?.weather?.rainUpdatedAt;const url='https://api.github.com/repos/jkor95/schermloop-site/contents/live-data.json?ref=main&refresh='+Date.now();const res=await fetch(url,{headers:{Accept:'application/vnd.github+json'},cache:'no-store'});if(!res.ok)throw Error('GitHub HTTP '+res.status);const record=await res.json();const raw=atob((record.content||'').replace(/\s/g,''));liveSnapshot=JSON.parse(decodeURIComponent(escape(raw)));try{const direct=await getDirectRain();liveSnapshot.weather={...(liveSnapshot.weather||{}),...direct}}catch(_){/* GitHub Actions blijft de fallback wanneer de directe bron niet beschikbaar is. */}updateWeatherCorner();updateTicker();if(running&&!admin&&previousRainVersion!==liveSnapshot?.weather?.rainUpdatedAt){const stage=$('stage');if(stage?.querySelector('.weather-page')){stage.replaceChildren();renderLiveSlide(stage,'live-weather',{})}}}catch(e){console.warn('Live gegevens kunnen niet worden bijgewerkt',e)}}
function liveHeading(host,title,subtitle){const header=document.createElement('div');header.className='live-title';const h=document.createElement('h2');h.textContent=title;const sub=document.createElement('p');sub.textContent=subtitle;header.append(h,sub);host.append(header)}

function rainLevel(mm){if(mm>=10)return 'heavy';if(mm>=2.5)return 'moderate';if(mm>=0.1)return 'light';return 'dry'}
function svgRain(tag,attributes,text){const el=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [key,value] of Object.entries(attributes||{}))el.setAttribute(key,String(value));if(text!==undefined)el.textContent=text;return el}
function rainForecastLine(host,points){
  const samples=Array.isArray(points)?points.slice(0,25).filter(p=>Number.isFinite(Number(p.mmHour))):[];
  if(samples.length<2){host.textContent='Regenverwachting tijdelijk niet beschikbaar';return}
  const values=samples.map(p=>Math.max(0,Number(p.mmHour)||0));
  const left=14,right=644,labelX=661,top=15,bottom=210;
  const bandHeight=(bottom-top)/3,span=right-left;
  const svg=svgRain('svg',{viewBox:'0 0 740 255',role:'img','aria-label':'Regenverwachting '+samples[0].time+' tot '+samples[samples.length-1].time+' met de niveaus licht, matig en zwaar'});
  const x=i=>left+(i/(samples.length-1))*span;
  // Vertaal mm/uur vloeiend naar drie vaste gebieden, zonder een numerieke as.
  // Licht: 0,1-2,5; matig: 2,5-10; zwaar: 10 mm/uur en meer.
  function y(mm){
    const v=Math.max(0,Number(mm)||0);
    if(v<0.1)return bottom;
    if(v<2.5)return bottom-bandHeight*(0.10+0.90*Math.sqrt((v-0.1)/2.4));
    if(v<10)return bottom-bandHeight*(1+(v-2.5)/7.5);
    return bottom-bandHeight*(2+Math.min(1,(v-10)/30));
  }
  for(const [level,label,className] of [
    [0,'Zwaar','heavy'],[1,'Matig','moderate'],[2,'Licht','light']
  ]){
    const bandTop=top+level*bandHeight;
    svg.append(svgRain('rect',{x:left,y:bandTop,width:span,height:bandHeight,class:'rain-band-bg-'+className}));
    if(level>0)svg.append(svgRain('line',{x1:left,x2:right,y1:bandTop,y2:bandTop,class:'rain-band-divider'}));
    svg.append(svgRain('text',{x:labelX,y:bandTop+bandHeight/2+7,class:'rain-band-label'},label))
  }
  svg.append(svgRain('line',{x1:left,x2:right,y1:bottom,y2:bottom,class:'rain-band-baseline'}));
  const linePath=values.map((v,i)=>(i?'L':'M')+x(i).toFixed(1)+' '+y(v).toFixed(1)).join(' ');
  svg.append(svgRain('path',{d:linePath+' L'+right+' '+bottom+' L'+left+' '+bottom+' Z',class:'rain-chart-area'}));
  for(let i=1;i<samples.length;i++){
    const level=rainLevel(Math.max(values[i-1],values[i]));
    svg.append(svgRain('line',{x1:x(i-1),y1:y(values[i-1]),x2:x(i),y2:y(values[i]),class:'rain-segment rain-'+level}))
  }
  for(let i=0;i<samples.length;i++){
    if(i%6!==0&&i!==samples.length-1)continue;
    svg.append(svgRain('text',{x:x(i),y:240,'text-anchor':i===0?'start':i===samples.length-1?'end':'middle',class:'rain-axis-label'},samples[i].time))
  }
  host.append(svg)
}
function makeWeatherPage(page,w){
  page.classList.add('weather-page');
  liveHeading(page,'Weer & regenverwachting','Dordrecht · neerslag komende 2 uur');
  const conditions=document.createElement('div');conditions.className='live-conditions weather-current';
  const temperature=document.createElement('strong');temperature.textContent=w.temperature==null?'-- °C':Math.round(Number(w.temperature))+' °C';
  const summary=document.createElement('div');
  const description=document.createElement('h3');description.textContent=w.description||'Actueel weer wordt bijgewerkt';
  const next=document.createElement('p');next.textContent=rainDescription(currentRainPoints(w));
  summary.append(description,next);conditions.append(temperature,summary);page.append(conditions);
  const layout=document.createElement('div');layout.className='weather-dashboard';
  const forecast=document.createElement('section');forecast.className='weather-panel weather-forecast';
  const h=document.createElement('h3');h.textContent='Regenverwachting Dordrecht';
  const sub=document.createElement('p');sub.className='weather-panel-sub';sub.textContent='Neerslag in drie niveaus · komende twee uur';
  const chart=document.createElement('div');chart.className='weather-chart';
  rainForecastLine(chart,currentRainPoints(w));
  forecast.append(h,sub,chart);
  const radar=document.createElement('section');radar.className='weather-panel weather-radar';
  const map=document.createElement('div');map.className='radar-map buienradar-map';
  const iframe=document.createElement('iframe');iframe.className='buienradar-iframe';
  iframe.src='https://gadgets.buienradar.nl/gadget/zoommap/?lat=51.79171&lng=4.68655&overname=2&zoom=8&naam=3318an&size=3&voor=1';
  iframe.width='550';iframe.height='512';iframe.loading='eager';iframe.scrolling='no';
  iframe.title='Buienradar live regenradar en verwachting boven Dordrecht';
  iframe.referrerPolicy='strict-origin-when-cross-origin';
  const loader=document.createElement('div');loader.className='buienradar-loading';loader.textContent='Regenradar wordt geladen…';
  iframe.addEventListener('load',()=>{loader.hidden=true});
  map.append(iframe,loader);
  radar.append(map);layout.append(forecast,radar);page.append(layout);
  function scaleRadar(){
    if(!map.isConnected)return;
    const width=radar.clientWidth,height=radar.clientHeight;
    if(width<20||height<20)return;
    const scale=Math.min(width/550,height/512);
    map.style.width=Math.floor(550*scale)+'px';
    map.style.height=Math.floor(512*scale)+'px';
    iframe.style.setProperty('--radar-scale',String(scale));
  }
  if(typeof ResizeObserver!=='undefined'){
    const observer=new ResizeObserver(()=>{if(!map.isConnected){observer.disconnect();return}scaleRadar()});
    observer.observe(radar)
  }else window.addEventListener('resize',scaleRadar,{passive:true});
  requestAnimationFrame(scaleRadar);
}


function renderLiveSlide(stage,type,slide){const page=document.createElement('div');page.className='live-slide';stage.append(page);if(type==='live-bulletin'){liveHeading(page,slide.title,'Mededelingen'+(slide.parts>1?' · Deel '+slide.part+' van '+slide.parts:''));const body=document.createElement('div');body.className='live-bulletin-body';if(Array.isArray(slide.points)&&slide.points.length){body.classList.add('has-points');const list=document.createElement('ul');list.className='live-bulletin-points';if(slide.points.length>4)list.classList.add('dense');for(const point of slide.points){const line=document.createElement('li');line.textContent=point;list.append(line)}body.append(list)}else{body.textContent=slide.body}page.append(body);const foot=document.createElement('p');foot.className='live-foot';foot.textContent='Actuele mededelingen';page.append(foot);return}if(type==='live-news'){const n=liveSnapshot?.news||{};const pageNumber=Number(slide.newsPage)||0;liveHeading(page,'Nieuws van NU.nl','Pagina '+(pageNumber+1)+' van 3 · automatisch bijgewerkt');const list=document.createElement('div');list.className='live-story-list';const entries=(n.headlines||[]).slice(pageNumber*2,pageNumber*2+2);entries.forEach(entry=>{const story=document.createElement('article');story.className='live-story';const body=document.createElement('div');body.className='live-story-body';const h=document.createElement('h3');h.textContent=entry.title;body.append(h);if(entry.summary){const summary=document.createElement('p');summary.textContent=entry.summary;body.append(summary)}const source=document.createElement('small');source.textContent='NU.nl';body.append(source);if(entry.imageUrl&&/^https:\/\//.test(entry.imageUrl)){const img=document.createElement('img');img.src=entry.imageUrl;img.alt='Nieuwsbeeld bij '+entry.title;img.referrerPolicy='no-referrer';img.loading='eager';story.append(img)}story.append(body);list.append(story)});if(!entries.length){const empty=document.createElement('p');empty.textContent='Het laatste nieuws wordt opgehaald.';list.append(empty)}page.append(list);const foot=document.createElement('p');foot.className='live-foot';foot.textContent='Bron: NU.nl'+(n.updatedAt?' · Bijgewerkt '+new Date(n.updatedAt).toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'}):'');page.append(foot);return}
const w=liveSnapshot?.weather||{};makeWeatherPage(page,w)}
async function loadPlaylist(){try{const incoming=await json('data/runtime.json');await loadLiveSettings();await loadBulletins();items=addLiveSlides(Array.isArray(incoming.slides)?incoming.slides:[]);$('info').textContent=items.length+' onderdelen beschikbaar, waaronder '+bulletinSlides.length+' Excel-mededeling(en). Klik op Start presentatie.'+(bulletinLoadError?' '+bulletinLoadError:'')}catch(e){$('info').textContent='Afspeellijst niet geladen: '+e.message}}async function refresh(){if(!running)return;try{const incoming=await json('data/runtime.json');if(Array.isArray(incoming.slides)){await loadLiveSettings();await loadBulletins();updateWeatherCorner();updateTicker();const next=addLiveSlides(incoming.slides);if(bulletinLoadError)$('info').textContent=bulletinLoadError;const old=JSON.stringify(items),fresh=JSON.stringify(next);if(old!==fresh){items=next;sequence++;playLoop()}}}catch(e){$('info').textContent='Verbinding tijdelijk verbroken: '+e.message}}async function asset(path){if(objects.has(path))return objects.get(path);const ext=path.toLowerCase().split('.').pop();const mime={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif',mp4:'video/mp4',webm:'video/webm'}[ext]||'application/octet-stream';let url=URL.createObjectURL(new Blob([await bytes(path)],{type:mime}));objects.set(path,url);return url}async function playLoop(){const my=++sequence;const screen=$('screen'),stage=$('stage');screen.style.display='flex';while(running&&my===sequence){if(!items.length){stage.textContent='Geen presentatie ingesteld';await new Promise(r=>setTimeout(r,3000));await refresh();continue}for(const slide of items){if(!running||my!==sequence)break;if(!slide.path)continue;try{if(slide.type==='live-news'||slide.type==='live-weather'||slide.type==='live-bulletin'){if(slide.type==='live-weather'&&Date.now()-lastLivePoll>120000)await pollLive();stage.replaceChildren();renderLiveSlide(stage,slide.type,slide);await new Promise(r=>setTimeout(r,Math.max(5,Number(slide.duration)||20)*1000));continue}let url=await asset(slide.path);stage.replaceChildren();let video=/\.(mp4|webm)$/i.test(slide.path),el=document.createElement(video?'video':'img');el.src=url;stage.appendChild(el);if(video){el.muted=true;el.autoplay=true;el.playsInline=true;await new Promise(resolve=>{let timeout=setTimeout(resolve,600000);el.onended=el.onerror=()=>{clearTimeout(timeout);resolve()};el.play().catch(e=>{$('info').textContent='Video kan niet starten: '+e.message;resolve()})})}else await new Promise(r=>setTimeout(r,Math.max(2,Number(slide.duration)||10)*1000))}catch(e){$('info').textContent=e.message;await new Promise(r=>setTimeout(r,2000))}}}}function updateNewsModeControls(){
  if(!admin)return;
  const enabled=$('live-news').checked,ticker=$('news-mode').value==='ticker';
  $('news-mode').disabled=!enabled;
  $('news-duration-row').hidden=!enabled||ticker;
  $('news-speed-row').hidden=!enabled||!ticker;
  $('news-speed-label').textContent=String($('news-speed').value)+' px/s'
}
async function loadAdmin(){let data=await json('data/playlist.json');items=Array.isArray(data.items)?data.items:[];await loadLiveSettings();if($('live-news')){$('live-news').checked=!!liveSettings.news.enabled;$('news-duration').value=liveSettings.news.duration||25;$('news-mode').value=liveSettings.news.mode==='ticker'?'ticker':'pages';$('news-speed').value=newsTickerSpeed();updateNewsModeControls();$('live-weather').checked=!!liveSettings.weather.enabled;$('weather-duration').value=liveSettings.weather.duration||20;$('corner-weather').checked=!!liveSettings.cornerWeather}render()}function render(){
  const root=$('items');root.replaceChildren();
  items.forEach((item,i)=>{
    const li=document.createElement('li');
    li.className='playlist-item'+(item.enabled===false?' playlist-item-off':'');
    const label=document.createElement('span');
    label.className='playlist-item-title';label.textContent=item.name||item.path;
    li.append(label);
    const toggleLabel=document.createElement('label');toggleLabel.className='playlist-item-toggle';
    const checkbox=document.createElement('input');checkbox.type='checkbox';
    checkbox.checked=item.enabled!==false;
    checkbox.setAttribute('aria-label','Tonen: '+(item.name||item.path));
    const caption=document.createElement('span');caption.textContent=checkbox.checked?'Aan':'Uit';
    checkbox.onchange=()=>{
      item.enabled=checkbox.checked;
      render();
      status((checkbox.checked?'Ingeschakeld: ':'Uitgeschakeld: ')+(item.name||item.path)+'. Klik op Opslaan om dit door te voeren.')
    };
    toggleLabel.append(checkbox,caption);li.append(toggleLabel);
    const buttons=[['↑',()=>move(i,-1)],['↓',()=>move(i,1)],['Verwijder',()=>{items.splice(i,1);render()}]];
    if(item.type!=='video')buttons.unshift(['Tijd '+(item.duration||10)+'s',()=>{
      let n=prompt('Weergavetijd in seconden (2–600)',item.duration||10);
      if(n!==null&&+n>=2&&+n<=600){item.duration=+n;render()}
    }]);
    if(item.type==='pptx')buttons.unshift(['Dia-tijden en zichtbaarheid',()=>pptxTimes(item,li)]);
    for(const [name,fn] of buttons){
      const b=document.createElement('button');b.textContent=name;b.onclick=fn;li.append(b)
    }
    root.append(li)
  })
}
async function pptxTimes(item,li){
  let section=li.querySelector('.pptx-times');
  if(section){section.remove();return}
  section=document.createElement('div');section.className='pptx-times';
  section.textContent='Dia’s ophalen…';li.append(section);
  try{
    const name=item.path.split('/').pop().replace(/\.[^.]+$/,'').replace(/[^A-Za-z0-9_-]/g,'_');
    const entries=await request('media/derived/'+name);
    const slides=entries.filter(x=>/^dia-\d+\.png$/i.test(x.name)).sort((a,b)=>Number(a.name.match(/\d+/)[0])-Number(b.name.match(/\d+/)[0]));
    section.replaceChildren();
    if(!slides.length){section.textContent='De dia’s worden nog verwerkt. Probeer het straks opnieuw.';return}
    item.slideDurations??={};item.slideEnabled??={};
    for(const slide of slides){
      const n=String(Number(slide.name.match(/\d+/)[0]));
      const row=document.createElement('label');row.className='pptx-slide-option';
      const toggle=document.createElement('input');toggle.type='checkbox';toggle.checked=item.slideEnabled[n]!==false;
      toggle.setAttribute('aria-label','Dia '+n+' tonen');
      const nameLabel=document.createElement('span');nameLabel.textContent='Dia '+n;
      const input=document.createElement('input');input.type='number';input.min='2';input.max='600';
      input.value=item.slideDurations[n]??item.duration??10;input.className='pptx-seconds';input.disabled=!toggle.checked;
      toggle.onchange=()=>{
        item.slideEnabled[n]=toggle.checked;input.disabled=!toggle.checked;
        row.classList.toggle('pptx-slide-off',!toggle.checked);
        status('Zichtbaarheid van dia '+n+' gewijzigd. Klik op Opslaan om dit door te voeren.')
      };
      input.onchange=()=>{
        const value=Number(input.value);
        if(value>=2&&value<=600){item.slideDurations[n]=value;status('Gewijzigd: klik op Volgorde en instellingen opslaan.')}
        else{input.value=item.slideDurations[n]??item.duration??10;status('Gebruik 2 tot 600 seconden.')}
      };
      row.classList.toggle('pptx-slide-off',!toggle.checked);
      row.append(toggle,nameLabel,input,document.createTextNode('sec.'));section.append(row)
    }
    const note=document.createElement('p');note.className='muted';
    note.textContent='Ook uitgeschakelde PowerPoint-dia’s blijven bewaard. Klik op Opslaan om je keuzes door te voeren.';
    section.append(note)
  }catch(e){section.textContent='Dia’s nog niet beschikbaar: '+e.message}
}
function move(i,d){let j=i+d;if(j<0||j>=items.length)return;[items[i],items[j]]=[items[j],items[i]];render()}async function save(){status('Instellingen opslaan…');await writeJson('data/playlist.json',{items});if($('live-news')){liveSettings={news:{enabled:$('live-news').checked,duration:Math.max(5,Math.min(600,Number($('news-duration').value)||25)),mode:$('news-mode').value==='ticker'?'ticker':'pages',speed:Math.max(30,Math.min(180,Number($('news-speed').value)||80))},weather:{enabled:$('live-weather').checked,duration:Math.max(5,Math.min(600,Number($('weather-duration').value)||20))},cornerWeather:$('corner-weather').checked,place:'Dordrecht'};await writeJson('data/live-settings.json',liveSettings)}status('Opgeslagen. Live nieuws en Buienradar verversen automatisch; presentatie-instellingen worden bijgewerkt.')}async function upload(){let f=$('file').files[0];if(!f)throw Error('Kies een bestand');if(f.size>50*1024*1024)throw Error('Maximaal 50 MB');let ext=f.name.split('.').pop().toLowerCase();if(!['jpg','jpeg','png','webp','gif','mp4','webm','mov','pptx'].includes(ext))throw Error('Bestandstype niet ondersteund');status('Bestand lezen en uploaden: '+f.name+' ('+Math.round(f.size/1024)+' KB)…');let path='media/uploads/'+Date.now()+'-'+f.name.replace(/[^a-zA-Z0-9_.-]/g,'_');await write(path,await to64(f));items.push({name:f.name,path,type:ext==='pptx'?'pptx':['mp4','webm','mov'].includes(ext)?'video':'image',duration:Number($('duration').value)||10});render();await save();status(ext==='pptx'?'PowerPoint ontvangen: GitHub Actions moet de dia’s verwerken.':'Bestand toegevoegd en opgeslagen.')}function logout(){running=false;sequence++;localStorage.removeItem(VAULT);token='';location.reload()}buildLogin();$('logout').onclick=logout;if(admin){$('upload').onclick=()=>upload().catch(e=>status(e.message));$('save').onclick=()=>save().catch(e=>status(e.message));$('live-news').onchange=updateNewsModeControls;$('news-mode').onchange=updateNewsModeControls;$('news-speed').oninput=updateNewsModeControls}else{const screen=$('screen');let hideTimer;function controls(){screen.classList.add('show-controls');clearTimeout(hideTimer);hideTimer=setTimeout(()=>screen.classList.remove('show-controls'),3200)}function begin(){if(!running){running=true;playLoop();updateTicker()}controls()}async function full(){begin();try{if(!document.fullscreenElement){if(screen.requestFullscreen)await screen.requestFullscreen();else if(screen.webkitRequestFullscreen)screen.webkitRequestFullscreen();else $('info').textContent='Gebruik F11 in Windows voor volledig scherm.'}else await document.exitFullscreen()}catch(e){$('info').textContent='Volledig scherm niet beschikbaar: '+e.message}}function stop(){running=false;sequence++;updateTicker();screen.style.display='none';$('stage').replaceChildren();if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});$('info').textContent='Presentatie gestopt. Klik op Start presentatie om opnieuw af te spelen.'} $('start').onclick=begin;$('full').onclick=full;$('screen-full').onclick=full;$('screen-stop').onclick=stop;screen.addEventListener('mousemove',controls);screen.addEventListener('touchstart',controls,{passive:true});window.addEventListener('resize',()=>{if(running)requestAnimationFrame(updateTickerTiming)},{passive:true});document.addEventListener('fullscreenchange',()=>{$('screen-full').textContent=document.fullscreenElement?'↙ Volledig scherm sluiten':'⛶ Volledig scherm';controls()});}