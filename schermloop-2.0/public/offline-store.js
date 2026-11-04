'use strict';
(function(scope){
 const NAME='schermloop2-player-cache',VERSION=1,STORE='content';
 let openPromise;
 function database(){
  if(!('indexedDB' in scope))return Promise.reject(Error('Offline-opslag niet ondersteund.'));
  if(!openPromise)openPromise=new Promise((resolve,reject)=>{
   const request=indexedDB.open(NAME,VERSION);
   request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE);};
   request.onsuccess=()=>resolve(request.result);
   request.onerror=()=>reject(request.error||Error('Offline-opslag niet beschikbaar.'));
  }).catch(error=>{openPromise=null;throw error;});
  return openPromise;
 }
 async function operate(mode,key,value){
  const db=await database();
  return new Promise((resolve,reject)=>{
   const transaction=db.transaction(STORE,mode==='get'?'readonly':'readwrite');
   const store=transaction.objectStore(STORE);
   const req=mode==='get'?store.get(key):mode==='put'?store.put(value,key):mode==='delete'?store.delete(key):store.clear();
   req.onsuccess=()=>resolve(req.result);
   req.onerror=()=>reject(req.error||Error('Offline-opslag mislukt.'));
  });
 }
 const api={
  get:key=>operate('get',key),
  put:(key,val)=>operate('put',key,val),
  remove:key=>operate('delete',key),
  clear:()=>operate('clear')
 };
 scope.SchermLoopOffline=api;
})(window);
