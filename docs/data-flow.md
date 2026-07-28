# Consumer report data flow (draft for counsel / privacy / security review)

> **Status:** Draft working artifact, not legal advice. This repo currently implements the flow **in-process in an in-memory prototype**. The diagram below shows the **logical pilot data path** the code implements today and the deployment constraints the free pilot must preserve.

## Purpose

This document gives counsel, privacy, security, and vendor reviewers a single picture of:
- where consumer report data enters the system,
- which transformations happen to it,
- which artifacts are stored,
- which outputs return only to the consumer, and
- where deletion must remove or age out data.

It is intended to support ticket 11 / ticket 12 approvals, the privacy notice draft, vendor due diligence, and the GLBA-style WISP / risk assessment documents.

## Guardrails this flow must preserve

- **Consumer-uploaded reports only** — no bureau self-fetching.
- **Consumer-only delivery** — outputs return only to the report subject.
- **Educational use only** — no lending/employment/housing/insurance/eligibility decisions.
- **No data sale / no advertising / no model training on report data.**
- **IdentityIQ PDF is the ingestion format** for the current pilot path.
- **Deletion must cover active-system artifacts immediately** and track delayed processors (e.g. backups, optional model provider) explicitly.

## Logical data flow

```mermaid
flowchart TD
  A[Consumer browser / device] --> B[Web / API boundary\nlogical pilot surface]
  B --> C[Register / Sign in\nemail + password]
  B --> D[Consent + written authorization\nUS-CA pilot gate]
  B --> E[Initialize upload\nephemeral upload token]
  E --> F[Complete upload\nmedia-type + structural validation]

  F --> G[HTML safety checks\nscript / iframe / URL / EICAR guards]
  F --> H[PDF structural checks\n%PDF- magic + /Encrypt scan]

  G --> I[Redaction boundary\nredactReportText()]
  H --> J[Private raw PDF bytes\nrawUploadBytes]

  I --> K[Sanitized upload payload]
  J --> L[pdftotext -bbox]
  L --> M[parseIdentityIqPdfBbox()]
  K --> N[Synthetic fixture parser path\n(test-only, not pilot ingestion)]

  M --> O[Canonical report\nprovenance + confidence]
  N --> O

  O --> P[Consumer review / corrections]
  P --> Q[Match proposal / split / subgroup confirmation]
  Q --> R[Deterministic analysis core\nevaluateAnalysis()]

  R --> S[Consumer report]
  S --> T[Masked export\nassertSafeConsumerOutput()]
  S --> U[Optional narration provider\nconstrained + guarded]

  T --> V[Return to consumer only]
  U --> V

  O --> W[Deletion workflow]
  R --> W
  S --> W
  T --> W
  J --> W

  W --> X[Immediate active-system deletion]
  W --> Y[Tracked delayed deletion\nbackup lifecycle / optional model provider]

  V -. never .-> Z[Lenders / landlords / employers / insurers / bureaus / furnishers / brokers / credit-repair businesses]
```

## Code facts this diagram is based on

- **Written authorization required before processing**: `AUTHORIZATION_TEXT`, `acceptAuthorization()`, `requireAuthorization()`
- **Retention policy disclosed**: `RETENTION_POLICY`
- **Upload gating**: `initializeUpload()` → `completeUpload()`
- **Inbound safety**: HTML quarantine checks; PDF `%PDF-` / `/Encrypt` checks
- **Inbound redaction**: `redactReportText()`
- **PDF parsing**: `extractBboxFromPdfBytes()` → `parseIdentityIqPdfBbox()`
- **Consumer review**: `completeReview()` + value correction flow
- **Matching / subgrouping**: `proposeMatches()` + `confirmMatchSubgroup()`
- **Deterministic analysis**: `runAnalysis()` → `evaluateAnalysis()`
- **Outbound guard**: `assertSafeConsumerOutput()` on export / narration
- **Deletion**: `requestDeletion()` deletes active-system artifacts and records delayed processors

## Data inventory by stage

| Stage | Data in scope | Purpose | Current storage shape | Deletion expectation |
|---|---|---|---|---|
| Registration / sign-in | email, password hash + salt | authenticate consumer | logical `users` / `sessions` | account/session lifecycle |
| Consent / authorization | jurisdiction, acknowledgements, authorization acceptance timestamp/version | legal gating | logical `consents` / authorization record | retain while account active or as required by policy |
| Upload staging | file name, media type, size, source hash, upload stage | safe ingestion orchestration | logical `uploads` | delete on request / retention schedule |
| Raw PDF bytes | uploaded report bytes | parse the IdentityIQ PDF | `rawUploadBytes` (private map in prototype) | delete on request; never expose on returned Upload |
| Sanitized text | redacted HTML/text content | safe extraction | upload sanitized content | delete on request / retention schedule |
| Canonical report | normalized tradelines + provenance/confidence | review + analysis | logical `normalized_reports` | delete on request |
| Match groups | candidate / confirmed account groups | deterministic comparison | logical match records | delete on request |
| Analysis output | findings + audit + versioning | consumer report generation | logical `analyses` | delete on request |
| Consumer report / export | masked findings + actions | consumer use only | logical `consumer_reports` / `exports` | delete on request |
| Narration payload/output | constrained findings payload, generated summary | optional education UX | optional external processor if enabled | delayed deletion must be tracked explicitly |

## External parties / processor categories

This repo does **not** send data to lenders, landlords, employers, insurers, bureaus, furnishers, brokers, attorneys, or credit-repair businesses. The only categories that may process consumer report data in the pilot architecture are:

1. **Hosting / infrastructure provider** (compute, storage, logs, backups)
2. **Optional narration/model provider** if narration is enabled in deployment
3. **Operational vendors** explicitly approved under the vendor gate (e.g. transactional email, monitoring), subject to confidentiality/security/deletion/incident terms

These processor categories must be reflected consistently in:
- vendor inventory / due diligence,
- privacy notice,
- contracts / DPAs,
- incident response plan,
- deletion expectations.

## Deletion model

### Immediate active-system deletion
The current code deletes active artifacts tied to the consumer on request:
- uploads
- reports
- analyses
- consumer reports
- exports
- raw PDF bytes (`rawUploadBytes`)

### Delayed / dependent deletion
The current model explicitly contemplates delayed processors:
- backup lifecycle
- optional model provider

These are not silently ignored; they must be disclosed and tracked.

## Open decisions this diagram does **not** answer

This diagram is intentionally stack-agnostic. It does **not** decide:
- web framework,
- database engine / driver,
- hosting vendor,
- encryption/KMS product,
- monitoring / logging vendor,
- whether narration is enabled in the pilot.

Those are downstream implementation choices that must preserve the flow and guardrails above.
