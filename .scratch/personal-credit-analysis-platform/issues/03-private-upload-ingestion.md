# 03 — Private upload and safe ingestion lifecycle

**What to build:** A consumer can upload a native PDF or static HTML report through private storage, receive stage-level processing status, and get safe retry, failure, or quarantine outcomes. Content validation, malware scanning, active-content stripping, resource limits, immutable source metadata, signed-access expiry, and idempotent upload completion work through the user flow.

**Blocked by:** 02 — Secure account, consent, and jurisdiction gate.

**Status:** ready-for-agent

- [ ] An eligible consumer can initialize and complete an upload for a supported native PDF or static HTML report.
- [ ] Uploads use private storage and short-lived signed access; persistent public document URLs are not exposed.
- [ ] File signature, MIME type, extension, parser eligibility, size, page/complexity limits, and processing limits are validated.
- [ ] Malware scanning and static HTML active-content stripping occur before parsing; unsafe documents are quarantined.
- [ ] The ingestion record includes an immutable source hash, size, media type, upload actor, scan result, and retention class.
- [ ] Processing status exposes safe stage-level progress and distinguishes retryable failure, final failure, and quarantine.
- [ ] Repeating upload completion or retryable processing does not create duplicate documents or jobs.
- [ ] Password-protected or unsupported documents receive a clear user-facing failure without leaking secrets or internal stack traces.
