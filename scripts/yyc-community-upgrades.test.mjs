import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const index = read('index.html');
const app = read('app.js');
const js = read('assets/yyc-community-upgrades.js');
const css = read('assets/yyc-community-upgrades.css');

test('Homepage has accessible skip navigation and a dedicated Help Centre', () => {
  assert.match(index, /class="yyc-skip-link" href="#mainContent"/);
  assert.match(index, /<main id="mainContent" tabindex="-1">/);
  assert.match(index, /id="communityHelp" aria-labelledby="communityHelpTitle"/);
  assert.match(index, /href="#communityHelp">Help &amp; FAQ<\/a>/);
  assert.match(index, /id="yycHelpSearch"/);
  assert.match(index, /id="yycHelpResultCount" aria-live="polite"/);
});

test('Help Centre contains at least 15 answers across all intended topics', () => {
  const questions = index.match(/class="yyc-help-item" data-help-category=/g) || [];
  assert.ok(questions.length >= 15, 'Expected at least 15 practical FAQ entries.');
  for (const category of ['all', 'membership', 'events', 'community', 'account', 'privacy']) {
    assert.match(index, new RegExp('data-help-filter="' + category + '"'));
  }
  assert.match(js, /function filterHelp\(\)/);
  assert.match(js, /yycHelpExpandAll/);
  assert.match(js, /yycHelpCollapseAll/);
});

test('Help Centre exposes share, copy, contact, membership, WhatsApp and print actions', () => {
  for (const id of ['yycShareSiteBtn', 'yycCopySiteLinkBtn', 'yycCopyHelpLinkBtn', 'yycPrintHelpBtn', 'yycHelpRegisterBtn']) {
    assert.match(index, new RegExp('id="' + id + '"'));
    assert.match(js, new RegExp(id));
  }
  assert.match(index, /href="\.\/contact\.html"/);
  assert.match(index, /https:\/\/chat\.whatsapp\.com\/JY6SGuGI6FM9Cwr2iPz54b/);
  assert.match(js, /navigator\.share/);
  assert.match(js, /window\.print\(\)/);
});

test('Accessibility preferences are usable, independent and persisted locally', () => {
  for (const id of ['yycA11yToggle', 'yycTextIncrease', 'yycTextDecrease', 'yycHighContrastToggle', 'yycReduceMotionToggle', 'yycAccessReset']) {
    assert.match(index, new RegExp('id="' + id + '"'));
    assert.match(js, new RegExp(id));
  }
  assert.match(js, /yyc-community-accessibility-v1/);
  assert.match(js, /localStorage\.setItem/);
  assert.match(css, /body\.yyc-high-contrast/);
  assert.match(css, /body\.yyc-user-reduce-motion/);
  assert.match(css, /body\.yyc-text-larger/);
});

test('Events support bulk export of dated published future events as one ICS file', () => {
  assert.match(index, /id="yycDownloadAllEvents"/);
  assert.match(app, /function yycDownloadUpcomingEventsCalendar\(\)/);
  assert.match(app, /ev\.event_date/); // Individual existing event export remains supported.
  assert.match(app, /publicData&&publicData\.events/);
  assert.match(app, /yyc-upcoming-events-/);
  assert.match(app, /METHOD:PUBLISH/);
  assert.match(app, /yycDownloadAllEvents'\)\.addEventListener\('click',yycDownloadUpcomingEventsCalendar/);
});

test('Community upgrade styles support narrow screens, printing and accessible focus', () => {
  assert.match(css, /@media\(max-width:780px\)/);
  assert.match(css, /@media print/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /\.yyc-help-item\[hidden\]/);
  assert.match(index, /assets\/yyc-community-upgrades\.css/);
  assert.match(index, /assets\/yyc-community-upgrades\.js/);
});
