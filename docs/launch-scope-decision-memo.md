# Launch-scope decision memo

> **Status:** Product/governance decision memo derived from the current legal-boundary research, competitor-positioning research, and state-by-state tracker. This is not legal advice.

## Decision to make

What launch-scope posture should this product adopt **before** any broader build-out or public availability claims?

This memo compares three options:
1. **Free pilot in one reviewed state only**
2. **Free pilot in a very small reviewed-state subset**
3. **Pause launch claims until actual counsel review**

## Current facts this decision must respect

- The product boundary is safest when it stays **analysis-only**, **educational**, **consumer-uploaded**, and **consumer-only**.
- The repo does **not** support claiming that the product is clearly acceptable nationwide.
- Several states surfaced explicit or adjacent regimes that make broad assumptions risky.
- Many states still have no clean first-pass answer, which is not the same as clearance.
- Paid launch remains materially higher risk than a genuinely free pilot.

## Option 1 — Free pilot in one reviewed state only

### What it means
- Pick exactly one state for the initial pilot.
- Limit invitations, onboarding, and availability to consumers in that state.
- Keep the product free, analysis-only, educational, and consumer-only.
- Delay any multi-state expansion claims until later review.

### Pros
- Smallest legal/compliance surface.
- Easiest posture to explain honestly.
- Best match for the current repo language and caution level.
- Reduces the chance that unresolved state-law questions become immediate blockers.
- Gives the cleanest feedback loop for product/ops/privacy/security before broader rollout.

### Cons
- Slowest commercial expansion.
- Requires choosing one state despite incomplete final legal review.
- Some potential users will be excluded early.

### Best fit when
- You want the safest executable path.
- You are still a solo founder without retained counsel.
- You want to avoid building a broad availability posture you may later need to unwind.

## Option 2 — Free pilot in a very small reviewed-state subset

### What it means
- Pick a narrow set of states where current posture appears comparatively safer or commercially important.
- Keep the same free, analysis-only, consumer-only boundary.
- Be explicit that unsupported states are not yet available.

### Pros
- Slightly broader learning than a one-state pilot.
- Can test demand across more than one jurisdiction.
- May be commercially attractive if one-state selection feels too narrow.

### Cons
- More legal/compliance complexity immediately.
- Harder to explain and operate cleanly than a one-state pilot.
- Increases the odds of implicit overclaiming if the product/copy suggests general U.S. availability.
- Not strongly supported by the current level of state-law certainty.

### Best fit when
- You have a clear, disciplined operational gate by state.
- You are prepared to maintain state-by-state eligibility logic.
- You accept extra complexity in exchange for somewhat broader pilot reach.

## Option 3 — Pause launch claims until actual counsel review

### What it means
- Do not make live launch-scope claims yet.
- Continue product shaping, copy hardening, and internal readiness work only.
- Defer any real pilot until counsel confirms a narrower path.

### Pros
- Most legally conservative option.
- Avoids any risk of overclaiming availability before counsel review.
- Lets you keep tightening copy/product/process without taking launch-position risk.

### Cons
- Slowest path to real user feedback.
- Can stall founder momentum.
- May delay learning that could be obtained from a narrow, free, tightly bounded pilot.

### Best fit when
- You are unwilling to launch without formal legal advice.
- You want zero ambiguity about current availability posture.
- You are prioritizing downside minimization over speed.

## Comparison summary

| Option | Risk posture | Speed | Operational simplicity | Match to current repo evidence |
|---|---|---:|---:|---:|
| One reviewed state only | Lowest launch risk of the three | Medium | Highest | Strongest |
| Small reviewed-state subset | Moderate | Medium-high | Lower | Weaker |
| Pause launch claims | Lowest absolute claim risk | Lowest | High | Also strong |

## Strongest recommendation

### Recommend now: **Option 1 — Free pilot in one reviewed state only**

This is the strongest recommendation because it best fits all current evidence:
- it respects the repo's existing one-state pilot language,
- it avoids pretending nationwide or multi-state readiness,
- it preserves the safest product boundary,
- it still allows real user learning,
- and it is the best compromise between paralysis and overreach.

## Secondary recommendation

If you are not comfortable launching even a one-state pilot without formal counsel, then the backup recommendation is:

### **Option 3 — Pause launch claims until actual counsel review**

## Weakest option right now

### **Option 2 — Small reviewed-state subset**

This is not impossible, but it is the weakest current choice because the repo's state-law certainty is still too thin to justify expanding scope just because the product is analysis-only.

## Recommended next repo changes from this decision

If Option 1 is accepted:
1. Add a named launch-scope placeholder field such as `launchState` / `approvedStates` to the pilot-approval docs.
2. Update onboarding and future UI copy to say the pilot is available only in approved states.
3. Keep README/spec language aligned with one-state launch until broader coverage is reviewed.
4. Do not add payment or broad U.S. availability copy.
5. Use `docs/checklist-one-state-free-pilot.md` as the execution checklist.
6. Use `docs/one-state-launch-selection-memo.md`, `docs/launch-scope-field-schema.md`, and `docs/onboarding-copy-approved-state-pilot.md` as the supporting implementation/governance set.

If Option 3 is accepted instead:
1. Keep the current state tracker and copy guide.
2. Add a repo-level note that launch remains paused pending counsel.
3. Focus future work on product shaping and safety rather than availability claims.
4. Use `docs/checklist-pause-launch-claims.md` as the execution checklist.

## Plain-English recommendation

If you want the safest realistic path forward **without pretending we have nationwide clearance**, launch only as a **free pilot in one reviewed state**.

See also `docs/launch-scope-checklist-index.md` for the execution checklists for all three rollout postures.
