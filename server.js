const http = require('http');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const root = __dirname;
const uploadsRoot = path.join(root, 'uploads');
fs.mkdirSync(uploadsRoot, { recursive: true });
const db = new DatabaseSync(path.join(root, 'yuvakesari.db'));
const adminId = process.env.ADMIN_ID || 'lxshhadmin';
const adminPassword = process.env.ADMIN_PASSWORD || 'lxshhboss';
const sessions = new Map();

// Tuned for a large local club database. SQLite can comfortably hold far more
// than 10,000 members; the UI loads records in small pages so the browser stays fast.
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA foreign_keys = ON;
  PRAGMA temp_store = MEMORY;
  PRAGMA cache_size = -64000;
  PRAGMA mmap_size = 268435456;
  PRAGMA busy_timeout = 5000;
  CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY,
    member_no INTEGER NOT NULL UNIQUE,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NOT NULL,
    reason TEXT NOT NULL,
    role TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL,
    photo TEXT,
    photo_zoom REAL NOT NULL DEFAULT 1,
    photo_x REAL NOT NULL DEFAULT 50,
    photo_y REAL NOT NULL DEFAULT 50
  );
  CREATE TABLE IF NOT EXISTS leaders (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    photo TEXT,
    photo_zoom REAL NOT NULL DEFAULT 1,
    photo_x REAL NOT NULL DEFAULT 50,
    photo_y REAL NOT NULL DEFAULT 50,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY,
    date TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS gallery (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    photo TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_members_status_created ON members(status, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_members_name ON members(name COLLATE NOCASE);
  CREATE INDEX IF NOT EXISTS idx_members_member_no ON members(member_no);
  CREATE INDEX IF NOT EXISTS idx_members_email ON members(email COLLATE NOCASE);
  CREATE INDEX IF NOT EXISTS idx_members_role_phone ON members(role COLLATE NOCASE, phone);
  CREATE INDEX IF NOT EXISTS idx_leaders_role ON leaders(role COLLATE NOCASE);
  CREATE INDEX IF NOT EXISTS idx_announcements_created ON announcements(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_gallery_position ON gallery(position, id);
`);

function hasColumn(table, name) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === name);
}
for (const [table, column, definition] of [
  ['members', 'member_no', 'INTEGER'],
  ['members', 'status', "TEXT NOT NULL DEFAULT 'pending'"],
  ['members', 'photo', 'TEXT'],
  ['members', 'photo_zoom', 'REAL NOT NULL DEFAULT 1'],
  ['members', 'photo_x', 'REAL NOT NULL DEFAULT 50'],
  ['members', 'photo_y', 'REAL NOT NULL DEFAULT 50'],
  ['leaders', 'photo', 'TEXT'],
  ['leaders', 'photo_zoom', 'REAL NOT NULL DEFAULT 1'],
  ['leaders', 'photo_x', 'REAL NOT NULL DEFAULT 50'],
  ['leaders', 'photo_y', 'REAL NOT NULL DEFAULT 50'],
  ['announcements', 'created_at', 'TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP'],
  ['gallery', 'photo', 'TEXT'],
  ['gallery', 'created_at', 'TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP']
]) {
  if (!hasColumn(table, column)) {
    try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`); } catch (_) {}
  }
}
if (!hasColumn('members', 'member_no')) {
  // The loop above normally adds it. This branch is retained for unusual older DBs.
  try { db.exec("ALTER TABLE members ADD COLUMN member_no INTEGER"); } catch (_) {}
}

