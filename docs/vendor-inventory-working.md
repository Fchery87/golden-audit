# Vendor inventory (working)

> **Status:** Working inventory for the current California one-state pilot. This is not approval and not production certification. It is a starting point for accountable-owner completion.

## Vendor rows

| Vendor | Service category | Data touched | DPA / contract status | Incident contact | Deletion / return mechanism | Subprocessors reviewed | Data residency reviewed | Owner | Notes |
|---|---|---|---|---|---|---|---|---|---|
| `Cloudflare Pages` | hosting / cloud infrastructure | frontend assets, account/session data, API routes | not started | `[TBD]` | `[TBD]` | no | no | Security / Ops | Provisional pilot hosting choice on the free tier |
| `Cloudflare R2` | storage / backup | raw PDFs, exports, backups, large object files | not started | `[TBD]` | `[TBD]` | no | no | Ops / Security | Provisional object/file storage choice for the pilot; bucket name still needs final value |
| `Cloudflare D1` | structured app state / database | account/session data, consent records, audit indexes, evidence metadata, normalized metadata | not started | `[TBD]` | `[TBD]` | no | no | Security / Ops | Provisional structured data store for the pilot; database id still needs final value |
| `[TBD monitoring provider]` | monitoring / security telemetry | runtime metadata, redacted logs, alerts | not started | `[TBD]` | `[TBD]` | no | no | Security | Must preserve telemetry redaction posture |
| `[TBD transactional email provider]` | transactional communication | account email, limited account metadata | not started | `[TBD]` | `[TBD]` | no | no | Ops / Privacy | Only if used in the pilot surface |
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
- Review `docs/cloudflare-pages-d1-r2-setup.md` before replacing the placeholder Cloudflare resource values in this working inventory.
- Replace every `[TBD ...]` row with the actual provider once deployment choices are made.
- Do not treat this as vendor approval; it is only the working inventory needed before vendor review can sign off.
