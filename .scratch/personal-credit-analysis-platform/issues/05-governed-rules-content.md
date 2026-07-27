# 05 — Governed rules and educational-content publication

**What to build:** An authorized reviewer can create, validate, approve, publish, version, and emergency-disable deterministic rules, legal-authority metadata, and educational modules. Only approved and effective content can be selected for production analysis, and publication history is immutable. Synthetic fixtures provide a first governed rule and content release.

**Blocked by:** 01 — Application foundation and deployable workspace.

**Status:** prototype-implemented

- [x] Authorized reviewers can create draft rules, authority records, and educational modules with jurisdiction, effective dates, limitations, approval state, and permitted-use metadata.
- [x] A rule contract requires declared inputs, minimum confidence, classification, limitations, authority/module references, and test-case references.
- [x] Draft rules and content can be validated against synthetic fixtures before approval.
- [x] Approval, rejection, revision requests, publication, and emergency disablement record reviewer identity, timestamp, reason, and immutable history.
- [x] Only approved, effective, non-disabled rules and content are available to production analysis.
- [x] Publishing creates an immutable version; changing a draft does not mutate a published version.
- [x] A first synthetic ruleset and approved educational content set can be published and retrieved by jurisdiction and effective date.


## Verification

Covered by the ticket-specific tests and the complete `npm run verify:pilot` gate. Human launch approvals remain explicitly gated in `docs/pilot-readiness.md`.

Prototype-implemented only (in-memory, no real DB/ingestion/UI). Not production-resolved.
