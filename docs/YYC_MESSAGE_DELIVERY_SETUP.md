# YYC Message Delivery Setup

This document covers the provider configuration for the YYC Admin **Messaging** tab.

## What is already implemented

- Admin can select an approved member or active leader.
- Admin can compose a general, membership, event, certificate, or system message.
- Email and WhatsApp can be selected independently or together.
- Every provider attempt is recorded in `public.admin_message_deliveries`.
- A successful provider API response is shown as **✓ SENT** in the Admin panel.
- Failed, queued, skipped, and sent states are retained in the delivery log.
- The in-app member notification is preserved when external delivery fails.
- Membership approval emails keep the full YYC approval email design and can be delivered alongside WhatsApp.

The green **✓ SENT** state means the external provider accepted the message for sending. It is not a guarantee that the recipient has opened the message. The database already has a `delivered` state so provider webhooks can be added later without redesigning the UI.

## Email: Resend

The existing YYC notifier uses Resend.

Configure these Supabase Edge Function secrets:

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`

`RESEND_FROM_EMAIL` should use a sender/domain that is verified in the Resend account.

The Edge Function sends through:

`POST https://api.resend.com/emails`

No Resend key is stored in the browser or in the GitHub repository.

## WhatsApp: official WhatsApp Business Cloud API

YYC uses the official Meta WhatsApp Business Platform API rather than unofficial browser automation.

Configure these Supabase Edge Function secrets:

- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_GRAPH_VERSION` (optional; defaults to `v26.0`)
- `WHATSAPP_TEMPLATE_NAME`
- `WHATSAPP_TEMPLATE_LANGUAGE` (optional; defaults to `en_US`)

The WhatsApp template should be an approved template whose body accepts four text variables in this order:

1. Recipient name
2. Message title
3. Message body
4. Message/link

Example template body:

Hello {{1}},

{{2}}

{{3}}

{{4}}

— Yuvakesari Youth Club

Keep the template's variable order exactly the same as above so the YYC Edge Function sends the correct values.

The Edge Function sends through:

`POST https://graph.facebook.com/{graph-version}/{phone-number-id}/messages`

## Optional WhatsApp text-window mode

For controlled testing, `WHATSAPP_ALLOW_TEXT=true` can be used when the WhatsApp conversation state permits free-text business messaging.

The approved-template path should remain the normal production configuration for admin-initiated messages.

## Provider status in Admin

Open:

**Admin Login → Messaging**

The provider cards show:

- **READY · RESEND** — required email secrets are present.
- **READY · CLOUD API** — required WhatsApp secrets plus a template/text mode are present.
- **NOT CONFIGURED** — provider credentials are missing.

The status check never exposes the secrets themselves.

## Delivery flow

1. Admin selects a member or leader.
2. Admin writes the message.
3. YYC creates a delivery-log row with status `queued`.
4. YYC calls the selected provider(s).
5. A successful provider response changes the row to `sent` and the Admin UI shows **✓ SENT**.
6. A provider error changes the row to `failed` with a safe error message.
7. The delivery log remains available under **Recent messages**.

## Certificate workflow

The same delivery pipeline can be used for personalized certificates:

**Event → Attendance → Present member → Generate certificate → Send via Email / WhatsApp**

The certificate renderer remains deterministic: the member's original photo and exact member data are used; the delivery layer does not redraw or alter the member photo.

## Security rules

- Provider secrets must only exist in Supabase Edge Function secrets.
- Do not put provider API keys in `app.js`, HTML, client-side environment variables, or GitHub.
- Use the official Meta API for WhatsApp. Do not use unofficial WhatsApp Web automation.
- Keep message content operational/service-related when appropriate.
- The delivery table has RLS enabled and is only queried through the admin-authorized server function.

## Provider documentation

Meta WhatsApp Cloud API:
https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api

Resend:
https://resend.com/docs/api-reference/emails/send-email
