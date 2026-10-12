# Yuvakesari Youth Club — GitHub Pages

## Upload structure
Upload the **contents of this folder** directly into the repository root.

```text
index.html
styles.css
app.js
sw.js
.nojekyll
assets/
  yyc-logo-clean.webp
  yyc-logo.webp
  hero-tulunad.webp
  river-circle.webp
  temple-circle.webp
  bhoota-kola.webp
  glimpse-hills.webp
  glimpse-river.webp
  glimpse-temple.webp
  social-whatsapp.png
  social-instagram.png
  social-x.png
  social-facebook.png
```

## Current site experience

- Premium YYC visual identity with the club logo, regional culture imagery, mobile-responsive layouts and dark/gold styling.
- Main sections include Home, Tulunad Glimpse, Leaders, Swags, Updates, Events, Gallery, Reel and Join YYC.
- The primary navigation uses one active tab at a time and follows the section selected or currently viewed.
- Reel videos keep their media source detached until a visitor chooses to play, reducing unnecessary video downloads on mobile.
- Respect for reduced-motion preferences is built into the interface.

## Admin
Admin credentials are managed through the YYC/Supabase backend and are intentionally not stored in this public repository.

## GitHub Pages
Repository → Settings → Pages → Deploy from a branch → `main` → `/ (root)`.

## Data and backend
The live YYC site uses Supabase for centralized member registration, approval, authentication, sessions, notifications, events/RSVPs, digital ID cards, QR verification, leaders, content, storage and site settings. GitHub Pages is used for the public frontend.


Latest hero refresh: Dharma Daiva, Aati Kalenja and Yakshagana assets are bundled locally as optimized 768px WebP files and cached by sw.js.

## Navigation and release checks

The desktop navigation has one active-state controller; the active tab follows clicks and manual scrolling. The active box uses a short transition and respects reduced-motion settings. Build 15 adds an automated Chromium check for desktop links and mobile navigation.

Run repository checks before merging changes:

```bash
node scripts/yyc-full-audit.mjs
node scripts/smoke-http.mjs
node scripts/production-monitor.mjs
```

The GitHub browser-regression workflow exercises the local site with a real Chromium browser. Member/leader/admin actions that require authorized accounts or production data must still be tested manually with controlled accounts.

## Real backend
Supabase project: `Yuvakesari Youth Club` (Asia South). Member registration, approval, login, sessions, digital cards, QR verification, leaders, updates, gallery and site settings use the hosted database. The frontend uses the Supabase publishable key; no secret/service-role key is included in GitHub.


<!-- Preflight verification: 2026-10-02T16:57:51.698Z -->