const settingDefaults = {
  siteName: 'Yuvakesari Youth Club',
  formerName: 'Formerly Yuvakesari Kukke',
  location: 'Subrahmanya, Karnataka',
  heroKicker: 'TOGETHER WE GROW',
  heroTagline: 'Empowering youth, building a better tomorrow through service, unity and social responsibility.',
  quote: 'Small steps create big changes.',
  mission: 'YUVAKESARI YOUTH CLUB (FORMERLY YUVAKESARI KUKKE) IS A NON PROFIT ORGANIZATION MEANT FOR CONDUCTING VARIOUS SOCIAL ACTIVITIES LIKE SWACHH ABHIYAAN, GAMES OR EVENTS ETC.',
  thanks: 'THANKING YOU',
  president: 'ASHWIN Y',
  presidentTitle: 'THE PRESIDENT',
  footerLine: 'Yuvakesari Youth Club · Subrahmanya'
};
const getSetting = key => db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value;
const setSetting = (key, value) => db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, String(value));
for (const [key, value] of Object.entries(settingDefaults)) if (getSetting(key) === undefined) setSetting(key, value);
setSetting('db_version', '14');

function seed() {
  if (!db.prepare('SELECT COUNT(*) AS count FROM leaders').get().count) {
    const add = db.prepare('INSERT INTO leaders (name, role, photo, photo_zoom, photo_x, photo_y) VALUES (?, ?, NULL, 1, 50, 50)');
    [['Arjun Nair', 'President'], ['Meera Menon', 'Vice President'], ['Vivek Kumar', 'Secretary']].forEach(row => add.run(...row));
  }
  if (!db.prepare('SELECT COUNT(*) AS count FROM announcements').get().count) {
    const add = db.prepare('INSERT INTO announcements (date, title, body) VALUES (?, ?, ?)');
    [
      ['14 Sep 2026', 'Community cleanup drive', 'Meet at the central park gate at 7:00 AM. Gloves and refreshments will be provided.'],
      ['21 Sep 2026', 'Youth cultural evening', 'An evening of talent, music, and stories from our community.'],
      ['05 Oct 2026', 'Member orientation', 'A warm welcome and introduction for our newest Yuvakesari members.']
    ].forEach(row => add.run(...row));
  }
  if (!db.prepare('SELECT COUNT(*) AS count FROM gallery').get().count) {
    const add = db.prepare('INSERT INTO gallery (title, position, photo) VALUES (?, ?, NULL)');
    ['Community clean-up', 'Cultural celebration', 'Leadership workshop', 'Together for change'].forEach((title, position) => add.run(title, position));
  }
}
seed();

