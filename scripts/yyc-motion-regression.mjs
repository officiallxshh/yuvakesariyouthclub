import { chromium } from 'playwright';

const baseURL = process.env.YYC_TEST_BASE_URL || 'http://127.0.0.1:4173/';
const browser = await chromium.launch({ headless: true });
const failures = [];

try {
  for (const viewport of [
    { name: 'phone', width: 360, height: 800 },
    { name: 'phone-large', width: 390, height: 844 },
    { name: 'tablet', width: 820, height: 1180 },
    { name: 'laptop', width: 1365, height: 900 },
    { name: 'large-display', width: 1920, height: 1080 }
  ]) {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
    page.on('pageerror', error => failures.push(viewport.name + ': ' + error.message));
    await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const layout = await page.evaluate(() => ({
      viewportWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      heroPhotoAnimation: getComputedStyle(document.querySelector('.hero-photo')).animationName,
      heroPhotoTransform: getComputedStyle(document.querySelector('.hero-photo')).transform
    }));

    if (layout.scrollWidth > layout.viewportWidth + 1) {
      failures.push(viewport.name + ': horizontal overflow (' + layout.scrollWidth + ' > ' + layout.viewportWidth + ')');
    }
    console.log('RESPONSIVE PASS:', viewport.name, JSON.stringify(layout));
    await page.close();
  }

  const reduced = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce'
  });
  reduced.on('pageerror', error => failures.push('reduced-motion: ' + error.message));
  await reduced.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const motion = await reduced.evaluate(() => {
    const hero = document.querySelector('.hero-photo');
    return {
      preferenceMatches: matchMedia('(prefers-reduced-motion: reduce)').matches,
      scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
      heroAnimation: getComputedStyle(hero).animationName,
      heroDuration: getComputedStyle(hero).animationDuration,
      transitionDuration: getComputedStyle(document.querySelector('.topbar')).transitionDuration
    };
  });
  if (!motion.preferenceMatches) failures.push('Reduced-motion preference was not applied by browser.');
  if (motion.heroAnimation !== 'none') failures.push('Hero background animation is still active with reduced motion.');
  if (motion.scrollBehavior !== 'auto') failures.push('Smooth scrolling remains enabled with reduced motion.');
  console.log('REDUCED MOTION:', JSON.stringify(motion));
  await reduced.close();

  if (failures.length) {
    console.error('MOTION REGRESSION FAILURES:\n- ' + failures.join('\n- '));
    process.exitCode = 1;
  } else {
    console.log('MOTION REGRESSION PASS: responsive widths, browser errors and reduced-motion behavior.');
  }
} finally {
  await browser.close();
}
