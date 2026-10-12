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
    { name: 'member', button: '#memberLoginBtn', form: '#memberLoginForm', field: '#mIdent', value: 'browser-test@example.invalid' },
    { name: 'leader', button: '#leaderLoginBtn', form: '#leaderLoginForm', field: '#lIdent', value: 'browser-test@example.invalid' },
    { name: 'admin', button: '#adminOpenBtn', form: '#adminLoginForm', field: '#aUser', value: 'browser-test-only' }
  ];
  for (const panel of loginPanels) {
    await page.locator(panel.button).click();
    await page.locator(panel.form).waitFor({ state: 'visible', timeout: 6000 });
    await page.locator(panel.field).fill(panel.value);
    await page.locator(panel.form + ' [data-access-close]').click();
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

  if (failures.length) {
    throw new Error('Uncaught browser errors:\n' + failures.join('\n'));
  }

  console.log('YYC BROWSER REGRESSION: PASS (' + targets.length + ' desktop targets + deep link/reload + three login close buttons + mobile Reel navigation)');
} finally {
  await browser.close();
}
