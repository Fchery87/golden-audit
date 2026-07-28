# 16 — Matching hardening and consumer-assisted subgrouping

**What to build:** Prevent oversized same-creditor/same-last4 collision sets from being auto-promoted as high-confidence matches, and let the consumer confirm a **subgroup** of a split collision set for analysis. This keeps the matching layer conservative until richer parser signals exist.

**Blocked by:** 06 — Cross-bureau account matching and confirmation; 13 — Parser spike (because richer signals remain pending).

**Status:** done

## Acceptance criteria

- [x] Proposed match groups with **more than 3 tradelines** are never auto-promoted as high-confidence proposals.
- [x] Oversized collision sets are surfaced as **split** and require explicit consumer confirmation before analysis.
- [x] The consumer can confirm a **subgroup** of tradelines from a split collision set, producing a confirmed group that analysis will consume.
- [x] Existing confirmed-match analysis remains deterministic and unchanged for valid 2- or 3-tradeline groups.
- [x] Matching-hardening behavior is covered by synthetic tests, and the real-sample profiler shows no oversized `0.95` proposals.

## Result

Implemented the smallest conservative hardening model the current parser supports:

- `proposeMatches()` now treats **>3 tradeline groups as collision sets**: confidence is forced to `0.72`, state to `split`, and signal `collision-set` is added.
- `decideMatch(..., 'confirmed', ...)` now **rejects oversized groups** outright.
- New `confirmMatchSubgroup()` lets the consumer create a **confirmed subgroup** from a split collision set without destroying the parent set or inventing richer parser signals.
- `runAnalysis()` required no change: it already consumes only `confirmed` groups, so subgroup confirmation composes cleanly with the existing deterministic engine.

**Verification:**
- New synthetic test proves an oversized collision set cannot be blindly confirmed and that a consumer-confirmed subgroup does feed deterministic analysis.
- Existing 2-tradeline confirmation flow still passes unchanged.
- Real-sample match profiler now shows **oversized@0.95 = 0 on all 4 PDFs**.
- Updated real-sample finding harness now confirms only `<=3` groups and reports withheld collision sets instead of blindly confirming everything.

**Why this is the right slice:** full parser-field reconstruction is still too weak for smart auto-disambiguation. Conservative, consumer-assisted subgrouping removes the verified high-confidence collision risk **without pretending the parser knows more than it does**.
