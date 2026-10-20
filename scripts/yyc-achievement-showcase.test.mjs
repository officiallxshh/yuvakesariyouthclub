import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const index = read('index.html');
const js = read('yyc90.js');
const css = read('assets/yyc-achievements.css');
const migration = read('supabase/migrations/20261020094435_yyc_achievement_podium_multiphoto.sql');
const publicPages = read('scripts/generate-public-pages.mjs');
const smoothData = read('assets/yyc-smooth-data.js');
const uploader = read('supabase/functions/yyc-image-upload/index.ts');

test('Achievements is a dedicated desktop and mobile navigation section before Gallery', () => {
  const desktopNav = index.match(/<nav\b[^>]*class=["'][^"']*\bdesktop-nav\b[^"']*["'][^>]*>([\s\S]*?)<\/nav>/i);
  assert.ok(desktopNav, 'desktop navigation exists');
  assert.ok(desktopNav[1].indexOf('href="#achievements"') >= 0, 'desktop nav has achievements');
  assert.ok(desktopNav[1].indexOf('href="#achievements"') < desktopNav[1].indexOf('href="#gallery"'), 'achievements appears before gallery in desktop nav');

  const mobilePanel = index.match(/<div\b[^>]*id=["']mobilePanel["'][^>]*>([\s\S]*?)<\/div>/i);
  assert.ok(mobilePanel, 'mobile navigation exists');
  assert.ok(mobilePanel[1].indexOf('href="#achievements"') < mobilePanel[1].indexOf('href="#gallery"'), 'achievements appears before gallery in mobile nav');

  assert.ok(index.indexOf('id="achievements"') < index.indexOf('id="gallery"'), 'homepage achievements section precedes Gallery');
  assert.match(index, /id="yycAchievementsGrid"/);
  assert.match(index, /id="yycAchievementCount"/);
  assert.match(index, /yyc-achievements\.css\?v=20261020-01/);

  const stylesheets = [...index.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi)];
  assert.ok(stylesheets.at(-1)?.[0].includes('yyc-professional-ux.css'), 'professional UX finish remains the final stylesheet');
  assert.ok(index.indexOf('assets/yyc-nav-active-state.css') < index.indexOf('assets/yyc-professional-ux.css'), 'active-nav controller loads before final visual polish');
});

test('Each achievement renders as one cube with a podium badge and grouped photos', () => {
  assert.match(js, /function renderAchievementsShowcase90\(\)/);
  assert.match(js, /rows\.map\(function\(a\)/, 'one card is rendered per achievement row');
  assert.match(js, /class="yyc-achievement-cube reveal"/);
  assert.match(js, /function achievementImages90\(a\)/);
  assert.match(js, /a\.image_url/);
  assert.match(js, /a\.image_urls/);
  assert.match(js, /photos\.slice\(0,4\)/, 'up to four photos make one collage cover');
  assert.match(js, /data-yyc-achievement=/);
  assert.match(js, /yycAchievementCount/);
  assert.match(js, /data-yyc-achievements-version/, 'unchanged data is not re-rendered on every poll');
});

test('Viewer has previous/next and thumbnail navigation with keyboard-openable cards', () => {
  assert.match(js, /function renderAchievementPhotoViewer90\(id,photoIndex\)/);
  assert.match(js, /data-yyc-achievement-prev/);
  assert.match(js, /data-yyc-achievement-next/);
  assert.match(js, /data-yyc-achievement-photo=/);
  assert.match(js, /e\.key!=='Enter'&&e\.key!==' '/);
  assert.match(js, /aria-label="View /);
});

test('Admin can set competition result and enter up to 12 photos for one achievement', () => {
  assert.match(js, /id="a90Placement"/);
  assert.match(js, /value="first">1st place/);
  assert.match(js, /value="second">2nd place/);
  assert.match(js, /value="third">3rd place/);
  assert.match(js, /value="runner_up">Runner-up/);
  assert.match(js, /id="a90Images"/);
  assert.match(js, /id="a90Files" type="file"[^>]*multiple/);
  assert.match(js, /window\.uploadYYCImage\(dataUrl,'achievement',window\.adminToken/);
  assert.match(js, /enteredImages\.length\+imageFiles\.length>12/);
  assert.match(js, /var imageFiles=uploadInput&&uploadInput\.files/);
  assert.match(js, /image_urls:enteredImages/);
  assert.match(js, /image_url:enteredImages\[0\]\|\|''/);
  assert.match(js, /load90Public\(\)/, 'saving or deleting an achievement refreshes public data');
});

test('Database migration preserves single-image compatibility and protects admin writes', () => {
  assert.match(migration, /add column if not exists placement text not null default 'participation'/i);
  assert.match(migration, /add column if not exists image_urls text\[\] not null default '\{\}'::text\[\]/i);
  assert.match(migration, /'participation','first','second','third','runner_up','special'/);
  assert.match(migration, /set image_urls = array\[image_url\]/i, 'existing cover images are copied to the new image list');
  assert.match(migration, /if not public\._admin_ok\(p_token\) then/i, 'achievement writes keep the existing admin session guard');
  assert.match(migration, /limit 12/i, 'database enforces the same maximum photo count');
  assert.match(migration, /'image_urls',a\.image_urls,'placement',a\.placement/);
  assert.match(migration, /where a\.status='published' and \(a\.publish_at is null or a\.publish_at<=now\(\)\)/i, 'public RPC exposes only published, scheduled-ready achievements');
});

test('Achievement image uploads remain admin-token guarded and use a dedicated storage folder', () => {
  assert.match(uploader, /new Set\(\["member","leader","announcement","gallery","event","swag","achievement"\]\)/);
  assert.match(uploader, /else if\(!reg && !await adminOK\(t\)\)/, 'admin upload types require an existing valid admin session');
  assert.match(uploader, /"achievement":"achievements"/, 'achievement photos are isolated in their own storage folder');
});

test('Achievement detail pages anchor to the new homepage showcase and use shared reveals', () => {
  assert.match(publicPages, /achievement: 'achievements'/);
  assert.match(smoothData, /'#yycAchievementsGrid'/);
  assert.match(smoothData, /\.yyc-achievement-cube/);
  assert.match(css, /\.yyc-achievement-award\.is-first/);
  assert.match(css, /\.yyc-achievement-award\.is-second/);
  assert.match(css, /\.yyc-achievement-award\.is-third/);
  assert.match(css, /\.yyc-achievement-award\.is-runner-up/);
  assert.match(css, /@media \(max-width: 620px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});
