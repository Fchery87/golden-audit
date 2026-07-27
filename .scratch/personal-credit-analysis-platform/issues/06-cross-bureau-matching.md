# 06 — Cross-bureau account matching and confirmation

**What to build:** The consumer can review probable account matches across bureau representations, see confidence and contributing signals, confirm or reject matches, and split or merge groups when appropriate. Comparisons preserve bureau-specific data and account for report/update dates and date precision.

**Blocked by:** 04 — Versioned parsing, provenance, and consumer review.

**Status:** prototype-implemented

- [x] The system proposes probable account match groups using masked account signals, creditor identity, account type, dates, balances, and other approved signals.
- [x] Each proposed match exposes confidence and the signals contributing to the proposal.
- [x] Ambiguous matches remain separate and are not automatically merged above the configured risk threshold.
- [x] The consumer can confirm or reject a proposed match and can split or merge a group through an auditable correction flow.
- [x] Bureau-specific values remain visible within a match group and are not destructively merged.
- [x] Cross-bureau comparisons account for report dates, bureau update dates, date precision, and unit/format differences.
- [x] Rejected, split, or merged match decisions preserve history and trigger a deterministic reanalysis-ready state.
- [x] Expert-labeled match fixtures cover high-confidence matches, ambiguous pairs, non-matches, date mismatches, and duplicate-looking creditor/collection patterns.


## Verification

Covered by the ticket-specific tests and the complete `npm run verify:pilot` gate. Human launch approvals remain explicitly gated in `docs/pilot-readiness.md`.

Prototype-implemented only (in-memory, no real DB/ingestion/UI). Not production-resolved.
