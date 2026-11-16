/* Mon Ciné Tracker — service worker : appli installable + consultable sans réseau */
var V='v15';
var SHELL='shell-'+V, IMG='img-'+V, CIMG='cimg-'+V, API='api-'+V, LIB='lib-'+V;
self.addEventListener('install',function(e){
  e.waitUntil(caches.open(SHELL).then(function(c){return c.addAll(['./','./manifest.webmanifest','./icon-192.png','./icon-512.png']);}).then(function(){return self.skipWaiting();}));
});
self.addEventListener('activate',function(e){
  e.waitUntil(caches.keys().then(function(ks){return Promise.all(ks.filter(function(k){return [SHELL,IMG,CIMG,API,LIB,'cine-notif'].indexOf(k)<0;}).map(function(k){return caches.delete(k);}));}).then(function(){return self.clients.claim();}));
});
function trim(name,max){caches.open(name).then(function(c){c.keys().then(function(ks){if(ks.length>max){for(var i=0;i<ks.length-max;i++)c.delete(ks[i]);}});});}
function networkFirst(req,name,timeout,max,ign){var mo=ign?{ignoreSearch:true}:undefined;
  return new Promise(function(resolve){
    var done=false;
    var t=setTimeout(function(){caches.match(req,mo).then(function(r){if(r&&!done){done=true;resolve(r);}});},timeout);
    fetch(req).then(function(res){
      clearTimeout(t);
      if(res&&res.ok){var cp=res.clone();caches.open(name).then(function(c){c.put(req,cp);if(max)trim(name,max);});}
      if(!done){done=true;resolve(res);}
    }).catch(function(){
      clearTimeout(t);
      caches.match(req,mo).then(function(r){if(!done){done=true;resolve(r||new Response('',{status:504,statusText:'offline'}));}});
    });
  });
}
function cacheFirst(req,name,max){
  return caches.match(req).then(function(r){
    if(r)return r;
    return fetch(req).then(function(res){if(res&&(res.ok||res.type==='opaque')){var cp=res.clone();caches.open(name).then(function(c){c.put(req,cp);trim(name,max);});}return res;});
  });
}
/* images lues par un canvas (couleurs d'affiche, persos…) : requête CORS → jamais de réponse « opaque » du cache */
function corsImg(req){
  return caches.open(CIMG).then(function(c){return c.match(req).then(function(r){
    if(r)return r;
    return fetch(req).then(function(res){if(res&&res.ok&&res.type!=='opaque'){var cp=res.clone();c.put(req,cp);trim(CIMG,260);}return res;});
  });});
}
function swr(req,name){
  return caches.match(req).then(function(r){
    var f=fetch(req).then(function(res){if(res&&(res.ok||res.type==='opaque')){var cp=res.clone();caches.open(name).then(function(c){c.put(req,cp);});}return res;}).catch(function(){return r;});
    return r||f;
  });
}
self.addEventListener('fetch',function(e){
  var req=e.request;if(req.method!=='GET')return;
  var u=new URL(req.url);
  // Jamais de cache pour la connexion / la synchro des comptes
  if(/firestore\.googleapis|identitytoolkit|securetoken|firebaseinstallations|googleapis\.com\/(identity|token)|ntfy\.sh|workers\.dev/.test(u.host+u.pathname))return;
  if(req.mode==='navigate'||(u.origin===location.origin&&/\/(index\.html)?$/.test(u.pathname))){e.respondWith(networkFirst(req,SHELL,4000,0,true));return;}
  if(u.origin===location.origin){e.respondWith(swr(req,SHELL));return;}
  if(u.host==='image.tmdb.org'){if(req.mode==='cors'){e.respondWith(corsImg(req));return;}e.respondWith(cacheFirst(req,IMG,600));return;}
  if(u.host==='api.themoviedb.org'||u.host==='api.tvmaze.com'){e.respondWith(networkFirst(req,API,6000,400));return;}
  if(/gstatic\.com|googleapis\.com|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com/.test(u.host)){e.respondWith(swr(req,LIB));return;}
});

