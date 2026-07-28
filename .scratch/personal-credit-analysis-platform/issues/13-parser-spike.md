# 13 — Conditions-compliant parser spike (de-risk extraction from real document structure)

**What to build:** Retire the biggest remaining technical risk — can the pipeline extract structured data **with provenance and confidence from a real document** (not the fictional `GOLDEN-AUDIT-REPORT:` JSON marker), and **reject rather than guess** unknown layouts? — while honouring the legal conditions in ticket 12.

**Blocked by:** 12 — Pilot legal-conditions backlog (parser must be conditions-compliant); and **one external dependency**: a legitimate authorized report fixture for real bureau-format support (see "Sample data" below).

**Status:** in-progress — machinery + redacted IdentityIQ field map done; real-format adapter next

> Per ADR-0003, development toward the free invite-only pilot is sanctioned. The free pilot requires real parsing. This spike does NOT touch real consumer data — it proves machinery against a clearly-labeled fictitious fixture and defers real-format support to when an authorized fixture exists.

## Provider scope (product decision)

**IdentityIQ is the lead provider** for user uploads; supported in **both PDF and HTML**. Other providers later. Field map: `docs/parsers/identityiq-field-map.md`.

## Sample data

- A real **IdentityIQ** report is available locally in **both** formats: `docs/reports/Credit Report - IdentityIQ.pdf` (native-text, 8 pp) and `docs/reports/M68887092_11-14-2025.html` (AngularJS snapshot). Real PII — gitignored, never committed, processed locally only under ticket-12 controls.
- ⚠️ **One sample → overfitting risk.** Adapter must be validated against **≥2 samples** before pilot trust.
- A fictitious IdentityIQ-layout fixture remains the committed test target; real files used only for local, structure-only smoke tests (never printing/committing values).

## Acceptance criteria

- [x] A **detector** identifies the document format and **flags unsupported layouts rather than guessing** (counsel / spec story 28). Unknown content → explicit "unsupported" outcome, never fabricated data.
- [x] An **adapter registry** dispatches a detected format to an adapter; a format with no adapter is flagged unsupported.
- [x] A **structured-HTML adapter** extracts tradelines (creditor, masked account, balance, status, dates) from markup with **element-level provenance, original display text, and calibrated confidence**, into a shape the deterministic core can consume.
- [x] **Redaction applies before extraction** (inbound trust boundary, `packages/redaction`) — an SSN injected into the fixture cannot reach the parsed output.
- [x] **End-to-end on fictitious structured markup**: fictitious-HTML fixture → parser → deterministic core (`packages/analysis-core`) → a real Finding, with no fictional JSON involved.
- [x] **Field-precision test**: a deliberately misread/invented value fails the test.
- [ ] **IdentityIQ PDF adapter** (coordinate-aware tri-bureau column extraction) — next slice; needs a coordinate-aware PDF text lib (regex over `pdftotext` fragments columns, confirmed empirically).
- [ ] **IdentityIQ HTML adapter** (rendered-table extraction, skipping `{{ }}` template remnants).
- [ ] **Detector signatures** for IdentityIQ-PDF and IdentityIQ-HTML; all other layouts flagged unsupported.
- [ ] **Wiring into `platform.parseReport`** after the real adapter passes on the synthetic IdentityIQ fixture + local smoke test.
- [ ] **≥2-sample validation** before pilot trust (overfitting gate).

## Notes
- The existing `GOLDEN-AUDIT-REPORT:` JSON path is retained **only** as an explicitly-labeled "synthetic-fixture adapter" that existing tests use; it no longer masquerades as the real parser.
- Production HTML/PDF parsing should use a real DOM/PDF library; the spike's extractor is minimal and documented as spike-quality.
