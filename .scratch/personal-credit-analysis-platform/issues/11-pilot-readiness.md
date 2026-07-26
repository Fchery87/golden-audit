# 11 — Pilot readiness: security, operations, accessibility, and quality gates

**What to build:** The invite-only pilot is operationally verifiable: tenant-isolation and IDOR tests, malicious-document and prompt-injection evaluations, redacted telemetry, privileged-access audit, incident runbooks, rollback/reproducibility, deletion drills, accessibility review, parser/rule/AI evaluation corpus, latency and quality reporting, vendor gate evidence, and launch approval checks are complete.

**Blocked by:** 02 — Secure account, consent, and jurisdiction gate; 03 — Private upload and safe ingestion lifecycle; 04 — Versioned parsing, provenance, and consumer review; 05 — Governed rules and educational-content publication; 06 — Cross-bureau account matching and confirmation; 07 — Deterministic evidence-linked analysis; 08 — Interactive report and user-controlled action workspace; 09 — Masked export and end-to-end deletion; 10 — Controlled AI narration and deterministic fallback.

**Status:** ready-for-agent

- [ ] RLS, storage authorization, IDOR, authentication/session, rate-limit, and privileged-access tests pass for supported pilot flows.
- [ ] Malicious PDF/HTML, decompression/resource-limit, document-controlled egress, prompt-injection, and sensitive-data redaction evaluations pass.
- [ ] Redacted structured telemetry contains no raw report text, full identifiers, or unnecessary identity dimensions.
- [ ] Audit events cover access, exports, deletion, rule publication, support/break-glass access, security actions, and rollback-relevant changes.
- [ ] Runbooks exist and are exercised for parser regressions, malware quarantine, model/provider outage, unsafe output, cross-tenant alert, deletion failure, legal disablement, credential exposure, and rollback.
- [ ] A representative synthetic/authorized evaluation corpus measures parser field precision/recall, account-match precision, finding positive predictive value, citation validity, AI safety, accessibility, and comprehension.
- [ ] Quality and latency results are reported by supported provider, document type, and relevant user segment rather than only as aggregate averages.
- [ ] Core flows meet the accessibility target, including keyboard, focus, screen reader, contrast, zoom/reflow, and export checks.
- [ ] Vendor security, data residency, encryption, key management, subprocessors, incident notification, deletion, and training-retention evidence is approved before real consumer reports are used.
- [ ] Retention and deletion drills demonstrate the approved lifecycle across active systems and document backup/provider limitations.
- [ ] The team can reproduce an analysis from its immutable inputs and recorded parser, ruleset, prompt, model, content, and application versions.
- [ ] Product, legal, privacy, security, operations, and pilot-scope approval gates are documented before inviting consumers.
