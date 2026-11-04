'use strict';
(function(){
 const byId=id=>document.getElementById(id);
 let shownFor=null;
 function hideSecret(){
  byId('excelSyncSecretBox').hidden=true;
  byId('excelSyncEndpoint').value='';
  byId('excelSyncToken').value='';
  shownFor=null;
 }
 async function refresh(){
  hideSecret();
  const panel=byId('excelSyncPanel');
  if(!state.selected||state.me?.user?.role!=='owner'){panel.hidden=true;return;}
  panel.hidden=false;
  const selected=state.selected;
  byId('excelSyncStatus').textContent='Koppeling controleren...';
  const info=await api('/screens/'+selected+'/excel-sync');
  if(selected!==state.selected)return;
  const when=info.last_sync_at?new Date(info.last_sync_at).toLocaleString('nl-NL'):'nog nooit';
  byId('excelSyncStatus').textContent=(info.enabled?'Actief':'Uitgeschakeld')+' · Laatste automatische import: '+when;
  byId('excelSyncDisable').disabled=!info.enabled;
  byId('excelSyncGenerate').textContent=info.enabled?'Sleutel vervangen':'Nieuwe synchronisatiesleutel maken';
 }
 document.addEventListener('DOMContentLoaded',()=>{
  byId('excelSyncGenerate').addEventListener('click',async()=>{
   if(!state.selected)return;
   if(!confirm('Een nieuwe sleutel maken? Een eerder gemaakte koppeling stopt dan direct met werken.'))return;
   const screenId=state.selected;
   try{
    const result=await api('/screens/'+screenId+'/excel-sync',{method:'POST',body:{confirm:true}});
    if(state.selected!==screenId)return;
    byId('excelSyncEndpoint').value=result.endpoint;
    byId('excelSyncToken').value=result.token;
    byId('excelSyncSecretBox').hidden=false;shownFor=screenId;
    byId('excelSyncStatus').textContent='Actief · Koppelgegevens éénmalig beschikbaar';
    byId('excelSyncDisable').disabled=false;
    message('De koppeling is aangemaakt. Bewaar de gegevens op een veilige plaats.');
   }catch(e){message(e.message,true);}
  });
  byId('excelSyncDisable').addEventListener('click',async()=>{
   if(!state.selected||!confirm('Automatische Excel-updates voor dit scherm uitschakelen?'))return;
   try{
    await api('/screens/'+state.selected+'/excel-sync',{method:'DELETE',body:{confirm:true}});
    await refresh();message('Automatische Excel-koppeling uitgeschakeld.');
   }catch(e){message(e.message,true);}
  });
  byId('excelSyncCopy').addEventListener('click',async()=>{
   if(!shownFor||shownFor!==state.selected)return;
   const text='Endpoint: '+byId('excelSyncEndpoint').value+'\nAuthorization: Bearer '+byId('excelSyncToken').value;
   try{await navigator.clipboard.writeText(text);message('Koppelgegevens gekopieerd. Bewaar ze veilig.');}
   catch{message('Kopiëren mislukt; selecteer de gegevens handmatig.',true);}
  });
  byId('excelSyncHide').addEventListener('click',()=>{
   hideSecret();message('Gegevens verborgen. Maak een nieuwe sleutel als je deze kwijt bent.');
  });
 });
 window.SchermLoopExcelSync={refresh,reset:hideSecret};
})();
