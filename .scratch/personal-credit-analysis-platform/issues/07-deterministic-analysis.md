# 07 — Deterministic evidence-linked analysis

**What to build:** A reviewed report can be analyzed with an immutable ruleset. The system produces reproducible findings, educational opportunities, or explicit insufficient-information outcomes using the approved taxonomy. Each publishable result includes evidence, severity, confidence, limitations, alternative explanations, verification documents, authority/module references, and a complete evaluated/skipped/suppressed/triggered audit.

**Blocked by:** 05 — Governed rules and educational-content publication; 06 — Cross-bureau account matching and confirmation.

**Status:** prototype-implemented

- [x] A consumer can start an analysis only after required report review and matching confirmation are complete.
- [x] Each analysis records immutable normalized-input, user-fact, ruleset, jurisdiction, parser, and application versions.
- [x] Pure deterministic rules produce reproducible outcomes from the same inputs and ruleset.
- [x] Findings use the approved observation-oriented taxonomy and do not emit unsupported legal-verdict labels.
- [x] Every publishable finding includes structured evidence, source references, severity, confidence, limitations, alternative explanations, verification documents, and approved authority/education references where applicable.
- [x] Missing, low-confidence, ambiguous, or non-comparable inputs produce a skip, suppression, or insufficient-information outcome rather than a weak finding.
- [x] Duplicate findings sharing evidence and consumer action are deterministically grouped.
- [x] The analysis audit records evaluated, skipped, suppressed, and triggered rules and their reasons.
- [x] Positive, negative, boundary, date-precision, update-date, missing-field, alternative-explanation, suppression, and deduplication fixtures pass.


## Verification

Covered by the ticket-specific tests and the complete `npm run verify:pilot` gate. Human launch approvals remain explicitly gated in `docs/pilot-readiness.md`.

Prototype-implemented only (in-memory, no real DB/ingestion/UI). Not production-resolved.
