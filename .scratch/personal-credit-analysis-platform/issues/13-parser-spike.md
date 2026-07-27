# 13 — Conditions-compliant parser spike (de-risk extraction from real document structure)

**What to build:** Retire the biggest remaining technical risk — can the pipeline extract structured data **with provenance and confidence from a real document** (not the fictional `GOLDEN-AUDIT-REPORT:` JSON marker), and **reject rather than guess** unknown layouts? — while honouring the legal conditions in ticket 12.

**Blocked by:** 12 — Pilot legal-conditions backlog (parser must be conditions-compliant); and **one external dependency**: a legitimate authorized report fixture for real bureau-format support (see "Sample data" below).

**Status:** in-progress (extraction + detection machinery); blocked (real bureau-format wiring)

> Per ADR-0003, development toward the free invite-only pilot is sanctioned. The free pilot requires real parsing. This spike does NOT touch real consumer data — it proves machinery against a clearly-labeled fictitious fixture and defers real-format support to when an authorized fixture exists.

## Sample data (the one external gate)

- Real bureau-format PDFs/HTML are **not public**. The only legitimate path to a real-format fixture is an **authorized consumer report** (e.g., your own from annualcreditreport.com) contributed as fixture #1 under written authorization (ticket 12).
- Until that exists, the spike proves machinery against a **fictitious structured-HTML fixture** modeled on the documented credit-report layout. This is honestly labeled "fictitious fixture," not a real report.

## Acceptance criteria

- [x] A **detector** identifies the document format and **flags unsupported layouts rather than guessing** (counsel / spec story 28). Unknown content → explicit "unsupported" outcome, never fabricated data.
- [x] An **adapter registry** dispatches a detected format to an adapter; a format with no adapter is flagged unsupported.
- [x] A **structured-HTML adapter** extracts tradelines (creditor, masked account, balance, status, dates) from markup with **element-level provenance, original display text, and calibrated confidence**, into a shape the deterministic core can consume.
- [x] **Redaction applies before extraction** (inbound trust boundary, `packages/redaction`) — an SSN injected into the fixture cannot reach the parsed output.
- [x] **End-to-end on fictitious structured markup**: fictitious-HTML fixture → parser → deterministic core (`packages/analysis-core`) → a real Finding, with no fictional JSON involved.
- [x] **Field-precision test**: a deliberately misread/invented value fails the test.
- [ ] **Real bureau-format support** (native-text PDF, ≥1 real provider/template) — blocked on an authorized fixture; flagged unsupported until then.
- [ ] **Wiring into `platform.parseReport`** to replace the fictional JSON marker as the primary path — gated on the real-format fixture (rewiring now would either break existing tests or keep the fictional path primary).

## Notes
- The existing `GOLDEN-AUDIT-REPORT:` JSON path is retained **only** as an explicitly-labeled "synthetic-fixture adapter" that existing tests use; it no longer masquerades as the real parser.
- Production HTML/PDF parsing should use a real DOM/PDF library; the spike's extractor is minimal and documented as spike-quality.
