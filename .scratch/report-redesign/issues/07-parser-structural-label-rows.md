# 07 — Reject IdentityIQ structural label rows

Type: task
Status: resolved

## Goal

Prevent IdentityIQ structural label rows, including `Last Reported`, from being reconstructed as consumer-visible fallback tradelines.

## Scope

- Reproduce the reported false-tradeline behavior with a positional synthetic fixture.
- Narrow fallback-tradeline eligibility using structural evidence rather than broadly suppressing legitimate date fields.
- Preserve normal account-block `updated` extraction and valid fallback balance-row parsing.
- Document the fix and retain real-sample verification as a controlled, local-only follow-up when authorized samples are available.

## Acceptance criteria

- A `Last Reported` label row produces no fallback tradeline.
- Genuine account-block `Last Reported` values still populate source-linked `updated` values.
- A valid fallback balance row remains parsed.
- Parser tests and full suite pass without exposing report data.

## Answer

Added a positional regression covering a `Last Reported` label row with tri-bureau date values and a valid fallback money row. The label row no longer emits a fallback tradeline; valid fallback money rows still do. Account-block handling of `updated` remains covered by the existing account fixture.

Validation: parser regression, focused suites, typecheck, web build, full tests, and diff check passed. Controlled verification against authorized local PDF samples remains a release-evidence follow-up.
