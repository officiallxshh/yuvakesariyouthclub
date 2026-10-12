import fs from 'node:fs/promises';

const file = process.argv[2] || 'yyc-backup.json';
let raw;
try {
  raw = await fs.readFile(file, 'utf8');
} catch (error) {
  throw new Error('Backup file is missing or unreadable: ' + file, { cause: error });
}

let snapshot;
try {
  snapshot = JSON.parse(raw);
} catch (error) {
  throw new Error('Backup output is not valid JSON: ' + file, { cause: error });
}

if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
  throw new Error('Backup output must be a JSON object.');
}
if (snapshot.ok !== true) {
  throw new Error('Backup snapshot did not report ok: true.');
}

const payloadKeys = Object.keys(snapshot).filter((key) => !['ok', 'error', 'message'].includes(key));
if (payloadKeys.length === 0 || raw.trim().length < 32) {
  throw new Error('Backup output contains no detectable snapshot payload.');
}

console.log('YYC backup JSON validated:', file);
console.log('Snapshot payload fields:', payloadKeys.join(', '));
console.log('Unencrypted bytes:', Buffer.byteLength(raw, 'utf8'));
