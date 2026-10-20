import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const css = read('assets/yyc-cinematic-experience.css');
const uxCss = read('assets/yyc-professional-ux.css');
const index = read('index.html');
const app = read('app.js');
const audit = read('scripts/yyc-full-audit.mjs');
const seoCss = read('yyc-seo.css');
const leadersPage = read('leaders.html');
const mediaPage = read('media.html');

test('cinematic, active-nav and professional UX layers preserve the intended cascade', () => {
  const currentBuild = '20261014-02-qr-attendance';
  const cinematic = index.indexOf('assets/yyc-cinematic-experience.css?v=' + currentBuild);
  const nav = index.indexOf('assets/yyc-nav-active-state.css?v=' + currentBuild);
  const professionalUX = index.indexOf('assets/yyc-professional-ux.css?v=20261020-01-whitehat-quality');
  assert.ok(cinematic >= 0, 'cinematic stylesheet is linked');
  assert.ok(nav > cinematic, 'active-nav stylesheet remains after cinematic layer');
  assert.ok(professionalUX > nav, 'professional UX finish is explicitly last');
  const links = [...index.matchAll(/<link\\b[^>]*rel=["']stylesheet["'][^>]*>/gi)];
  assert.ok(links.at(-1)?.[0].includes('yyc-professional-ux.css'), 'professional UX stylesheet is the final linked stylesheet');
  assert.doesNotMatch(uxCss, /\\.desktop-nav\\s*>\\s*a\\.nav-link\\.active/, 'final polish must not replace active-nav state rules');
  assert.ok(index.includes('name="yyc-build" content="' + currentBuild + '"'));
  assert.ok(app.includes("var YYC_APP_BUILD='" + currentBuild + "'"));
  assert.ok(audit.includes('const currentBuild = "' + currentBuild + '";'));
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
  assert.match(css, /\.yyc-reel-card,.yyc-reel-event-cube/);
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

test('generated listing/detail pages and standalone leadership/media pages receive motion polish', () => {
  assert.match(seoCss, /YYC GENERATED PAGE MOTION LAYER/);
  assert.match(seoCss, /\.wrap>\.card/);
  assert.match(seoCss, /\.listing>\.item/);
  assert.match(seoCss, /@keyframes yycSeoPageIn/);
  assert.match(seoCss, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(leadersPage, /assets\/yyc-cinematic-experience\.css\?v=20261013-45-cinematic-experience/);
  assert.match(mediaPage, /assets\/yyc-cinematic-experience\.css\?v=20261013-45-cinematic-experience/);
  assert.match(css, /\.wrap>\.grid>\.person/);
  assert.match(css, /\.wrap>\.coverage/);
});
