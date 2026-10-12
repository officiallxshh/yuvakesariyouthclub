import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = process.cwd();
const BASE = 'https://www.yuvakesariyouthclub.in';
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
  if (!r.ok) throw new Error((d && (d.message || d.error)) || ('Supabase RPC failed: ' + r.status));
  return d;
}

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function unescapeTitle(v) {
  return String(v || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
}
function slug(v) {
  return String(v ?? '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90) || 'item';
}
function displayDate(v) {
  if (!v) return '';
  const s = String(v);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T00:00:00+05:30') : new Date(s);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}
function sitemapDate(v) {
  if (!v) return '';
  const s = String(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}
function typeRoute(type) {
  return ({ event: 'events', update: 'updates', gallery: 'gallery', reel: 'reels', swag: 'swags', leader: 'leaders', achievement: 'achievements' })[type] || type;
}
function sectionAnchor(type) {
  return ({ event: 'events', update: 'updates', gallery: 'gallery', reel: 'reel', swag: 'swags', leader: 'leaders', achievement: 'impact' })[type] || 'glimpse';
}
function itemTitle(type, item) {
  return String((type === 'leader' ? item.name : item.title) || item.name || item.title || '').trim();
}
function itemImage(item) {
  const raw = item.thumbnail_url || item.image_url || item.photo_url || item.src || '';
  return /^https?:\/\//i.test(String(raw)) ? String(raw) : '';
}
function itemVideo(item) {
  const raw = String(item?.video_url || '');
  return /^https:\/\/vrllozfzheikjbhxvpkx\.supabase\.co\/storage\/v1\/object\/public\/yyc-reels\/reels\/video\//i.test(raw) ? raw : '';
}
function generatedReelThumbnailName(item) {
  const identity = item?.id || itemTitle('reel', item) || 'video';
  return 'generated-' + slug(identity).slice(0, 82) + '.jpg';
}
async function pathHasImage(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile() && stat.size > 1024;
  } catch { return false; }
}
function extractVideoThumbnail(videoUrl, outputPath) {
  return new Promise(resolve => {
    let finished = false;
    const finish = result => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve(result);
    };
    const child = spawn('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-ss', '00:00:01', '-i', videoUrl,
      '-an', '-frames:v', '1',
      '-vf', 'scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2',
      '-q:v', '3', outputPath
    ], { stdio: 'ignore' });
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch {}
      finish(false);
    }, 45000);
    child.once('error', () => finish(false));
    child.once('close', code => finish(code === 0));
  });
}
async function ensurePublishedReelThumbnails(reels) {
  const directory = path.join(ROOT, 'reels', 'thumbnails');
  await fs.mkdir(directory, { recursive: true });
  const candidates = (reels || []).filter(item => item && String(item.status || '').toLowerCase() === 'published' && itemVideo(item));
  const usedGenerated = new Set();
  let cursor = 0;
  const failures = [];
  async function worker() {
    while (cursor < candidates.length) {
      const item = candidates[cursor++];
      if (itemImage(item)) continue;
      const name = generatedReelThumbnailName(item);
      const outputPath = path.join(directory, name);
      if (!(await pathHasImage(outputPath))) {
        const ok = await extractVideoThumbnail(itemVideo(item), outputPath);
        if (!ok || !(await pathHasImage(outputPath))) {
          await fs.rm(outputPath, { force: true }).catch(() => {});
          failures.push(itemTitle('reel', item) || item.id || 'Untitled Reel');
          continue;
        }
      }
      item.thumbnail_url = BASE + '/reels/thumbnails/' + name;
      usedGenerated.add(name);
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, candidates.length) }, worker));
  const existing = await fs.readdir(directory).catch(() => []);
  for (const name of existing) {
    if (name.startsWith('generated-') && name.endsWith('.jpg') && !usedGenerated.has(name)) {
      await fs.rm(path.join(directory, name), { force: true });
    }
  }
  if (failures.length) {
    throw new Error('Could not automatically generate thumbnails for these published Reels: ' + failures.join(', ') + '. The SEO sync will stop rather than silently publish an incomplete video sitemap.');
  }
  console.log('Published Reel thumbnails ready:', candidates.length, '| generated locally:', usedGenerated.size);
}
function itemDescription(type, item) {
  return String(item.description || item.body || item.bio || item.caption || (type === 'event' ? 'YYC event: ' : type === 'update' ? 'YYC update: ' : type === 'gallery' ? 'YYC gallery: ' : type === 'reel' ? 'YYC Reel: ' : type === 'leader' ? 'YYC leader profile: ' : 'YYC achievement: ') + itemTitle(type, item)).trim();
}
function metaDescription(type, item) {
  const name = itemTitle(type, item) || 'Yuvakesari Youth Club';
  const role = String(item.role || item.position || 'YYC leader').trim();
  const raw = String(item.meta_description || item.description || item.body || item.bio || item.caption || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\x60*_#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const templates = {
    event: name + ' — a public programme by Yuvakesari Youth Club (YYC) in Subrahmanya, Karnataka. View the published event details and related community activities.',
    update: name + ' — official news and updates from Yuvakesari Youth Club (YYC), Subrahmanya, Karnataka. Read the latest published community announcements.',
    gallery: name + ' — a published community photo from Yuvakesari Youth Club (YYC), Subrahmanya, Karnataka. Explore the gallery and related public activities.',
    reel: 'Watch ' + name + ', a published community video from Yuvakesari Youth Club (YYC) in Subrahmanya, Karnataka. Explore more public events and youth activities.',
    swag: name + ' from Yuvakesari Youth Club (YYC), Subrahmanya, Karnataka. View the published item details and official club merchandise information.',
    leader: 'Meet ' + name + ', ' + role + ' at Yuvakesari Youth Club (YYC), Subrahmanya, Karnataka. View the official leadership profile and public club activities.',
    achievement: name + ' — a published milestone from Yuvakesari Youth Club (YYC), Subrahmanya, Karnataka. Explore the club achievements and community initiatives.'
  };
  const candidate = raw.length >= 85 ? raw : (templates[type] || ('Official ' + type + ' details from Yuvakesari Youth Club (YYC), Subrahmanya, Karnataka. ' + name + '.'));
  if (candidate.length <= 158) return candidate;
  const shortened = candidate.slice(0, 155);
  const lastSpace = shortened.lastIndexOf(' ');
  return (lastSpace > 110 ? shortened.slice(0, lastSpace) : shortened).replace(/[ ,;:—-]+$/, '') + '…';
}
function structuredData(type, item, image, canonical, title, route) {
  const org = { '@type': 'Organization', name: 'Yuvakesari Youth Club', url: BASE + '/', logo: BASE + '/assets/yyc-logo-clean.webp' };
  const graph = [{
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: BASE + '/' },
      { '@type': 'ListItem', position: 2, name: route[0].toUpperCase() + route.slice(1), item: BASE + '/' + route + '/' },
      { '@type': 'ListItem', position: 3, name: title, item: canonical }
    ]
  }];
  if (type === 'event') graph.push({
    '@type': 'Event',
    name: title,
    startDate: item.event_date || undefined,
    description: itemDescription(type, item),
    location: item.location ? { '@type': 'Place', name: item.location } : undefined,
    image: image || undefined,
    organizer: org
  });
  if (type === 'update') graph.push({
    '@type': 'Article',
    headline: title,
    description: itemDescription(type, item),
    datePublished: item.published_at || item.created_at || undefined,
    image: image || undefined,
    publisher: org
  });
  if (type === 'gallery') graph.push({
    '@type': 'ImageObject',
    name: title,
    caption: item.caption || undefined,
    contentUrl: image || undefined
  });
  if (type === 'leader') graph.push({
    '@type': 'Person',
    name: title,
    jobTitle: item.role || undefined,
    image: image || undefined,
    worksFor: org
  });
  if (type === 'reel') graph.push({
    '@type': 'VideoObject',
    name: title,
    description: itemDescription(type, item).slice(0, 2048),
    thumbnailUrl: image ? [image] : undefined,
    uploadDate: item.created_at || item.updated_at || undefined,
    contentUrl: itemVideo(item) || undefined,
    publisher: org,
    inLanguage: 'en-IN'
  });
  if (type === 'swag') graph.push({
    '@type': 'CreativeWork',
    name: title,
    description: itemDescription(type, item).slice(0, 2048),
    image: image ? [image] : undefined,
    category: item.category || undefined,
    creator: org,
    publisher: org
  });
  if (type === 'achievement') graph.push({
    '@type': 'Article',
    headline: title,
    description: itemDescription(type, item),
    datePublished: item.achieved_on || item.created_at || undefined,
    image: image || undefined,
    publisher: org
  });
  return '<script type="application/ld+json">' + JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }) + '</script>';
}
function detailPage(type, item, fileSlug) {
  const route = typeRoute(type);
  const title = itemTitle(type, item) || 'YYC ' + type;
  const desc = itemDescription(type, item);
  const metaDesc = metaDescription(type, item);
  const image = itemImage(item);
  const video = itemVideo(item);
  const canonical = BASE + '/' + route + '/auto/' + fileSlug + '.html';
  const assets = '../../';
  const structured = structuredData(type, item, image, canonical, title, route);
  const mediaMarkup = type === 'reel' && video
    ? '<div class="media yyc-video-watch"><video controls playsinline preload="metadata"' + (image ? ' poster="' + esc(image) + '"' : '') + ' style="display:block;width:100%;max-height:78vh;background:#000;border-radius:12px"><source src="' + esc(video) + '">Your browser does not support HTML video.</video></div>'
    : (image ? '<div class="media"><img src="' + esc(image) + '" alt="' + esc(title) + '"></div>' : '');
  const metaImage = image ? '<meta property="og:image" content="' + esc(image) + '">' : '';
  return '<!doctype html><html lang="en"><head>' +
    '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="theme-color" content="#05080b"><meta name="robots" content="index,follow,max-image-preview:large">' +
    '<link rel="canonical" href="' + canonical + '">' +
    '<link rel="icon" href="' + assets + 'assets/yyc-lion-favicon-redesigned.svg">' +
    '<meta name="description" content="' + esc(metaDesc) + '">' + metaImage +
    '<meta property="og:type" content="' + (type === 'reel' ? 'video.other' : type === 'event' ? 'article' : 'website') + '">' +
    (type === 'reel' && video ? '<meta property="og:video" content="' + esc(video) + '">' : '') +
    (type === 'reel' && image ? '<meta property="og:video:image" content="' + esc(image) + '">' : '') +
    '<meta property="og:title" content="' + esc(title) + ' | Yuvakesari Youth Club">' +
    '<meta property="og:description" content="' + esc(metaDesc) + '">' +
    '<meta property="og:url" content="' + canonical + '">' +
    '<meta name="twitter:card" content="' + (image ? 'summary_large_image' : 'summary') + '">' +
    '<meta name="twitter:title" content="' + esc(title) + ' | Yuvakesari Youth Club">' +
    '<meta name="twitter:description" content="' + esc(metaDesc) + '">' +
    structured +
    '<title>' + esc(title) + ' | Yuvakesari Youth Club</title>' +
    '<link rel="stylesheet" href="' + assets + 'yyc-seo.css"><script src="' + assets + 'yyc-production.js?v=20261008-02" defer></script></head><body><main class="wrap">' +
    '<a class="back" href="' + assets + 'index.html">← Back to Yuvakesari Youth Club</a>' +
    '<article class="card"><img class="logo" src="' + assets + 'assets/yyc-logo-clean.webp" alt="Yuvakesari Youth Club logo">' +
    '<div class="k">YUVAKESARI YOUTH CLUB · ' + esc(type.toUpperCase()) + '</div>' +
    '<h1 class="title">' + esc(title) + '</h1>' +
    '<div class="date">' + esc(displayDate(item.event_date || item.achieved_on || item.published_at || item.created_at)) + '</div>' +
    mediaMarkup +
    '<div class="meta">' +
      (item.category ? '<span class="tag">' + esc(item.category) + '</span>' : '') +
      (item.location ? '<span class="tag">' + esc(item.location) + '</span>' : '') +
      (item.album ? '<span class="tag">' + esc(item.album) + '</span>' : '') +
      (item.role ? '<span class="tag">' + esc(item.role) + '</span>' : '') +
    '</div><div class="body">' + esc(desc) + '</div>' +
    '<div class="footer"><a href="' + assets + 'index.html#' + sectionAnchor(type) + '">Open on the YYC website →</a> · <a href="../index.html">Browse all ' + esc(route) + ' →</a></div></article></main></body></html>';
}
function categoryIndexPage(title, description, route, entries) {
  const canonical = BASE + '/' + route + '/';
  const collectionSchema = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': canonical + '#webpage',
        url: canonical,
        name: title + ' | Yuvakesari Youth Club',
        description,
        isPartOf: { '@id': BASE + '/#website' },
        about: { '@id': BASE + '/#organization' },
        mainEntity: {
          '@type': 'ItemList',
          itemListElement: entries.slice(0, 100).map((entry, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            name: entry.title,
            url: new URL(entry.href, canonical).href
          }))
        }
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: BASE + '/' },
          { '@type': 'ListItem', position: 2, name: title, item: canonical }
        ]
      }
    ]
  });
  const rows = entries.map(e =>
    '<article class="item"><h2><a href="' + esc(e.href) + '">' + esc(e.title) + '</a></h2>' +
    (e.date ? '<p class="item-date">' + esc(e.date) + '</p>' : '') +
    (e.summary ? '<p>' + esc(e.summary) + '</p>' : '') +
    (e.image ? '<a class="item-image" href="' + esc(e.href) + '"><img src="' + esc(e.image) + '" alt="' + esc(e.title) + '" loading="lazy"></a>' : '') +
    '</article>'
  ).join('');
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="theme-color" content="#05080b"><meta name="robots" content="index,follow,max-image-preview:large">' +
    '<link rel="canonical" href="' + BASE + '/' + route + '/"><link rel="icon" href="../assets/yyc-lion-favicon-redesigned.svg">' +
    '<meta name="description" content="' + esc(description) + '"><title>' + esc(title) + ' | Yuvakesari Youth Club</title>' +
    '<script type="application/ld+json">' + collectionSchema.replace(/</g, '\\u003c') + '</script>' +
    '<link rel="stylesheet" href="../yyc-seo.css"><style>.listing{display:grid;gap:12px;margin-top:22px}.item{border:1px solid rgba(229,191,107,.15);background:rgba(255,255,255,.025);border-radius:16px;padding:18px}.item h2{font-size:21px;line-height:1.35;margin:0 0 7px}.item h2 a{color:#f1d58f;text-decoration:none}.item h2 a:hover{text-decoration:underline;text-underline-offset:4px}.item p{margin:6px 0;color:#aeb5b0;font-size:13px}.item-date{font-size:10px!important;letter-spacing:.08em;text-transform:uppercase}.item-image{display:block;margin-top:12px}.item-image img{max-width:100%;width:100%;max-height:300px;object-fit:cover;border-radius:10px}.empty{color:#89928c;font-size:13px;margin-top:20px}</style></head><body><main class="wrap">' +
    '<a class="back" href="../index.html">← Back to YYC</a><article class="card">' +
    '<img class="logo" src="../assets/yyc-logo-clean.webp" alt="Yuvakesari Youth Club logo"><div class="k">YUVAKESARI YOUTH CLUB</div>' +
    '<h1 class="title">' + esc(title) + '</h1><div class="body">' + esc(description) + '</div>' +
    (entries.length ? '<section class="listing" aria-label="' + esc(title) + '">' + rows + '</section>' : '<p class="empty">New public items will appear here after they are published.</p>') +
    '</article></main></body></html>';
}
async function listManualPages(route) {
  const dir = path.join(ROOT, route);
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const result = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/\.html$/i.test(entry.name) || entry.name.toLowerCase() === 'index.html') continue;
    /* Legacy detail pages are superseded by generated /auto/ pages. Do not
       keep advertising old leader IDs, or a root-level copy of an auto page,
       as equally important links in the category directory. */
    const legacyPath = path.join(dir, entry.name);
    const sameSlugAuto = path.join(dir, 'auto', entry.name);
    let hasAutoTwin = false;
    try { await fs.access(sameSlugAuto); hasAutoTwin = true; } catch {}
    if (route === 'leaders' || hasAutoTwin) continue;
    const html = await fs.readFile(legacyPath, 'utf8').catch(() => '');
    const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = unescapeTitle(match ? match[1].replace(/<[^>]+>/g, '').trim() : entry.name.replace(/\.html$/i, '').replace(/[-_]+/g, ' '));
    result.push({ href: './' + entry.name, title, summary: '', date: '', image: '' });
  }
  return result;
}
async function walkHtml(dir) {
  const result = [];
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...await walkHtml(abs));
    else if (entry.isFile() && /\.html$/i.test(entry.name)) result.push(abs);
  }
  return result;
}

