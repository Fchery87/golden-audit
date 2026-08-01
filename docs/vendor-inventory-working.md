# Vendor inventory (working)

> **Status:** Working inventory for the current California one-state pilot. This is not approval and not production certification. It is a starting point for accountable-owner completion.

## Vendor rows

| Vendor | Service category | Data touched | DPA / contract status | Incident contact | Deletion / return mechanism | Subprocessors reviewed | Data residency reviewed | Owner | Notes |
|---|---|---|---|---|---|---|---|---|---|
| `Cloudflare Pages` | hosting / cloud infrastructure | frontend assets, account/session data, API routes | not started | `[TBD]` | Cloudflare account/project teardown and deployment removal path to be documented during vendor review | no | no | Security / Ops | Active pilot hosting choice. Production alias URL: `https://main.golden-audit-pilot.pages.dev`. Verified preview deployment: `https://91794dbe.golden-audit-pilot.pages.dev` on 2026-07-31. |
| `Cloudflare R2` | storage / backup | raw PDFs, exports, backups, large object files | not started | `[TBD]` | Cloudflare bucket object deletion lifecycle and bucket teardown path to be documented during vendor review | no | no | Ops / Security | Active pilot object/file storage choice. Bucket name: `golden-audit-pilot-uploads`. |
| `Cloudflare D1` | structured app state / database | account/session data, consent records, audit indexes, evidence metadata, normalized metadata | not started | `[TBD]` | Cloudflare D1 data deletion / database teardown path to be documented during vendor review | no | no | Security / Ops | Active pilot structured data store. Database name: `golden-audit-pilot`. Database id: `e24d3d92-0f9d-4cf1-a31f-f47b733e3432`. Remote migration `003_pilot_pages_state` verified 2026-07-31. |
| `[TBD monitoring provider]` | monitoring / security telemetry | runtime metadata, redacted logs, alerts | not started | `[TBD]` | `[TBD]` | no | no | Security | Must preserve telemetry redaction posture |
| `Cloudflare Email Service` | transactional account email | account email; one-hour, single-use password-reset or verification token carried only in the email link | not started | `[TBD]` | Cloudflare Email Service retention/deletion terms and account/project teardown path to be documented during vendor review | no | no | Ops / Privacy | D10 implementation uses an `EMAIL` Pages binding. Must not be enabled for real consumers until the verified sender domain, DPA/contract, privacy review, and deployment checklist are complete. See `docs/cloudflare-email-service-checklist.md`. |
| `[Optional narration/model provider]` | model / narration | constrained findings payload, generated summary | not started | `[TBD]` | delayed lifecycle / provider deletion path | no | no | Security / Vendor | Keep disabled until approved and contractually reviewed |

## Required categories to review
- hosting / cloud infrastructure (Pages + Functions)
- storage / backup (R2)
- structured app state / database (D1)
- monitoring / security telemetry
- transactional communication
- optional narration / model provider if enabled

## Minimum evidence
- confidentiality terms
- security obligations
- deletion / return commitments
- incident-notification duties
- approved subprocessors terms
- data residency review where applicable

## Notes
- Review `docs/cloudflare-pages-d1-r2-setup.md` and `docs/cloudflare-email-service-checklist.md` before enabling the Email Sending binding or replacing placeholder Cloudflare resource values in this working inventory.
- Monitoring, incident contact, deletion / return commitments, subprocessors review, and data residency review still require accountable-owner completion during vendor review.
- Do not treat this as vendor approval; it is only the working inventory needed before vendor review can sign off.
