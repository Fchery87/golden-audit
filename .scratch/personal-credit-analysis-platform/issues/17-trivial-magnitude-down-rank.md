# 17 — Trivial-magnitude down-ranking (de-clutter pilot output)

**What to build:** Let a rule declare an optional `minimumMagnitude` threshold (in cents). When a cross-bureau balance difference is below it, the finding still fires but is **down-ranked** to `low` severity and flagged as a likely reporting-date artifact — not suppressed.

**Blocked by:** 07 — Deterministic evidence-linked analysis; 14 — Finding-quality measurement (which surfaced the ~27% sub-$10 findings).

**Status:** done

> Originated from a `/grill-with-docs` session that resolved three decisions before any code change:
> 1. **Where:** rule-level parameter (mirrors `minimumConfidence`), not engine-builtin — keeps the ingest-agnostic core (ADR-0002) free of product policy.
> 2. **What:** down-rank, not suppress — CONTEXT.md reserves Suppression for missing/low-confidence/ambiguous/non-comparable evidence, and explicitly says to avoid "filtering." A small-but-real difference is none of those.
> 3. **Threshold:** optional field (default = no down-ranking); pilot rule sets 1000 cents ($10), matching the measurement bin.

## Acceptance criteria

- [x] `EvaluableRule` and the platform `Rule` type accept an optional `minimumMagnitude` (cents).
- [x] A sub-threshold finding **still fires** but with severity `low` and a "likely reporting-date artifact" limitation.
- [x] An above-threshold finding keeps severity `medium` (unchanged).
- [x] An absent `minimumMagnitude` leaves behavior fully unchanged (backward compatible).
- [x] Synthetic tests prove all three behaviors; the real-sample measurement reports down-ranked counts.

## Result (recorded)

**Synthetic:** a `$0.50` difference (below `$10` threshold) fires at `low` severity with the timing flag; a `$4900` difference fires at `medium` without it; no threshold = `medium` (backward compatible).

**Real-sample (4 IdentityIQ PDFs, under hardened matching + `$10` threshold):**

| Sample | findings | down-ranked (low) | normal (medium) |
|---|---:|---:|---:|
| IdentityIQ | 7 | 3 | 4 |
| (copy) | 5 | 2 | 3 |
| (another copy) | 9 | 5 | 4 |
| C_Pique | 30 | 4 | 26 |
| **Total** | **51** | **14 (27%)** | **37 (73%)** |

The 27% down-ranked exactly matches the `<$10` magnitude bin from ticket 14 — confirming the threshold captures the intended timing-noise population without hiding material differences.

## Notes
- This is a **governed, counsel-adjustable** rule parameter: the threshold ships with the published ruleset and can change without code edits.
- The engine remains magnitude-agnostic in principle: it respects a *declared* threshold rather than hardcoding one. The decision "what counts as trivial" lives in the rule, not the core.
- This does not change finding COUNTS (down-rank ≠ suppress), so the pilot's "where your bureaus disagree" value is preserved — the consumer just sees trivial differences de-emphasized rather than mixed with material ones.