const site = await rpc('public_site_data');
const feature = await rpc('public_feature_data');
const reelPayload = await rpc('yyc_reels_public_list');
const publicReels = Array.isArray(reelPayload?.reels) ? reelPayload.reels.filter(item => item && String(item.status || '').toLowerCase() === 'published') : [];
await ensurePublishedReelThumbnails(publicReels);
const publicSwags = Array.isArray(site.swags) ? site.swags.filter(item => item && !['draft', 'hidden', 'private', 'deleted', 'archived', 'denied', 'rejected'].includes(String(item.status || '').toLowerCase())) : [];
const routeDefs = [
  ['event', 'events', 'YYC Events & Programmes', 'Explore published events, community programmes and youth initiatives from Yuvakesari Youth Club (YYC) in Subrahmanya, Karnataka.'],
  ['update', 'updates', 'YYC News & Updates', 'Read official news, announcements and community updates from Yuvakesari Youth Club (YYC), Subrahmanya, Karnataka.'],
  ['gallery', 'gallery', 'YYC Community Gallery', 'Browse published photos from Yuvakesari Youth Club (YYC), including community service, events and youth activities in Subrahmanya, Karnataka.'],
  ['reel', 'reels', 'YYC Reels & Videos', 'Watch published videos and event Reels from Yuvakesari Youth Club (YYC), documenting community programmes and youth activities in Subrahmanya, Karnataka.'],
  ['swag', 'swags', 'YYC Merchandise & Jerseys', 'View official Yuvakesari Youth Club (YYC) merchandise, jerseys and published club items from Subrahmanya, Karnataka.'],
  ['leader', 'leaders', 'YYC Leadership Team', 'Meet the public leadership team of Yuvakesari Youth Club (YYC) in Subrahmanya, Karnataka, and explore the roles behind the club community activities.'],
  ['achievement', 'achievements', 'YYC Achievements & Milestones', 'Explore published milestones and achievements from Yuvakesari Youth Club (YYC), highlighting community initiatives and youth activities in Subrahmanya, Karnataka.']
];
const sitemapLastmod = new Map();
const counts = {};
const contentByRoute = new Map();

