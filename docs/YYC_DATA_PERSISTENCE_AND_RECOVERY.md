# YYC Data Persistence & Backup Notes

## Authoritative data store

YYC's operational records are stored in the Supabase Postgres database through the site's RPC functions. The browser's `yyc_public_cache_v2` is a display cache for faster first paint; it is not the authoritative copy and must never be used to overwrite server records. Profile/session tokens kept in browser storage are session conveniences, not business-data storage.

Uploaded photos and media are stored separately through Supabase Storage buckets (`member-photos`, `yyc-media`, and `yyc-certificates`). Database backups do not contain the actual bytes of Storage files.

## Application-level daily snapshots

The existing `yyc-daily-backup` pg_cron job runs at **02:15 UTC daily**. This migration upgrades its snapshot format to version 2 and includes these persisted records: settings, members (without password hashes), leaders (without password hashes), announcements, news, events, gallery, swags, volunteers, achievements, club history, finance, contact messages, attendance, member cards, event RSVPs, member notifications, admin activity history, email/WhatsApp delivery history, delivery events, and a manifest of media object paths and metadata.

The snapshot also records table counts so an administrator can see whether a snapshot includes the expected modules. Active session-token hashes, password hashes, and login-throttling state are intentionally excluded. The storage manifest is only an inventory; it does **not** back up the binary contents of photos/certificates.

The in-database snapshot table keeps a rolling 30-day window. The live tables are not deleted by this retention rule. The snapshot table is in the same database, so it is not a substitute for an independent off-site copy or Supabase-managed database backups.

## Recommended recovery posture

1. Verify Supabase's **Database → Backups** page and confirm the plan's managed backup retention for this project.
2. Keep an off-site logical database export in a separate trusted location; do not commit personal member data or credentials into GitHub.
3. Keep a separate copy of important Storage files, because restoring a database backup does not restore Storage objects that were deleted later.
4. Test recovery periodically on a separate project/branch, never by running a destructive restore against production as a test.
5. On any restore, reset/re-establish credentials and sessions; application-level snapshots deliberately omit password hashes and active sessions.

## How to verify the scheduled snapshot

As an administrator, call the existing `admin_backup_status(p_token)` RPC to inspect the last snapshot time, rolling count, format version and covered-table counts. `admin_backup_snapshot(p_token)` returns the current application-data export after checking the administrator token. Treat the returned data as confidential because it includes membership/contact and message history.
