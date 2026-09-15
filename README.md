# Yuvakesari Youth Club — Admin V11

Run locally with **Node.js 22+** using `Start YYC.bat`, then open `http://localhost:4176/`.

Admin ID: `lxshhadmin`
Admin password: `lxshhboss`

## V11 admin architecture
The admin workspace is redesigned from the ground up. Overview, Members, Leaders, News & Updates, Gallery, and Site Settings are separate views. The selected view is the only one mounted/visible, so records cannot leak between panels.

## Large database
The local backend uses SQLite in WAL mode with indexes for member status, name, member number, email, leaders, announcements, and gallery. Members are loaded 50 at a time, updates 30 at a time, and gallery 24 at a time. This avoids loading 10,000 member records into the browser at once. SQLite is suitable for substantially more than 10,000 member rows; practical capacity is mainly determined by disk space and server resources.

Photos uploaded through the server are stored as files in `uploads/` while SQLite stores only their paths. This is much faster and smaller than storing large base64 images directly inside the database.

## Site Settings
Admins can edit the public site name, former name, location, hero kicker, hero tagline, quote, mission, thank-you line, president, title, and footer line from **Site Settings**. Values are stored in the SQLite `settings` table.

## Performance
The hero/background images have optimized WebP versions . Public gallery/leader images use lazy loading and decoding hints. Static CSS/JS/images are cacheable, while API responses are not.

## Important hosting note
GitHub Pages/static hosting cannot run the Node.js + SQLite backend. In static mode the site falls back to browser storage and is intended only as a demo. For the large shared database and admin features, run the included Node server or deploy the Node app to a server.

V13 image loading fix
- Hero now uses a responsive <picture>/<img> element with high-priority preload, rather than relying on a CSS-only background.
- WebP is served first, with compact JPEG fallback for maximum browser compatibility.
- Desktop uses yuvakesari-landscape; phones <=760px use yuvakesari-mobile.
- Cache-busted app.js?v=13.0.0 prevents stale JS from being reused.

## V14 performance pass
- Hero uses only the device-matching responsive WebP preload, so mobile does not waste a request downloading the desktop hero.
- Hero and logo WebP assets were recompressed and resized for faster first paint.
- Server sends compressed JSON (Brotli/Gzip when supported) and long-lived cache headers for static assets.
- Public data has a short in-memory cache, and admin summary combines count queries into one SQLite statement.
- SQLite remains WAL + NORMAL synchronous with indexed member fields and paginated admin views.

## V15 professional member workflow
The Members admin panel now provides dedicated **Edit, Approve, Reject, Restore/Set Pending, Photo, and Delete** actions. The Edit Member modal also allows the administrator to change the membership status in one save operation. Status changes are persisted through the protected admin API in server mode and through the local admin store in static mode.


V15 also fixes static/browser-mode membership status actions so Approve/Reject/Restore work without requiring the local Node server.


V16 visual asset update: the supplied Sep 13 landscape is used as the hero background, and the supplied Sep 4 emblem is cropped to a lion-only symbol for branding. The reference artwork itself is not used as a page screenshot.

### V17 image loading fix
The hero now uses two device-specific local WebP files: `assets/yyc-hero-desktop.webp` and `assets/yyc-hero-mobile.webp`. Desktop/tablet and mobile browsers request the correct image directly via `<picture>`, with high-priority preload. The provided scenery is unchanged; only delivery encoding is optimized.


V18: membership submissions explicitly start as PENDING. The success dialog shows the pending approval state, and members can check status later using role number + phone. Admin can Approve or Deny/Reject from the Members panel.

## V19 exact responsive hero
- Mobile hero uses the exact user-provided 940×1672 image.
- Desktop/tablet hero uses the exact user-provided 1671×941 image.
- Lion logo uses a cropped lion-only symbol from the user-provided emblem.
- Native `<picture>` + eager high-priority hero loading; no JS swapping.
- WebP plus JPEG/PNG fallbacks for resilient loading.
