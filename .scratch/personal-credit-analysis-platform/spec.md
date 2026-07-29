# Personal Credit Analysis & Education Platform

Status: ready-for-agent

## Problem Statement

As a U.S. consumer, I can receive a long credit report containing bureau-specific account records, collections, inquiries, identity information, dates, balances, statuses, and remarks that are difficult to interpret and compare. Existing tools often flatten normal bureau differences into alleged errors, encourage generic or unsupported disputes, make legal claims that cannot be established from a consumer-facing report, or use AI that invents facts, citations, deadlines, and outcomes.

I need a secure, evidence-first way to understand what my report displays, identify inconsistencies or potential errors that warrant verification, distinguish uncertainty from evidence, learn constructive credit-building concepts, and track proportionate next steps. I must remain in control of corrections, evidence gathering, communications, and deletion. The product must protect highly sensitive report data and make each analysis reproducible, qualified, and auditable.

The initial product is a direct-to-consumer educational and diagnostic experience for adults in the United States. It accepts user-authorized native-text PDF or static HTML reports, with scanned-PDF OCR deferred unless separately prioritized. It does not replace legal, credit-counseling, identity-theft, tax, bankruptcy, or other professional advice. **Nationwide availability is a product goal, not a current legal/compliance assumption; launch scope must remain bounded to independently reviewed states until broader coverage is validated.**

## Solution

Build a secure personal credit analysis and education platform that:

- Confirms the user's eligibility, report ownership or lawful authorization, residence, jurisdiction, and understanding of the educational product boundary before accepting a report.
- Accepts supported PDF and static HTML reports through private storage, content validation, malware scanning, active-content stripping, size/complexity limits, and short-lived access controls.
- Detects report provider and template, routes the document to a versioned parser adapter, and extracts page- and element-level provenance with calibrated confidence.
- Normalizes bureau-specific report representations into a provider-independent canonical schema without destructively merging bureau records or inventing missing values.
- Lets the user review, recognize, correct, or leave uncertain extracted information while preserving original extraction, correction history, confidence, and source evidence.
- Matches probable representations of the same account across bureaus while keeping ambiguous matches separate until confirmed by the user or reviewer.
- Runs immutable, deterministic, versioned rules against approved normalized data and confirmed user facts to produce evidence-linked findings, educational opportunities, or explicit insufficiency outcomes.
- Uses neutral classifications such as observed fact, inconsistency, potential error, verification recommended, potential compliance concern, insufficient information, and educational opportunity rather than unsupported legal verdicts.
- Explains findings using approved educational and legal-reference content, structured generation, output validation, citation validation, prohibited-language checks, sensitive-data redaction, and deterministic fallback rendering.
- Presents a report containing scope and limitations, an overview, prioritized findings, side-by-side account comparisons, identity and inquiry review, credit education, verification checklists, sources, methodology, export controls, retention status, and deletion controls.
- Provides a user-controlled action workspace for recognition, dismissal, correction, notes, document gathering, and progress tracking without automatically sending disputes or other communications.
- Gives administrators and qualified reviewers versioned workflows for authorities, educational modules, rules, jurisdictions, effective dates, approvals, emergency disablement, regression fixtures, and audit history.
- Enforces tenant isolation, private-by-default storage, least privilege, redacted telemetry, audit events, retention classes, end-to-end deletion, and provider portability.

The first release should prioritize a supported, invite-only pilot with one counsel-approved launch state, native PDF/HTML support, limited supported report providers/templates, deterministic analysis, approved federal education, and no autonomous disputes, score guarantees, or conclusive Metro 2 conclusions.

## User Stories

### Consumer onboarding, authorization, and account

