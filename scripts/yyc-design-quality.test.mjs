import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const index = read('index.html');
const css = read('assets/yyc-professional-ux.css');

test('Professional UX stylesheet is loaded once as the final CSS layer', () => {
  const links = [...index.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/g)].map((match) => match[0]);
  assert.ok(links.length > 0, 'Expected homepage stylesheets.');
  assert.match(links.at(-1), /assets\/yyc-professional-ux\.css\?v=20261020-01-whitehat-quality/);
  assert.equal((index.match(/assets\/yyc-professional-ux\.css/g) || []).length, 1);
});

test('Design finish uses shared tokens and preserves YYC brand palette', () => {
  for (const token of [
    '--yyc-design-surface:',
    '--yyc-design-surface-raised:',
    '--yyc-design-edge:',
    '--yyc-design-edge-strong:',
    '--yyc-design-copy:',
    '--yyc-design-muted:',
    '--yyc-design-radius:',
    '--yyc-design-ease:'
  ]) assert.ok(css.includes(token), 'Missing design token: ' + token);
  assert.match(css, /#dfbf7b/);
  assert.match(css, /rgba\(231,191,112/);
});

test('Tablet and compact-laptop navigation reuses the existing menu controller', () => {
  assert.match(css, /@media\s*\(min-width:\s*981px\)\s*and\s*\(max-width:\s*1320px\)/);
  assert.match(css, /\.desktop-nav\s*\{display:none!important\}/);
  assert.match(css, /\.menu-btn\s*\{display:block\}/);
  assert.match(css, /\.mobile-panel\.open\s*\{[^}]*pointer-events:auto/s);
  assert.match(index, /id="menuBtn"[^>]*aria-expanded="false"/);
  assert.match(index, /id="mobilePanel"/);
});

test('Visual interaction is limited to fine pointers and respects reduced motion', () => {
  assert.match(css, /@media\s*\(hover:hover\)\s*and\s*\(pointer:fine\)\s*and\s*\(prefers-reduced-motion:no-preference\)/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:reduce\)/);
  assert.match(css, /animation-duration:\.01ms!important/);
  assert.match(css, /transition-duration:\.01ms!important/);
});

test('Keyboard focus and forced-colors users receive explicit high-visibility treatment', () => {
  assert.match(css, /:focus-visible/);
  assert.match(css, /outline:2px solid #f5d58f!important/);
  assert.match(css, /@media\s*\(forced-colors:active\)/);
  assert.match(css, /outline:2px solid Highlight!important/);
});

test('Page sections retain readable editorial measure and touch-friendly actions', () => {
  assert.match(css, /max-width:48ch/);
  assert.match(css, /text-wrap:balance/);
  assert.match(css, /min-height:44px/);
  assert.match(css, /\.section-kicker::before/);
});
