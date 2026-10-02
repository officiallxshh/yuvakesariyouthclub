import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const CURRENT_ASSET_VERSION = '20261002-07';
const ignored = new Set(['.git','node_modules']);

function walk(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(ent.name)) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(full));
    else out.push(path.relative(ROOT, full).replaceAll(path.sep, '/'));
  }
  return out;
}
function stripQuery(ref) {
  return String(ref || '').split('?')[0].split('#')[0];
}
function normalizeTarget(from, ref) {
  const raw = stripQuery(ref);
  if (!raw || /^(https?:|data:|mailto:|tel:|javascript:)/i.test(raw) || raw.startsWith('#')) return null;
  let joined = raw.startsWith('/') ? raw.slice(1) : path.join(path.dirname(from), raw);
  const parts = [];
  for (const part of joined.replaceAll('\\', '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return parts.join('/');
}
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}
function addIssue(list, msg) { list.push(msg); }

const files = walk(ROOT);
const fileSet = new Set(files);
const issues = [];
const warnings = [];

const jsFiles = files.filter(f => /\.(?:js|mjs|cjs)$/i.test(f));
for (const file of jsFiles) {
  const r = spawnSync(process.execPath, ['--check', file], { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) addIssue(issues, `JS syntax: ${file}\\n${(r.stderr || r.stdout || '').trim()}`);
}

for (const file of files.filter(f => /\.css$/i.test(f))) {
  const raw = read(file);
  const stripped = raw
    .replace(/\/\*[\\s\\S]*?\*\//g, '')
    .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '');
  let depth = 0;
  for (const ch of stripped) {
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    if (depth < 0) break;
  }
  if (depth !== 0) addIssue(issues, `CSS brace mismatch: ${file}`);
}

for (const file of files.filter(f => /\.html?$/i.test(f))) {
  const html = read(file);
  const ids = [...html.matchAll(/\bid=["']([^"']+)["']/gi)].map(m => m[1]);
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) addIssue(issues, `Duplicate id in ${file}: #${id}`);
    seen.add(id);
  }

  const refs = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/gi)].map(m => m[1]);
  for (const ref of refs) {
    const target = normalizeTarget(file, ref);
    if (target && !fileSet.has(target)) addIssue(issues, `Missing local reference: ${file} -> ${ref} (resolved ${target})`);
  }

  if (/yyc-production\.(?:js|css)\?v=/i.test(html) && !html.includes(`yyc-production.js?v=${CURRENT_ASSET_VERSION}`) && !html.includes(`yyc-production.css?v=${CURRENT_ASSET_VERSION}`)) {
    addIssue(issues, `Stale YYC production asset version in ${file}; expected ${CURRENT_ASSET_VERSION}`);
  }
}

const sourceText = files
  .filter(f => /\.(?:html?|js|css)$/i.test(f))
  .map(read)
  .join('\n');

const badSelector = sourceText.match(/(?<!\$)\$\((['"])[^'"]+\\1\)\.forEach/g);
if (badSelector) addIssue(issues, `Single-element $().forEach() runtime pattern found: ${badSelector[0]}`);

const index = read('index.html');
const app = read('app.js');
const yyc90 = read('yyc90.js');
const yyc90final = read('yyc90-final.js');
const production = read('yyc-production.js');

const coreButtons = [
  'memberLoginBtn','leaderLoginBtn','adminOpenBtn','menuBtn',
  'memberLoginMobile','leaderLoginMobile','adminOpenMobile',
  'submitUpdateBtn','submitGalleryBtn','memberRegisterBtn','footerAdminBtn'
];
for (const id of coreButtons) {
  const exists = index.includes(`id="${id}"`);
  const handled = app.includes(`#${id}`) || app.includes(`'${id}'`) || app.includes(`"${id}"`) || yyc90.includes(id) || production.includes(id);
  if (!exists) addIssue(issues, `Core button missing from index.html: #${id}`);
  else if (!handled) addIssue(issues, `Core button has no detected handler/wiring: #${id}`);
}

const adminActions = [
  'data-view','data-download-member','data-edit-member','data-reset-member','data-review-member',
  'data-approve','data-mark-duplicate','data-deny','data-remove',
  'data-card-leader','data-download-leader','data-edit-leader','data-reset-leader','data-del-leader',
  'data-edit-update','data-del-update','data-edit-gallery','data-del-gallery',
  'data-edit-swag','data-del-swag','data-am','data-dm','data-au','data-du','data-ag','data-dg',
  'data-edit-event','data-del-event'
];
const adminSource = app.slice(app.indexOf('function adminPanel'), app.indexOf('async function verifyFromUrl'));
for (const attr of adminActions) {
  const count = (adminSource.match(new RegExp(attr.replace(/[.*+?^$()|[\]\\]/g, '\\$&'), 'g')) || []).length;
  if (count < 2) addIssue(issues, `Admin control wiring looks incomplete for [${attr}] (found ${count} references)`);
}

const adminTabs = ['overview','members','leaders','updates','gallery','swags','approvals','events','notifications','activity','reports','storage','settings'];
for (const tab of adminTabs) {
  if (!adminSource.includes(`'${tab}'`) || !adminSource.includes(`tab===\'${tab}\'`)) {
    addIssue(issues, `Admin tab wiring incomplete: ${tab}`);
  }
}

const customTabs = ['volunteers','achievements','history','attendance','finance','messages','analytics','backup','sitepro'];
for (const tab of customTabs) {
  if (!yyc90.includes(`'${tab}'`) || !yyc90.includes(`tab===' ${tab}'`.replace(' ',''))) {
    addIssue(issues, `YYC90 custom admin tab wiring incomplete: ${tab}`);
  }
}

if (/document\.addEventListener\(['"]input['"][\\s\\S]{0,2200}localStorage\.setItem\([^\n]+\)[\\s\\S]{0,500}querySelectorAll\(['"]input,textarea,select['"]/.test(production)) {
  addIssue(issues, 'Admin draft autosave still scans the whole document on each keystroke.');
}
if (/setInterval\([^,]+,\s*100\)/.test(read('access.js'))) {
  warnings.push('access.js contains a legacy 100ms polling fallback; it is not loaded by index.html.');
}

const large = files
  .map(f => ({ f, n: fs.statSync(path.join(ROOT, f)).size }))
  .filter(x => x.n > 180000)
  .sort((a,b) => b.n-a.n);
if (large.length) warnings.push('Large source/assets: ' + large.map(x => x.f + ' (' + Math.round(x.n/1024) + ' KB)').join(', '));

console.log('YYC FULL SITE AUDIT');
console.log('Files scanned:', files.length);
console.log('JS syntax checks:', jsFiles.length);
console.log('Issues:', issues.length);
if (issues.length) console.error(issues.join('\\n---\\n'));
console.log('Warnings:', warnings.length);
if (warnings.length) console.warn(warnings.join('\\n'));

if (issues.length) process.exit(1);
console.log('PASS: repository static/runtime-wiring audit completed.');