1. As an adult U.S. consumer, I want to create a secure account, so that my credit report data is associated only with me.
2. As a consumer, I want to sign in using a strong passwordless or strong-password method, so that access to my sensitive data is protected.
3. As a consumer, I want to enable multi-factor authentication when available, so that account takeover is harder.
4. As a consumer, I want to revoke active sessions and devices, so that I can respond quickly if I lose access to a device.
5. As a consumer, I want to confirm that I am an adult located in the United States, so that the product can enforce its launch scope.
6. As a consumer, I want to confirm that an uploaded report belongs to me or that I have lawful authorization to use it, so that the platform does not process unauthorized documents.
7. As a consumer, I want to confirm my state of residence and analysis jurisdiction explicitly, so that the platform does not rely on inferred location for regulated content.
8. As a consumer, I want to understand before uploading that the product is educational and does not provide legal verdicts, score guarantees, or guaranteed deletions, so that I can make an informed decision.
9. As a consumer, I want to understand how my report data will be stored, used, retained, and deleted, so that I can consent knowingly.
10. As a consumer, I want to use a display name or alias in the application where possible, so that unnecessary identity information is not exposed throughout the product.
11. As a consumer, I want to delete my account and associated data, so that I retain control over my information.
12. As a consumer, I want deletion to show its progress and completion status, so that I know which originals and derived artifacts have been removed.

### Upload and secure ingestion

13. As a consumer, I want to upload a supported native-text PDF report, so that I can begin an analysis from a document I already have.
14. As a consumer, I want to upload a supported static HTML report, so that I am not restricted to one report format.
15. As a consumer, I want unsupported file types to be rejected clearly, so that I know what kind of report is required.
16. As a consumer, I want content-based file validation rather than extension-only validation, so that malformed or disguised files are handled safely.
17. As a consumer, I want my uploaded file stored privately, so that it cannot be accessed through a persistent public URL.
18. As a consumer, I want upload capability to expire, so that an intercepted upload authorization cannot be reused indefinitely.
19. As a consumer, I want the platform to scan uploaded files for malware before parsing, so that malicious documents cannot reach processing components.
20. As a consumer, I want active HTML content and external resources stripped or blocked, so that scripts and document-controlled network requests cannot execute.
21. As a consumer, I want oversized, deeply nested, compressed, or otherwise pathological documents rejected safely, so that processing remains reliable and secure.
22. As a consumer, I want password-protected or encrypted PDFs to produce a clear, safe explanation when unsupported, so that I know why processing cannot continue.
23. As a consumer, I want processing failures to avoid exposing internal stack traces or security details, so that errors are understandable without creating new risk.
24. As a consumer, I want to see stage-level processing progress, so that I know whether the report is uploading, scanning, extracting, normalizing, awaiting review, or analyzing.
25. As a consumer, I want a retryable failure to be distinguishable from a final failure or quarantine, so that I know whether I can try again.
26. As a consumer, I want the original document to receive an immutable hash and ingestion record, so that the source used for analysis can be reproduced.

### Parsing, provenance, and review

27. As a consumer, I want the platform to identify the report provider and layout template, so that the appropriate versioned parser is used.
28. As a consumer, I want unsupported layouts flagged rather than guessed, so that missing parser support does not become fabricated data.
29. As a consumer, I want extracted values associated with the source page or HTML element where possible, so that I can verify what the report displays.
30. As a consumer, I want extracted values to retain their original displayed text, so that normalization does not hide what the source actually said.
31. As a consumer, I want parser confidence shown for uncertain values, so that I can focus my review on fields that need confirmation.
32. As a consumer, I want report metadata, identity data, addresses, employers, tradelines, collections, inquiries, public records, scores, and remarks normalized consistently, so that the report is easier to understand.
33. As a consumer, I want each bureau's representation stored separately, so that one bureau's value cannot silently overwrite another bureau's value.
34. As a consumer, I want unknown, absent, not applicable, redacted, and parser-failed values distinguished, so that missing information is not mistaken for a zero, false, or confirmed absence.
35. As a consumer, I want dates to preserve their source precision, so that a month-only date is not presented as an invented day-level date.
36. As a consumer, I want displayed date labels preserved alongside their normalized meaning, so that the platform does not assume that similarly named dates have identical legal or reporting semantics.
37. As a consumer, I want money represented accurately while retaining the original display, so that balances and calculations are understandable and auditable.
38. As a consumer, I want account and SSN identifiers masked in the interface, so that I can recognize records without exposing unnecessary full identifiers.
39. As a consumer, I want to review my extracted identity information, so that I can recognize or correct information associated with my report.
40. As a consumer, I want to review tradelines, collections, inquiries, public records, and remarks with source references, so that I can validate the normalized report.
41. As a consumer, I want to correct an extracted value without erasing the original parser output, so that my correction remains transparent and auditable.
42. As a consumer, I want to provide a reason for a correction or confirmation, so that later analysis can distinguish parser output from my assertion.
43. As a consumer, I want to say “I do not know” or “not shown,” so that I am not forced to make an unsupported factual claim.
44. As a consumer, I want the platform to ask only questions that can change the analysis, so that review is focused and not burdensome.
45. As a consumer, I want to see a source snippet or page associated with a field, so that I can validate the extraction without exposing unrelated report content.
46. As a consumer, I want to reprocess a report with a newer parser while preserving prior normalized versions, so that improvements are traceable rather than destructive.

