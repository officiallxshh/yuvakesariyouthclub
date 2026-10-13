import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const migration = read('supabase/migrations/20261013150000_yyc_certificate_delivery_workflow.sql');
const manualMigration = read('supabase/migrations/20261013180000_yyc_manual_certificate_uploads.sql');
const edge = read('supabase/functions/yyc-certificate-delivery/index.ts');
const app = read('app.js');
const attendance = read('yyc90.js');
const browserTest = read('scripts/yyc-browser-regression.mjs');
const verifier = read('certificate-verify.html');

test('certificate records are private and unique per event/person', () => {
  assert.match(migration, /create table if not exists public\.yyc_certificates/);
  assert.match(migration, /unique \(event_id, recipient_kind, recipient_id\)/);
  assert.match(migration, /verification_code uuid not null unique/);
  assert.match(migration, /alter table public\.yyc_certificates enable row level security/);
  assert.match(migration, /revoke all on table public\.yyc_certificates from public, anon, authenticated/);
  assert.match(migration, /grant all on table public\.yyc_certificates to service_role/);
  assert.match(migration, /'yyc_certificates'/);
});

test('preview and issuing are admin-authorized and based on saved Present attendance', () => {
  assert.match(migration, /create or replace function public\.admin_certificate_preview/);
  assert.match(migration, /create or replace function public\.admin_certificate_finalize/);
  assert.match(migration, /if not public\._admin_ok\(p_token\) then/);
  assert.match(migration, /where a\.event_id=p_event_id and a\.present=true/);
  assert.match(migration, /m\.approved=true and lower\(coalesce\(m\.status,'pending'\)\)='approved'/);
  assert.match(migration, /lower\(coalesce\(l\.status,'active'\)\) = 'active'/);
  assert.match(migration, /on conflict \(event_id,recipient_kind,recipient_id\) do nothing/);
  assert.match(migration, /certificates_finalized_at is null/);
  assert.match(migration, /unique \(event_id, recipient_kind, recipient_id\)/);
});

test('email jobs are claimed safely, tracked and retryable', () => {
  assert.match(migration, /create or replace function public\.yyc_claim_certificate_email_batch/);
  assert.match(migration, /for update skip locked/i);
  assert.match(migration, /email_status='queued'/);
  assert.match(migration, /email_status in \('failed','skipped'\)/);
  assert.match(migration, /create or replace function public\.admin_certificate_retry/);
  assert.match(migration, /create or replace function public\.admin_certificate_queue_status/);
  assert.match(migration, /grant execute on function public\.yyc_claim_certificate_email_batch\(integer,uuid\) to service_role/);
  assert.doesNotMatch(migration, /'recipient_email',c\.recipient_email/);
});

