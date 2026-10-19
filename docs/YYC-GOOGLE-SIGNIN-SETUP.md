# YYC Google Sign-In Setup

Google sign-in is available for **existing approved members** and **active leaders** whose verified Google email exactly matches the email stored in their YYC account. It does not create or approve a YYC member, and it is deliberately not available for the administrator login.

## How the browser flow works

1. The Member Login or Leader Login modal starts Google OAuth through Supabase Auth using PKCE.
2. Supabase redirects back to the same YYC homepage with a short-lived OAuth code.
3. The page exchanges the code through the Supabase Auth JS client and calls one of the existing database bridges:
   - \`public.member_login_verified_identity\`
   - \`public.leader_login_verified_identity\`
4. The bridge verifies the authenticated Google provider, verified email, and exactly one approved/active matching YYC record, then issues the existing YYC member/leader session token.
5. The Supabase OAuth session is cleared locally after the YYC token is issued. Existing password login and admin login remain unchanged.

The database bridges are already present in the connected production database and grant execution only to the \`authenticated\` role. Do not replace these functions with client-side role claims or trust a name supplied from the browser.

## One-time provider configuration

Google OAuth cannot work until the OAuth credentials are configured. Do not put a Google client secret in this repository or in browser JavaScript.

1. In Google Cloud Console, create an OAuth Client ID with application type **Web application**.
2. Add these **Authorized JavaScript origins**:
   - \`https://www.yuvakesariyouthclub.in\`
   - \`https://yuvakesariyouthclub.in\`
3. Add this **Authorized redirect URI** in Google Cloud. This is the Supabase Auth callback, not the YYC homepage:
   - \`https://vrllozfzheikjbhxvpkx.supabase.co/auth/v1/callback\`
4. In Supabase Dashboard → Authentication → Sign In / Providers → Google, enable Google and enter the Google **Client ID** and **Client Secret**.
5. In Supabase Dashboard → Authentication → URL Configuration, set the Site URL to \`https://www.yuvakesariyouthclub.in/\` and allow the homepage redirect from both hostnames:
   - \`https://www.yuvakesariyouthclub.in/\`
   - \`https://yuvakesariyouthclub.in/\`
   - \`https://www.yuvakesariyouthclub.in/**\`
   - \`https://yuvakesariyouthclub.in/**\`
6. Save the provider settings before testing. If the project is configured with a different canonical host, add that exact host to the redirect allowlist too.

## Access rules

- Members must be approved and have status \`approved\`.
- Leaders must be active and their verified Google email must match exactly one active leader row.
- If the email does not match the registered YYC email, Google sign-in will explain that the account needs its registered contact details corrected by YYC administration.
- Admin Login stays on its existing secure username/password route. A Google identity is never treated as an admin credential.
- A newly created Google Auth identity without a matching YYC role gets no member or leader portal token.

## Test checklist

- Test an approved member whose registered email matches their Google email.
- Test an active leader whose registered email matches their Google email.
- Test a Google account that is not in YYC records; it must be denied portal access.
- Test a member with an unapproved/inactive record and a leader with an inactive record; both must be denied.
- Test cancel, missing provider configuration, and a disallowed redirect URL; each should show an error without leaving a Supabase Auth session behind.
- Confirm legacy member/leader password login and admin login are unaffected.
- Check desktop and mobile modals, browser back/refresh, and sign-out/session reset behavior.

## Official references

- [Supabase: Sign in with Google](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Supabase: Auth redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