### Cross-bureau matching and comparison

47. As a consumer, I want likely representations of the same account grouped across bureaus, so that I can compare them side by side.
48. As a consumer, I want each account match to show confidence and contributing signals, so that I understand why records were grouped.
49. As a consumer, I want ambiguous accounts kept separate until confirmation, so that the platform does not merge unrelated debts.
50. As a consumer, I want to confirm, split, or correct an account match, so that the analysis reflects my best-supported understanding.
51. As a consumer, I want cross-bureau comparisons to account for report dates and bureau update dates, so that normal timing differences are not presented as errors.
52. As a consumer, I want differences in balances, statuses, limits, open dates, responsibilities, and histories shown with their exact bureau and date context, so that I can judge whether a comparison is meaningful.
53. As a consumer, I want the platform to explain when records are not comparable, so that lack of a finding is not mistaken for proof that data is correct.
54. As a consumer, I want duplicate-looking tradelines explained carefully, so that an original creditor and a collection account are not automatically treated as duplicate debt.

### Deterministic analysis and findings

55. As a consumer, I want analysis to run only after I review required extracted data, so that findings are based on information I had an opportunity to correct.
56. As a consumer, I want analysis to use a recorded ruleset version, so that I can understand which rules produced my result.
57. As a consumer, I want the same normalized input and ruleset to produce reproducible deterministic findings, so that results do not change unpredictably.
58. As a consumer, I want findings to be based on displayed evidence, confirmed information, or approved content, so that the system does not invent facts.
59. As a consumer, I want a finding classified as an observed fact, inconsistency, potential error, verification recommendation, potential compliance concern, insufficient information, or educational opportunity, so that the wording reflects the strength of the evidence.
60. As a consumer, I want each finding to include its severity and confidence separately, so that urgency is not confused with certainty.
61. As a consumer, I want each finding to show the exact values, bureau, dates, and source references that support it, so that I can verify the observation.
62. As a consumer, I want each finding to explain why it may matter, so that I understand its practical significance.
63. As a consumer, I want plausible alternative explanations shown, so that normal bureau timing, transfers, mapping differences, or other explanations are considered.
64. As a consumer, I want the platform to suppress findings when required fields are missing, ambiguous, low-confidence, or not comparable, so that weak evidence does not create unnecessary alarm.
65. As a consumer, I want duplicate findings grouped by shared evidence and action, so that one apparent issue is not counted repeatedly.
66. As a consumer, I want the platform to distinguish information that is accurate but educationally important from information that may warrant verification, so that credit education is not framed as a dispute opportunity.
67. As a consumer, I want unfamiliar information to prompt recognition and verification guidance rather than an automatic identity-theft conclusion, so that serious risks are handled without false attribution.
68. As a consumer, I want inquiry findings to acknowledge that a report alone may not establish permissible purpose, so that I am not given an unsupported legal conclusion.
69. As a consumer, I want Metro 2-related observations limited to displayed patterns that warrant verification, so that the platform does not claim a field-level furnishing violation from incomplete consumer-report data.
70. As a consumer, I want the analysis to explain when the report alone lacks enough information, so that uncertainty is visible rather than converted into a finding.
71. As a qualified reviewer, I want all rules evaluated, skipped, suppressed, and triggered recorded, so that an analysis can be audited and reproduced.
72. As a qualified reviewer, I want high-risk or low-confidence cases optionally routed for expert review, so that the product can apply stronger safeguards where needed.
73. As a qualified reviewer, I want reviewer changes attributed and preserved alongside automated output, so that human review does not erase the original result.

### Education, report, and action workspace

