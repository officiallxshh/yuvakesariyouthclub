# Yuvakesari Youth Club website

A responsive, animated YYC website built as a no-build static site for Netlify/GitHub Pages.

## Included
- Premium dark/gold YYC visual system
- Uploaded YYC logo + Tulunadu/Subrahmanya landscape used in the design
- Kannada slogan: **ಧರ್ಮೋ ರಕ್ಷಿತ ರಕ್ಷಿತಃ 🚩**
- About / Tulunadu glimpse / leaders / updates / gallery / membership sections
- WhatsApp and Instagram links supplied by the club
- X and Facebook are intentionally shown as unavailable until the real official URLs are supplied
- Member registration with photo upload and crop controls: zoom, left/right and up/down
- Admin area with members, leaders, updates, gallery and approval queue
- Member approval/denial and automatic YYC role-number assignment
- Membership card preview with the approved member photo
- Admin can add/edit/remove leaders and publish/delete updates/gallery items
- Member/community submissions for updates/gallery go into an approval queue
- Data is persisted in browser localStorage

## Demo admin access
Two admin IDs are configured:
- `lxshhisadmin`
- `lxshhisboss`

Demo password for both: `YYC@2026`

**Important:** this is front-end demo authentication. A production public site should use Firebase Auth/Supabase Auth plus a hosted database and storage. Do not treat client-side passwords/localStorage as secure authentication.

## Deploy to Netlify
1. Upload the whole folder to Netlify, or drag-and-drop the folder/zip into Netlify.
2. No build command is required.
3. The entry file is `index.html`.

## Next production upgrade
For multi-device member records, replace the localStorage layer with Firebase/Supabase. This will allow admins on different devices to see the same members, approvals, leaders, updates and gallery, with real authentication and image storage.
