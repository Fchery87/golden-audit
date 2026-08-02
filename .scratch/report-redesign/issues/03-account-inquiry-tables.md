# 03 — Account and inquiry analysis tables

Type: task
Status: resolved

After the profile foundation is verified, add source-linked account/finding and inquiry tables only for canonical fields that have parser coverage and provenance.

Blocked by: 01, 02

## Answer

Implemented the safe account-analysis portion only. Consumer reports and exports now snapshot source-linked canonical account rows; UI renders provenance references for account values and finding evidence. The parser now carries creditor provenance instead of inventing a locator. Inquiry presentation remains deferred because the supported IdentityIQ PDF path still emits no provenance-backed inquiries. Validation: `npm test` passed 97/97; `npm run typecheck` and `npm run build:web` passed.