74. As a consumer, I want an overview of my report's accounts, collections, inquiries, utilization where valid, and displayed score information, so that I can understand the overall contents without receiving a score prediction.
75. As a consumer, I want priority findings ordered by consumer impact, certainty, and actionability rather than fear, so that the report helps me decide what to do first.
76. As a consumer, I want account-level bureau comparisons presented side by side, so that I can inspect meaningful differences.
77. As a consumer, I want identity and inquiry review separated from credit-building education, so that urgent recognition questions do not get lost among general advice.
78. As a consumer, I want plain-language explanations of credit concepts such as payment history, utilization, account age, account mix, inquiries, collections, and accurate negative information, so that I can make informed decisions.
79. As a consumer, I want technical terms preserved where necessary and explained in plain language, so that simplification does not change the meaning.
80. As a consumer, I want accurate negative information to receive constructive education rather than deletion promises, so that I am not encouraged to dispute information I know is accurate.
81. As a consumer, I want a prioritized verification checklist, so that I know which documents, organizations, facts, or questions may help resolve an item.
82. As a consumer, I want each checklist action to identify its purpose, responsible party, required evidence, and status, so that I can track progress.
83. As a consumer, I want to mark an item recognized, dismissed, corrected, or under review, so that the report reflects my decisions.
84. As a consumer, I want to add notes and track documents I still need to gather, so that the product supports an organized review process.
85. As a consumer, I want identity-theft and security resources displayed when my confirmed facts support that path, so that I can find appropriate official help.
86. As a consumer, I want high-risk situations to include referral guidance to qualified attorneys or nonprofit counselors without implying endorsement or guaranteed outcomes, so that I know when the product's boundaries have been reached.
87. As a consumer, I want to export a sanitized report, so that I can keep or share an understandable record without exposing full account identifiers or SSNs.
88. As a consumer, I want an export to include its generation date, report scope, ruleset version, sources, limitations, and educational disclaimer, so that the document remains interpretable outside the application.
89. As a consumer, I want user notes excluded from exports by default, so that private working notes are not shared accidentally.
90. As a consumer, I want exports generated from validated structured content, so that a screenshot or stale rendering cannot misrepresent the current analysis.

### Controlled language generation and knowledge

91. As a consumer, I want explanations adapted to my confirmed report context, so that education is relevant without changing the deterministic finding.
92. As a consumer, I want approved legal and educational content used for explanations, so that citations and guidance are governed rather than improvised.
93. As a consumer, I want every authority reference to be applicable, approved, effective, and traceable, so that outdated or irrelevant legal content is not shown.
94. As a consumer, I want generated language to match structured evidence for every numeric, date, account, and status statement, so that narration cannot contradict the report.
95. As a consumer, I want prohibited claims, guarantees, fabricated citations, and unsupported legal verdicts blocked before publication, so that generated content remains within the product boundary.
96. As a consumer, I want complete identifiers and unnecessary report data excluded from model-provider payloads, so that explanation generation does not create avoidable privacy exposure.
97. As a consumer, I want a deterministic report when the language model is unavailable or fails validation, so that the product remains useful and safe during provider outages.
98. As a consumer, I want explanations to include limitations and alternative explanations for regulated or ambiguous findings, so that the report calibrates my confidence.
99. As a product owner, I want each approved model to have a model card and evaluation record, so that changes can be governed and rolled back.
100. As a product owner, I want model changes evaluated for factuality, citation validity, prohibited language, prompt injection, sensitive-data leakage, and readability, so that a new model cannot silently reduce safety.

### Administration, governance, and operations

