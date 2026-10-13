# YYC Website Build 15 — Audit Notes

Audit date: 2026-10-13

## Verified

- GitHub Actions reported successful recent runs for CodeQL, preflight, and the production monitor.
- The SEO audit checked 31 tracked URLs: 10 indexed, 19 unknown to Google, and 2 discovered but not indexed.
- Google Search Console reports both `sitemap.xml` (31 URLs) and `video-sitemap.xml` (3 URLs) downloaded with zero reported warnings or errors.
- IndexNow's key file was verified as reachable.
- The 25-page technical audit reported no critical/high issues in that batch. Six additional URLs were checked separately.
- The Supabase project is active and the main member/event/leader tables inspected have RLS enabled.

## Changes proposed in this branch

- Add Schema.org Organization + AboutPage structured data to `about.html`.
- Add Schema.org Organization + ContactPage structured data to `contact.html`.
- Extend the Playwright regression suite to assert mobile layout has no horizontal overflow and navigation has one active target after a mobile menu action.

## Items requiring follow-up / manual verification

- Search Console's live audit returned HTTP 403 for `/updates/` while the repository contains the generated page with canonical metadata and CollectionPage JSON-LD. This may be a CDN/WAF or crawler-specific response; compare a normal browser request and hosting/CDN logs before changing routing.
- The Supabase Security Advisor reports 4 RLS-enabled tables with no direct policies and broad warnings about SECURITY DEFINER RPC execution for both `anon` and `authenticated`. Many RPCs intentionally authenticate using an application session token, so do not blanket-revoke grants. Review each function's token validation and required caller roles; make targeted changes only after regression tests.
- No recent GitHub Actions run for the encrypted offsite backup workflow was found in the inspected run history. Confirm repository secrets are configured, run the workflow manually, and verify the encrypted artifact and manifest exist. A decryption round-trip in CI is not a full database restore test.
- A restore test must run in an isolated/non-production project after checking the snapshot schema. No production restore or destructive database operation was performed.
- The browser regression workflow is extended here, but its result must be read from the PR's GitHub Actions run before marking it passed.
- Search indexing is controlled by Google; sitemap submission and IndexNow do not guarantee indexing.

## Current indexing snapshot

- Indexed: 10 / 31 (32.3%)
- URL unknown to Google: 19 / 31
- Discovered — currently not indexed: 2 / 31
- Tracked URLs with a recorded crawl: 10 / 31

## Safety notes

- No production data was changed.
- No live database migrations, grant changes, secret changes, or restore actions were run.