for (const [type, route] of routeDefs) {
  const autoDir = path.join(ROOT, route, 'auto');
  await fs.rm(autoDir, { recursive: true, force: true });
  await fs.mkdir(autoDir, { recursive: true });
  contentByRoute.set(route, []);
}

const videoSitemapEntries = [];
const allCollections = [
  ['event', site.events || []],
  ['update', site.updates || []],
  ['gallery', site.gallery || []],
  ['reel', publicReels],
  ['swag', publicSwags],
  ['leader', site.leaders || []],
  ['achievement', feature.achievements || []]
];
for (const [type, list] of allCollections) {
  const route = typeRoute(type);
  const output = contentByRoute.get(route);
  const usedSlugs = new Set();
  let written = 0;
  for (const item of list) {
    if (!item || !itemTitle(type, item)) continue;
    if (type === 'gallery' && !item.src && !item.image_url && !item.photo_url) continue;
    if (type === 'reel' && !itemVideo(item)) continue;
    const baseSlug = slug(item.slug || itemTitle(type, item) || item.id);
    let fileSlug = baseSlug;
    if (usedSlugs.has(fileSlug)) {
      const suffix = slug(item.id || item.created_at || String(usedSlugs.size)).slice(-12);
      fileSlug = (baseSlug.slice(0, 76) + '-' + suffix).replace(/-+$/g, '');
      let n = 2;
      while (usedSlugs.has(fileSlug)) fileSlug = baseSlug.slice(0, 76) + '-' + n++;
    }
    usedSlugs.add(fileSlug);
    const filePath = path.join(ROOT, route, 'auto', fileSlug + '.html');
    await fs.writeFile(filePath, detailPage(type, item, fileSlug), 'utf8');
    const dateValue = item.event_date || item.achieved_on || item.published_at || item.updated_at || item.created_at || '';
    const entry = {
      href: './auto/' + fileSlug + '.html',
      title: itemTitle(type, item),
      summary: itemDescription(type, item),
      date: displayDate(dateValue),
      image: itemImage(item),
      lastmod: sitemapDate(item.updated_at || item.modified_at || item.published_at || item.created_at)
    };
    output.push(entry);
    if (type === 'reel' && entry.image && /^https:\/\//i.test(entry.image)) {
      videoSitemapEntries.push({
        page: BASE + '/' + route + '/auto/' + fileSlug + '.html',
        video: itemVideo(item),
        thumbnail: entry.image,
        title: entry.title,
        description: entry.summary,
        published: String(item.created_at || item.updated_at || '')
      });
    }
    if (entry.lastmod) sitemapLastmod.set(BASE + '/' + route + '/auto/' + fileSlug + '.html', entry.lastmod);
    written++;
  }
  counts[route] = written;
}