101. As a compliance reviewer, I want to create proposed authority records, so that legal and educational sources enter a controlled workflow.
102. As a compliance reviewer, I want authorities to include jurisdiction, effective dates, approval status, permitted use, and citation metadata, so that content applicability is explicit.
103. As a compliance reviewer, I want to create and revise educational modules, so that consumer explanations can be updated without changing deterministic rule outcomes.
104. As a rules author, I want to define rules with required fields, confidence thresholds, limitations, authority links, educational modules, and test cases, so that each rule has a complete contract.
105. As an engineering reviewer, I want proposed rules validated against synthetic and expert-labeled fixtures, so that schema and behavioral regressions are caught before approval.
106. As a qualified reviewer, I want to approve, reject, or request revisions with an immutable identity, timestamp, and reason, so that governance decisions are auditable.
107. As a release manager, I want to publish an immutable ruleset version, so that existing analyses remain reproducible after future changes.
108. As a qualified reviewer, I want to disable unsafe or outdated content immediately, so that new analyses cannot use it while history remains intact.
109. As a product owner, I want prior analyses to remain reproducible and reanalysis to create a new immutable run, so that changes never silently rewrite consumer history.
110. As an administrator, I want role-based access separating consumers, masked support, compliance reviewers, security administrators, break-glass reviewers, and workers, so that access follows purpose and least privilege.
111. As a support analyst, I want masked job status and redacted parser errors, so that I can help without routinely viewing raw report data.
112. As a security administrator, I want access events, exports, deletion actions, rule publication, support access, and security actions logged immutably, so that misuse can be detected and investigated.
113. As a break-glass reviewer, I want time-bound access to one case with documented approval, so that exceptional support is possible without persistent broad access.
114. As an operations analyst, I want metrics for upload, processing, parser confidence, corrections, matching, findings, validation failures, exports, deletion, and suspicious access, so that service quality and safety can be monitored.
115. As an operations analyst, I want operational metrics redacted of report text and full identifiers, so that observability does not become a secondary data leak.
116. As an operator, I want runbooks for parser regressions, malware quarantine, provider outages, unsafe model output, cross-tenant alerts, deletion failures, legal disablement, and credential exposure, so that incidents can be handled consistently.
117. As a release manager, I want to roll back parser, ruleset, prompt, model, application, and migration versions, so that a bad release can be contained.
118. As a product owner, I want privacy-safe analytics separated from report content, so that product learning does not require collecting sensitive attributes unnecessarily.
119. As a quality owner, I want evaluation results reported by provider, document type, and relevant user groups rather than only as aggregate averages, so that hidden quality failures are not masked.

### Security, privacy, and portability

120. As a consumer, I want my report data encrypted in transit and at rest, so that interception and storage compromise are harder.
121. As a consumer, I want tenant isolation enforced by database and storage policies, so that another user cannot access my documents or analyses.
122. As a consumer, I want full identifiers masked as soon as the minimum matching operation is complete, so that logs, analytics, UI, and AI payloads do not retain unnecessary sensitive values.
123. As a consumer, I want a deletion request to cover originals, page images, OCR artifacts, normalized data, analyses, exports, search indexes, caches, provider artifacts, and applicable backups, so that deletion is meaningful across the data lifecycle.
124. As a security administrator, I want secrets held in a central secrets manager and absent from source, client bundles, document metadata, logs, and support tools, so that credentials are protected.
125. As a security administrator, I want document parsing sandboxed with resource limits and outbound access controls, so that malicious files cannot abuse processing infrastructure.
126. As a security administrator, I want prompt-injection content in uploaded documents treated strictly as untrusted data, so that it cannot change system instructions, invoke tools, or alter analysis behavior.
127. As a security administrator, I want vendor security, data residency, encryption, key management, subprocessors, deletion, incident notification, and training-retention terms reviewed before real consumer reports are used, so that provider risk is understood.
128. As an engineer, I want storage, OCR, model, notification, and worker integrations behind stable provider interfaces, so that a vendor change does not require rewriting core business logic.
129. As an engineer, I want portable SQL migrations and rules outside platform-only triggers, so that core behavior remains testable and portable.
130. As an operator, I want outbox and idempotency controls around database updates and job enqueueing, so that retries cannot create duplicate findings, charges, or exports.
131. As an operator, I want intermediate normalized versions retained according to policy, so that a model or export failure does not require reparsing the original document unnecessarily.

## Implementation Decisions

