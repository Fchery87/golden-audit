# 12 — Pilot legal-conditions backlog (derived from preliminary FCRA counsel opinion)

**What to build:** The concrete, testable engineering and operational constraints that counsel made **conditions** of the invite-only free pilot. These gate the pilot. They are not optional nice-to-haves; each traces to a specific point in `docs/legal-pre-mortem-brief.md` and the counsel opinion captured in ADR-0003.

**Blocked by:** 11 — Pilot readiness (the platform conditions are part of pilot readiness).

**Status:** in-progress — code-enforceable conditions (Q-L1/L2/L3/L4/L5 + pricing) implemented & tested this slice; infrastructure + human-gated items (encryption-at-rest, GLBA WISP/risk-assessment/vendor-contracts, final counsel clearance) remain

> Source: preliminary (non-privileged) FCRA counsel opinion, to be validated by retained California/FCRA counsel before any **paid** launch. ADR-0003 governs. The free pilot doubles as the demand probe.

## Delivery model (keeps us outside the FCRA CRA definition — Q-L1)

- [x] Results are delivered **only** to the authenticated report subject; no path delivers to lenders, landlords, employers, insurers, brokers, attorneys, or credit-repair businesses. _(test: subject-only delivery — a second consumer cannot read another's report)_
- [x] No "share with lender" affordance, third-party portal, public link, eligibility API, or underwriting integration exists in the pilot. _(test: API-surface absence of share/lender/broker/eligib/underwrit/thirdpart)_
- [x] No cross-consumer rankings, comparative risk profiles, proprietary creditworthiness scores, or probability-of-approval outputs. _(test: API-surface absence of rankconsumer/approvalodds/scoreprobab)_
- [~] Terms state the output is for the consumer's **personal educational use** and is not produced for lending/employment/housing/insurance/eligibility decisions. _(AUTHORIZATION_TEXT states "personal educational use only"; the explicit decision-use exclusion is copy pending legal review)_
- [x] A failing test asserts no third-party-delivery code path exists (enforced at the boundary). _(tests/pilot-legal-conditions.test.ts)_

## Marketing & language guardrails (CROA + California Credit Services Act — Q-L2)

- [x] A **forbidden-vocabulary** gate (lint/test) blocks these terms in UI, marketing, and generated output: _credit repair, fix, clean, remove, delete, boost, improve your score, get approved faster_. _(packages/output-guard FORBIDDEN_OUTPUT_TERMS)_
- [x] No per-deletion / per-corrected-item / per-score-increase / results-based pricing (and no ranking of recommendations by expected score increase). _(no payment path exists; test asserts API-surface absence of pay/charge/bill/subscribe/stripe/price/fee)_
- [x] No generation or transmission of dispute letters or any communication to bureaus/furnishers. _(FORBIDDEN_DISPUTE_TERMS; assertSafeConsumerOutput blocks at the outbound boundary)_
- [x] No testimonials focused on deletions, score increases, approvals, or successful disputes. _(no testimonial/ranking feature exists in the platform)_
- [x] Educational content stays **generic and separate** from the consumer-specific result. _(education modules are governance artifacts, never inlined into findings/export output)_

## Pricing (reduces CROA + CCSA risk)

- [x] The invite-only pilot is **genuinely free** — no payment, no data sale, no advertising, no unrelated model training of report data. _(AUTHORIZATION_TEXT states free/no-sale/no-ad/no-training; test asserts no payment API path exists. Re-analysis required before introducing any payment.)_

## Authorization (Q-L3)

- [x] A standalone, versioned **written authorization** the consumer expressly accepts before any processing, instructing the company to: receive the uploaded Report; parse/analyze for the consumer's educational use; temporarily store under the disclosed retention policy; return Findings only to that consumer; delete per the schedule; and refrain from sale/share/ad-use/training. _(AUTHORIZATION_TEXT / AUTHORIZATION_VERSION='authorization-2026-01'; completeUpload is gated on acceptAuthorization)_
- [x] The acceptance record (text version, consumer identity, timestamp) is retained. _(AuthorizationRecord via getAuthorization; audited as 'authorization-accepted')_

## Minimization, retention, deletion, privacy (Q-L4)

- [x] SSNs, access credentials, and unnecessary identifiers are **redacted/removed before analysis** (parser pre-processing stage). _(packages/redaction, wired into ingestion; tested)_
- [ ] Reports encrypted in transit and at rest; no advertising pixels or session-replay on report pages. _(infrastructure — no real transport/storage in the in-memory prototype; human-gated for deployment)_
- [x] Originals retained only as long as operationally necessary; a visible consumer **deletion control** exists. _(RETENTION_POLICY.originalsMaxDays=30 + requestDeletion)_
- [ ] Every processor bound to confidentiality, security, deletion, and incident-notification duties. _(vendor contracts — human-gated)_
- [~] CCPA-grade controls (notice at collection, disclosed retention, access/correction/deletion) built in regardless of current threshold status. _(access=getSourceSnippet, correction=reviewValue, deletion=requestDeletion, notice/retention=AUTHORIZATION_TEXT+RETENTION_POLICY; formal notice-at-collection copy human-gated)_

## Security (GLBA Safeguards — ADR-0004, until cleared)

- [ ] Written information-security program with a designated responsible individual.
- [ ] Documented risk assessment; MFA; least-privilege access controls.
- [ ] Vendor due diligence + contractual security/deletion/incident terms.
- [ ] Incident-response plan; secure deletion/retention controls.

## Unauthorized-practice-of-law boundary (Q-L5)

- [x] No rule applies a statute to the consumer's individual facts to produce a legal conclusion. Any such rule is **suppressed or reframed** as "verify with the reporting source / consult qualified counsel." _(taxonomy is provisional/educational; no rule emits a legal-violation classification)_
- [x] Output never asserts a bureau/furnisher violated the FCRA, that the consumer has a legal claim, that a debt is legally invalid/unenforceable, or that the consumer is entitled to deletion/damages. _(FORBIDDEN_UPL_TERMS blocks every such phrasing at the outbound boundary)_

## Human-gated (not completable by an agent)

- [ ] Final written legal clearance of pricing, marketing copy, sample Findings, authorization, privacy notice, terms, retention schedule, and vendor/data-flow diagram by retained California/FCRA counsel **before any paid launch**.
- [ ] Formal GLBA classification determined.
- [ ] California Credit Services Act (CCSA) registration/bonding/contract obligations reviewed for the paid model.

## Security (GLBA Safeguards) — infrastructure / human-gated

The GLBA items below require real infrastructure and human processes (WISP, risk assessment, MFA, vendor due diligence, incident-response) that an in-memory prototype cannot provide. They are tracked here and gated on deployment, not codeable in this slice:

- [ ] Written information-security program with a designated responsible individual.
- [ ] Documented risk assessment; MFA; least-privilege access controls.
- [ ] Vendor due diligence + contractual security/deletion/incident terms.
- [ ] Incident-response plan; secure deletion/retention controls.

## Implementation log

- **Code-enforced (this slice):** Q-L1 subject-only delivery + no-third-party API; Q-L2 forbidden marketing + dispute vocabulary; Q-L3 written-authorization gate + retained acceptance record; Q-L4 bounded retention policy + disclosure + deletion control (redaction was pre-existing); Q-L5 UPL legal-conclusion blocking; pricing = genuinely free (no payment path).
- **Tests:** `tests/pilot-legal-conditions.test.ts` (7 tests) + extended `tests/output-guard.test.ts` (dispute + UPL categories). Existing flows updated to accept authorization before upload.
- **Remaining (human-gated / infra):** encryption-in-transit/at-rest, GLBA WISP/risk-assessment/MFA/vendor-contracts/incident-response, final counsel clearance of all copy/terms/notices, GLBA classification, CCSA registration.
