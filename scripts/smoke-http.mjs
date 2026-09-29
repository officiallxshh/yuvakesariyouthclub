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

const required = [
  'https://officiallxshh.github.io/yuvakesariyouthclub/',
  'https://officiallxshh.github.io/yuvakesariyouthclub/about.html',
  'https://officiallxshh.github.io/yuvakesariyouthclub/contact.html',
  'https://officiallxshh.github.io/yuvakesariyouthclub/privacy.html',
  'https://officiallxshh.github.io/yuvakesariyouthclub/terms.html',
  'https://officiallxshh.github.io/yuvakesariyouthclub/verify.html'
];

for (const url of required) {
  const r = await fetch(url, { redirect: 'follow' });
  if (!r.ok) throw new Error(url + ' returned ' + r.status);
  const body = await r.text();
  if (!/Yuvakesari Youth Club/i.test(body)) throw new Error(url + ' does not contain the YYC marker');
  console.log('HTTP OK', r.status, url);
}

const optional = [
  'https://www.yuvakesariyouthclub.in/',
  'https://www.yuvakesariyouthclub.in/sitemap.xml',
  'https://www.yuvakesariyouthclub.in/robots.txt'
];

for (const url of optional) {
  try {
    const r = await fetch(url, { redirect: 'follow' });
    console.log('CUSTOM DOMAIN', r.status, url);
  } catch (error) {
    console.log('CUSTOM DOMAIN CHECK SKIPPED', url, String(error));
  }
}
