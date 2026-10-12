import { chromium } from 'playwright';

const baseURL = process.env.YYC_TEST_BASE_URL || 'http://127.0.0.1:4173/';
const browser = await chromium.launch({ headless: true });
const failures = [];

try {
  const page = await browser.newPage({
    viewport: { width: 1365, height: 900 },
    reducedMotion: 'reduce'
  });

  page.on('pageerror', (error) => failures.push(error.message));
  await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.locator('.desktop-nav > a.nav-link[href^="#"]').first().waitFor({ state: 'visible', timeout: 15000 });

  await page.waitForFunction(() => {
    const links = Array.from(document.querySelectorAll('.desktop-nav > a.nav-link'));
    const active = links.filter((link) => link.classList.contains('active'));
    return active.length === 1 &&
      active[0].getAttribute('href') === '#home' &&
      active[0].getAttribute('aria-current') === 'location';
  }, null, { timeout: 6000 });

  const initialHighlight = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('.desktop-nav > a.nav-link'));
    return links
      .filter((link) => Number.parseFloat(getComputedStyle(link, '::before').opacity) > 0.5)
      .map((link) => (link.getAttribute('href') || '').slice(1));
  });
  if (initialHighlight.length !== 1 || initialHighlight[0] !== 'home') {
    throw new Error('At the top of the homepage, only Home may show the visible highlight. Visible highlights: ' + initialHighlight.join(', '));
  }
  console.log('HOME ACTIVE-STATE PASS: only Home is highlighted at initial page load');

  const targets = await page.locator('.desktop-nav > a.nav-link[href^="#"]').evaluateAll((links) => {
    return links.map((link) => (link.getAttribute('href') || '').slice(1)).filter(Boolean);
  });
  if (new Set(targets).size !== targets.length) {
    throw new Error('Desktop nav contains duplicate section targets: ' + targets.join(', '));
  }

  for (const target of targets) {
    if (!(await page.locator('#' + target).count())) {
      throw new Error('Navigation target is missing from page: #' + target);
    }

    await page.locator('.desktop-nav > a.nav-link[href="#' + target + '"]').click();
    await page.waitForFunction((id) => {
      const active = Array.from(document.querySelectorAll('.desktop-nav > a.nav-link.active'));
      return active.length === 1 &&
        active[0].getAttribute('href') === '#' + id &&
        active[0].getAttribute('aria-current') === 'location';
    }, target, { timeout: 6000 });
    console.log('DESKTOP NAV PASS:', target);
  }

  await page.goto(baseURL + '#events', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => {
    const active = Array.from(document.querySelectorAll('.desktop-nav > a.nav-link.active'));
    return active.length === 1 && active[0].getAttribute('href') === '#events';
  }, null, { timeout: 6000 });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => {
    const active = Array.from(document.querySelectorAll('.desktop-nav > a.nav-link.active'));
    return active.length === 1 &&
      active[0].getAttribute('href') === '#events' &&
      active[0].getAttribute('aria-current') === 'location';
  }, null, { timeout: 6000 });
  await page.waitForFunction(() => {
    const section = document.getElementById('events');
    const header = document.querySelector('.topbar');
    if (!section || !header) return false;
    const expectedTop = header.getBoundingClientRect().bottom + 12;
    return Math.abs(section.getBoundingClientRect().top - expectedTop) <= 48;
  }, null, { timeout: 6000 });
  const firstHashAligned = await page.evaluate(() => {
    const section = document.getElementById('events');
    const header = document.querySelector('.topbar');
    if (!section || !header) return false;
    const expectedTop = header.getBoundingClientRect().bottom + 12;
    return Math.abs(section.getBoundingClientRect().top - expectedTop) <= 48;
  });
  if (!firstHashAligned) throw new Error('Direct #events link did not align the section below the fixed header.');
  console.log('DEEP LINK PASS: #events loads and aligns correctly');

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => {
    const active = Array.from(document.querySelectorAll('.desktop-nav > a.nav-link.active'));
    return active.length === 1 &&
      active[0].getAttribute('href') === '#events' &&
      active[0].getAttribute('aria-current') === 'location';
  }, null, { timeout: 6000 });
  await page.waitForFunction(() => {
    const section = document.getElementById('events');
    const header = document.querySelector('.topbar');
    if (!section || !header) return false;
    const expectedTop = header.getBoundingClientRect().bottom + 12;
    return Math.abs(section.getBoundingClientRect().top - expectedTop) <= 48;
  }, null, { timeout: 6000 });
  const reloadHashAligned = await page.evaluate(() => {
    const section = document.getElementById('events');
    const header = document.querySelector('.topbar');
    if (!section || !header) return false;
    const expectedTop = header.getBoundingClientRect().bottom + 12;
    return Math.abs(section.getBoundingClientRect().top - expectedTop) <= 48;
  });
  if (!reloadHashAligned) throw new Error('Reloaded #events link did not remain aligned below the fixed header.');
  console.log('DEEP LINK PASS: #events loads, aligns and survives a page reload');

  const loginPanels = [
    { name: 'member', button: '#memberLoginBtn', form: '#memberLoginForm', close: '.modal-shell > .modal-close', field: '#mIdent', value: 'browser-test@example.invalid' },
    { name: 'leader', button: '#leaderLoginBtn', form: '#leaderLoginForm', close: '.modal-shell > .modal-close', field: '#lIdent', value: 'browser-test@example.invalid' },
    { name: 'admin', button: '#adminOpenBtn', form: '#adminLoginForm', close: '.modal-shell > .modal-close', field: '#aUser', value: 'browser-test-only' }
  ];
  for (const panel of loginPanels) {
    await page.locator(panel.button).click();
    await page.locator(panel.form).waitFor({ state: 'visible', timeout: 6000 });
    await page.locator(panel.field).fill(panel.value);
    await page.locator(panel.close).click();
    await page.waitForFunction(() => {
      const modal = document.getElementById('modal');
      return !!modal && modal.getAttribute('aria-hidden') === 'true' && !modal.classList.contains('open');
    }, null, { timeout: 4000 });
    console.log('LOGIN PANEL CLOSE PASS:', panel.name);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  const menu = page.locator('#menuBtn');
  await menu.waitFor({ state: 'visible', timeout: 8000 });
  await menu.click();
  const mobilePanel = page.locator('#mobilePanel');
  await page.waitForFunction(() => {
    const panel = document.getElementById('mobilePanel');
    return !!panel && panel.classList.contains('open');
  }, null, { timeout: 3000 });

  const mobileReelLink = mobilePanel.locator('a[href="#reel"]').first();
  await mobileReelLink.click();
  await page.waitForFunction(() => {
    const active = Array.from(document.querySelectorAll('.desktop-nav > a.nav-link.active'));
    return active.length === 1 &&
      active[0].getAttribute('href') === '#reel' &&
      active[0].getAttribute('aria-current') === 'location';
  }, null, { timeout: 6000 });
  await page.waitForFunction(() => {
    const panel = document.getElementById('mobilePanel');
    return !!panel && !panel.classList.contains('open');
  }, null, { timeout: 3000 });
  console.log('MOBILE NAV PASS: Reel anchor closes the menu and activates the matching desktop state');

  await page.setViewportSize({ width: 1365, height: 900 });

  /* Use a fake administrator session/data so the media admin UI can be tested
     without touching production records or requiring real credentials. */
  const stubImage = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
  const testGallery = [1, 2, 3].map((n) => ({
    id: 'test-photo-' + n,
    title: 'Cleanliness Drive 2026 · Photo ' + String(n).padStart(2, '0'),
    src: stubImage,
    image_url: stubImage,
    caption: 'Browser fixture photo ' + n,
    album: 'Cleanliness Drive 2026',
    image_format: 'square',
    status: 'published',
    featured: n === 1,
    sort_order: n
  }));
  const testReels = [1, 2, 3].map((n) => ({
    id: 'test-reel-' + n,
    title: 'Cleanliness Drive Reel ' + n,
    caption: 'Browser fixture reel ' + n,
    category: 'Community',
    event_name: 'Cleanliness Drive 2026',
    reel_number: n,
    reel_total: 3,
    video_url: 'https://example.invalid/test-reel-' + n + '.mp4',
    video_path: 'reels/test-reel-' + n + '.mp4',
    thumbnail_url: stubImage,
    thumbnail_path: '',
    status: 'published',
    sort_order: n,
    created_at: '2026-10-01T00:00:00.000Z'
  }));
  const testDashboard = {
    ok: true,
    members: [],
    leaders: [],
    updates: [],
    gallery: testGallery,
    events: [],
    swags: [],
    settings: {},
    pending_updates: [],
    pending_gallery: [],
    pending_volunteers: [],
    volunteers: []
  };

  await page.route('**/rest/v1/rpc/admin_login', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, token: 'browser-test-admin-token', username: 'browser-test' })
  }));
  await page.route('**/rest/v1/rpc/admin_dashboard', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(testDashboard)
  }));
  await page.route('**/rest/v1/rpc/yyc_reels_admin_list', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, reels: testReels })
  }));

  await page.locator('#adminOpenBtn').click();
  await page.locator('#adminLoginForm').waitFor({ state: 'visible', timeout: 6000 });
  await page.locator('#aUser').fill('browser-test-admin');
  await page.locator('#aPass').fill('browser-test-only');
  await page.locator('#adminLoginForm button[type="submit"]').click();
  await page.locator('.admin-shell').waitFor({ state: 'visible', timeout: 12000 });

  await page.locator('.admin-tab[data-tab="gallery"]').click();
  const galleryCube = page.locator('#adminGalleryAlbumsGrid .yyc-admin-gallery-cube');
  await galleryCube.waitFor({ state: 'visible', timeout: 8000 });
  if (await galleryCube.count() !== 1) {
    throw new Error('Three photos from the same album should appear in one admin Gallery cube.');
  }
  if (!(await galleryCube.first().innerText()).includes('3 PHOTOS')) {
    throw new Error('Admin Gallery cube should show the grouped photo count.');
  }
  await galleryCube.first().click();
  const albumPhotos = page.locator('#adminGalleryDetailGrid .admin-gallery-card');
  await albumPhotos.first().waitFor({ state: 'visible', timeout: 5000 });
  if (await albumPhotos.count() !== 3 ||
      await page.locator('#adminGalleryDetailGrid [data-edit-gallery]').count() !== 3 ||
      await page.locator('#adminGalleryDetailGrid [data-del-gallery]').count() !== 3) {
    throw new Error('Opening an admin Gallery cube must show all photos and their usual Edit/Remove actions.');
  }
  console.log('ADMIN GALLERY CUBE PASS: 3 photos grouped; Edit/Remove actions appear in the album');

  await page.locator('#adminGalleryBackAlbums').click();
  await page.locator('.admin-tab[data-tab="reels"]').click();
  const reelCube = page.locator('#yycReelAdminGrid .yyc-reel-admin-event-cube');
  await reelCube.waitFor({ state: 'visible', timeout: 8000 });
  if (await reelCube.count() !== 1) {
    throw new Error('Three Reels from the same event should appear in one admin Reel cube.');
  }
  if (!(await reelCube.first().innerText()).includes('3 REELS')) {
    throw new Error('Admin Reel cube should show the grouped Reel count.');
  }
  await reelCube.first().locator('[data-admin-reel-group]').click();
  const managedReels = page.locator('#yycReelAdminGrid .yyc-reel-admin-card');
  await managedReels.first().waitFor({ state: 'visible', timeout: 5000 });
  if (await managedReels.count() !== 3 ||
      await page.locator('#yycReelAdminGrid [data-reel-edit]').count() !== 3 ||
      await page.locator('#yycReelAdminGrid [data-reel-toggle]').count() !== 3 ||
      await page.locator('#yycReelAdminGrid [data-reel-delete]').count() !== 3) {
    throw new Error('Opening an admin Reel cube must show every Reel with Edit/Publish/Delete actions.');
  }
  await page.locator('[data-reel-admin-add]').click();
  await page.locator('#yycReelBatchForm').waitFor({ state: 'visible', timeout: 5000 });
  if (await page.locator('#yycBatchEventName').inputValue() !== 'Cleanliness Drive 2026' ||
      !(await page.locator('[data-batch-video="4"]').count())) {
    throw new Error('Add Reels from a collection should prefill the event and generate the next numbered upload slot.');
  }
  console.log('ADMIN REEL CUBE PASS: 3 Reels grouped; Edit/Publish/Delete actions and add-to-event flow work');

  if (failures.length) {
    throw new Error('Uncaught browser errors:\n' + failures.join('\n'));
  }

  console.log('YYC BROWSER REGRESSION: PASS (' + targets.length + ' desktop targets + deep link/reload + three login close buttons + mobile Reel navigation + Gallery/Reel admin cube workflows)');
} finally {
  await browser.close();
}
