# Privacy notice draft (pilot)

> **Status:** Draft for privacy / counsel review, not legal advice. Prepared for the free invite-only California pilot described in ADR-0003. This draft must be reviewed and approved before any real consumer pilot launch.

## 1. Scope

This draft privacy notice applies to the invite-only pilot of the Personal Credit Analysis & Education Platform, a direct-to-consumer, educational product for adults who upload a credit report they are authorized to use.

This draft assumes:
- **consumer-uploaded reports only**,
- **consumer-only delivery** of outputs,
- **no sale / no advertising / no training on report data**, and
- a California / U.S.-only pilot.

For the California pilot, the notice should not imply broader availability.

## 2. Information we collect

We may collect the following categories of information:

### A. Account and access information
- email address
- password hash / authentication data
- session identifiers and security activity

### B. Consent / authorization information
- consent acknowledgements
- authorization acceptance version and timestamp
- pilot / jurisdiction eligibility confirmations

### C. Consumer-provided report data
- the credit report file the consumer uploads
- normalized report data extracted from that report
- provenance / source references for extracted values
- consumer corrections, notes, and match confirmations

### D. Analysis and product-use information
- findings and educational output generated from the uploaded report
- export artifacts the consumer requests
- consumer action-tracking information in the report workspace

### E. Security / operational information
- upload metadata (file type, size, hash, stage)
- audit events for security-relevant activity
- device / browser / request metadata needed for authentication, fraud prevention, and service delivery

## 3. Sources of information

We collect information:
- **directly from the consumer** (account creation, consent, authorization, report upload, corrections, notes), and
- **automatically from service operation** (session activity, security logs, upload metadata).

We do **not** fetch reports from credit bureaus on the consumer's behalf in the current pilot.

## 4. How we use information

We use information to:
- authenticate the consumer and maintain account/session security,
- verify consent, authorization, and pilot eligibility,
- receive and process the uploaded report,
- parse the report into a normalized format with provenance,
- generate educational findings and related output for the consumer,
- let the consumer review, correct, and confirm matching decisions,
- provide exports or optional narrated explanations to the consumer,
- detect abuse, malicious files, fraud, and unauthorized access,
- maintain logs, backups, and incident response capability,
- comply with legal obligations and enforce our terms.

## 5. What we do **not** do with report data

For the current pilot, we do **not**:
- sell report data,
- share report data for cross-context behavioral advertising,
- train machine-learning models on uploaded report data,
- deliver findings to lenders, landlords, employers, insurers, brokers, attorneys, credit-repair businesses, credit bureaus, or furnishers,
- automatically send disputes or other communications on the consumer's behalf.

## 6. Sensitive information handling

Uploaded consumer reports can contain highly sensitive information, including identifiers, financial account details, and credit history. We treat that information as restricted data and apply access, retention, deletion, and security controls designed for that level of sensitivity.

## 7. Retention

We retain information only as long as reasonably necessary to operate the pilot, deliver the requested analysis, maintain security and auditability, and satisfy legal obligations.

Current product disclosures state that:
- uploaded originals are retained only as long as operationally necessary, with a stated maximum,
- analysis artifacts can be deleted on consumer request,
- some delayed processor copies (such as backups or an optional narration/model provider) may age out on their own lifecycle and are tracked explicitly rather than ignored.

The final notice should include approved retention periods for each major category.

For the California pilot, retention language should stay aligned with the current data-flow and deletion model.

## 8. Sharing and processor categories

We do not share report data with third parties for their own independent use.

We may use service providers / processors that help us operate the pilot, such as:
- hosting / cloud infrastructure providers,
- storage / backup providers,
- monitoring / security vendors,
- Cloudflare Email Service, when enabled for account recovery and verification; it receives the consumer's email address and a one-hour, single-use link token solely to deliver the requested account message.
- an optional narration/model provider if that feature is enabled.

Any such processor should be bound by contractual duties covering confidentiality, security, deletion/return, incident notification, and approved subprocessors.

For the California pilot, list only processor categories that are actually used or expected to be used.

## 9. Consumer rights (draft framing)

Depending on applicable law, consumers may have rights such as:
- to know what categories of personal information are collected and why,
- to request access to information associated with them,
- to request deletion of certain information,
- to request correction of inaccurate account information,
- to opt out of sale or sharing if those activities occur.

For the current pilot design, the product is intended to avoid sale/sharing behavior entirely. Final rights language must be tailored by privacy counsel to the actual legal basis, state applicability, and operational process.

## 10. Security

We use administrative, technical, and physical safeguards designed to protect information appropriate to its sensitivity. The exact controls for the pilot should be documented in the WISP / risk assessment and reflected consistently here once approved.

## 11. Children's information

The pilot is intended for adults only. The current product gate requires the consumer to confirm they are an adult U.S. consumer.

For the California pilot, rights language should not imply broader availability.

## 12. Changes to this notice

If the pilot's practices materially change, we will update the notice and revise the effective date.

## 13. Contact

Privacy contact: `[EMAIL / ADDRESS / SUPPORT CHANNEL]`

## 14. Open items for counsel / privacy review

Before this notice can be finalized, confirm:
- legal basis / state applicability language,
- exact retention periods by category,
- final Cloudflare Email Service sender-domain, contractual, subprocessors, deletion/return, and incident-contact details before it is enabled for real consumers,
- rights request workflow and response times,
- whether any sensitive personal information section or notice-at-collection format is required,
- whether narration/model-provider disclosures are required for the free pilot even if the feature is optional.