for (const [type, route, title, description] of routeDefs) {
  const manual = await listManualPages(route);
  const autoEntries = contentByRoute.get(route) || [];
  const entries = [...manual, ...autoEntries].sort((a, b) => {
    const da = a.date ? Date.parse(a.date) : 0;
    const db = b.date ? Date.parse(b.date) : 0;
    return db - da || a.title.localeCompare(b.title);
  });
  await fs.writeFile(path.join(ROOT, route, 'index.html'), categoryIndexPage(title, description, route, entries), 'utf8');
}

/* Keep the designed public leadership directory and its structured data synchronized
   with the same approved Supabase records used to build individual leader pages. */
const leadersFile = path.join(ROOT, 'leaders.html');
const leadersHtml = await fs.readFile(leadersFile, 'utf8');
const leaderItems = (site.leaders || []).filter(item => item && itemTitle('leader', item));
if (leaderItems.length) {
  const usedLeaderSlugs = new Set();
  const leaderProfiles = [];
  const cards = leaderItems.map((item, i) => {
    const name = itemTitle('leader', item);
    const role = String(item.role || item.position || 'YYC Leader');
    const image = itemImage(item);
    const base = slug(item.slug || name || item.id);
    let fileSlug = base;
    if (usedLeaderSlugs.has(fileSlug)) {
      const suffix = slug(item.id || item.created_at || String(usedLeaderSlugs.size)).slice(-12);
      fileSlug = (base.slice(0, 76) + '-' + suffix).replace(/-+$/g, '');
      let n = 2;
      while (usedLeaderSlugs.has(fileSlug)) fileSlug = base.slice(0, 76) + '-' + n++;
    }
    usedLeaderSlugs.add(fileSlug);
    leaderProfiles.push({ item, name, role, image, fileSlug });
    const imageHtml = image
      ? '<div class="photo"><img src="' + esc(image) + '" alt="' + esc(name + ', ' + role + ' at Yuvakesari Youth Club') + '" loading="lazy" decoding="async"></div>'
      : '<div class="photo" aria-hidden="true"></div>';
    return '<article class="person" id="leader-' + String(i + 1).padStart(2, '0') + '">' + imageHtml +
      '<div class="person-body"><div class="num">YYC LEADER · ' + String(i + 1).padStart(2, '0') + '</div>' +
      '<h2 class="name">' + esc(name) + '</h2><p class="role">' + esc(role) + '</p>' +
      '<a class="person-link" href="./leaders/auto/' + fileSlug + '.html">VIEW PROFILE ↗</a></div></article>';
  }).join('\n');
  const gridRegex = /<section class="grid" aria-label="YYC leadership team">[\s\S]*?<\/section>/;
  if (!gridRegex.test(leadersHtml)) throw new Error('Could not locate leadership card grid; refusing to overwrite leaders.html');
  let nextLeadersHtml = leadersHtml.replace(gridRegex, '<section class="grid" aria-label="YYC leadership team">' + cards + '</section>');

  const jsonPattern = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/;
  const jsonMatch = nextLeadersHtml.match(jsonPattern);
  if (!jsonMatch) throw new Error('Could not locate leadership CollectionPage JSON-LD; refusing to write a stale schema.');
  let schema;
  try { schema = JSON.parse(jsonMatch[1]); }
  catch { throw new Error('Leadership JSON-LD is invalid; refusing to overwrite leaders.html.'); }
  if (schema['@type'] !== 'CollectionPage' || !schema.mainEntity) {
    throw new Error('Leadership JSON-LD schema shape is unexpected; refusing to overwrite leaders.html.');
  }
  schema.mainEntity.numberOfItems = leaderProfiles.length;
  schema.mainEntity.itemListElement = leaderProfiles.map((leader, index) => {
    const profileUrl = BASE + '/leaders/auto/' + leader.fileSlug + '.html';
    const person = {
      '@type': 'Person',
      '@id': profileUrl + '#person',
      name: leader.name,
      url: profileUrl,
      worksFor: { '@id': BASE + '/#organization' }
    };
    if (leader.role) person.jobTitle = leader.role;
    if (leader.image) person.image = leader.image;
    return { '@type': 'ListItem', position: index + 1, item: person };
  });
  nextLeadersHtml = nextLeadersHtml.replace(
    jsonPattern,
    '<script type="application/ld+json">\n' + JSON.stringify(schema, null, 2) + '\n</script>'
  );
  const keywords = 'YYC leaders, Yuvakesari Youth Club leaders, youth club Subrahmanya, ' +
    leaderProfiles.map(leader => leader.name).join(', ') + ', ಯುವಕೇಸರಿ ಯೂತ್ ಕ್ಲಬ್';
  nextLeadersHtml = nextLeadersHtml.replace(
    /<meta name="keywords" content="[^"]*">/,
    '<meta name="keywords" content="' + esc(keywords) + '">'
  );
  await fs.writeFile(leadersFile, nextLeadersHtml, 'utf8');
}

