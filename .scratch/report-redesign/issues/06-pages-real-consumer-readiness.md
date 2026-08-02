# 06 — Pages real-consumer readiness guard

Type: task
Status: resolved

## Goal

Fail closed in the Cloudflare Pages consumer API unless the runtime has an explicitly valid real-consumer readiness configuration. Fixture-only configuration must never authorize registration, uploads, parsing, analysis, exports, or other consumer mutations.

## Scope

- Replace the Pages-only unconditional fixture launch/approval bootstrap with a validated configuration loader.
- Keep diagnostics/readiness endpoints available while blocking state-changing consumer paths when the runtime is unready.
- Ensure onboarding/availability messaging reads the same resolved configuration as mutation authorization.
- Add Pages-compatible tests for fixture, absent/malformed, incomplete, and valid real-consumer configurations.

## Non-goals

- Do not create Cloudflare resources, store real approvals, deploy, or claim that local fixtures are real approvals.
- Do not weaken the existing platform-level `assertRealConsumerPilotReady()` checks.

## Acceptance criteria

- A missing, malformed, fixture-only, or incomplete approval configuration blocks every consumer mutation before data processing.
- A valid explicitly configured real-consumer runtime can exercise the existing synthetic consumer flow.
- Fixture mode is unambiguously diagnostic-only.
- Tests verify Pages/runtime behavior rather than Node-only parity.

## Answer

Implemented a Pages-safe, fail-closed runtime readiness contract.

- `PILOT_RUNTIME_MODE` defaults to `fixture`; fixture mode exposes only readiness diagnostics and rejects every catch-all consumer/admin route with `503` before D1/R2 construction or processing.
- `real-consumer` mode requires `PILOT_APPROVAL_RECORD_JSON`: a validated non-fixture launch scope plus accountable evidence for product, legal, privacy, security, operations, accessibility, and vendor approvals.
- The old repository-path configuration was removed because Pages Functions cannot read it at runtime.
- Onboarding and availability use the same resolved runtime configuration.

Validation: runtime configuration tests, typecheck, focused integration tests, web build, full tests, and diff check passed. A real target remains blocked until accountable operators supply a reviewed configuration and complete external release evidence.
