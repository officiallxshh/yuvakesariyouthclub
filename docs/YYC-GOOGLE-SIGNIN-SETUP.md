# YYC Google Sign-In and Member Registration

Google is available for three separate flows: **existing approved member login**, **active leader login**, and **new member registration**. Google is never used for administrator login.

For new registration, standard Google sign-in can supply the verified email, account name and (when available) profile picture. Google does **not** reliably provide date of birth or a phone number through the standard profile scopes, so the applicant must enter those YYC-required fields. The Google picture can be used as the member photo, or the applicant can upload a different image. New applications remain pending until an administrator approves them.

## How the browser flow works

### Existing members and leaders

1. Member Login or Leader Login starts Google OAuth through Supabase Auth using PKCE.
2. Supabase redirects back to the YYC homepage with a short-lived OAuth code.
3. The page exchanges the code through the Supabase Auth JS client and calls the relevant database bridge:
   - `public.member_login_verified_identity`
   - `public.leader_login_verified_identity`
4. The bridge verifies the Google provider, verified email, and exactly one approved/active matching YYC record, then issues the existing YYC member/leader session token.
5. The temporary Supabase OAuth session is cleared locally after the YYC token is issued.

### New member registration

1. The Member Registration form offers **Continue with Google**.
2. After Google returns, the form prefills the account name, verified email and profile picture when Google supplies them. The verified email is read-only in the browser form.
3. The applicant enters date of birth and phone number, confirms their name, and can upload a different member photo.
4. Submitting invokes `public.member_register_verified_google` with the signed-in Supabase Auth session. The server checks that the authenticated identity is Google and the email is verified; it takes the authoritative email from `auth.users`, not from a browser-supplied email.
5. The server creates a **pending, unapproved** YYC member record. It does not issue a member portal session or approve the application. The temporary Google session is cleared once submission succeeds or the form is cancelled.

The traditional manual registration route and its password flow remain available. The Google registration RPC grants execution only to `authenticated`; do not loosen it to `anon` or trust a client-side role claim.

## One-time provider configuration

Google OAuth cannot work until the OAuth credentials are configured. Do not put a Google client secret in this repository or in browser JavaScript.

1. In Google Cloud Console, create an OAuth Client ID with application type **Web application**.
2. Add these **Authorized JavaScript origins**:
   - `https://www.yuvakesariyouthclub.in`
   - `https://yuvakesariyouthclub.in`
3. Add this **Authorized redirect URI** in Google Cloud. This is the Supabase Auth callback, not the YYC homepage:
   - `https://vrllozfzheikjbhxvpkx.supabase.co/auth/v1/callback`
4. In Supabase Dashboard → Authentication → Sign In / Providers → Google, enable Google and enter the matching Google **Client ID** and **Client Secret**.
5. In Supabase Dashboard → Authentication → URL Configuration, set the Site URL to `https://www.yuvakesariyouthclub.in/` and allow the homepage redirect from both hostnames:
   - `https://www.yuvakesariyouthclub.in/`
   - `https://yuvakesariyouthclub.in/`
   - `https://www.yuvakesariyouthclub.in/**`
   - `https://yuvakesariyouthclub.in/**`
6. Save the provider settings before testing. If the project is configured with a different canonical host, add that exact host to the redirect allowlist too.

## Access and approval rules

- Existing members must be approved and have status `approved` to receive a member portal token.
- Existing leaders must be active and their verified Google email must match exactly one active leader row.
- New Google registrations use a separate server-side RPC and remain `pending` with `approved = false` until an admin approves them.
- Google registration takes the contact email from the verified Supabase Auth identity. It will not let a client register a different email from the authenticated account.
- A newly created Google Auth identity without a matching YYC role does not get a member or leader portal token.
- Admin Login remains on its existing username/password route.

## Test checklist

- Register a new member using Google. Confirm name, verified email and profile picture are prefilled when supplied by Google.
- Confirm date of birth and phone are required and not falsely auto-filled from Google.
- Submit an application and confirm the saved row is pending/unapproved and no member portal token is issued.
- Try registering again with an email or phone already used by a non-denied/non-duplicate member; the server must reject the duplicate.
- Cancel the Google registration form and confirm the temporary Supabase Auth session is cleared.
- Test an approved existing member and active leader whose registered email matches the Google email.
- Test a Google account that is not in YYC records for member/leader login; it must be denied portal access.
- Test cancel, missing provider configuration and a disallowed redirect URL; each should show an error.
- Confirm manual password registration, legacy password login and administrator login are unaffected.
- Check desktop and mobile modals, refresh/back navigation, and sign-out/session-reset behavior.

## Official references

- [Supabase: Sign in with Google](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Supabase: Auth redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
