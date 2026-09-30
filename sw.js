const CACHE='yyc-v39-stable-runtime';
const SHELL=['./','./index.html','./styles.css','./app.js','./yyc90.js','./yyc90-final.js','./yyc-production.js','./yyc-production.css','./about.html','./verify.html','./contact.html','./privacy.html','./terms.html','./yyc-seo.css','./manifest.webmanifest','./sw.js'];
const STATIC=['./assets/tm-wxriorz.svg','./assets/yyc-lion-favicon.png','./assets/yyc-logo-clean.webp','./assets/yyc-logo.webp','./assets/hero-tulunad.webp','./assets/dharma-daiva.webp','./assets/aati-kalenja.webp','./assets/yakshagana.webp','./assets/social-whatsapp.png','./assets/social-instagram.png','./assets/social-x.png','./assets/social-facebook.png','./assets/yyc-tulunad-food-culture.webp'];

async function cacheOne(cache,url){
  try{
    const r=await fetch(url,{cache:'no-store'});
    if(r.ok) await cache.put(url,r.clone());
  }catch(_){}
}

async function refreshShell(){
  const cache=await caches.open(CACHE);
  await Promise.all(SHELL.concat(STATIC).map(url=>cacheOne(cache,url)));
}

self.addEventListener('install',event=>event.waitUntil((async()=>{
  await refreshShell();
  await self.skipWaiting();
})()));

self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)));
  await self.clients.claim();
})()));

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  const url=new URL(event.request.url);
  if(url.origin!==location.origin) return;

  const path=url.pathname;
  const isShell=event.request.mode==='navigate'
    || SHELL.some(x=>path.endsWith(x.replace('./','/')))
    || path==='/' || path.endsWith('/index.html');

  if(isShell){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE);
      const cached=await cache.match(event.request);

      // Cached shell is returned immediately so repeat visits never wait on the network.
      event.waitUntil(cacheOne(cache,event.request.url));

      if(cached) return cached;

      try{
        const controller=new AbortController();
        const timer=setTimeout(()=>controller.abort(),7000);
        const response=await fetch(event.request,{signal:controller.signal,cache:'no-store'});
        clearTimeout(timer);
        if(response.ok) cache.put(event.request,response.clone()).catch(()=>{});
        return response;
      }catch(_){
        return (await cache.match('./index.html'))||new Response('YYC is temporarily unavailable.',{status:503,headers:{'Content-Type':'text/plain;charset=utf-8'}});
      }
    })());
    return;
  }

  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    const cached=await cache.match(event.request);
    if(cached){
      event.waitUntil(cacheOne(cache,event.request.url));
      return cached;
    }
    try{
      const response=await fetch(event.request);
      if(response.ok) cache.put(event.request,response.clone()).catch(()=>{});
      return response;
    }catch(_){
      return new Response('',{status:504});
    }
  })());
});