- The product is a direct-to-consumer, U.S.-only, educational analysis platform for adult users and authorized report owners. The initial pilot is invite-only and limited to one counsel-approved launch state and a bounded set of supported report providers/templates. **A nationwide rollout remains a future objective and must not be assumed cleared merely because the product is analysis-only or consumer-upload-only.**
- The MVP supports native-text PDF and static HTML. Scanned-PDF OCR is deferred to a later phase unless pilot evidence makes it essential. OCR, storage, language-model, notification, and processing providers must be accessed through provider-neutral interfaces.
- The system uses a staged, durable processing workflow rather than parsing in the browser, in a synchronous upload response, or in a short-lived edge request. The processing lifecycle includes creation, verified upload, malware scan, extraction, normalization, user review, analysis readiness, deterministic analysis, explanation generation, output validation, and completion, with explicit retryable failure, final failure, quarantine, and deletion-pending outcomes.
- Uploads use private storage, short-lived signed access, content-based validation, malware scanning, active-content stripping, decompression and complexity limits, immutable source hashes, and ingestion metadata. Document text, HTML, metadata, and OCR output are untrusted data and cannot provide instructions to the processing or language-generation system.
- The canonical credit report schema is provider-independent and preserves bureau-specific representations as separate entities. It covers report metadata, pages, consumer identity fragments, addresses, employers, tradelines, payment history, collections, inquiries, public records, scores, remarks, account match groups, analyses, findings, evidence, authorities, educational modules, audit events, and deletion requests.
- Normalized values retain provenance, source location, extraction method, parser version, confidence, original display text, correction history, and distinct unknown/absent/not-applicable/redacted/parser-failed states. Dates retain precision and semantic labels; money uses integer minor units plus currency and original display text; no displayed date is silently mapped to a different semantic event.
- Full SSNs and account numbers are never exposed in routine UI, logs, analytics, exports, or model payloads. Identifiers are masked after the minimum required matching operation. Default exports retain at most the last four account digits and exclude SSNs, authentication data, internal rule logic, and administrative notes.
- User corrections and confirmations are append-only changes layered over parser output. The platform permits “I do not know” and “not shown” responses and asks only questions whose answers can materially affect matching or analysis.
- Cross-bureau matching is probabilistic and non-destructive. Match groups expose confidence and signals. Ambiguous groups remain separate until user or reviewer confirmation; split/merge decisions create a new auditable version and trigger deterministic reanalysis.
- Findings come only from pure, deterministic, versioned TypeScript rules operating on normalized data and confirmed user facts. The rules engine records evaluated, skipped, suppressed, and triggered outcomes. Rules require declared fields and minimum confidence, suppress weak or non-comparable cases, deduplicate shared evidence, and attach evidence, severity, confidence, limitations, alternative explanations, verification documents, authority references, and educational modules.
- The approved finding taxonomy is observation-oriented: observed fact, inconsistency, potential error, verification recommended, potential compliance concern, insufficient information, and educational opportunity. The system must not automatically state that a party violated law, breached Metro 2, had improper permissible purpose, caused damages, or will produce a score outcome.
- Initial P0 rule families cover identity recognition, internal date sequences, balance/status consistency, cross-bureau comparisons, duplicate-debt patterns, dispute notation comparisons, approved obsolescence checks, inquiry recognition, public-record inconsistencies, and educational opportunities. Each rule family must account for alternative explanations and the limits of a consumer-facing report.
- The platform may explain applicable federal or counsel-approved state concepts only through approved, versioned, effective-dated authority and educational records. Retrieval narrows explanatory context but never determines whether a rule triggers. Unapproved, expired, or inapplicable content cannot reach production users.
- Language-model generation is constrained to explaining validated structured findings, selecting approved educational modules, organizing user-controlled action checklists, and later drafting user-editable correspondence when explicitly scoped. It cannot decide legal outcomes, invent authorities, infer missing identifiers or ownership, follow document instructions, send communications, or create recurring disputes.
- Generated output must validate against a structured schema and evidence, authority, privacy, prohibited-language, and completeness checks. Failed generation is retried once with constrained correction and then replaced by deterministic templates. The report cannot be finalized when required evidence, limitations, alternative explanations, applicable citations, or safety controls are missing.
- The consumer report renders from validated structured content and contains scope/limitations, overview, priority findings, account comparisons, identity/inquiry review, education, verification checklist, sources/methodology, export controls, retention status, and deletion controls. Evidence navigation reveals only the relevant masked source page or snippet.
- The action workspace is user-controlled. It supports recognition, dismissal with a reason, correction, notes, document gathering, escalation, and completion status. It does not autonomously send, mail, email, or repeatedly generate disputes. Any later correspondence draft must be tied to a selected specific factual basis, remain editable, and require explicit user action.
- Administrative governance includes proposed and approved authorities, educational modules, rules, jurisdictions, effective dates, approval events, publication, emergency disablement, reanalysis, model cards, evaluation records, and vendor configuration history. Existing analyses remain immutable and reproducible; reanalysis always produces a new run with recorded versions.
- Access is separated by consumer, masked support, compliance reviewer, security administrator, break-glass reviewer, and service worker roles. Break-glass access is case-specific, time-bound, approved, logged, and non-persistent. Routine compliance review uses synthetic or de-identified fixtures rather than raw consumer reports.
- Data governance uses purpose-specific retention classes rather than indefinite storage. Planning defaults are 30 days for originals after completed analysis, earlier deletion for page/OCR artifacts, 90 days for normalized data and analyses, controlled backup expiry, and zero provider retention where supported. These are planning assumptions pending privacy, security, vendor, and legal approval.
- Deletion is orchestrated across object storage, database records, derived artifacts, search indexes, caches, provider artifacts, and backup lifecycle. Deletion requests expose status and completion evidence and create auditable events.
- The reference architecture uses a TypeScript monorepo with a web application, durable worker, administrative application, shared domain/schema/parser/normalization/matching/rules/knowledge/AI/security/testing packages, SQL migrations and policies, and synthetic/adversarial fixtures. The application platform provides authentication, PostgreSQL, row-level security, private storage, short edge functions, and durable compute, while production processing remains compatible with Node.js LTS.
- Business logic, schemas, rules, migrations, and provider adapters remain outside proprietary platform-only triggers. SQL migrations are version-controlled. An outbox/idempotency pattern protects job creation and retries, and every retryable stage must be idempotent.
- Observability uses redacted structured events and OpenTelemetry-compatible telemetry without raw report text, full identifiers, or unnecessary identity dimensions. Required operational measures include processing success and latency, parser confidence/corrections, match outcomes, rule outcomes, model validation failures, exports, deletions, support access, and suspicious activity.
- Launch requires written product, federal and launch-state legal, pricing, contract, marketing, vendor, security, privacy, parser-quality, rules-quality, AI-safety, operations, accessibility, deletion, and user-comprehension approvals. The product must be able to detect, triage, disable, roll back, and reproduce any analysis.

