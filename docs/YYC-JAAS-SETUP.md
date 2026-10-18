# YYC Meet: secure Jitsi as a Service (JaaS) setup

YYC Meet uses the 8x8 Jitsi as a Service (JaaS) deployment at 8x8.vc for authenticated moderator access. The public meet.jit.si instance does not accept tokens issued from YYC's own key, so do not point the JaaS token flow at meet.jit.si.

## One-time service setup

1. Sign in to the 8x8 Jitsi as a Service developer console and create an application/tenant. Keep the App ID.
2. In **API Keys**, add an RSA public key and keep the downloaded private key private. Save the full **Key ID** exactly as shown in the console. It includes the App ID prefix, e.g. vpaas-magic-cookie-.../key-fragment.
3. If the downloaded private key starts with BEGIN RSA PRIVATE KEY, convert it locally to unencrypted PKCS#8 PEM:

~~~sh
openssl pkcs8 -topk8 -nocrypt -in jaas-private.key -out jaas-private-pkcs8.pem
~~~

The resulting file must start with BEGIN PRIVATE KEY. Never commit, paste into this repository, or send the private key in chat.

## Supabase Edge Function secrets

In the Supabase dashboard for project vrllozfzheikjbhxvpkx, open **Edge Functions → Secrets** and add these values:

- **JAAS_APP_ID** — the App ID from the JaaS console.
- **JAAS_KEY_ID** — the full Key ID shown by JaaS, including the App ID prefix.
- **JAAS_PRIVATE_KEY_PKCS8** — the entire PKCS#8 PEM private key, including the BEGIN/END PRIVATE KEY lines.

The Edge Function is named yyc-jaas-token. Deploy it with verify_jwt = false: guests join with a secret invite code and YYC session tokens are opaque application tokens rather than Supabase Auth JWTs. The function performs its own checks before signing anything: it validates that the invite resolves to a currently-live meeting, validates any supplied YYC session through yyc_meet_portal, and sets moderator permission only for a verified admin actor. Guest/member/leader tokens are tied to the exact meeting room and have no moderator permission. JWTs expire after ten minutes and are returned with Cache-Control: no-store.

## Verify the flow

1. Sign in as the YYC Admin on the main website.
2. Open **Admin Panel → YYC Meet** and press **Start** on a scheduled meeting (or start an instant meeting). The host meeting opens in a new full-page YYC Meet tab, and its backend-issued JaaS JWT grants moderator status. No separate Jitsi username/password prompt should appear.
3. Open the copied YYC invite in a private/incognito window or on another device. It should join the same room with a non-moderator token.
4. Confirm that ended, cancelled, and non-live meetings fail before any conference token is signed.

## Operational notes

- GitHub Pages does not deploy Supabase functions by itself. Deploy supabase/functions/yyc-jaas-token/index.ts through Supabase and keep the three JaaS values in Supabase secrets.
- JaaS service/account usage limits and billing are governed by 8x8. Confirm current terms in the JaaS console before production use.
