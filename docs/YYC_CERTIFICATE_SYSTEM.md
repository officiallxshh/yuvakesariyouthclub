# YYC Certificate Automation

The live certificate flow uses PostgreSQL for globally continuous numbering and idempotent issuance, Supabase Edge Functions (TypeScript/Deno) for validation, PDF creation, storage and email delivery, and the existing Node.js/Python utilities remain isolated for future server-side rendering expansion.

## Numbering

certificate_no is allocated from a database counter and never resets per event. The display format starts at 01, then 02, 03, 04 and continues globally. A certificate is unique per recipient plus event, so saving attendance again cannot allocate a second number for the same participation.

## Automatic flow

Admin marks a member or leader as PRESENT -> certificate record is issued -> PDF is generated with the recipient name, event details, certificate number, QR verification link and the exact Kannada motto ಧರ್ಮೋ ರಕ್ಷತಿ ರಕ್ಷितಃ -> PDF is saved in the private yyc-certificates bucket -> Resend emails the PDF as an attachment plus a permanent verification-page link.

Delivery failures do not roll back attendance. The assigned certificate number is kept with the failed certificate record so a retry reuses the same number.

## Public verification

certificate.html?token=<certificate-token> shows the registered recipient and event details and requests a short-lived signed download URL from yyc-certificate-public. The storage bucket remains private.

## Provider requirements

Existing RESEND_API_KEY and RESEND_FROM_EMAIL secrets are used. No new provider secret is required for certificate PDF delivery.