## Testing Decisions

- The primary test seam is one highest-level vertical slice: an authenticated consumer confirms eligibility and authorization, uploads a synthetic supported report, the system validates and scans it, parses and normalizes it, presents a review flow, accepts corrections/uncertainty, runs deterministic analysis, renders an evidence-linked report, generates a masked export, and completes deletion. External storage, malware scanning, OCR, model, notification, and platform services are stubbed behind their provider interfaces.
- The vertical slice tests observable behavior and safety boundaries rather than internal implementation details. It verifies tenant isolation, consent gating, status transitions, user confirmation, provenance visibility, report content, finding qualification, no prohibited claims, export masking, idempotent retries, and deletion status.
- Existing seams are preferred because the repository has no implementation yet. The first implementation should expose one application-level workflow boundary for the end-to-end test and keep lower-level integrations behind stable adapters. New seams should be added only when the vertical slice cannot isolate a meaningful external dependency or deterministic domain behavior.
- Pure deterministic normalization, redaction, date/money semantics, account matching, deduplication, schema validation, and rule evaluation still receive focused tests because their boundary cases are safety-critical and are cheaper to diagnose than failures observed only through the full slice.
- Parser behavior is tested with golden fixtures for supported provider/template combinations, including native PDF layout variants, static HTML variants, missing values, month-only dates, ambiguous labels, malformed input, low-confidence extraction, and unsupported layouts. Every P0 normalized field must have an expected value and provenance assertion.
- Rule behavior is tested with positive, negative, boundary, missing-field, low-confidence, date-precision, update-date comparability, alternative-explanation, suppression, and deduplication fixtures. Negative fixtures must prove that insufficient evidence produces no finding.
- Contract tests verify storage permissions, row-level security, signed URL expiry, upload completion idempotency, job payloads, OCR/model interfaces, authority retrieval applicability, deletion orchestration, and worker retry behavior.
- Security tests cover IDOR and cross-tenant access, authentication/session revocation, malicious PDFs and HTML, decompression/resource limits, document-controlled network access, prompt injection, sensitive-data redaction, secret leakage, rate limits, support/break-glass access, export controls, and deletion across derived systems.
- AI evaluation tests are separate from deterministic rule correctness. They assess grounding to structured evidence, authority validity, prohibited language, citation failure, sensitive-data leakage, prompt-injection resistance, readability, completeness, and deterministic fallback. Model output never becomes the source of truth for whether a rule triggered.
- Accessibility tests cover keyboard navigation, focus management, screen-reader semantics, contrast, zoom/reflow, error messages, source navigation, and accessible export. Core flows target WCAG 2.2 AA.
- Legal and content QA verifies jurisdiction, effective-date, approval, citation, limitation, and marketing-language controls. Tests should assert that unapproved or expired content cannot appear in a production analysis.
- Evaluation uses synthetic reports, legally obtained and consented redacted reports, malformed and adversarial documents, and expert-labeled matches/findings/suppressions/insufficient-information cases. No production consumer data is used in routine fixtures, issue tracking, screenshots, or local development.
- Release evidence must include parser precision/recall for P0 fields, high-confidence account-match precision, published-finding positive predictive value, citation validity, deletion completion, accessibility, audit-event completeness, processing latency, and stratified quality results by supported provider/document type. Aggregate averages cannot conceal a materially failing segment.

