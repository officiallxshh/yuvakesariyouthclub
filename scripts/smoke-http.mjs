import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const js = [
  'app.js',
  'yyc90.js',
  'yyc90-final.js',
  'yyc-production.js',
  'scripts/generate-public-pages.mjs',
  'scripts/backup-supabase.mjs'
];

for (const file of js) {
  if (!fs.existsSync(file)) throw new Error('Missing file: ' + file);
  execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  console.log('syntax OK', file);
}

/*
 * The repository is deployed on a custom domain behind Cloudflare.
 * GitHub's legacy *.github.io URL can legitimately return 403/redirect after
 * a custom domain is configured, so the CI smoke test should not treat that
 * legacy host as the production origin.
 *
 * Validate the actual committed public pages locally first; this is deterministic
 * and catches broken/missing generated pages without depending on an external
 * CDN, DNS edge or bot-protection policy during CI.
 */
const requiredFiles = [
  'index.html',
  'about.html',
  'contact.html',
  'privacy.html',
  'terms.html',
  'verify.html',
  'achievements/index.html',
  'events/index.html',
  'gallery/index.html',
  'leaders/index.html',
  'updates/index.html'
];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) throw new Error('Missing public page: ' + file);
  const body = fs.readFileSync(file, 'utf8');
  if (!/Yuvakesari Youth Club/i.test(body)) {
    throw new Error(file + ' does not contain the YYC marker');
  }
  console.log('PUBLIC PAGE OK', file);
}

/* Live production probes are informative only: Cloudflare/WAF and DNS are
 * deployment-edge concerns and should not make source validation red. */
const optional = [
  'https://www.yuvakesariyouthclub.in/',
  'https://www.yuvakesariyouthclub.in/sitemap.xml',
  'https://www.yuvakesariyouthclub.in/robots.txt'
];

for (const url of optional) {
  try {
    const r = await fetch(url, { redirect: 'follow' });
    console.log('LIVE PROBE', r.status, url);
  } catch (error) {
    console.log('LIVE PROBE SKIPPED', url, String(error));
  }
}
