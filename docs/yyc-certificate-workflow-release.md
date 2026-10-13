# YYC certificate workflow release checklist

This workflow is intentionally split between browser UI, a database migration, and an Edge Function. Do not release only the static frontend: the migration and Edge Function must be available first.

## 1. Review and back up

1. Export the current YYC administrative backup and confirm it validates.
2. Review supabase/migrations/20261013150000_yyc_certificate_delivery_workflow.sql in the Supabase SQL editor.
3. Review supabase/migrations/20261013180000_yyc_manual_certificate_uploads.sql immediately after it.
4. Apply both migrations in timestamp order once. The first adds event-finalization fields, the generated-certificate ledger and guarded admin/queue RPCs. The second adds a private ledger for individually uploaded PDFs, tightens the existing `yyc-certificates` bucket to private PDF-only storage with a 10 MiB limit, and includes upload metadata in the Admin backup. Neither migration edits attendance rows.

## 2. Deploy the Edge Function

Deploy supabase/functions/yyc-certificate-delivery/index.ts as yyc-certificate-delivery with JWT gateway verification disabled (supabase functions deploy yyc-certificate-delivery --no-verify-jwt). The function validates the existing YYC admin/member/leader session token inside the handler; the Supabase service-role key must remain a server-side secret and must never be added to browser code. The same function handles admin-uploaded PDF certificates, sends a recipient email prompt with the PDF attached when a valid address is available, records member in-app notifications where supported, and authorizes every private download by the current recipient session.

The function needs the project's existing Resend secrets:
- RESEND_API_KEY
- RESEND_FROM_EMAIL

The function also expects the Supabase URL and service-role secret supplied by the Edge Runtime. Keep all secrets in Supabase, never in Git or client-side files.

## 3. Safe operational sequence

1. Deploy the Edge Function and test a preview against a test event with at least one test-only attendance row.
2. Confirm a future-dated event is blocked from certificate issuance.
3. Confirm Preview lists only approved members and active leaders with saved PRESENT attendance.
4. Finalize only a completed event. The event/person uniqueness constraint makes replays idempotent.
5. Confirm PDF download and verification QR, then use a test recipient mailbox before sending real certificates.
6. Confirm sent, failed, and skipped states are visible; use Retry only after fixing the address/configuration.
7. Check the administrative backup snapshot includes yyc_certificates, yyc_manual_certificates and the event's finalization fields.
8. Upload a small test PDF to a test recipient first. Verify a NEW badge appears in that account's My certificates list, the PDF can only be downloaded by its intended member/leader session, and the email status is correctly shown as sent, failed or skipped. Do not use real recipients until the test passes.

The browser regression uses mocked responses and will never contact Resend or alter live attendance.

## 4. Rollback notes

Do not drop the certificate ledger or reset its sequence during rollback. If the frontend must be reverted, leave issued certificate records intact and disable only the UI/worker entry points after reviewing pending delivery jobs. Revoke/mark a certificate as revoked using a reviewed administrative operation; do not delete the audit trail.