function acceptsBrotli(req){ return /\bbr\b/i.test(req.headers['accept-encoding']||''); }
function acceptsGzip(req){ return /\bgzip\b/i.test(req.headers['accept-encoding']||''); }
function send(res, status, body, headers = {}, req = null) {
  const raw = Buffer.from(JSON.stringify(body));
  const common = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Vary':'Accept-Encoding', ...headers };
  if(req && acceptsBrotli(req)){ const out=zlib.brotliCompressSync(raw,{params:{[zlib.constants.BROTLI_PARAM_QUALITY]:4}}); res.writeHead(status,{...common,'Content-Encoding':'br'}); return res.end(out); }
  if(req && acceptsGzip(req)){ const out=zlib.gzipSync(raw,{level:4}); res.writeHead(status,{...common,'Content-Encoding':'gzip'}); return res.end(out); }
  res.writeHead(status,common); res.end(raw);
}
function sendFile(res, status, file, type, cache = 'public, max-age=31536000, immutable') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': cache });
  fs.createReadStream(file).pipe(res);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let settled = false;
    const fail = err => { if (!settled) { settled = true; reject(err); } };
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 10_000_000) fail(new Error('Request too large. Reduce the image size and try again.'));
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('Invalid JSON.')); }
    });
    req.on('error', fail);
  });
}
const safeText = (value, max = 8000) => String(value ?? '').trim().slice(0, max);
const safeNumber = (value, fallback, min, max) => { const n = Number(value); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback; };
const roleName = name => String(name || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 12) || 'MEMBER';
const safeImage = value => {
  const text = String(value || '');
  if (!text) return null;
  if (!/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/.test(text)) return null;
  if (text.length > 8_500_000) return null;
  return text;
};
function extensionFromDataUrl(dataUrl) {
  const match = /^data:image\/(png|jpeg|jpg|webp);base64,/.exec(dataUrl || '');
  if (!match) return null;
  return match[1] === 'jpeg' || match[1] === 'jpg' ? 'jpg' : match[1];
}
function saveImageData(dataUrl) {
  const safe = safeImage(dataUrl);
  if (!safe) return null;
  const ext = extensionFromDataUrl(safe);
  const fileName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${ext}`;
  const abs = path.join(uploadsRoot, fileName);
  fs.writeFileSync(abs, Buffer.from(safe.split(',')[1], 'base64'));
  return `/uploads/${fileName}`;
}
function deleteStoredImage(photo) {
  if (!photo || !photo.startsWith('/uploads/')) return;
  const abs = path.resolve(root, `.${photo}`);
  if (abs.startsWith(path.resolve(uploadsRoot) + path.sep)) fs.rm(abs, { force: true }, () => {});
}
function normalizeStoredPhoto(photo) {
  if (!photo) return null;
  if (String(photo).startsWith('/uploads/')) return String(photo);
  const pathName = saveImageData(photo);
  if (pathName) return pathName;
  return null;
}
function migrateInlineImages(table) {
  const rows = db.prepare(`SELECT id, photo FROM ${table} WHERE photo LIKE 'data:image/%'`).all();
  const update = db.prepare(`UPDATE ${table} SET photo = ? WHERE id = ?`);
  for (const row of rows) {
    const next = normalizeStoredPhoto(row.photo);
    if (next) update.run(next, row.id);
  }
}
// One-time migration from older V1-V10 base64-in-DB records to files.
try { migrateInlineImages('members'); migrateInlineImages('leaders'); migrateInlineImages('gallery'); } catch (_) {}

function settingsObject() {
  const result = {};
  const rows = db.prepare('SELECT key, value FROM settings').all();
  for (const row of rows) result[row.key] = row.value;
  return { ...settingDefaults, ...result };
}
let publicCache = null;
let publicCacheAt = 0;
function invalidatePublicCache(){ publicCache=null; publicCacheAt=0; }
function publicData() {
  if(publicCache && Date.now()-publicCacheAt < 3000) return publicCache;
  const leaders = db.prepare('SELECT id,name,role,photo,photo_zoom AS photoZoom,photo_x AS photoX,photo_y AS photoY FROM leaders ORDER BY id LIMIT 100').all();
  const announcements = db.prepare('SELECT id,date,title,body FROM announcements ORDER BY id DESC LIMIT 12').all();
  const gallery = db.prepare('SELECT id,title,position,photo FROM gallery ORDER BY position,id DESC LIMIT 18').all();
  const settings = settingsObject();
  publicCache = { leaders, announcements, gallery, settings };
  publicCacheAt = Date.now();
  return publicCache;
}
function adminSummary() {
  const counts = db.prepare(`SELECT
    (SELECT COUNT(*) FROM members) AS members,
    (SELECT COUNT(*) FROM members WHERE status='pending') AS pendingMembers,
    (SELECT COUNT(*) FROM members WHERE status='approved') AS approvedMembers,
    (SELECT COUNT(*) FROM leaders) AS leaders,
    (SELECT COUNT(*) FROM announcements) AS announcements,
    (SELECT COUNT(*) FROM gallery) AS gallery`).get();
  return { counts, settings: settingsObject() };
}
function memberPage({ page = 1, pageSize = 50, search = '', status = '' }) {
  const limit = Math.min(100, Math.max(10, Number(pageSize) || 50));
  const current = Math.max(1, Number(page) || 1);
  const offset = (current - 1) * limit;
  const q = safeText(search, 200).toLowerCase();
  const where = [];
  const args = [];
  if (q) { where.push('(LOWER(name) LIKE ? OR LOWER(phone) LIKE ? OR LOWER(email) LIKE ? OR LOWER(role) LIKE ? OR CAST(member_no AS TEXT) LIKE ?)'); const x = `%${q}%`; args.push(x,x,x,x,x); }
  if (['pending','approved','rejected'].includes(status)) { where.push('status = ?'); args.push(status); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS count FROM members ${clause}`).get(...args).count;
  const rows = db.prepare(`SELECT id,member_no AS memberNo,name,phone,email,reason,role,status,created_at AS createdAt,photo,photo_zoom AS photoZoom,photo_x AS photoX,photo_y AS photoY FROM members ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...args, limit, offset);
  return { rows, page: current, pageSize: limit, total, pages: Math.max(1, Math.ceil(total / limit)) };
}
function leaderPage() {
  return { rows: db.prepare('SELECT id,name,role,photo,photo_zoom AS photoZoom,photo_x AS photoX,photo_y AS photoY FROM leaders ORDER BY id').all() };
}
function announcementPage({ page = 1, pageSize = 30, search = '' }) {
  const limit = Math.min(100, Math.max(10, Number(pageSize) || 30));
  const current = Math.max(1, Number(page) || 1);
  const offset = (current - 1) * limit;
  const q = safeText(search, 200).toLowerCase();
  const args = [];
  const clause = q ? 'WHERE LOWER(title) LIKE ? OR LOWER(body) LIKE ?' : '';
  if (q) { const x=`%${q}%`; args.push(x,x); }
  const total = db.prepare(`SELECT COUNT(*) AS count FROM announcements ${clause}`).get(...args).count;
  const rows = db.prepare(`SELECT id,date,title,body,created_at AS createdAt FROM announcements ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...args, limit, offset);
  return { rows, page: current, pageSize: limit, total, pages: Math.max(1, Math.ceil(total / limit)) };
}
function galleryPage({ page = 1, pageSize = 24, search = '' }) {
  const limit = Math.min(100, Math.max(12, Number(pageSize) || 24));
  const current = Math.max(1, Number(page) || 1);
  const offset = (current - 1) * limit;
  const q = safeText(search, 200).toLowerCase();
  const args = [];
  const clause = q ? 'WHERE LOWER(title) LIKE ?' : '';
  if (q) args.push(`%${q}%`);
  const total = db.prepare(`SELECT COUNT(*) AS count FROM gallery ${clause}`).get(...args).count;
  const rows = db.prepare(`SELECT id,title,position,photo,created_at AS createdAt FROM gallery ${clause} ORDER BY position,id DESC LIMIT ? OFFSET ?`).all(...args, limit, offset);
  return { rows, page: current, pageSize: limit, total, pages: Math.max(1, Math.ceil(total / limit)) };
}
function cookieValue(req, key) {
  const item = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(`${key}=`));
  return item ? item.slice(key.length + 1) : null;
}
function isAdmin(req) {
  const session = sessions.get(cookieValue(req, 'yyc_admin'));
  if (!session || session.expires < Date.now()) return false;
  return true;
}
function requireAdmin(req, res) { if (!isAdmin(req)) { send(res, 401, { error: 'Admin sign-in required.' }); return false; } return true; }
function sameSecret(a,b) { const x=Buffer.from(String(a)); const y=Buffer.from(String(b)); return x.length===y.length && crypto.timingSafeEqual(x,y); }
function parsePage(url, defaults={}) { return { page: url.searchParams.get('page') || defaults.page || 1, pageSize: url.searchParams.get('pageSize') || defaults.pageSize, search: url.searchParams.get('search') || '', status: url.searchParams.get('status') || '' }; }