## Out of Scope

- Calculating, predicting, or simulating FICO, VantageScore, lending decisions, approval odds, or guaranteed score increases.
- Declaring that a bureau, furnisher, collector, creditor, or other party committed a legal violation.
- Determining liability, damages, litigation strategy, venue, claim value, or statute-of-limitations deadlines.
- Automatically mailing, emailing, submitting, or repeatedly generating disputes or other communications.
- Encouraging disputes over information the user knows is accurate or generating mass disputes.
- Performing a conclusive field-level Metro 2 audit from a consumer-facing report alone.
- Providing reports, evaluations, profiles, or creditworthiness recommendations to lenders, landlords, employers, insurers, or other eligibility decision-makers.
- Business-to-business, attorney, counselor, white-label, or professional-review product modes.
- Nationwide state-law coverage before each jurisdiction is independently reviewed and approved.
- Paid pricing, contracts, marketing claims, testimonials, cancellation flows, and service-model decisions before counsel reviews possible CROA and state credit-services implications.
- Scanned-PDF OCR in the initial MVP unless separately approved based on pilot demand.
- Full identity-theft adjudication from an unfamiliar account, address, or inquiry alone.
- Debt-collection, bankruptcy, tax, medical-debt, servicemember, disaster-relief, ECOA, FCBA, or other specialized legal analysis without the required facts and approved jurisdictional content.
- User evidence uploads and correspondence drafting unless explicitly added in a later phase with factual-basis and recipient controls.
- Access to or incorporation of protected Metro 2/CRRG material without eligibility, licensing, copyright, and product-use approval.
- Training models on consumer credit reports by default.
- Indefinite retention, public report URLs, raw report text in analytics, full identifiers in logs, or production consumer data in developer environments.

## Further Notes

- This spec synthesizes `Personal_Credit_Analysis_Platform_PRD_v0.1.docx`, including its product boundaries, functional requirements, canonical entities, processing lifecycle, security controls, quality targets, phased roadmap, risks, and open decisions.
- The source PRD explicitly states that product launch, pricing, marketing, contracts, state coverage, Metro 2 use, and the meaning of “CSDA” require qualified legal or subject-matter review. Those are gates, not assumptions that implementation can resolve independently.
- See also `docs/nationwide-legal-regulatory-posture-brief.md`, `docs/competitor-credit-positioning-brief.md`, `docs/product-boundary-positioning-update.md`, `docs/copy-boundary-guide.md`, `docs/50-state-review-tracker.md`, `docs/launch-scope-decision-memo.md`, `docs/launch-scope-checklist-index.md`, `docs/one-state-launch-selection-memo.md`, `docs/launch-scope-field-schema.md`, and `docs/onboarding-copy-approved-state-pilot.md` for the current analysis-only positioning and state-review posture.
- Before build commitment, the product owner must decide the working product name and claims, first launch state, pricing model, correspondence scope, managed platform versus self-hosting, OCR/model providers and retention terms, final retention periods, evaluation-corpus consent process, the meaning of “CSDA,” and whether Metro 2 is deferred entirely.
- The next planning artifacts should be a canonical database/schema specification, a P0 rules catalog with fixtures, consumer and admin wireframes, a threat model and vendor questionnaire, a launch-state compliance matrix, and an implementation backlog with estimates.
- The spec is published as the local issue-tracker spec at `.scratch/personal-credit-analysis-platform/spec.md` with `Status: ready-for-agent`.