/* ---------- 🔔 notifications : un toucher ouvre l'appli ---------- */
self.addEventListener('notificationclick',function(e){e.notification.close();var url=(e.notification.data&&e.notification.data.url)||'./';
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(function(l){for(var i=0;i<l.length;i++){if('focus' in l[i])return l[i].focus();}return self.clients.openWindow(url);}));});
/* ---------- 🔔 vérification en arrière-plan (Android, appli installée) : actus de ta liste + tops ---------- */
function nnorm(s){return ' '+String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,' ').trim()+' ';}
var NIMP=/renouvel|renew|annul|cancel|date de sortie|release date|bande[- ]annonce|trailer|teaser|saison \d|season \d|premi[eè]res? images|first look|casting|rejoint|joins|officiel|official|confirm/i;
var NPN={netflix:'Netflix',prime:'Prime Video',disney:'Disney+',canal:'Canal+',max:'Max',apple:'Apple TV+',paramount:'Paramount+',tf1:'TF1+',m6:'M6+'};
function bgNotify(){
  return caches.open('cine-notif').then(function(ca){return ca.match('notif-cfg.json').then(function(r){if(!r)return;return r.json().then(function(C){
    if(!C.native&&!C.topic)return;var S=C.sent||{},now=Date.now(),day=new Date().toISOString().slice(0,10),out=[];
    function send(title,body,tag,natOk,ntOk,tags){out.push(Promise.resolve().then(function(){
      var a=(C.native&&natOk)?self.registration.showNotification(title,{body:body,icon:'icon-192.png',badge:'icon-192.png',tag:tag,data:{url:C.site||'./'}}):null;
      var b=(ntOk&&C.topic)?fetch('https://ntfy.sh/'+encodeURIComponent(C.topic)+'?title='+encodeURIComponent(title)+'&tags='+(tags||'clapper')+'&click='+encodeURIComponent(C.site||''),{method:'POST',body:body}).catch(function(){}):null;
      return Promise.all([a,b]);}));}
    var base=(C.site||'./').replace(/[^/]*$/,'');
    return Promise.all([
      (C.news||C.ntNews)?fetch(base+'news.json?bg='+now).then(function(r){return r.ok?r.json():null;}).catch(function(){return null;}):null,
      (C.tops||C.ntTops)?fetch(base+'tops.json?bg='+now).then(function(r){return r.ok?r.json():null;}).catch(function(){return null;}):null
    ]).then(function(a){var N=a[0],J=a[1],n=0;
      if(N)(N.items||[]).filter(function(x){return x.ts>now-20*36e5;}).forEach(function(x){var t=nnorm(x.t+' '+(x.d||'')),hit='';for(var k in C.titles){if(t.indexOf(' '+k+' ')>=0){hit=C.titles[k];break;}}
        if(!hit||!(NIMP.test(x.t)||(x.k||[]).indexOf('officiel')>=0||(x.k||[]).indexOf('ba')>=0))return;var key='nw_'+(x.u||x.t).slice(-120);if(S[key]||n>=4)return;S[key]=now;n++;send('📰 '+hit,x.t,key,C.news,C.ntNews,'newspaper');});
      if(J)Object.keys(J.prov||{}).forEach(function(pl){var P=J.prov[pl];if(pl==='netflix'||!P||P.src!=='jw')return;['tv','films'].forEach(function(cat){(P[cat]||[]).forEach(function(x,i){var key=x.mt+'_'+x.id,title=C.keys[key];if(!title)return;var r=x.r||i+1;
        var kk='tp_'+day+'_'+pl+'_'+key+'_'+(r===1?'1':'in');if(S[kk]||(r!==1&&S['tp_'+day+'_'+pl+'_'+key+'_1'])||n>=6)return;S[kk]=now;n++;
        send(r===1?'👑 '+title+' est n°1':'🏆 '+title+' est dans le top',(r===1?'Numéro 1 aujourd\'hui sur ':'N°'+r+' aujourd\'hui sur ')+(NPN[pl]||pl)+' en France',kk,C.tops,C.ntTops,'trophy');});});});
      C.sent=S;return Promise.all(out).then(function(){return ca.put('notif-cfg.json',new Response(JSON.stringify(C),{headers:{'content-type':'application/json'}}));});
    });});});}).catch(function(){});}
self.addEventListener('periodicsync',function(e){if(e.tag==='cine-notif')e.waitUntil(bgNotify());});
