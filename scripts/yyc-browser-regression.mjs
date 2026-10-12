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

  console.log('YYC BROWSER REGRESSION: PASS (' + targets.length + ' desktop targets + mobile Reel navigation)');
} finally {
  await browser.close();
}
