import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const migration = read('supabase/migrations/20261013130000_yyc_volunteer_task_manager.sql');
const adminUi = read('yyc90.js');
const app = read('app.js');

test('task schema is protected from direct browser table access', () => {
  assert.match(migration, /create table if not exists public\.yyc_tasks/i);
  assert.match(migration, /create table if not exists public\.yyc_task_updates/i);
  assert.match(migration, /alter table public\.yyc_tasks enable row level security/i);
  assert.match(migration, /revoke all on table public\.yyc_tasks from anon, authenticated/i);
});

test('admin task RPCs enforce the existing admin session check', () => {
  for (const name of ['admin_tasks_list', 'admin_task_upsert', 'admin_task_archive']) {
    assert.ok(migration.includes('function public.' + name + '('), 'Missing admin RPC: ' + name);
  }
  assert.ok((migration.match(/if not public\._admin_ok\(p_token\)/gi) || []).length >= 3);
  assert.match(migration, /grant execute on function public\.admin_task_upsert\(text,uuid,jsonb\) to anon, authenticated/i);
});

test('leader task RPCs restrict reads and updates to the logged-in leader', () => {
  assert.match(migration, /function public\.leader_tasks_list\(p_token text\)/i);
  assert.match(migration, /function public\.leader_task_update\(p_token text, p_id uuid, p_status text, p_note text default ''\)/i);
  assert.match(migration, /t\.assigned_leader_id=v_leader and not t\.is_archived/i);
  assert.match(migration, /this task is not assigned to your account/i);
});

test('task data is included in the application backup snapshot', () => {
  assert.match(migration, /'yyc_tasks', coalesce\(\(select jsonb_agg/i);
  assert.match(migration, /'yyc_task_updates', coalesce\(\(select jsonb_agg/i);
  assert.match(migration, /'yyc_tasks',\(select count\(\*\) from public\.yyc_tasks\)/i);
});

test('admin UI includes create/edit/archive/restore and task filtering', () => {
  for (const text of [
    "['tasks','Tasks']",
    "rpc90('admin_tasks_list'",
    "rpc90('admin_task_upsert'",
    "rpc90('admin_task_archive'",
    'yyc90TaskSearch',
    'yyc90TaskView',
    'Restore'
  ]) assert.ok(adminUi.includes(text), 'Missing admin task UI hook: ' + text);
});

test('leader UI only exposes assigned-task progress updates', () => {
  assert.match(app, /rpc\('leader_tasks_list'/);
  assert.match(app, /rpc\('leader_task_update'/);
  assert.match(app, /ASSIGNED WORK/i);
  assert.match(app, /p_note:form\.elements\.note\.value\.trim\(\)/);
});

test('recycle-bin migration keeps deletes recoverable and guarded', () => {
  const recycle = read('supabase/migrations/20261013140000_yyc_content_recycle_bin.sql');
  for (const name of ['admin_recycle_bin_list', 'admin_recycle_restore', 'admin_recycle_purge']) {
    assert.ok(recycle.includes('function public.' + name + '('), 'Missing recycle-bin RPC: ' + name);
  }
  assert.match(recycle, /enable row level security/i);
  assert.match(recycle, /private\.yyc_recycle_store/);
  for (const kind of ['announcements', 'gallery', 'events', 'swags', 'achievements', 'club_history']) {
    assert.ok(recycle.includes('public.' + kind), 'Missing recoverable content kind: ' + kind);
  }
  assert.match(recycle, /'yyc_recycle_bin'/);
});

test('Recycle Bin is available from the admin custom tabs', () => {
  assert.ok(adminUi.includes("['recycle','Recycle Bin']"));
  assert.ok(adminUi.includes("rpc90('admin_recycle_bin_list'"));
  assert.ok(adminUi.includes("rpc90('admin_recycle_restore'"));
  assert.ok(adminUi.includes("rpc90('admin_recycle_purge'"));
});