const fixedPaths = [
  '/', '/about.html', '/contact.html', '/privacy.html', '/terms.html',
  '/instagram.html', '/media.html', '/leaders.html'
];
const urlEntries = new Map();
for (const routePath of fixedPaths) {
  const rel = routePath === '/' ? 'index.html' : routePath.slice(1);
  try {
    await fs.access(path.join(ROOT, rel));
    urlEntries.set(BASE + routePath, '');
  } catch {}
}
for (const [, route] of routeDefs) {
  const files = await walkHtml(path.join(ROOT, route));
  for (const abs of files) {
    const rel = path.relative(ROOT, abs).split(path.sep).join('/');
    const isCategoryIndex = rel === route + '/index.html' || rel === route + '/index.htm';
    const isGeneratedDetail = rel.startsWith(route + '/auto/') && /\.html$/i.test(rel);
    /* Only publish canonical category URLs and generated public detail URLs.
       Old hand-written copies in the route root otherwise create duplicate
       canonical pages and waste discovery/crawl attention. */
    if (!isCategoryIndex && !isGeneratedDetail) continue;
    let urlPath = '/' + rel;
    if (isCategoryIndex) urlPath = '/' + route + '/';
    const loc = BASE + urlPath;
    urlEntries.set(loc, sitemapLastmod.get(loc) || '');
  }
}

