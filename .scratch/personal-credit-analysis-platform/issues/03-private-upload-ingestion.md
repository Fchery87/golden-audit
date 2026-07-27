# 03 — Private upload and safe ingestion lifecycle

**What to build:** A consumer can upload a native PDF or static HTML report through private storage, receive stage-level processing status, and get safe retry, failure, or quarantine outcomes. Content validation, malware scanning, active-content stripping, resource limits, immutable source metadata, signed-access expiry, and idempotent upload completion work through the user flow.

**Blocked by:** 02 — Secure account, consent, and jurisdiction gate.

**Status:** prototype-implemented

- [x] An eligible consumer can initialize and complete an upload for a supported native PDF or static HTML report.
- [x] Uploads use private storage and short-lived signed access; persistent public document URLs are not exposed.
- [x] File signature, MIME type, extension, parser eligibility, size, page/complexity limits, and processing limits are validated.
- [x] Malware scanning and static HTML active-content stripping occur before parsing; unsafe documents are quarantined.
- [x] The ingestion record includes an immutable source hash, size, media type, upload actor, scan result, and retention class.
- [x] Processing status exposes safe stage-level progress and distinguishes retryable failure, final failure, and quarantine.
- [x] Repeating upload completion or retryable processing does not create duplicate documents or jobs.
- [x] Password-protected or unsupported documents receive a clear user-facing failure without leaking secrets or internal stack traces.


## Verification

Covered by the ticket-specific tests and the complete `npm run verify:pilot` gate. Human launch approvals remain explicitly gated in `docs/pilot-readiness.md`.

Prototype-implemented only (in-memory, no real DB/ingestion/UI). Not production-resolved.