test('certificate edge function generates a PDF, embeds verification QR, and emails in background', () => {
  assert.match(edge, /PDFDocument\.create\(\)/);
  assert.match(edge, /QRCode\.toDataURL/);
  assert.match(edge, /attachments:\s*\[\s*\{[\s\S]*?content:\s*bytesToBase64\(pdfBytes\)/);
  assert.match(edge, /Idempotency-Key/);
  assert.match(edge, /EdgeRuntime\.waitUntil/);
  assert.match(edge, /action === "preview"/);
  assert.match(edge, /action === "finalize"/);
  assert.match(edge, /action === "retry"/);
  assert.match(edge, /action === "status"/);
  assert.match(edge, /action === "list"/);
  assert.match(edge, /action === "download"/);
  assert.match(edge, /url\.searchParams\.get\("action"\) !== "verify"/);
  assert.match(edge, /_member_id/);
  assert.match(edge, /_leader_id/);
  assert.match(edge, /cache-control": "private, no-store"/);
});

test('member and leader panels can list and securely download their own certificates', () => {
  assert.match(app, /function yycCertificatesCenterHTML\(kind\)/);
  assert.match(app, /function yycLoadCertificates\(kind\)/);
  assert.match(app, /action:'list',target_kind:kind/);
  assert.match(app, /action:'download',target_kind:kind/);
  assert.match(app, /yycCertificatesCenterHTML\('member'\)/);
  assert.match(app, /yycCertificatesCenterHTML\('leader'\)/);
  assert.match(app, /yycLoadCertificates\('member'\)/);
  assert.match(app, /yycLoadCertificates\('leader'\)/);
  assert.match(app, /application\/pdf/);
});

test('email failure never rolls a successfully saved attendance selection back', () => {
  assert.match(attendance, /var attendanceSaved=false/);
  assert.match(attendance, /attendanceSaved=true/);
  assert.match(attendance, /Email delivery is best-effort and never undoes a persisted attendance record/);
  assert.match(attendance, /certificate remains available after event finalization/);
  assert.match(attendance, /function bindCertificateWorkflow90\(\)/);
  assert.match(attendance, /FINALIZE ATTENDANCE & ISSUE CERTIFICATES/);
  assert.match(attendance, /RETRY FAILED \/ STALLED EMAILS/);
  assert.match(attendance, /RESUME QUEUE/);
  assert.match(attendance, /window\.confirm\('Finalize attendance and issue one certificate/);
});

test('certificate workflow has browser regression coverage and a non-indexed verification page', () => {
  assert.match(browserTest, /CERTIFICATE WORKFLOW PASS/);
  assert.match(browserTest, /yyc-certificate-delivery/);
  assert.match(verifier, /name="robots" content="noindex,follow"/);
  assert.match(verifier, /action=verify&code=/);
  assert.match(verifier, /Verify authenticity using the QR code|CERTIFICATE/);
});


test('manual PDF uploads are private, admin-authorized, size-limited and auditable', () => {
  assert.ok(manualMigration.includes('create table if not exists public.yyc_manual_certificates'));
  assert.ok(manualMigration.includes('alter table public.yyc_manual_certificates enable row level security'));
  assert.ok(manualMigration.includes('revoke all on table public.yyc_manual_certificates from public, anon, authenticated'));
  assert.ok(manualMigration.includes('grant all on table public.yyc_manual_certificates to service_role'));
  assert.ok(manualMigration.includes("values ('yyc-certificates', 'yyc-certificates', false, 10485760, array['application/pdf'])"));
  assert.ok(manualMigration.includes('storage_path text not null unique'));
  assert.ok(manualMigration.includes("content_type text not null default 'application/pdf'"));
  assert.ok(edge.includes('action === "upload_manual"'));
  assert.ok(edge.includes('if (!(await adminOK(adminToken)))'));
  assert.ok(edge.includes('MAX_MANUAL_CERTIFICATE_BYTES'));
  assert.ok(edge.includes('"%PDF-"'));
  assert.ok(edge.includes('resolveAdminRecipient(kind, targetId)'));
  assert.ok(edge.includes('db.storage.from(MANUAL_CERTIFICATE_BUCKET).upload'));
  assert.ok(edge.includes('yyc_manual_certificates'));
});

test('manual upload creates a prompt, emails the PDF and keeps recipient downloads private', () => {
  assert.ok(edge.includes('subject = "New YYC certificate available · " + title'));
  assert.ok(edge.includes('attachments: [{'));
  assert.ok(edge.includes('content: bytesToBase64(pdfBytes)'));
  assert.ok(edge.includes('member_notifications'));
  assert.ok(edge.includes('portal_prompt: true'));
  assert.ok(edge.includes('source: "manual_upload"'));
  assert.ok(edge.includes('certificate_source, 40) === "manual_upload"'));
  assert.ok(edge.includes('.eq("recipient_kind", kind).eq("recipient_id", recipient.id)'));
  assert.ok(app.includes('id="yycManualCertificateForm"'));
  assert.ok(app.includes("action','upload_manual'"));
  assert.ok(app.includes('NEW CERTIFICATE'));
  assert.ok(app.includes('data-yyc-cert-source'));
  assert.ok(app.includes("certificate_source:download.getAttribute('data-yyc-cert-source')"));
});
