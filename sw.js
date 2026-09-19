const CACHE='yyc-v18-embedded-temple';
const ASSETS=[
  './','./index.html','./styles.css','./app.js',
  './assets/yyc-logo-clean.webp','./assets/yyc-logo.webp','./assets/hero-tulunad.webp',
  './assets/bhoota-kola.webp','./assets/dharma-daiva.webp','./assets/aati-kalenja.webp','./assets/yakshagana.webp','./assets/river-circle.webp','./assets/temple-circle.webp',
  './assets/glimpse-river.webp','./assets/glimpse-temple.webp','./assets/glimpse-hills.webp',
  './assets/subrahmanya-generated.webp',
  './assets/social-whatsapp.png','./assets/social-instagram.png','./assets/social-x.png','./assets/social-facebook.png'
];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()).catch(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(resp=>{
    const copy=resp.clone();caches.open(CACHE).then(c=>c.put(event.request,copy)).catch(()=>{});return resp;
  }).catch(()=>caches.match('./index.html'))));
});
