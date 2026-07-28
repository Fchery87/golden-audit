# 14 — Finding-quality measurement harness (de-risk pilot core value)

**What to build:** Measure whether the balance-difference findings the engine produces are **real signal** (precision/recall on a labeled corpus) and characterize the **real-sample output** (finding volume, magnitude distribution, timing heuristic) — *before* investing in hard parser work or new evaluators. Closes the ticket-11 "described, not measured" gap.

**Blocked by:** none (the engine and real-PDF pipeline already work end-to-end).

**Status:** in-progress

> Originated from a `/grill-with-docs` session that overturned an earlier "full-field parser reconstruction" recommendation. Verification showed: (a) the analysis already runs end-to-end on real PDFs (14 balance findings on one report); (b) the engine has exactly ONE evaluator consuming only `balance`; (c) parser full-field would add **zero** findings without new evaluators. So the right next step is to **measure** whether the current findings are real, not to build more parser/evaluator capacity blind.

## Discovery during verification (prerequisite fix, done)

- **`parseMoney` whole-dollar bug:** a balance with no decimal (`$1,200`) was normalized as `1200` (cents = `$12.00`) instead of `120000`. 165/205 real balances were affected. This corrupted magnitude comparisons (though it did not create within-group false positives, since each account-group uses a consistent display format). Fixed: whole-dollar figures now `×100`. Regression test added.

## Acceptance criteria

- [x] **Synthetic labeled corpus** (committed CI test): construct reports with KNOWN injected discrepancies; measure the engine's **precision** (no false positives), **recall** (fires on every findable difference), **suppression** (low-confidence/null → no finding + audited), and **determinism**. Ground truth by construction; no PII.
- [x] **Magnitude-agnostic proof:** the corpus documents that the engine fires on ANY nonzero difference (a $0.01 gap fires) — this is correct behavior, and it is precisely why real-sample magnitude characterization matters (the engine cannot distinguish a timing artifact from a material difference).
- [x] **Real-sample structural characterization** (skip-if-absent smoke): run the full chain on each of the 4 real PDFs; report per-finding balance-difference magnitude, binned (`<$10` ≈ timing … `>$1k` ≈ material), plus finding/match counts. **Structure-only** — bins/aggregates only, never raw values; skip-if-absent (reports gitignored).
- [x] **`parseMoney` regression test:** whole-dollar and decimal formats normalize to identical minor units.
- [x] Measurement **result recorded** in this ticket (what the magnitudes imply for precision/evaluator work).

## Measurement result (recorded)

**Engine correctness (synthetic labeled corpus):** precision = 1.0, recall = 1.0, determinism = identical. The engine fires on every real cross-bureau balance difference and nothing else; low-confidence/null balances are suppressed and audited. No false positives.

**Real-sample magnitude distribution (4 IdentityIQ PDFs, structure-only):**

| Sample | tradelines | matches | findings | <$10 (timing) | $10–100 | $100–1k | >$1k (material) |
|---|---|---|---|---|---|---|---|
| IdentityIQ | 205 | 22 | 14 | 4 | 3 | 0 | 7 |
| (copy) | 141 | 18 | 12 | 3 | 2 | 1 | 6 |
| (another copy) | 164 | 20 | 17 | 6 | 3 | 0 | 8 |
| C_Pique | 252 | 46 | 42 | 5 | 7 | 3 | 27 |
| **Total** | | | **85** | **18 (21%)** | **15 (18%)** | **4 (5%)** | **48 (56%)** |

**Implication:** the findings are **real signal, not noise** — 56% are >$1k (material discrepancies). The pilot's core value claim holds. The precision gap is **~21% of findings are <$10** (likely timing artifacts): the engine is magnitude-agnostic and fires on $0.01 differences, and the #1 alternative explanation ("different update dates") is unverifiable while `updated` is unknown. **Conclusion:** the balance-only analysis is trustworthy enough for the free pilot as-is; a future precision slice (down-rank/suppress sub-$10 findings, or reconstruct `updated` to make the timing caveat checkable) is a refinement, not a blocker.

## Notes
- True precision/recall requires ground truth; the real reports have none (no human labels). The synthetic corpus gives true engine precision/recall; the real characterization gives a noise/materialism signal via magnitude bins — together they answer "are the findings real?" without labeling PII.
- The pilot's core value ("where your 3 bureau reports disagree") is **already delivered** by balance-only analysis. This measurement decides whether that output is trustworthy enough for the pilot, or whether precision work (e.g. update-date-aware suppression) is needed first.
