const fs=require('node:fs');
const {execFileSync}=require('node:child_process');
const js=['app.js','yyc90.js','yyc90-final.js','yyc-production.js','scripts/generate-public-pages.mjs','scripts/backup-supabase.mjs'];
for(const f of js){execFileSync(process.execPath,['--check',f],{stdio:'inherit'});console.log('syntax OK',f);}
const urls=['https://www.yuvakesariyouthclub.in/','https://www.yuvakesariyouthclub.in/about.html','https://www.yuvakesariyouthclub.in/contact.html','https://www.yuvakesariyouthclub.in/privacy.html','https://www.yuvakesariyouthclub.in/terms.html','https://www.yuvakesariyouthclub.in/verify.html','https://www.yuvakesariyouthclub.in/robots.txt','https://www.yuvakesariyouthclub.in/sitemap.xml'];
for(const url of urls){
  const r=await fetch(url,{redirect:'follow'});
  if(!r.ok) throw new Error(url+' returned '+r.status);
  const body=await r.text();
  if(!body.includes('Yuvakesari Youth Club')) throw new Error(url+' does not contain YYC marker');
  console.log('HTTP OK',r.status,url);
}
