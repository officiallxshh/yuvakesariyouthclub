import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const html = read('index.html');
const pack = read('assets/yyc-performance-pack.js');
const css = read('assets/yyc-performance-stability.css');

test('hero background is preloaded with high priority', () => {
  assert.match(html, /<link rel="preload" as="image" href="\.\/assets\/hero-tulunad\.webp" fetchpriority="high">/);
});

test('header logo is dimensioned and footer logo stays lazy', () => {
  assert.match(html, /alt="Yuvakesari Youth Club logo" loading="eager" decoding="async" width="49" height="49"/);
  assert.match(html, /alt="YYC logo" loading="lazy" decoding="async" width="45" height="45"/);
});

test('non-primary hero culture imagery does not compete as eager downloads', () => {
  assert.match(html, /<img src="\.\/assets\/dharma-daiva\.webp" alt="Dharma Daiva" loading="lazy" decoding="async">/);
  assert.match(html, /<img src="\.\/assets\/aati-kalenja\.webp" alt="Aati Kalenja" loading="lazy" decoding="async">/);
  assert.match(html, /<img src="\.\/assets\/yakshagana\.webp" alt="Yakshagana" loading="lazy" decoding="async">/);
  assert.match(html, /class="hero-logo" src="\.\/assets\/yyc-logo-clean\.webp" alt="Yuvakesari Youth Club emblem" loading="eager" decoding="async"/);
});

test('mobile and low-data paint safeguards are linked before the final active-nav stylesheet', () => {
  assert.match(html, /assets\/yyc-performance-stability\.css\?v=20261013-01/);
  const stabilityPosition = html.indexOf('assets/yyc-performance-stability.css');
  const navPosition = html.indexOf('assets/yyc-nav-active-state.css');
  assert.ok(stabilityPosition >= 0 && navPosition > stabilityPosition);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*?\.modal-backdrop[\s\S]*?backdrop-filter: none !important/i);
  assert.match(css, /body\.yyc-low-data \.hero-photo[\s\S]*?filter: none !important/i);
  assert.match(css, /body\.yyc-reduced-motion \.modal-backdrop/i);
});

test('dynamic-media observer deduplicates subtree work per animation frame', () => {
  assert.match(pack, /var pending = new Set\(\)/);
  assert.match(pack, /window\.requestAnimationFrame\(function \(\) \{/);
  assert.match(pack, /candidates\.has\(parent\)/);
  assert.match(pack, /if \(!root \|\| !root\.isConnected\) continue/);
  assert.match(pack, /setAttribute\('loading', 'lazy'\)/);
  assert.match(pack, /setAttribute\('decoding', 'async'\)/);
});
