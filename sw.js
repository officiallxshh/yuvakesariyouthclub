/* YYC SERVICE WORKER RETIRED · 2026-10-01
   This file intentionally contains no cache strategy.
   Any previously installed YYC worker should remove its caches and unregister. */
self.addEventListener('install',function(event){
  event.waitUntil(Promise.resolve(self.skipWaiting()));
});
self.addEventListener('activate',function(event){
  event.waitUntil((async function(){
    try{
      var keys=await caches.keys();
      await Promise.all((keys||[]).map(function(k){return caches.delete(k);}));
    }catch(_){}
    try{await self.clients.claim();}catch(_){}
    try{await self.registration.unregister();}catch(_){}
  })());
});
self.addEventListener('fetch',function(event){
  event.respondWith(fetch(event.request));
});
