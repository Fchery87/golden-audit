# 08 — Explicit source-value review before analysis

Type: task
Status: resolved

## Decision

2026-08-01: Owner selected **review every publishable canonical value and every enabled-rule input**. This is the required completion policy; it deliberately favors consumer control and provenance over lower-friction shortcuts.

Restore a consumer-controlled source-value review stage before matching and deterministic analysis. The deployed Pages flow must not auto-complete review after parsing.

## Required policy decision

Select the required review population and the semantics of corrections/unknown values:

1. **Recommended: review every publishable canonical value and every enabled-rule input.** Strongest consumer control and provenance, but adds pilot friction.
2. Review only enabled-rule inputs. Lower friction, but consumer-visible values outside current rule inputs may be unreviewed.
3. Review exceptional/low-confidence values only. Lowest friction, but insufficient for the source PRD’s explicit review guarantee unless separately approved.

## Scope after decision

- Persist resumable value-review status and decisions.
- Require explicit completion before match review or analysis.
- Expose only owner-scoped, masked, source-linked review APIs.
- Add consumer UI, error states, resume behavior, and Node/Pages parity tests.
- Preserve the independent explicit match-confirmation gate.

## Acceptance criteria

- Analysis rejects before all policy-required value decisions are complete.
- Corrections/unknown decisions affect only the reviewed canonical version and maintain audit/provenance history.
- No session can access another consumer’s review data.
- The UI can resume a review and then separately confirm account matches.

## Answer

2026-08-01: Owner selected the recommended policy: every publishable canonical value and every enabled-rule input requires an explicit consumer decision.

Implemented resumable, owner-scoped source-value review before matching or analysis:

- Parsing now stops at `value-review-required`; neither Node nor Pages automatically completes review.
- Consumers can retrieve masked/source-linked values, submit confirmed/corrected/unknown/not-shown decisions with reasons, and explicitly complete review only when all required values are decided.
- Corrections and unavailable decisions are applied only to a reviewed projection for matching, analysis, report snapshots, and exports; original values, sources, and review audit history remain persisted.
- Match confirmation remains a separate explicit gate.
- Added browser UI with progress, source locators, correction validation, resume behavior, and completion controls.

Validation: platform and Node route integration tests cover the full review → match → analysis flow; typecheck, web build, full tests, and diff check passed.
