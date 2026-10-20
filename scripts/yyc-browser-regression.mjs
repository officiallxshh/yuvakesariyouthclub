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

  // Return to the stable top-of-page header before exercising fixed-header login controls.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForTimeout(300);

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

  const mobileLayout = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
    activeLinks: Array.from(document.querySelectorAll('.desktop-nav > a.nav-link.active')).map(link => link.getAttribute('href')),
    visibleHighlights: Array.from(document.querySelectorAll('.desktop-nav > a.nav-link')).filter(link => Number.parseFloat(getComputedStyle(link, '::before').opacity) > 0.5).map(link => link.getAttribute('href'))
  }));
  if (mobileLayout.documentWidth > mobileLayout.viewportWidth + 1) {
    throw new Error('Mobile layout has horizontal overflow: document ' + mobileLayout.documentWidth + 'px, viewport ' + mobileLayout.viewportWidth + 'px.');
  }
  if (mobileLayout.activeLinks.length !== 1 || mobileLayout.activeLinks[0] !== '#reel') {
    throw new Error('Mobile Reel navigation must leave exactly one active section: ' + mobileLayout.activeLinks.join(', '));
  }
  if (mobileLayout.visibleHighlights.length > 1) {
    throw new Error('Mobile layout shows multiple desktop navigation highlights: ' + mobileLayout.visibleHighlights.join(', '));
  }
  console.log('MOBILE LAYOUT PASS: no horizontal overflow and one active Reel section');

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
  const certificateEventId = '11111111-1111-4111-8111-111111111111';
  const certificateMemberOne = '22222222-2222-4222-8222-222222222221';
  const certificateMemberTwo = '22222222-2222-4222-8222-222222222222';
  const certificateEvent = {
    id: certificateEventId,
    title: 'Browser Certificate Test Event',
    event_date: '2026-10-01',
    location: 'Subrahmanya',
    status: 'published'
  };
  const certificateMembers = [
    { id: certificateMemberOne, name: 'Test Member One', role_number: 'YYC-M-001', email: 'one@example.invalid', status: 'approved', approved: true, duplicate_of: null },
    { id: certificateMemberTwo, name: 'Test Member Two', role_number: 'YYC-M-002', email: '', status: 'approved', approved: true, duplicate_of: null }
  ];
  const testDashboard = {
    ok: true,
    members: certificateMembers,
    leaders: [],
    updates: [],
    gallery: testGallery,
    events: [certificateEvent],
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

  /* Certificate workflow is mocked end-to-end; it never writes to production data or sends mail. */
  await page.route('**/rest/v1/rpc/admin_feature_data', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ok: true,
      members: certificateMembers,
      leaders: [],
      events: [certificateEvent],
      attendance: [
        { id: '33333333-3333-4333-8333-333333333331', event_id: certificateEventId, member_id: certificateMemberOne, present: true, marked_at: '2026-10-01T10:00:00.000Z' },
        { id: '33333333-3333-4333-8333-333333333332', event_id: certificateEventId, member_id: certificateMemberTwo, present: true, marked_at: '2026-10-01T10:05:00.000Z' }
      ],
      volunteers: [],
      achievements: [],
      history: [],
      finance: []
    })
  }));
  await page.route('**/functions/v1/yyc-certificate-delivery*', async (route) => {
    const request = route.request();
    const corsHeaders = {
      'access-control-allow-origin': 'http://127.0.0.1:4173',
      'access-control-allow-headers': 'apikey,content-type,accept,cache-control',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'content-type': 'application/json'
    };
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders, body: '' });
      return;
    }
    const body = request.postDataJSON();
    if (body.action === 'preview') {
      await route.fulfill({
        status: 200, headers: corsHeaders,
        body: JSON.stringify({
          ok: true,
          event: { id: certificateEventId, title: certificateEvent.title, event_date: certificateEvent.event_date, location: certificateEvent.location, certificates_finalized_at: null },
          already_finalized: false, eligible_count: 2, member_count: 2, leader_count: 0, missing_email_count: 1, existing_certificate_count: 0,
          email_status: { queued: 0, sent: 0, failed: 0, skipped: 0 },
          recipients: [
            { kind: 'member', id: certificateMemberOne, name: 'Test Member One', role_number: 'YYC-M-001', email_valid: true },
            { kind: 'member', id: certificateMemberTwo, name: 'Test Member Two', role_number: 'YYC-M-002', email_valid: false }
          ]
        })
      });
      return;
    }
    if (body.action === 'finalize') {
      await route.fulfill({
        status: 202, headers: corsHeaders,
        body: JSON.stringify({
          ok: true, already_finalized: false, event_id: certificateEventId, issued_count: 2, new_count: 2,
          email_status: { queued: 1, sending: 0, sent: 0, failed: 0, skipped: 1 }, worker_started: true, background: true
        })
      });
      return;
    }
    if (body.action === 'status') {
      await route.fulfill({
        status: 200, headers: corsHeaders,
        body: JSON.stringify({
          ok: true,
          event: { id: certificateEventId, title: certificateEvent.title, event_date: certificateEvent.event_date, certificates_finalized_at: '2026-10-13T08:00:00.000Z' },
          counts: { total: 2, queued: 0, sending: 0, sent: 1, failed: 0, skipped: 1 },
          items: [
            { id: '44444444-4444-4444-8444-444444444441', certificate_number: 'YYC-CERT-2026-000001', recipient_kind: 'member', recipient_name: 'Test Member One', recipient_role_number: 'YYC-M-001', email_status: 'sent', attempt_count: 1, email_sent_at: '2026-10-13T08:00:00.000Z' },
            { id: '44444444-4444-4444-8444-444444444442', certificate_number: 'YYC-CERT-2026-000002', recipient_kind: 'member', recipient_name: 'Test Member Two', recipient_role_number: 'YYC-M-002', email_status: 'skipped', email_error: 'No valid email address', attempt_count: 0 }
          ]
        })
      });
      return;
    }
    await route.fulfill({ status: 400, headers: corsHeaders, body: JSON.stringify({ ok: false, error: 'Unexpected certificate action' }) });
  });

  await page.locator('[data-yyc90-tab="attendance"]').waitFor({ state: 'visible', timeout: 8000 });
  await page.locator('[data-yyc90-tab="attendance"]').click();
  await page.locator('#at90Event').selectOption(certificateEventId);
  await page.locator('#yyc90CertificatePreview').click();
  await page.locator('#yyc90CertificatePreviewHost').getByText('Test Member One', { exact: true }).waitFor({ state: 'visible', timeout: 6000 });
  await page.locator('#yyc90CertificatePreviewHost').getByText('Test Member Two', { exact: true }).waitFor({ state: 'visible', timeout: 6000 });
  if (!(await page.locator('#yyc90CertificatePreviewHost').innerText()).includes('2')) {
    throw new Error('Certificate preview should show both eligible Present recipients before issuing.');
  }
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#yyc90CertificateFinalize').click();
  await page.getByText('Certificates issued ✓', { exact: false }).waitFor({ state: 'visible', timeout: 6000 });
  await page.locator('#yyc90CertificateStatusHost').getByText('YYC-CERT-2026-000001', { exact: false }).waitFor({ state: 'visible', timeout: 6000 });
  if (!(await page.locator('#yyc90CertificateStatusHost').innerText()).includes('1 / 2 SENT')) {
    throw new Error('Certificate queue status should show its delivery counts after finalization.');
  }
  console.log('CERTIFICATE WORKFLOW PASS: preview → one-time issue → background queue status with skipped-email visibility');

  /* Reduced-motion browser profile: all new decorative entrances must resolve to no animation. */
  await page.evaluate(() => {
    const host = document.createElement('div');
    host.className = 'leader-card yyc-data-ready';
    host.style.cssText = 'position:fixed;left:-10000px;top:0;width:10px;height:10px';
    document.body.appendChild(host);
    const motion = getComputedStyle(host).animationName;
    host.remove();
    if (motion !== 'none') throw new Error('Reduced-motion mode must disable the cinematic card entrance. Got: ' + motion);
  });
  console.log('REDUCED MOTION PASS: cinematic card entrance is disabled');

  /* Separate no-preference context: verify that the cinematic layer really animates
     observer-driven content and does not create horizontal page overflow on a phone. */
  const motionPage = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'no-preference'
  });
  motionPage.on('pageerror', (error) => failures.push('motion page: ' + error.message));
  await motionPage.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await motionPage.waitForFunction(() =>
    document.documentElement.classList.contains('yyc-smooth-data') &&
    Array.from(document.querySelectorAll('link[rel="stylesheet"]')).some(link => link.href.includes('yyc-cinematic-experience.css'))
  , null, { timeout: 12000 });
  const motionResult = await motionPage.evaluate(() => {
    document.body.classList.add('yyc-scroll-ready');
    const section = document.createElement('section');
    section.className = 'section';
    const reveal = document.createElement('div');
    reveal.className = 'reveal yyc-scroll-in';
    section.appendChild(reveal);
    document.body.appendChild(section);

    const card = document.createElement('div');
    card.className = 'leader-card yyc-data-ready';
    card.style.cssText = 'position:fixed;left:-10000px;top:0;width:10px;height:10px';
    document.body.appendChild(card);
    const reelCard = document.createElement('article');
    reelCard.className = 'yyc-reel-card';
    reelCard.style.cssText = 'position:fixed;left:-10000px;top:0;width:10px;height:10px';
    document.body.appendChild(reelCard);

    const modal = document.querySelector('#modalContent');
    if (modal) modal.classList.add('yyc-panel-swap-in');
    let workspace = document.querySelector('#adminWorkspace');
    const madeWorkspace = !workspace;
    if (!workspace) {
      workspace = document.createElement('div');
      workspace.className = 'admin-workspace';
      workspace.style.cssText = 'position:fixed;left:-10000px;top:0;width:10px;height:10px';
      document.body.appendChild(workspace);
    }
    workspace.classList.add('yyc-admin-tab-enter');

    const result = {
      reveal: getComputedStyle(reveal).animationName,
      card: getComputedStyle(card).animationName,
      reel: getComputedStyle(reelCard).animationName,
      modal: modal ? getComputedStyle(modal).animationName : 'missing',
      admin: getComputedStyle(workspace).animationName,
      noOverflow: document.documentElement.scrollWidth <= window.innerWidth,
      reduced: matchMedia('(prefers-reduced-motion: reduce)').matches
    };
    reveal.parentNode.remove();
    card.remove();
    reelCard.remove();
    if (modal) modal.classList.remove('yyc-panel-swap-in');
    workspace.classList.remove('yyc-admin-tab-enter');
    if (madeWorkspace) workspace.remove();
    return result;
  });
  if (motionResult.reduced) throw new Error('No-preference browser context unexpectedly requests reduced motion.');
  if (motionResult.reveal !== 'yycCinematicReveal') throw new Error('Cinematic section reveal is not active: ' + motionResult.reveal);
  if (motionResult.card !== 'yycCinematicCardIn') throw new Error('Cinematic dynamic-card entrance is not active: ' + motionResult.card);
  if (motionResult.reel !== 'yycCinematicCardIn') throw new Error('Cinematic Reel entrance is not active: ' + motionResult.reel);
  if (motionResult.modal !== 'yycCinematicPanelIn') throw new Error('Cinematic panel transition is not active: ' + motionResult.modal);
  if (motionResult.admin !== 'yycCinematicAdminIn') throw new Error('Cinematic admin tab transition is not active: ' + motionResult.admin);
  if (!motionResult.noOverflow) throw new Error('Cinematic motion caused horizontal overflow on a 390px viewport.');
  console.log('CINEMATIC MOTION PASS: section, dynamic card, Reel, modal panel and admin-tab transitions animate without mobile overflow');

  await motionPage.goto(new URL('leaders.html', baseURL).href, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await motionPage.waitForFunction(() =>
    Array.from(document.querySelectorAll('link[rel="stylesheet"]')).some(link => link.href.includes('yyc-cinematic-experience.css'))
  , null, { timeout: 12000 });
  const leadersMotion = await motionPage.evaluate(() => ({
    hero: getComputedStyle(document.querySelector('.wrap>.hero')).animationName,
    person: getComputedStyle(document.querySelector('.wrap>.grid>.person')).animationName,
    noOverflow: document.documentElement.scrollWidth <= window.innerWidth
  }));
  if (leadersMotion.hero !== 'yycCinematicPageIn') throw new Error('Standalone leaders hero entrance is not active: ' + leadersMotion.hero);
  if (leadersMotion.person !== 'yycCinematicCardIn') throw new Error('Standalone leader-card entrance is not active: ' + leadersMotion.person);
  if (!leadersMotion.noOverflow) throw new Error('Standalone leader-page motion caused mobile overflow.');
  console.log('LEADERS PAGE MOTION PASS: premium header/card entrance without mobile overflow');

  await motionPage.goto(new URL('media.html', baseURL).href, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await motionPage.waitForFunction(() =>
    Array.from(document.querySelectorAll('link[rel="stylesheet"]')).some(link => link.href.includes('yyc-cinematic-experience.css'))
  , null, { timeout: 12000 });
  const mediaMotion = await motionPage.evaluate(() => ({
    hero: getComputedStyle(document.querySelector('.wrap>.hero')).animationName,
    report: getComputedStyle(document.querySelector('.wrap>.coverage')).animationName,
    noOverflow: document.documentElement.scrollWidth <= window.innerWidth
  }));
  if (mediaMotion.hero !== 'yycCinematicPageIn') throw new Error('Standalone media hero entrance is not active: ' + mediaMotion.hero);
  if (mediaMotion.report !== 'yycCinematicCardIn') throw new Error('Standalone media-report entrance is not active: ' + mediaMotion.report);
  if (!mediaMotion.noOverflow) throw new Error('Standalone media-page motion caused mobile overflow.');
  console.log('MEDIA PAGE MOTION PASS: press/media content animates without mobile overflow');

  await motionPage.goto(new URL('events/', baseURL).href, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await motionPage.waitForFunction(() => document.querySelector('link[href*="yyc-seo.css"]'), null, { timeout: 12000 });
  const directoryMotion = await motionPage.evaluate(() => ({
    page: getComputedStyle(document.querySelector('.wrap>.card')).animationName,
    item: getComputedStyle(document.querySelector('.listing>.item')).animationName,
    noOverflow: document.documentElement.scrollWidth <= window.innerWidth
  }));
  if (directoryMotion.page !== 'yycSeoPageIn') throw new Error('Generated event-page entrance is not active: ' + directoryMotion.page);
  if (directoryMotion.item !== 'yycSeoItemIn') throw new Error('Generated event-list item entrance is not active: ' + directoryMotion.item);
  if (!directoryMotion.noOverflow) throw new Error('Generated event-page motion caused mobile overflow.');
  console.log('GENERATED PAGE MOTION PASS: event listing and event card animate without mobile overflow');
  await motionPage.close();

  if (failures.length) {
    throw new Error('Uncaught browser errors:\n' + failures.join('\n'));
  }

  console.log('YYC BROWSER REGRESSION: PASS (' + targets.length + ' desktop targets + deep link/reload + three login close buttons + mobile Reel navigation + Gallery/Reel cubes + certificate issuance workflow + cinematic, reduced-motion and dedicated-page checks)');
} finally {
  await browser.close();
}