const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.svg':'image/svg+xml', '.ico':'image/x-icon' };

const server = http.createServer(async (req,res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    // Fast public boot payload: only the content needed for the public page.
    if (req.method === 'GET' && url.pathname === '/api/public') return send(res,200,publicData(),{},req);
    if (req.method === 'GET' && url.pathname === '/api/member-status') {
      const role=safeText(url.searchParams.get('role'),120).toUpperCase();
      const phone=safeText(url.searchParams.get('phone'),80);
      if(!role||!phone) return send(res,400,{error:'Role number and phone number are required.'});
      const row=db.prepare("SELECT role,status FROM members WHERE UPPER(role)=? AND phone=? LIMIT 1").get(role,phone);
      if(!row) return send(res,404,{error:'Application not found. Check your role number and phone number.'});
      return send(res,200,{role:row.role,status:row.status});
    }
    if (req.method === 'GET' && url.pathname === '/api/admin/summary') { if (!requireAdmin(req,res)) return; return send(res,200,adminSummary(),{},req); }
    if (req.method === 'GET' && url.pathname === '/api/admin/members') { if (!requireAdmin(req,res)) return; return send(res,200,memberPage(parsePage(url,{pageSize:50})),{},req); }
    if (req.method === 'GET' && url.pathname === '/api/admin/leaders') { if (!requireAdmin(req,res)) return; return send(res,200,leaderPage(),{},req); }
    if (req.method === 'GET' && url.pathname === '/api/admin/announcements') { if (!requireAdmin(req,res)) return; return send(res,200,announcementPage(parsePage(url,{pageSize:30})),{},req); }
    if (req.method === 'GET' && url.pathname === '/api/admin/gallery') { if (!requireAdmin(req,res)) return; return send(res,200,galleryPage(parsePage(url,{pageSize:24})),{},req); }
    if (req.method === 'GET' && url.pathname === '/api/admin/settings') { if (!requireAdmin(req,res)) return; return send(res,200,{settings:settingsObject()}, {}, req); }
    if (req.method === 'POST' && url.pathname === '/api/admin/login') {
      const item = await readBody(req);
      if (!sameSecret(safeText(item.id,120),adminId) || !sameSecret(String(item.password || ''),adminPassword)) return send(res,401,{error:'Incorrect admin ID or password.'});
      const token=crypto.randomBytes(32).toString('hex'); sessions.set(token,{expires:Date.now()+8*60*60*1000});
      return send(res,200,{ok:true}, {'Set-Cookie':`yyc_admin=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`});
    }
    if (req.method === 'POST' && url.pathname === '/api/admin/logout') {
      sessions.delete(cookieValue(req,'yyc_admin')); return send(res,200,{ok:true},{'Set-Cookie':'yyc_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});
    }
    if (req.method === 'PUT' && url.pathname === '/api/admin/settings') {
      if (!requireAdmin(req,res)) return;
      const body=await readBody(req);
      for (const key of Object.keys(settingDefaults)) setSetting(key,safeText(body[key],8000));
      invalidatePublicCache();
      return send(res,200,{settings:settingsObject()}, {}, req);
    }
    if (req.method === 'POST' && url.pathname === '/api/admin/reset') {
      if (!requireAdmin(req,res)) return;
      db.exec('DELETE FROM members; DELETE FROM leaders; DELETE FROM announcements; DELETE FROM gallery;'); seed(); invalidatePublicCache(); return send(res,200,adminSummary(),{},req);
    }
    if (req.method === 'POST' && url.pathname === '/api/members') {
      const item=await readBody(req), name=safeText(item.name,200), phone=safeText(item.phone,80), email=safeText(item.email,200), reason=safeText(item.reason,1000);
      if(!name||!phone||!email||!reason) return send(res,400,{error:'Please complete every membership field.'});
      const memberNo=(db.prepare('SELECT COALESCE(MAX(member_no),0) AS number FROM members').get().number||0)+1;
      const role=`YYC-${String(memberNo).padStart(3,'0')}-${roleName(name)}`;
      const photo=normalizeStoredPhoto(item.photo);
      const createdAt=new Date().toISOString();
      const result=db.prepare('INSERT INTO members(member_no,name,phone,email,reason,role,status,created_at,photo,photo_zoom,photo_x,photo_y) VALUES(?,?,?,?,?,?\,\'pending\',?,?,?,?,?)').run(memberNo,name,phone,email,reason,role,createdAt,photo,safeNumber(item.photoZoom,1,1,3),safeNumber(item.photoX,50,0,100),safeNumber(item.photoY,50,0,100));
      const member=db.prepare('SELECT id,member_no AS memberNo,name,phone,email,reason,role,status,created_at AS createdAt,photo,photo_zoom AS photoZoom,photo_x AS photoX,photo_y AS photoY FROM members WHERE id=?').get(result.lastInsertRowid);
      return send(res,201,{member});
    }
    const statusMatch=url.pathname.match(/^\/api\/members\/(\d+)\/status$/);
    if(req.method==='PATCH'&&statusMatch){ if(!requireAdmin(req,res)) return; const body=await readBody(req), status=safeText(body.status,20).toLowerCase(); if(!['pending','approved','rejected'].includes(status)) return send(res,400,{error:'Invalid membership status.'}); const result=db.prepare('UPDATE members SET status=? WHERE id=?').run(status,Number(statusMatch[1])); if(!result.changes)return send(res,404,{error:'Member not found.'}); invalidatePublicCache(); return send(res,200,adminSummary(),{},req); }
    const photoMatch=url.pathname.match(/^\/api\/(members|leaders)\/(\d+)\/photo$/);
    if(req.method==='PATCH'&&photoMatch){
      if(!requireAdmin(req,res)) return;
      const [,type,id]=photoMatch, body=await readBody(req), existing=db.prepare(`SELECT photo FROM ${type} WHERE id=?`).get(Number(id));
      const next=normalizeStoredPhoto(body.photo);
      if(existing?.photo&&existing.photo!==next) deleteStoredImage(existing.photo);
      db.prepare(`UPDATE ${type} SET photo=?,photo_zoom=?,photo_x=?,photo_y=? WHERE id=?`).run(next,safeNumber(body.photoZoom,1,1,3),safeNumber(body.photoX,50,0,100),safeNumber(body.photoY,50,0,100),Number(id));
      return send(res,200,{ok:true});
    }
    if(req.method==='POST' && /^\/api\/(leaders|announcements|gallery)$/.test(url.pathname)) {
      if(!requireAdmin(req,res)) return;
      const type=url.pathname.split('/').pop(), item=await readBody(req);
      if(type==='leaders'){
        const name=safeText(item.name,200),role=safeText(item.role,120),photo=normalizeStoredPhoto(item.photo); if(!name||!role)return send(res,400,{error:'Name and role are required.'});
        db.prepare('INSERT INTO leaders(name,role,photo,photo_zoom,photo_x,photo_y) VALUES(?,?,?,?,?,?)').run(name,role,photo,safeNumber(item.photoZoom,1,1,3),safeNumber(item.photoX,50,0,100),safeNumber(item.photoY,50,0,100));
      }
      if(type==='announcements'){
        const title=safeText(item.title,300),body=safeText(item.body,8000); if(!title||!body)return send(res,400,{error:'Title and details are required.'});
        db.prepare('INSERT INTO announcements(date,title,body,created_at) VALUES(?,?,?,?)').run(new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}),title,body,new Date().toISOString());
      }
      if(type==='gallery'){
        const title=safeText(item.title,300),photo=normalizeStoredPhoto(item.photo); if(!title)return send(res,400,{error:'A gallery caption is required.'});
        const pos=(db.prepare('SELECT COALESCE(MAX(position),-1) AS p FROM gallery').get().p||-1)+1; db.prepare('INSERT INTO gallery(title,position,photo,created_at) VALUES(?,?,?,?)').run(title,pos,photo,new Date().toISOString());
      }
      return send(res,201,{ok:true});
    }
    const edit=url.pathname.match(/^\/api\/(members|leaders|announcements|gallery)\/(\d+)$/);
    if(req.method==='PUT'&&edit){
      if(!requireAdmin(req,res)) return;
      const [,type,id]=edit, item=await readBody(req), n=Number(id);
      if(type==='members'){
        const name=safeText(item.name,200),phone=safeText(item.phone,80),email=safeText(item.email,200),reason=safeText(item.reason,1000); if(!name||!phone||!email||!reason)return send(res,400,{error:'All member fields are required.'});
        const result=db.prepare('UPDATE members SET name=?,phone=?,email=?,reason=? WHERE id=?').run(name,phone,email,reason,n); if(!result.changes)return send(res,404,{error:'Member not found.'});
      } else if(type==='leaders'){
        const name=safeText(item.name,200),role=safeText(item.role,120); if(!name||!role)return send(res,400,{error:'Name and role are required.'}); db.prepare('UPDATE leaders SET name=?,role=? WHERE id=?').run(name,role,n);
      } else if(type==='announcements'){
        const title=safeText(item.title,300),body=safeText(item.body,8000); if(!title||!body)return send(res,400,{error:'Title and details are required.'}); db.prepare('UPDATE announcements SET title=?,body=? WHERE id=?').run(title,body,n);
      } else {
        const title=safeText(item.title,300),existing=db.prepare('SELECT photo FROM gallery WHERE id=?').get(n); if(!title)return send(res,400,{error:'Gallery caption is required.'});
        if(item.photo!==undefined){const next=normalizeStoredPhoto(item.photo); if(existing?.photo&&existing.photo!==next)deleteStoredImage(existing.photo); db.prepare('UPDATE gallery SET title=?,photo=? WHERE id=?').run(title,next,n);} else db.prepare('UPDATE gallery SET title=? WHERE id=?').run(title,n);
      }
      invalidatePublicCache(); return send(res,200,{ok:true});
    }
    const remove=url.pathname.match(/^\/api\/(members|leaders|announcements|gallery)\/(\d+)$/);
    if(req.method==='DELETE'&&remove){
      if(!requireAdmin(req,res))return;
      const [,type,id]=remove,n=Number(id); const row=db.prepare(`SELECT photo FROM ${type} WHERE id=?`).get(n); if(row?.photo)deleteStoredImage(row.photo); db.prepare(`DELETE FROM ${type} WHERE id=?`).run(n); invalidatePublicCache(); return send(res,200,{ok:true});
    }
    if(req.method==='GET'){
      if(url.pathname.startsWith('/uploads/')){
        const rel=decodeURIComponent(url.pathname.slice('/uploads/'.length));
        const abs=path.resolve(uploadsRoot,rel); if(!abs.startsWith(path.resolve(uploadsRoot)+path.sep))return res.writeHead(403).end('Forbidden');
        if(fs.existsSync(abs)){const ext=path.extname(abs).toLowerCase(); return sendFile(res,200,abs,mime[ext]||'application/octet-stream','public, max-age=31536000, immutable');}
        return res.writeHead(404).end('Not found');
      }
      const requested=decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname), abs=path.resolve(root,`.${requested}`);
      if(!abs.startsWith(root))return res.writeHead(403).end('Forbidden');
      if(!fs.existsSync(abs)||!fs.statSync(abs).isFile())return res.writeHead(404).end('Not found');
      const ext=path.extname(abs).toLowerCase(); return sendFile(res,200,abs,mime[ext]||'application/octet-stream',ext==='.html'||ext==='.js'||ext==='.css'?'no-cache':'public, max-age=86400');
    }
    return send(res,405,{error:'Method not allowed.'});
  }catch(error){ console.error(error); return send(res,500,{error:error.message||'Server error.'}); }
});
server.listen(4176,()=>console.log('Yuvakesari server ready at http://localhost:4176'));
