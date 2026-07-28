# 11 — Pilot readiness: security, operations, accessibility, and quality gates

**What to build:** The invite-only pilot is operationally verifiable: tenant-isolation and IDOR tests, malicious-document and prompt-injection evaluations, redacted telemetry, privileged-access audit, incident runbooks, rollback/reproducibility, deletion drills, accessibility review, parser/rule/AI evaluation corpus, latency and quality reporting, vendor gate evidence, and launch approval checks are complete.

**Blocked by:** 02 — Secure account, consent, and jurisdiction gate; 03 — Private upload and safe ingestion lifecycle; 04 — Versioned parsing, provenance, and consumer review; 05 — Governed rules and educational-content publication; 06 — Cross-bureau account matching and confirmation; 07 — Deterministic evidence-linked analysis; 08 — Interactive report and user-controlled action workspace; 09 — Masked export and end-to-end deletion; 10 — Controlled AI narration and deterministic fallback.

**Status:** ready-for-human

> **Honest re-assessment.** Earlier this ticket was marked `resolved`. That overclaimed: the criteria below are split into what is genuinely implemented in the in-memory prototype, what is only **documented** (runbook/aspiration, not exercised), and what is **human-gated** (requires real external parties an agent cannot supply). Per ADR-0001, real-consumer launch is paused until legal viability is de-risked.

## Genuinely implemented (prototype-level, tested)

- [x] Authentication/session revocation and tenant-isolation (IDOR-style) tests pass for the prototype flows. _(No real DB/RLS or rate-limit yet.)_
- [x] Malicious-content quarantine (script/EICAR), prompt-injection-content blocking, and sensitive-data redaction in audit events are tested.
- [x] Structured audit events exist and telemetry-redaction (no raw report text / no full identifiers in events) is tested. _(Support/break-glass/rollback events are not yet emitted.)_
- [x] Deletion logic removes active-system artifacts and records delayed provider/backup items; tested at prototype level. _(Not a real multi-system deletion drill.)_
- [x] Reproducibility: an analysis records immutable normalized-input/ruleset/jurisdiction/parser/application versions and is deterministic; tested.

## Documented only — not exercised on real systems (needs real execution before launch)

- [ ] Runbooks **exist** in `docs/pilot-readiness.md` but are **not exercised** (no drills recorded).
- [~] Evaluation corpus is **partially measured**: finding precision/recall = 1.0/1.0 (synthetic labeled corpus); real-sample finding magnitude/materiality distribution is measured **conditional on the current matching heuristic** (ticket 14); and the account-match heuristic now has synthetic exact-signal precision/recall plus real-sample coverage/confidence/collision profiling (ticket 15). Still described-only: parser field precision/recall, real-sample finding PPV (needs human-labeled match truth or a hardened matcher), citation validity, AI safety, accessibility, comprehension.
- [ ] Quality and latency reporting by provider/document-type/segment is **specified**, not produced.
- [ ] Accessibility (WCAG 2.2 AA) target is **documented**; there is **no UI** to evaluate.

## Human-gated — cannot be completed by an implementation agent

- [ ] Vendor security, data residency, encryption, key management, subprocessors, incident notification, deletion SLAs, and training/retention evidence approved by accountable owners before real consumer reports are used.
- [ ] Product, legal, privacy, security, operations, accessibility, and pilot-scope approval gates signed by accountable owners before inviting consumers.
- [ ] **Legal viability** (FCRA / CCRAA / CPRA, educational-vs-legal-advice boundary) — preliminary opinion received (ADR-0003): **conditionally cleared for a free invite-only pilot**; a paid launch still requires retained California/FCRA counsel final review of pricing, marketing, sample Findings, authorization, privacy notice, terms, retention, and data-flow (tracked in ticket 12). GLBA remains unresolved and is treated as applicable (ADR-0004).

## Note on the approval gate mechanism

The application exposes a fail-closed pilot gate for seven approval areas (product, legal, privacy, security, operations, accessibility, vendor), tested in `tests/pilot-readiness.test.ts`. The records in `docs/pilot-approval-records.json` are **test fixtures that exercise the gate** — they are **not** real approvals. The gate is implemented; the approvals are not.

## Progress note

Foundational gate artifacts are now drafted in support of the remaining human approvals:
- `docs/data-flow.md`
- `docs/glba-wisp-skeleton.md`
- `docs/privacy-notice-draft.md`
- `docs/privacy-review-packet.md`
- `docs/security-review-packet.md`
- `docs/risk-assessment-template.md`
- `docs/pilot-approval-review-packet.md`
- `docs/legal-review-packet.md`

These drafts support counsel / privacy / security review, but they do **not** satisfy the human-gated approval criteria by themselves.
