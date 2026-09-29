import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const SUPA_URL = 'https://vrllozfzheikjbhxvpkx.supabase.co';
const readApp = await fs.readFile(path.join(ROOT, 'app.js'), 'utf8');
const keyMatch = readApp.match(/supabaseKey:\s*'([^']+)'/);
const KEY = keyMatch?.[1];
if (!KEY) throw new Error('Could not read Supabase publishable key from app.js');

async function rpc(name, body = {}) {
  const r = await fetch(SUPA_URL + '/rest/v1/rpc/' + encodeURIComponent(name), {
    method: 'POST',
    headers: { apikey: KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body)
  });
  const t = await r.text();
  let d = null;
  try { d = t ? JSON.parse(t) : null; } catch {}
  if (!r.ok) throw new Error(d?.message || d?.error || 'Supabase RPC failed: ' + r.status);
  return d;
}

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function slug(v) {
  return String(v ?? '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0,90) || 'item';
}
function date(v) {
  return v ? new Date(v + 'T00:00:00').toLocaleDateString('en-IN', {day:'2-digit',month:'short',year:'numeric'}) : '';
}
function structuredData(type, item, image, canonical, title) {
  const org = {'@type':'Organization', name:'Yuvakesari Youth Club', url:'https://www.yuvakesariyouthclub.in/'};
  const plural = type === 'event' ? 'events' : type === 'update' ? 'updates' : type === 'gallery' ? 'gallery' : type === 'leader' ? 'leaders' : type === 'achievement' ? 'achievements' : type;
  const graph = [
    {'@type':'BreadcrumbList','itemListElement':[
      {'@type':'ListItem',position:1,name:'Home',item:'https://www.yuvakesariyouthclub.in/'},
      {'@type':'ListItem',position:2,name:plural[0].toUpperCase()+plural.slice(1),item:'https://www.yuvakesariyouthclub.in/'+plural+'/'},
      {'@type':'ListItem',position:3,name:title,item:canonical}
    ]}
  ];
  if(type==='event') graph.push({'@type':'Event',name:item.title||'',startDate:item.event_date||undefined,location:item.location?{'@type':'Place',name:item.location}:undefined,image:image||undefined,organizer:org});
  if(type==='update') graph.push({'@type':'Article',headline:item.title||'',datePublished:item.published_at||item.created_at||undefined,image:image||undefined,publisher:org});
  if(type==='gallery') graph.push({'@type':'ImageObject',name:item.title||'',caption:item.caption||undefined,contentUrl:image||undefined});
  return '<script type="application/ld+json">'+JSON.stringify({'@context':'https://schema.org','@graph':graph})+'</script>';
}
function page(title, desc, type, item) {
  const rawImage = item.image_url || item.photo_url || item.src || '';
  const image = /^https?:\/\//i.test(String(rawImage)) ? rawImage : '';
  const route = type === 'event' ? 'events' : type === 'update' ? 'updates' : type === 'gallery' ? 'gallery' : type === 'leader' ? 'leaders' : type === 'achievement' ? 'achievements' : type;
  const canonical = 'https://www.yuvakesariyouthclub.in/' + route + '/' + slug(item.slug || item.id || item.title || item.name) + '.html';
  const body = item.body || item.description || item.bio || item.caption || '';
  const structured = structuredData(type, item, image, canonical, title);
  const metaImage = image ? '<meta property="og:image" content="' + esc(image) + '">' : '';
  const html = '<!doctype html><html lang="en"><head>' +
    '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="theme-color" content="#05080b"><meta name="robots" content="index,follow">' +
    '<link rel="canonical" href="' + canonical + '">' +
    '<link rel="icon" type="image/svg+xml" href="../assets/yyc-lion-favicon-redesigned.svg">' +
    '<meta name="description" content="' + esc(desc).slice(0,320) + '">' + metaImage +
    '<meta name="twitter:card" content="summary_large_image">' +
    '<meta name="twitter:title" content="' + esc(title) + ' | Yuvakesari Youth Club">' +
    '<meta name="twitter:description" content="' + esc(desc).slice(0,320) + '">' +
    structured +
    '<title>' + esc(title) + ' | Yuvakesari Youth Club</title>' +
    '<link rel="stylesheet" href="../yyc-seo.css"><script src="../yyc-production.js?v=20260929-r1" defer></script></head><body><main class="wrap">' +
    '<a class="back" href="../index.html">← Back to Yuvakesari Youth Club</a>' +
    '<article class="card"><img class="logo" src="../assets/yyc-logo-clean.webp" alt="Yuvakesari Youth Club logo">' +
    '<div class="k">YUVAKESARI YOUTH CLUB · ' + esc(type.toUpperCase()) + '</div>' +
    '<h1 class="title">' + esc(title) + '</h1>' +
    '<div class="date">' + esc(date(item.event_date || item.achieved_on || (item.created_at || '').slice(0,10))) + '</div>' +
    (image ? '<div class="media"><img src="' + esc(image) + '" alt="' + esc(title) + '"></div>' : '') +
    '<div class="meta">' +
      (item.category ? '<span class="tag">' + esc(item.category) + '</span>' : '') +
      (item.location ? '<span class="tag">' + esc(item.location) + '</span>' : '') +
      (item.album ? '<span class="tag">' + esc(item.album) + '</span>' : '') +
      (item.role ? '<span class="tag">' + esc(item.role) + '</span>' : '') +
    '</div><div class="body">' + esc(body) + '</div>' +
    '<div class="footer"><a href="../index.html#' +
      (type === 'event' ? 'events' : type === 'update' ? 'updates' : type === 'gallery' ? 'gallery' : type === 'leader' ? 'leaders' : type === 'achievement' ? 'impact' : 'glimpse') +
      '">Open on the YYC website →</a></div></article></main></body></html>';
  return html;
}

const site = await rpc('public_site_data');
const feature = await rpc('public_feature_data');
const dirs = {
  event: path.join(ROOT, 'events'),
  update: path.join(ROOT, 'updates'),
  gallery: path.join(ROOT, 'gallery'),
  leader: path.join(ROOT, 'leaders'),
  achievement: path.join(ROOT, 'achievements')
};
for (const d of Object.values(dirs)) {
  await fs.rm(d, {recursive:true,force:true});
  await fs.mkdir(d, {recursive:true});
}

const urls = [
  ['https://www.yuvakesariyouthclub.in/','2026-09-29','weekly'],
  ['https://www.yuvakesariyouthclub.in/about.html','2026-09-29','monthly'],
  ['https://www.yuvakesariyouthclub.in/contact.html','2026-09-29','monthly'],
  ['https://www.yuvakesariyouthclub.in/privacy.html','2026-09-29','monthly'],
  ['https://www.yuvakesariyouthclub.in/terms.html','2026-09-29','monthly']
];

for (const e of site.events || []) {
  const s = slug(e.slug || e.id || e.title);
  await fs.writeFile(path.join(dirs.event, s + '.html'), page(e.title, e.description || ('YYC event: ' + e.title), 'event', e));
  urls.push(['https://www.yuvakesariyouthclub.in/events/' + s + '.html', e.event_date || '2026-09-29', 'weekly']);
}
for (const e of site.updates || []) {
  const s = slug(e.slug || e.id || e.title);
  await fs.writeFile(path.join(dirs.update, s + '.html'), page(e.title, e.body || ('YYC update: ' + e.title), 'update', e));
  urls.push(['https://www.yuvakesariyouthclub.in/updates/' + s + '.html', (e.event_date || e.created_at || '2026-09-29').slice(0,10), 'weekly']);
}
for (const e of site.gallery || []) {
  const s = slug(e.slug || e.id || e.title);
  if (!e.src && !e.image_url) continue;
  await fs.writeFile(path.join(dirs.gallery, s + '.html'), page(e.title, e.caption || ('YYC gallery: ' + e.title), 'gallery', e));
  urls.push(['https://www.yuvakesariyouthclub.in/gallery/' + s + '.html', (e.created_at || '2026-09-29').slice(0,10), 'monthly']);
}
for (const e of site.leaders || []) {
  const s = slug(e.role_number || e.id || e.name);
  await fs.writeFile(path.join(dirs.leader, s + '.html'), page(e.name, 'YYC leader profile: ' + e.name, 'leader', e));
  urls.push(['https://www.yuvakesariyouthclub.in/leaders/' + s + '.html', (e.created_at || '2026-09-29').slice(0,10), 'monthly']);
}
for (const e of feature.achievements || []) {
  const s = slug(e.slug || e.id || e.title);
  await fs.writeFile(path.join(dirs.achievement, s + '.html'), page(e.title, e.description || ('YYC achievement: ' + e.title), 'achievement', e));
  urls.push(['https://www.yuvakesariyouthclub.in/achievements/' + s + '.html', (e.achieved_on || e.created_at || '2026-09-29').slice(0,10), 'monthly']);
}

const unique = [...new Map(urls.map(x => [x[0], x])).values()];
const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  unique.map(x => '  <url><loc>' + x[0] + '</loc><lastmod>' + x[1] + '</lastmod><changefreq>' + x[2] + '</changefreq></url>').join('\n') +
  '\n</urlset>\n';
await fs.writeFile(path.join(ROOT, 'sitemap.xml'), xml);
console.log('YYC static SEO pages generated:', unique.length);
