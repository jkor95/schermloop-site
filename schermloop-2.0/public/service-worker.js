'use strict';
const CACHE='schermloop2-player-shell-v2';
const ASSETS=['/player','/player.js','/controls.js','/offline-store.js','/weather-view.js','/news-view.js','/styles.css','/weather.css','/news.css'];
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));
 self.skipWaiting();
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('schermloop2-player-shell-')&&key!==CACHE).map(key=>caches.delete(key)))));
 self.clients.claim();
});
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET')return;
 const url=new URL(request.url);
 if(url.origin!==self.location.origin||!ASSETS.includes(url.pathname))return;
 event.respondWith(fetch(request).then(response=>{
  if(response.ok){const duplicate=response.clone();caches.open(CACHE).then(cache=>cache.put(request,duplicate)).catch(()=>{});}
  return response;
 }).catch(async()=> (await caches.match(request))||Response.error()));
});
