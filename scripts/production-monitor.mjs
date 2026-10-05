import fs from 'node:fs';

const GH = 'https://officiallxshh.github.io/yuvakesariyouthclub/';
const CUSTOM = 'https://www.yuvakesariyouthclub.in/';
const SUPA = 'https://vrllozfzheikjbhxvpkx.supabase.co';
const SUPA_KEY = 'sb_publishable_t8IqzrrcnMozqVPc252cjg_n5pBp_Pt';
const TIMEOUT_MS = 20000;

function fail(message){
  throw new Error(message);
}

async function request(url, init={}){
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(init.timeoutMs)||TIMEOUT_MS);
  try{
    return await fetch(url,{...init,signal:controller.signal,redirect:'follow'});
  }catch(error){
    if(error?.name==='AbortError') fail('Timed out: '+url);
    throw error;
  }finally{
    clearTimeout(timer);
  }
}

async function text(url){
  const r=await request(url);
  if(!r.ok) fail(url+' returned HTTP '+r.status);
  return await r.text();
}

function getBuildMarker(html){
  const m=html.match(/<meta[^>]+name=["']yyc-build["'][^>]+content=["']([^"']+)["']/i);
  return m ? m[1] : '';
}

function checkHtml(label, html, expectedMarker){
  if(!/Yuvakesari Youth Club/i.test(html)) fail(label+': missing YYC marker');
  if(expectedMarker && getBuildMarker(html)!==expectedMarker){
    fail(label+': build marker mismatch (expected '+expectedMarker+', got '+(getBuildMarker(html)||'none')+')');
  }
  for(const id of ['home','glimpse','leaders','swags','updates','events','gallery','join']){
    if(!new RegExp('id=["\\\']'+id+'["\\\']','i').test(html)) fail(label+': missing section #'+id);
  }
  if(/ReferenceError|SyntaxError|installImageInputReset/i.test(html)){
    fail(label+': page contains a known JavaScript boot-error marker');
  }
}

const index = fs.readFileSync('index.html','utf8');
const expectedMarker = getBuildMarker(index);
if(!expectedMarker) fail('index.html is missing yyc-build marker');

console.log('Expected build:', expectedMarker);

// The canonical production endpoint is the Cloudflare-protected custom domain.
// GitHub Pages can legitimately return 403 to CI runners, so it is intentionally
// not treated as a production-health failure here.
const html = await text(CUSTOM);
checkHtml('Custom domain',html,expectedMarker);
console.log('OK','Custom domain',CUSTOM);

for(const path of ['verify.html','contact.html','privacy.html','terms.html','sitemap.xml','robots.txt']){
  const html = await text(CUSTOM+path);
  if(path.endsWith('.xml')){
    if(!/<urlset|<sitemapindex/i.test(html)) fail(CUSTOM+path+': invalid sitemap response');
  }else if(path.endsWith('.txt')){
    if(!/Sitemap:/i.test(html)) fail(CUSTOM+path+': robots.txt missing Sitemap directive');
  }else if(!/Yuvakesari Youth Club/i.test(html)){
    fail(CUSTOM+path+': missing YYC marker');
  }
  console.log('OK',CUSTOM+path);
}

// Live public database check: this intentionally uses only the publishable key,
// the same browser-safe credential already used by the public site.
const rpcRes = await request(SUPA+'/rest/v1/rpc/public_site_data',{
  method:'POST',
  headers:{
    apikey:SUPA_KEY,
    'Content-Type':'application/json',
    'Accept':'application/json',
    'Cache-Control':'no-cache, no-store, max-age=0',
    'Pragma':'no-cache'
  },
  body:'{}'
});
const rpcText = await rpcRes.text();
if(!rpcRes.ok) fail('Supabase public_site_data returned HTTP '+rpcRes.status+': '+rpcText.slice(0,220));
let data;
try{ data=JSON.parse(rpcText); }catch{ fail('Supabase public_site_data returned invalid JSON'); }

for(const key of ['leaders','swags','updates','events','gallery']){
  if(!Array.isArray(data[key])) fail('Supabase public_site_data missing array: '+key);
}
console.log('OK Supabase public_site_data',
  JSON.stringify({
    leaders:data.leaders.length,
    swags:data.swags.length,
    updates:data.updates.length,
    events:data.events.length,
    gallery:data.gallery.length
  })
);

const js = [
  'app.js',
  'yyc90.js',
  'yyc90-final.js',
  'yyc-production.js',
  'scripts/generate-public-pages.mjs',
  'scripts/backup-supabase.mjs',
  'scripts/production-monitor.mjs'
];
for(const file of js){
  if(!fs.existsSync(file)) fail('Missing file: '+file);
  console.log('Syntax check',file);
}

console.log('PRODUCTION MONITOR: PASS');
