import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const index = read('index.html');
const app = read('app.js');
const legacyPath = read('meet/index.html');
const migration = read('supabase/migrations/20261020115000_remove_yyc_meet.sql');
const sitemap = read('sitemap.xml');

test('No homepage navigation, iframe, or invite relay points to the retired Meet feature', () => {
  assert.doesNotMatch(index, /href=["']#meet["']/i);
  assert.doesNotMatch(index, /id=["']meet["']/i);
  assert.doesNotMatch(index, /yycMeetHomeFrame|yyc-meet-frame-height|\.\/meet\/\?join=/i);
  assert.doesNotMatch(index, /<iframe[^>]+\.\/meet\//i);
});

test('Admin navigation and dashboard no longer expose Meet controls', () => {
  assert.doesNotMatch(app, /\[['"]meet['"],\s*['"]YYC Meet['"]\]/i);
  assert.doesNotMatch(app, /tab===['"]meet['"]/i);
  assert.doesNotMatch(app, /data-admin-tab=["']meet["']/i);
  assert.doesNotMatch(app, /\.\/meet\/\?admin_embed=/i);
});

test('Old Meet route immediately redirects home and its active assets/docs are removed', () => {
  assert.match(legacyPath, /window\.location\.replace\(['"]\.\.\/['"]\)/);
  assert.doesNotMatch(legacyPath, /meet\.js|meet\.css|jitsi|meeting code|schedule meeting|yyc meet/i);
  assert.equal(fs.existsSync(new URL('../meet/meet.js', import.meta.url)), false);
  assert.equal(fs.existsSync(new URL('../meet/meet.css', import.meta.url)), false);
  assert.equal(fs.existsSync(new URL('../docs/YYC-CUSTOM-MEET.md', import.meta.url)), false);
  assert.equal(fs.existsSync(new URL('../docs/YYC-JITSI-MEET.md', import.meta.url)), false);
});

test('Meet is removed from sitemap and public database API while old records are privately archived', () => {
  assert.doesNotMatch(sitemap, /\/meet\/?/i);
  assert.match(migration, /drop function if exists public\.yyc_meet_attendance/i);
  assert.match(migration, /drop function if exists public\.yyc_meet_lookup/i);
  assert.match(migration, /drop function if exists public\.yyc_meet_portal/i);
  assert.match(migration, /alter table public\.yyc_meetings set schema private/i);
  assert.match(migration, /alter table public\.yyc_meeting_attendance set schema private/i);
  assert.match(migration, /revoke all on table private\.yyc_meetings from public, anon, authenticated/i);
  assert.match(migration, /notify pgrst, 'reload schema'/i);
});
