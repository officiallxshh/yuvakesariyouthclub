/* YYC SW RETIRED — service worker disabled for production stability. */
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.map(k=>caches.delete(k)));
  const regs=await self.registration;
  await self.clients.claim();
  await regs.unregister();
})()));
self.addEventListener('fetch',event=>{
  /* No caching layer: let the browser request the live GitHub Pages resource. */
  return;
});
