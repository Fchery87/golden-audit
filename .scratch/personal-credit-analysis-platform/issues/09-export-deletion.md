# 09 — Masked export and end-to-end deletion

**What to build:** A consumer can explicitly request a validated, masked export containing scope, generation date, ruleset version, sources, limitations, and educational disclaimers. The consumer can request deletion of originals and derived artifacts and observe completion status across storage, database, indexes, caches, provider artifacts, and backup lifecycle according to the approved retention policy.

**Blocked by:** 03 — Private upload and safe ingestion lifecycle; 08 — Interactive report and user-controlled action workspace.

**Status:** ready-for-agent

- [ ] An explicit consumer request generates an export from validated structured report content rather than a screenshot or stale UI rendering.
- [ ] The export includes generation date, report scope, ruleset version, source references, limitations, and educational disclaimer.
- [ ] The default export masks all but the last four account digits and excludes SSNs, authentication data, internal rule logic, administrative notes, and user notes unless explicitly selected.
- [ ] Export creation is authorized to the owning consumer, idempotent, and recorded as an audit event.
- [ ] The consumer can request deletion of the original report, normalized data, analyses, exports, and derived artifacts.
- [ ] Deletion orchestration covers object storage, database records, page/OCR artifacts, search indexes, caches, provider artifacts, and applicable backup lifecycle according to policy.
- [ ] The consumer sees deletion progress, failures, retry state, and completion evidence without exposing internal secrets.
- [ ] Deletion tests prove tenant scoping, no undeleted derived artifact in active systems, and safe handling of provider or backup delays.
