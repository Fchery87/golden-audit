# 15 — Account-match measurement harness (de-risk finding validity)

**What to build:** Measure the current cross-bureau account-matching heuristic that feeds analysis. Produce (1) a synthetic labeled corpus giving the heuristic's **true precision/recall/determinism** within its current signal envelope, and (2) a **real-sample structural profile** across the 4 IdentityIQ PDFs showing match counts, tradeline coverage, group sizes, and confidence distribution. This closes the ticket-11 gap where account-match precision was described, not measured.

**Blocked by:** 04 — Versioned parsing, provenance, and consumer review; 06 — Cross-bureau account matching and confirmation.

**Status:** done

> Originated from the same `/grill-with-docs` thread as ticket 14. Once finding quality was measured, the next remaining validity question was the **matching layer**: findings are only as good as the account-groups they compare. The current heuristic in `platform.proposeMatches()` groups tradelines by `creditor.toLowerCase() + maskedAccount`, with confidence `0.95` when balances agree and `0.72` otherwise. It is deterministic and intentionally conservative, but its actual behavior needed measurement.

## Acceptance criteria

- [x] **Synthetic labeled corpus** (committed CI test): measures the heuristic's **precision**, **recall**, and **determinism** on an exact-signal corpus where ground truth is known by construction. No PII.
- [x] **Known-limitation test**: explicitly captures a realistic recall miss the current heuristic cannot solve (e.g. creditor alias variation with the same masked account), so the measurement is honest about what it proves.
- [x] **Real-sample structural characterization** (skip-if-absent smoke): across each real IdentityIQ PDF, report **proposed match count**, **matched-tradeline coverage**, **2-bureau vs 3-bureau vs oversized-collision group sizes**, and **0.95 vs 0.72 confidence distribution**. Structure-only; never print raw identifiers or balances.
- [x] Ticket 11 is updated so account-match measurement is no longer described-only.
- [x] Measurement **result recorded** in this ticket (what the results imply about the heuristic and whether improvement is needed before the pilot).

## Measurement result (recorded)

**Synthetic exact-signal corpus:** precision = 1.0, recall = 1.0, determinism = identical. Within the heuristic's current signal envelope — exact creditor string + same last-4 account digits — the matcher behaves exactly as designed.

**Known limitation tests:**
- **Recall miss:** `Example Bank` vs `Example Bank NA` with the same real account is **not** matched (no creditor-alias normalization).
- **Precision risk:** two different full accounts at the same creditor that share the same last-4 digits **do** match, because canonical tradelines retain only the masked account.

**Real-sample structural profile (4 IdentityIQ PDFs, structure-only):**

| Sample | tradelines | matches | coverage | groups (2b / 3b / >3) | confidence (0.95 / 0.72) | oversized @ 0.95 |
|---|---:|---:|---:|---:|---:|---:|
| IdentityIQ | 205 | 22 | 205/205 | 2 / 11 / 9 | 8 / 14 | 2 |
| (copy) | 141 | 18 | 141/141 | 1 / 10 / 7 | 6 / 12 | 0 |
| (another copy) | 164 | 20 | 164/164 | 1 / 11 / 8 | 3 / 17 | 0 |
| C_Pique | 252 | 46 | 252/252 | 18 / 16 / 12 | 4 / 42 | 0 |

**Implication:** this measurement materially changes the risk picture. The current heuristic is trustworthy only in a **narrow exact-signal envelope**. On real PDFs it produces **oversized collision groups** (>3 tradelines) and covers **100% of tradelines** with some group, which is a red flag that same-creditor/same-last4 collisions are common. Most oversized groups are low-confidence (`0.72`) and therefore require consumer confirmation before analysis, which helps. However, there are also **oversized `0.95` groups** in at least one sample, meaning some collision groups would look "high-confidence" under the current rule.

**Practical conclusion:** the next highest-value code slice is **matching hardening**, not more parser richness. Examples: never auto-`0.95` any group with more than 3 tradelines; never surface oversized groups as ordinary proposals; add additional disambiguation signals; or require explicit consumer-assisted merge selection for collision sets. Also, ticket 14's real-sample finding-materiality profile must be interpreted as **conditional on the current matching heuristic**, not as validated real-world finding PPV.

## Notes
- **Historical note:** this ticket captured the pre-hardening behavior that motivated ticket 16. After ticket 16, the live profiler now shows `oversized@0.95 = 0` because oversized groups are forced to `split`.
- True precision/recall requires ground truth; the real PDFs have none. Therefore the synthetic corpus provides **true** heuristic precision/recall, while the real-sample pass provides **structural** evidence only (coverage, confidence, grouping shape).
- This harness measures the **current heuristic**, not the abstract concept of matching. A future matching algorithm (creditor alias normalization, date/term/status signals, consumer-assisted merge UX) would need to be re-measured.
- Findings remain consumer-confirmed: low-confidence groups (`0.72`) are surfaced as `split` and require user confirmation before analysis. That makes match quality especially important for UX and trust, even when false matches do not automatically reach analysis.
