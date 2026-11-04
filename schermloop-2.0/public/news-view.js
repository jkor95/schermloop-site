'use strict';
(function(scope){
 function e(tag,cls,value){const el=document.createElement(tag);if(cls)el.className=cls;if(value!==undefined)el.textContent=value;return el;}
 function render(into,data){
  into.replaceChildren();
  const page=e('section','news-slide');
  page.append(e('p','news-eyebrow','ACTUELE BERICHTEN'));
  page.append(e('h2','news-heading','Nieuws van de Rijksoverheid'));
  const list=e('div','news-headlines');
  for(const headline of (Array.isArray(data?.headlines)?data.headlines:[]).slice(0,6)){
   const line=e('article','news-headline');
   line.append(e('span','news-dot','•'),e('p','',String(headline).slice(0,180)));
   list.append(line);
  }
  if(!list.children.length)list.append(e('p','news-empty','Nieuws wordt bijgewerkt.'));
  page.append(list);
  page.append(e('p','news-credit',(data?.stale?'Laatst opgeslagen nieuws · ':'')+'Bron: Rijksoverheid · tekst CC0 · Geen officiële steunverklaring'));
  into.append(page);
 }
 scope.SchermLoopNewsView={render};
})(window);
