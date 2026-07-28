# 14 — Finding-quality measurement harness (de-risk pilot core value)

**What to build:** Measure whether the balance-difference findings the engine produces are **real signal** (precision/recall on a labeled corpus) and characterize the **real-sample output** (finding volume, magnitude distribution, timing heuristic) — *before* investing in hard parser work or new evaluators. Closes the ticket-11 "described, not measured" gap.

**Blocked by:** none (the engine and real-PDF pipeline already work end-to-end).

**Status:** done

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

**Real-sample magnitude distribution (4 IdentityIQ PDFs, structure-only, under the hardened matching model):**

| Sample | tradelines | matches | confirmed <=3 | withheld >3 | findings | <$10 (timing) | $10–100 | $100–1k | >$1k (material) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| IdentityIQ | 205 | 22 | 13 | 9 | 7 | 3 | 2 | 0 | 2 |
| (copy) | 141 | 18 | 11 | 7 | 5 | 2 | 1 | 0 | 2 |
| (another copy) | 164 | 20 | 12 | 8 | 9 | 5 | 1 | 0 | 3 |
| C_Pique | 252 | 46 | 34 | 12 | 30 | 4 | 4 | 1 | 21 |
| **Total** | 762 | 106 | **70** | **36** | **51** | **14 (27%)** | **8 (16%)** | **1 (2%)** | **28 (55%)** |

**Implication:** under the hardened matching model, the engine still is not dominated by trivial noise — **55%** of the observed finding magnitudes are >$1k — but the more important truth is that **36 collision sets were withheld** rather than blindly confirmed. That is healthier and more honest than the earlier profile. The remaining real-sample findings should still be interpreted as **conditional on confirmed <=3 match groups**, not full real-world PPV, but the measurement now aligns with the product's fail-closed posture instead of bypassing it. **Conclusion:** the engine remains trustworthy within valid match groups; matching hardening was the right next slice.

## Notes
- True precision/recall requires ground truth; the real reports have none (no human labels). The synthetic corpus gives true engine precision/recall; the real characterization gives a noise/materiality signal via magnitude bins. After tickets 15–16, interpret that real characterization as conditional on **consumer-confirmable <=3 tradeline groups**, not as validated finding PPV.
- The pilot's core value ("where your 3 bureau reports disagree") is already delivered by the engine once valid match groups exist. Ticket 16 moved the product closer to that truth by withholding collision sets instead of letting the measurement bypass them; the next open question is whether matching can be improved further without richer parser fields or labeled truth.
