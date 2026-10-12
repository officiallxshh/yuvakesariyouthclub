# YYC Build 15 — Release and reliability checklist

Use this checklist for the release and periodic health checks. Do not use real members' private records for destructive tests.

## Automated checks

- [ ] YYC Preflight passes: TypeScript, ID-card checks, syntax checks, full repository audit and HTTP smoke test.
- [ ] YYC Browser Navigation Regression passes on Chromium, covering every desktop section link and the mobile Reel navigation.
- [ ] Production monitor passes its local-page checks and the Supabase public-data RPC check.
- [ ] Inspect the action logs for actual failures; a skipped or unavailable external probe is not the same as an end-to-end pass.

## Encrypted backups

- [ ] Add the repository Actions secrets `YYC_ADMIN_TOKEN` and `YYC_BACKUP_PASSWORD`. Never put their values in source files, issues, logs or chat.
- [ ] Run **YYC Encrypted Offsite Backup** manually once and confirm the action completes with **YYC backup status: VERIFIED**.
- [ ] Download the generated artifact and keep the encrypted file, manifest and SHA-256 checksum together. The GitHub artifact expires after 90 days.
- [ ] Plan a restore rehearsal in a separate staging Supabase project using a reviewed restore procedure. The current workflow checks the snapshot format and encryption round-trip; that alone does **not** prove a database restore works.
- [ ] Never trial an unverified restore against the production database.

If backup secrets are missing, the workflow deliberately fails and explains which secret names need configuration rather than silently reporting a green skipped backup.

## Account and admin workflows

Test with designated test accounts and avoid deleting or editing live member records.

- [ ] Member registration creates a pending application; duplicate applications are handled as expected.
- [ ] A role number is issued only after approval and approved role numbers remain ordered according to the current YYC policy.
- [ ] Member login, profile editing, digital ID card, QR verification and explicit logout work.
- [ ] Leader login and profile features work without granting administrative edit permissions.
- [ ] Admin login, logout, device/session revocation and session persistence behave as intended.
- [ ] Admin can create, edit and delete a test event, update and gallery item; verify changes on the public view and remove the test content afterward.
- [ ] Approval, denial, duplicate marking, member/leader records, reports, notifications, settings and storage screens show clear success/error states.

## Performance and media

- [ ] Check the homepage on a real phone over mobile data and on desktop; confirm no horizontal overflow, frozen navigation or overlapping highlights.
- [ ] Use browser performance tooling on desktop and mobile to inspect Largest Contentful Paint (LCP), Cumulative Layout Shift (CLS), Interaction to Next Paint (INP), console errors and failed asset requests.
- [ ] Confirm Reel videos do not fetch their media sources until play is requested. Posters/thumbnails should remain lazy-loaded when below the fold.
- [ ] Review Supabase Storage usage periodically. The Reel interface warns that larger videos consume more storage; actual upload limits still depend on project settings.

## Security maintenance

- [ ] Confirm row-level security and RPC permission checks remain enabled for member, leader and admin data.
- [ ] Keep service-role keys and administrative tokens out of public code and issue comments.
- [ ] Confirm that the private vulnerability-reporting route is enabled in repository settings if available.
- [ ] Review dependency and GitHub Actions alerts and investigate failures promptly.

