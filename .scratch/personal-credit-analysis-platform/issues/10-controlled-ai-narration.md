# 10 — Controlled AI narration and deterministic fallback

**What to build:** The report can optionally use approved retrieval and structured language generation to explain already-determined findings and adapt education to confirmed context. Evidence, citation, prohibited-language, completeness, privacy, and prompt-injection validation gates the result; invalid or unavailable generation falls back to deterministic templates. No generated text can change rule outcomes or send communications.

**Blocked by:** 05 — Governed rules and educational-content publication; 07 — Deterministic evidence-linked analysis; 08 — Interactive report and user-controlled action workspace.

**Status:** prototype-implemented

- [x] The language-generation boundary accepts only validated structured findings, confirmed user context, and approved educational/authority records.
- [x] Retrieval filters content by approval status, jurisdiction, effective dates, permitted use, and citation metadata.
- [x] Generated explanations validate numeric, date, account, status, evidence, authority, limitation, alternative-explanation, and length requirements.
- [x] Output validation blocks fabricated or missing authority references, unsupported legal verdicts, guarantees, prohibited claims, and unnecessary sensitive data.
- [x] Uploaded report text, HTML, metadata, and OCR content cannot alter system instructions or invoke tools through prompt injection.
- [x] Provider payloads exclude complete identifiers and unnecessary report data; redaction failures abort the request safely.
- [x] A failed or unavailable model retries once with constrained correction and then uses deterministic templates without changing the underlying rule result.
- [x] Model, prompt, retrieval, and application versions are recorded for reproducibility and model governance.
- [x] Evaluation fixtures cover grounding, citation validity, prohibited language, leakage, prompt injection, readability, completeness, and fallback behavior.


## Verification

Covered by the ticket-specific tests and the complete `npm run verify:pilot` gate. Human launch approvals remain explicitly gated in `docs/pilot-readiness.md`.

Prototype-implemented only (in-memory, no real DB/ingestion/UI). Not production-resolved.
