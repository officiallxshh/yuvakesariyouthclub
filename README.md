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

## Design changes
- No image panel on the left side of the hero.
- Left side now uses **LAND OF CULTURE** with four compact culture boxes: Rivers, Temples, Tradition and People.
- The old left-side “Tulunadu Glimpse” heading/art block is removed.
- Right side keeps the heritage information panel and circular River, Temple and Bhuta Kola visuals.
- The old “Rooted in Tradition” overlay box is removed.
- Hero button is now **EXPLORE YYC**.
- Social buttons use local PNG app icons.
- YYC branding uses a cleaned circular logo asset with the square black corners removed.

## Admin
ID: `lxshhadmin`
Password: `yyclxshhboss`

## GitHub Pages
Repository → Settings → Pages → Deploy from a branch → `main` → `/ (root)`.

## Data note
Member/admin data is browser-local in this static GitHub Pages version. Shared multi-device registrations require a real backend such as Firebase or Supabase.


Latest hero refresh: Dharma Daiva, Aati Kalenja and Yakshagana assets are bundled locally as optimized 768px WebP files and cached by sw.js.

## Navigation active-state fix
The top navigation highlight now follows the section that was clicked. The Home tab is no longer permanently highlighted; clicking Tulunad Glimpse, Leaders, Updates, Gallery, or Join moves the gold underline to that tab and keeps it there until another navigation item is selected. Hash changes are also synchronized.


Latest fix: exact slogan is “ಧರ್ಮೋ ರಕ್ಷತಿ ರಕ್ಷಿತಃ 🚩”; below-hero sections now have persistent dark/gold visual backgrounds and static fallback cards so content is visible even before JavaScript renders dynamic data.


Latest hero-label correction: “YUVAKESARI YOUTH CLUB” is shown above “SUBRAHMANYA · KUKKE REGION · KARNATAKA” in the hero kicker.
