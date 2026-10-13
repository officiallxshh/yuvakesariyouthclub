import { chromium } from 'playwright';

const baseURL = process.env.YYC_TEST_BASE_URL || 'http://127.0.0.1:4173/';
const browser = await chromium.launch({ headless: true });
const errors = [];

try {
  const context = await browser.newContext({
    viewport: { width: 1365, height: 900 },
    reducedMotion: 'reduce'
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.locator('.desktop-nav > a.nav-link[href="#home"]').waitFor({ state: 'visible', timeout: 15000 });

  const widths = [360, 390, 820, 1365, 1920];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(60);
    const dims = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth
    }));
    if (dims.document > dims.viewport + 2) {
      throw new Error('Horizontal overflow at ' + width + 'px: document is ' + dims.document + 'px wide.');
    }
    if (dims.body > dims.viewport + 2) {
      throw new Error('Body content overflows at ' + width + 'px: body is ' + dims.body + 'px wide.');
    }
    console.log('RESPONSIVE WIDTH PASS:', width + 'px');
  }

  /* Keep one active tab and animate its own box; never reintroduce a detached moving marker. */
  await page.setViewportSize({ width: 1365, height: 900 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.locator('.desktop-nav > a.nav-link[href="#home"]').click();
  await page.waitForFunction(() => {
    const links = Array.from(document.querySelectorAll('.desktop-nav > a.nav-link'));
    const active = links.filter((link) => link.classList.contains('active'));
    return active.length === 1 && active[0].getAttribute('href') === '#home' &&
      getComputedStyle(active[0], '::before').opacity === '1';
  }, null, { timeout: 5000 });
  await page.locator('.desktop-nav > a.nav-link[href="#glimpse"]').click();
  const navMotion = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('.desktop-nav > a.nav-link'));
    const active = links.filter((link) => link.classList.contains('active'));
    const pseudo = active[0] ? getComputedStyle(active[0], '::before') : null;
    const properties = pseudo ? pseudo.transitionProperty.split(',').map((v) => v.trim()) : [];
    const durations = pseudo ? pseudo.transitionDuration.split(',').map((v) => parseFloat(v) || 0) : [];
    return {
      activeCount: active.length,
      activeHref: active[0]?.getAttribute('href'),
      pseudoOpacity: pseudo?.opacity,
      transitionEnabled: properties.includes('transform') && durations.some((duration) => duration > 0),
      detachedMarker: !!document.querySelector('#yycNavHighlight')
    };
  });
  if (navMotion.activeCount !== 1 || navMotion.activeHref !== '#glimpse') {
    throw new Error('Navigation active state is not exclusive after switching to Tulunad Glimpse: ' + JSON.stringify(navMotion));
  }
  if (navMotion.detachedMarker) throw new Error('Detached navigation highlight must stay disabled.');
  if (navMotion.pseudoOpacity !== '1' || !navMotion.transitionEnabled) {
    throw new Error('Smooth active-tab box transition is missing: ' + JSON.stringify(navMotion));
  }
  await page.waitForTimeout(380);
  const settledMotion = await page.evaluate(() => {
    const active = Array.from(document.querySelectorAll('.desktop-nav > a.nav-link')).filter((link) => link.classList.contains('active'));
    return active.length === 1 && active[0].getAttribute('href') === '#glimpse' &&
      getComputedStyle(active[0], '::before').opacity === '1' &&
      !document.querySelector('#yycNavHighlight');
  });
  if (!settledMotion) throw new Error('Navigation active box did not settle cleanly on Tulunad Glimpse.');
  await page.locator('.desktop-nav > a.nav-link[href="#home"]').click();
  const homeActiveCount = await page.locator('.desktop-nav > a.nav-link.active').count();
  if (homeActiveCount !== 1 || await page.locator('.desktop-nav > a.nav-link.active').getAttribute('href') !== '#home') {
    throw new Error('Navigation active state is not exclusive after returning Home.');
  }
  console.log('NAV ACTIVE-BOX MOTION PASS: smooth box transition; exclusive active state; no detached marker');

  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await page.evaluate(() => ({
    heroCultureLazy: ['Dharma Daiva', 'Aati Kalenja', 'Yakshagana'].every((alt) => {
      const img = document.querySelector('.culture-panel img[alt="' + alt + '"]');
      return !!img && img.loading === 'lazy';
    }),
    footerLogoLazy: document.querySelector('.footer-brand img')?.loading === 'lazy',
    logoDimensions: (() => {
      const img = document.querySelector('.brand-mark img');
      return !!img && img.getAttribute('width') === '49' && img.getAttribute('height') === '49';
    })(),
    heroPreloaded: Array.from(document.querySelectorAll('link[rel="preload"][as="image"]'))
      .some((link) => link.href.includes('/assets/hero-tulunad.webp'))
  }));
  for (const [name, value] of Object.entries(mobile)) {
    if (!value) throw new Error('Mobile media optimization failed: ' + name);
  }
  const backdropFilter = await page.locator('.modal-backdrop').evaluate((el) => getComputedStyle(el).backdropFilter);
  if (backdropFilter !== 'none') throw new Error('Mobile modal backdrop still uses expensive blur: ' + backdropFilter);
  console.log('MOBILE MEDIA/PAINT PASS: eager hero kept, non-primary images lazy, modal blur disabled');

  const lowDataContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'no-preference'
  });
  await lowDataContext.addInitScript(() => {
    try {
      Object.defineProperty(navigator, 'connection', {
        configurable: true,
        value: {
          saveData: true,
          effectiveType: '2g',
          downlink: 0.4,
          addEventListener() {}
        }
      });
    } catch (_) {}
  });
  const lowDataPage = await lowDataContext.newPage();
  lowDataPage.on('pageerror', (error) => errors.push(error.message));
  await lowDataPage.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await lowDataPage.waitForFunction(() => document.body.classList.contains('yyc-low-data'), null, { timeout: 8000 });
  const lowData = await lowDataPage.evaluate(() => ({
    heroFilter: getComputedStyle(document.querySelector('.hero-photo')).filter,
    heroWillChange: getComputedStyle(document.querySelector('.hero-photo')).willChange,
    backdropFilter: getComputedStyle(document.querySelector('.modal-backdrop')).backdropFilter
  }));
  if (lowData.heroFilter !== 'none') throw new Error('Low-data mode did not remove hero image filter: ' + lowData.heroFilter);
  if (lowData.heroWillChange !== 'auto') throw new Error('Low-data mode kept forced hero compositing: ' + lowData.heroWillChange);
  if (lowData.backdropFilter !== 'none') throw new Error('Low-data mode kept backdrop blur: ' + lowData.backdropFilter);
  console.log('LOW-DATA MODE PASS: decorative paint work reduced without hiding content');

  if (errors.length) throw new Error('Uncaught browser errors:\n' + errors.join('\n'));
  console.log('YYC PERFORMANCE BROWSER REGRESSION: PASS');
  await lowDataContext.close();
  await context.close();
} finally {
  await browser.close();
}
