/* YYC SW RETIRED — no production service-worker caching. */
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  try{
    const keys=await caches.keys();
    await Promise.all(keys.map(k=>caches.delete(k)));
  }catch(_){}
  try{await self.clients.claim();}catch(_){}
  try{await self.registration.unregister();}catch(_){}
})()));
self.addEventListener('fetch',event=>{
  /* Intentionally pass through: GitHub Pages must serve the live files. */
});