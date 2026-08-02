# Operator dashboard and personalized report redesign

Status: ready-for-agent

## Goal

Give Golden Audit owners a protected, deployable control surface for report presentation settings while improving the consumer report’s clarity without turning it into a dispute, repair, legal-advice, or score-prediction product.

## Confirmed decisions

- Deploy a protected `/admin` experience in the Cloudflare Pages application, with local Node parity.
- Bootstrap exactly one initial owner from a server-only deployment environment variable. Never expose the bootstrap value to the client or logs.
- The owner may configure **presentation-only** fields: organization/trade name, prepared-by label/title, logo, support contact details, report title/subtitle, accent/print settings, and a short closing note.
- Blank optional values are omitted; no fabricated contact data.
- Configuration changes apply only to reports generated after the change. Each consumer report/export retains an immutable profile snapshot.
- Findings, source evidence, education, coverage, parser limitations, required educational boundary text, and workflow language remain governed/immutable.
- Consumer name is shown only when conservatively extracted from the uploaded IdentityIQ report with provenance and adequate confidence; otherwise use `Your report overview`.

## Non-goals for this release

- No scores, inquiry analysis, utilization summary, creditor/furnisher table, or detailed tri-merge presentation until parser coverage supports each item.
- No dispute-generation workflow, legal conclusion, score prediction, deletion promise, fabricated consumer data, or free-form editing of protected content.
- No real deployment, credential creation, or production data migration in this implementation slice.

## Security and integrity requirements

- Anonymous and consumer sessions receive no admin data and cannot mutate admin configuration.
- Settings mutations require anti-CSRF protection and use a strict allowlist, bounded values, URL validation, and the consumer-output guard for displayable copy.
- Persist revisions and audit events without sensitive report data, passwords, session IDs, or bootstrap secrets.
- Local SQLite, D1, and in-memory test stores must implement one compatible profile/snapshot contract.
- Browser report, print rendering, and masked JSON export must all use the same saved profile snapshot.

## Delivery phases

1. **Foundation (this slice):** authorization, owner bootstrap, profile schema and snapshot model, profile settings endpoint/UI, report cover/overview, matching and export-scope safety fixes, conservative display-name extraction.
2. **Account analysis:** source-linked account/finding tables with creditor/furnisher and bureau presentation only where canonical values exist.
3. **Extended analysis:** scores, inquiries, utilization, summary charts, and expanded education only after parser capability/provenance tests are in place.

## Verification

- Test the role matrix, profile validation/revision behavior, report snapshot immutability, owner-only admin route, CSRF denial, fallback display name, safe matching, and export wording.
- Run focused tests, `npm run typecheck`, `npm run build:web`, and relevant build/tests before claiming completion.

## Notes

This specification does not authorize real-consumer deployment. Existing pilot readiness/approval gates remain independently required.
