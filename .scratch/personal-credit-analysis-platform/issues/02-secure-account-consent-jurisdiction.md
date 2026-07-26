# 02 — Secure account, consent, and jurisdiction gate

**What to build:** An adult U.S. consumer can create an account, authenticate, confirm report ownership or lawful authorization, acknowledge the educational product boundary and sensitive-data handling, confirm residence and analysis jurisdiction, revoke sessions, and create an empty report-analysis workspace. Tenant isolation and consent version/timestamp recording are verifiable end to end.

**Blocked by:** 01 — Application foundation and deployable workspace.

**Status:** resolved

- [x] A consumer can register, sign in, sign out, and access only their own workspace.
- [x] The product records adult U.S. scope, report ownership or lawful authorization, educational limitations, sensitive-data handling acknowledgement, residence, and analysis jurisdiction with consent version and timestamp.
- [x] The platform does not issue an upload capability until required consent and jurisdiction information is complete.
- [x] The consumer can revoke active sessions or devices, and revoked sessions fail closed.
- [x] Cross-tenant access attempts fail closed through application and database/storage authorization checks.
- [x] The consumer can see the empty report-analysis workspace after passing the gate.

## Verification

Covered by `tests/platform.test.ts` and the full `npm run verify:pilot` gate.
