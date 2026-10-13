import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const css = read('assets/yyc-cinematic-experience.css');
const index = read('index.html');
const app = read('app.js');
const audit = read('scripts/yyc-full-audit.mjs');

test('cinematic stylesheet loads before the exclusive active-nav stylesheet', () => {
  const cinematic = index.indexOf('assets/yyc-cinematic-experience.css?v=20261013-45-cinematic-experience');
  const nav = index.indexOf('assets/yyc-nav-active-state.css?v=20261013-45-cinematic-experience');
  assert.ok(cinematic >= 0, 'cinematic stylesheet is linked');
  assert.ok(nav > cinematic, 'exclusive nav active-state stylesheet remains after cinematic layer');
  const links = [...index.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi)];
  assert.ok(links.at(-1)?.[0].includes('yyc-nav-active-state.css'), 'nav active-state stylesheet is still the final linked stylesheet');
  assert.match(index, /name="yyc-build" content="20261013-45-cinematic-experience"/);
  assert.match(app, /var YYC_APP_BUILD='20261013-45-cinematic-experience'/);
  assert.match(audit, /const currentBuild = "20261013-45-cinematic-experience";/);
});

test('section reveal, dynamic cards, modal and admin tab animations reuse existing lifecycle classes', () => {
  assert.match(css, /body\.yyc-scroll-ready \.section \.reveal\.yyc-scroll-in/);
  assert.match(css, /html\.yyc-smooth-data \.leader-card\.yyc-data-ready/);
  assert.match(css, /\.section\.yyc-section-navigate \.section-head/);
  assert.match(css, /\.modal\.open \.modal-shell/);
  assert.match(css, /#modalContent\.yyc-panel-swap-in/);
  assert.match(css, /\.admin-workspace\.yyc-admin-tab-enter/);
  assert.match(css, /@keyframes yycCinematicReveal/);
  assert.match(css, /@keyframes yycCinematicCardIn/);
  assert.match(css, /@keyframes yycCinematicModalIn/);
});

test('hover polish does not depend on hover-capable desktops only, and active-nav state is left alone', () => {
  assert.match(css, /@media \(hover:hover\) and \(pointer:fine\) and \(prefers-reduced-motion:no-preference\)/);
  assert.match(css, /\.yyc-certificate-card:hover/);
  assert.match(css, /yyc-certificate-actions button:hover/);
  assert.doesNotMatch(css, /\.desktop-nav > a\.nav-link\.active/);
  assert.match(css, /Visual-only layer: no JS event interception, layout changes, or data\/auth edits/);
});

test('reduced motion disables decorative entrances and transitions', () => {
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
  const reduceBlock = css.slice(css.lastIndexOf('@media(prefers-reduced-motion:reduce)'));
  assert.match(reduceBlock, /animation:none!important/);
  assert.match(reduceBlock, /transition:none!important/);
  assert.match(reduceBlock, /transform:none!important/);
});

test('low-data and mobile fallbacks shorten or remove decorative motion', () => {
  assert.match(css, /body\.yyc-low-data/);
  assert.match(css, /@media\(max-width:700px\)/);
  assert.match(css, /yyc-cinema/);
});
