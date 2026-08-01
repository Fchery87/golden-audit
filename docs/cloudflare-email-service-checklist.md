# D10 transactional email deployment checklist

> **Scope:** Cloudflare Email Service delivery for the California-only, invite-only educational pilot. This checklist does not approve a vendor, launch the pilot, or replace privacy/counsel review.

## What the application does

- `POST /api/consumer/password-reset/request` always returns the same response, whether or not an account exists. When an account exists, the Pages Function sends a one-hour, single-use password-reset link through the `EMAIL` binding.
- `POST /api/consumer/email-verification/request` requires the account's session and sends a one-hour, single-use verification link through the same binding.
- Links use only the configured HTTPS `CONSUMER_APP_URL`; the Pages response sets `Referrer-Policy: no-referrer` so browser navigation does not forward a link token to another origin. Raw tokens are not written to application logs.
- A failed send returns the same generic response as an unknown account, preserving the reset endpoint’s account-enumeration protection. The token remains single-use and expires normally; the consumer can request a fresh link.

## Required operator steps before deployment

1. **Complete vendor/privacy review.** Update the Cloudflare Email Service row in `docs/vendor-inventory-working.md` with the accountable owner, DPA/contract status, incident contact, deletion/return mechanism, subprocessors, and data-residency decision. Counsel/privacy must approve corresponding notice language before real consumer email is processed.
2. **Enable Email Sending for the sender domain.** In the Cloudflare account that owns this Pages project, onboard and verify the sender domain according to Cloudflare Email Service documentation. Configure SPF, DKIM, and DMARC as required by that onboarding flow.
3. **Set production values in `wrangler.jsonc`.** Replace the placeholders below with the production consumer app URL and a verified sender address. Both must be HTTPS/domain-controlled values; do not use a personal mailbox.
4. **Deploy to a preview environment first.** Confirm a real account that you control receives reset and verification emails, the links work once, and a second click fails. Do not test with fabricated addresses.
5. **Configure Cloudflare WAF.** The application’s `AUTH_RATE_LIMITER` is a narrow application binding. Before public pilot access, configure WAF/rate-limit rules for `/api/consumer/register`, `/api/consumer/sign-in`, and `/api/consumer/password-reset/request`, with monitoring and owner escalation.
6. **Record deployment evidence.** Add the date, tested preview URL, sender domain, and non-sensitive success/failure evidence to the release checklist. Do not copy message bodies, recipient addresses, or link tokens into Git or telemetry.

## Local development behavior

The Node development server sends no real email by default. Set `PILOT_EMAIL_OUTBOX_PATH` to a local, access-restricted scratch file only when manually exercising email delivery. The file contains reset/verification links and must never be committed, attached to an issue, or shared.

```bash
PILOT_EMAIL_OUTBOX_PATH=.scratch/runtime/email-outbox.jsonl \
CONSUMER_APP_URL=https://pilot.local.test/app \
CONSUMER_EMAIL_FROM='Golden Audit <no-reply@pilot.local.test>' \
npm run dev:web
```

Remove the scratch outbox after testing.

## Verification commands

```bash
npm run typecheck
npm test
npm run verify:content
npm run build
npm run build:web
```

The automated suite verifies the public sender seam with an injected fake transport. It does not send network email.