/* Keep superseded root-level detail copies accessible to visitors who already
   have their URL, but ask search engines not to index these legacy duplicates.
   The canonical /auto/ detail pages remain indexable and in the sitemap. */
for (const [, route] of routeDefs) {
  const dir = path.join(ROOT, route);
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isFile() || !/\.html$/i.test(entry.name) || entry.name.toLowerCase() === 'index.html') continue;
    let legacy = route === 'leaders';
    if (!legacy) {
      try { await fs.access(path.join(dir, 'auto', entry.name)); legacy = true; } catch {}
    }
    if (!legacy) continue;
    const file = path.join(dir, entry.name);
    const html = await fs.readFile(file, 'utf8').catch(() => '');
    if (!html) continue;
    let next = html.replace(/<meta\s+name=["']robots["']\s+content=["'][^"']*["']\s*\/?\s*>/i, '<meta name="robots" content="noindex,follow">');
    if (next === html && !/<meta\s+name=["']robots["']/i.test(html)) {
      next = html.replace(/<head[^>]*>/i, match => match + '<meta name="robots" content="noindex,follow">');
    }
    if (next !== html) await fs.writeFile(file, next, 'utf8');
  }
}
const unique = [...urlEntries.entries()].sort((a, b) => a[0].localeCompare(b[0]));
const xmlEsc = v => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  unique.map(([loc, lastmod]) => '  <url><loc>' + xmlEsc(loc) + '</loc>' + (lastmod ? '<lastmod>' + lastmod + '</lastmod>' : '') + '</url>').join('\n') +
  '\n</urlset>\n';
await fs.writeFile(path.join(ROOT, 'sitemap.xml'), xml, 'utf8');

const uniqueVideos = [...new Map(videoSitemapEntries.map(item => [item.page, item]).map(([key, value]) => [key, value])).values()]
  .sort((a, b) => a.page.localeCompare(b.page));
const videoXml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">\n' +
  uniqueVideos.map(item => {
    const parsedDate = item.published ? new Date(item.published) : null;
    const publishedTag = parsedDate && !Number.isNaN(parsedDate.getTime())
      ? '<video:publication_date>' + parsedDate.toISOString() + '</video:publication_date>'
      : '';
    return '  <url><loc>' + xmlEsc(item.page) + '</loc><video:video>' +
      '<video:thumbnail_loc>' + xmlEsc(item.thumbnail) + '</video:thumbnail_loc>' +
      '<video:title>' + xmlEsc(item.title.slice(0, 100)) + '</video:title>' +
      '<video:description>' + xmlEsc(item.description.slice(0, 2048)) + '</video:description>' +
      '<video:content_loc>' + xmlEsc(item.video) + '</video:content_loc>' + publishedTag +
      '</video:video></url>';
  }).join('\n') + '\n</urlset>\n';
await fs.writeFile(path.join(ROOT, 'video-sitemap.xml'), videoXml, 'utf8');

console.log('YYC public SEO sync complete:', JSON.stringify({ pagesInSitemap: unique.length, publishedPages: counts, videoPagesInSitemap: uniqueVideos.length, sitemap: 'sitemap.xml', videoSitemap: 'video-sitemap.xml' }));
