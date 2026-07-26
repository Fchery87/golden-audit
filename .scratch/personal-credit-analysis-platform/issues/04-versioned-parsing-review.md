# 04 — Versioned parsing, provenance, and consumer review

**What to build:** A supported report is parsed into a canonical, bureau-preserving representation. The consumer can inspect masked identity data, tradelines, collections, inquiries, dates, balances, statuses, and source references; review confidence; correct values; and answer “I do not know” or “not shown.” Original extraction, provenance, precision, confidence, and correction history remain auditable.

**Blocked by:** 03 — Private upload and safe ingestion lifecycle.

**Status:** resolved

- [x] A supported provider/template is routed to a versioned parser adapter, while unsupported layouts are flagged rather than guessed.
- [x] Parsed report metadata, identity fragments, addresses, employers, tradelines, collections, inquiries, public records, scores, and remarks validate against a canonical schema.
- [x] Bureau-specific representations remain separate and no normalized value silently overwrites another bureau's value.
- [x] P0 normalized values retain source page/element references, original display text, extraction method, parser version, and calibrated confidence.
- [x] Dates preserve semantic labels and precision; money preserves normalized minor units, currency, unknown/blank state, and original display text.
- [x] The consumer can review masked extracted data and navigate to relevant source snippets without exposing unrelated report content.
- [x] The consumer can confirm, correct, or mark a value as “I do not know” or “not shown.”
- [x] Corrections preserve the original extraction, correction reason, actor, timestamp, and resulting normalized version.
- [x] Parser golden fixtures cover supported layouts, low-confidence fields, ambiguous labels, missing values, and unsupported documents.


## Verification

Covered by the ticket-specific tests and the complete `npm run verify:pilot` gate. Human launch approvals remain explicitly gated in `docs/pilot-readiness.md`.
