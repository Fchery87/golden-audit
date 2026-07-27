# 12 — Pilot legal-conditions backlog (derived from preliminary FCRA counsel opinion)

**What to build:** The concrete, testable engineering and operational constraints that counsel made **conditions** of the invite-only free pilot. These gate the pilot. They are not optional nice-to-haves; each traces to a specific point in `docs/legal-pre-mortem-brief.md` and the counsel opinion captured in ADR-0003.

**Blocked by:** 11 — Pilot readiness (the platform conditions are part of pilot readiness).

**Status:** ready-for-agent

> Source: preliminary (non-privileged) FCRA counsel opinion, to be validated by retained California/FCRA counsel before any **paid** launch. ADR-0003 governs. The free pilot doubles as the demand probe.

## Delivery model (keeps us outside the FCRA CRA definition — Q-L1)

- [ ] Results are delivered **only** to the authenticated report subject; no path delivers to lenders, landlords, employers, insurers, brokers, attorneys, or credit-repair businesses.
- [ ] No "share with lender" affordance, third-party portal, public link, eligibility API, or underwriting integration exists in the pilot.
- [ ] No cross-consumer rankings, comparative risk profiles, proprietary creditworthiness scores, or probability-of-approval outputs.
- [ ] Terms state the output is for the consumer's **personal educational use** and is not produced for lending/employment/housing/insurance/eligibility decisions.
- [ ] A failing test asserts no third-party-delivery code path exists (enforced at the boundary).

## Marketing & language guardrails (CROA + California Credit Services Act — Q-L2)

- [ ] A **forbidden-vocabulary** gate (lint/test) blocks these terms in UI, marketing, and generated output: _credit repair, fix, clean, remove, delete, boost, improve your score, get approved faster_.
- [ ] No per-deletion / per-corrected-item / per-score-increase / results-based pricing (and no ranking of recommendations by expected score increase).
- [ ] No generation or transmission of dispute letters or any communication to bureaus/furnishers.
- [ ] No testimonials focused on deletions, score increases, approvals, or successful disputes.
- [ ] Educational content stays **generic and separate** from the consumer-specific result.

## Pricing (reduces CROA + CCSA risk)

- [ ] The invite-only pilot is **genuinely free** — no payment, no data sale, no advertising, no unrelated model training of report data. (Re-analysis required before introducing any payment.)

## Authorization (Q-L3)

- [ ] A standalone, versioned **written authorization** the consumer expressly accepts before any processing, instructing the company to: receive the uploaded Report; parse/analyze for the consumer's educational use; temporarily store under the disclosed retention policy; return Findings only to that consumer; delete per the schedule; and refrain from sale/share/ad-use/training.
- [ ] The acceptance record (text version, consumer identity, timestamp) is retained.

## Minimization, retention, deletion, privacy (Q-L4)

- [ ] SSNs, access credentials, and unnecessary identifiers are **redacted/removed before analysis** (parser pre-processing stage).
- [ ] Reports encrypted in transit and at rest; no advertising pixels or session-replay on report pages.
- [ ] Originals retained only as long as operationally necessary; a visible consumer **deletion control** exists.
- [ ] Every processor bound to confidentiality, security, deletion, and incident-notification duties.
- [ ] CCPA-grade controls (notice at collection, disclosed retention, access/correction/deletion) built in regardless of current threshold status.

## Security (GLBA Safeguards — ADR-0004, until cleared)

- [ ] Written information-security program with a designated responsible individual.
- [ ] Documented risk assessment; MFA; least-privilege access controls.
- [ ] Vendor due diligence + contractual security/deletion/incident terms.
- [ ] Incident-response plan; secure deletion/retention controls.

## Unauthorized-practice-of-law boundary (Q-L5)

- [ ] No rule applies a statute to the consumer's individual facts to produce a legal conclusion. Any such rule is **suppressed or reframed** as "verify with the reporting source / consult qualified counsel."
- [ ] Output never asserts a bureau/furnisher violated the FCRA, that the consumer has a legal claim, that a debt is legally invalid/unenforceable, or that the consumer is entitled to deletion/damages.

## Human-gated (not completable by an agent)

- [ ] Final written legal clearance of pricing, marketing copy, sample Findings, authorization, privacy notice, terms, retention schedule, and vendor/data-flow diagram by retained California/FCRA counsel **before any paid launch**.
- [ ] Formal GLBA classification determined.
- [ ] California Credit Services Act (CCSA) registration/bonding/contract obligations reviewed for the paid model.
