# Nationwide legal/regulatory posture brief: consumer-uploaded credit-report analysis only

> **Status:** Research brief assembled from repo materials and their cited primary sources. This is **not legal advice**. Where this brief states an inference, it is labeled as such. Where the repo itself preserves uncertainty or counsel conditions, that uncertainty is carried forward rather than resolved here.

## Scope reviewed

Product shape: a U.S. consumer-facing platform that **only** accepts a consumer's own uploaded credit report, analyzes it, and returns **educational** credit-analysis output to that same consumer. It does **not** handle disputes, contact bureaus/furnishers, promise deletions, or promise credit-score improvement.

## Bottom line

### Verified findings

1. **Analysis-only does not clearly and automatically escape federal credit-regulation risk.**  
   The repo's legal brief identifies the central FCRA issue as whether evaluating a consumer's credit data and returning derived output constitutes furnishing a consumer report to a third party. The brief treats that as an **open, fact-specific question**, not a settled safe harbor. `docs/legal-pre-mortem-brief.md` (citing 15 U.S.C. § 1681a(d), (f)).

2. **CROA risk is purpose/marketing/pricing sensitive, not obviously eliminated by the current feature list alone.**  
   The local legal brief says CROA turns on whether the service is offered "for the purpose of improving" the consumer's credit record/history/rating. It infers that a strictly educational/diagnostic product likely falls outside that purpose prong **if** it does not dispute, promise deletion, or promise score improvement. But ADR-0003 records preliminary counsel as only giving a **conditional yellow light** on CROA, driven by marketing, pricing, onboarding, and output. `docs/legal-pre-mortem-brief.md`; `docs/adr/0003-conditional-free-pilot.md`.

3. **State-law review still matters nationwide even if the product aims to stay outside CROA/CRA lines.**  
   Verified buckets preserved in repo materials: California CCRAA and CCPA/CPRA, California Credit Services Act review for any paid model, GLBA/Safeguards uncertainty, and unauthorized-practice-of-law boundaries. `docs/legal-pre-mortem-brief.md`; `docs/adr/0003-conditional-free-pilot.md`; `docs/adr/0004-glba-safeguards-as-applicable.md`; `.scratch/personal-credit-analysis-platform/issues/12-pilot-legal-conditions.md`.

4. **Paid vs. free changes risk materially in the current record.**  
   The accepted ADR authorizes only a **genuinely free invite-only pilot** and says any paid launch still requires retained California/FCRA counsel review of pricing, marketing, sample findings, authorization, privacy notice, terms, retention, and vendor/data flow. `.scratch/personal-credit-analysis-platform/issues/12-pilot-legal-conditions.md`; `docs/adr/0003-conditional-free-pilot.md`.

5. **Lower-risk launch boundary is narrow and operational, not just disclaimer-based.**  
   Verified guardrails include: consumer-upload only; delivery only to the authenticated consumer; no third-party sharing; no underwriting or eligibility features; no payment path; no dispute generation; no legal conclusions; redaction before analysis; retention/deletion controls; and GLBA-style safeguards until cleared. `.scratch/personal-credit-analysis-platform/issues/12-pilot-legal-conditions.md`; `packages/output-guard/src/index.ts`; `docs/adr/0004-glba-safeguards-as-applicable.md`.

## Question-by-question analysis

### 1) Does analysis-only clearly escape CROA / credit-repair classification?

**Verified:** No clear nationwide safe harbor is established in the repo.  
The strongest federal source position recorded locally is that CROA covers services offered "for the purpose of improving" a consumer's credit record/history/rating. The repo's legal brief infers that analysis-only, educational output likely sits outside that purpose prong if the product does not improve records, dispute items, or promise score gains. `docs/legal-pre-mortem-brief.md` (citing 15 U.S.C. § 1679a(3), § 1679b).

**Verified conflict / caution:** Later repo materials do **not** treat this as fully cleared. ADR-0003 records preliminary counsel's view as only a **conditional yellow light**, expressly driven by marketing, pricing, onboarding, and output. `docs/adr/0003-conditional-free-pilot.md`.

**Best supported inference:** A narrowly described analysis-only product may have a defensible argument that it is not a CRO under federal CROA, but that argument is fragile and can be undermined by product language, monetization, or adjacent features.

### 2) What state-law buckets likely still matter nationwide?

**Verified from repo materials:**

- **State CRA analogs / consumer credit reporting laws**, with California CCRAA as the clearest example in the repo. `docs/legal-pre-mortem-brief.md`; `docs/adr/0003-conditional-free-pilot.md`.
- **State privacy laws**, with California CCPA/CPRA specifically called out as threshold-dependent but important regardless. `docs/legal-pre-mortem-brief.md`; `docs/adr/0003-conditional-free-pilot.md`.
- **State credit-services / credit-repair laws** for paid models, with California Credit Services Act review explicitly still required before any paid model. `.scratch/personal-credit-analysis-platform/issues/12-pilot-legal-conditions.md`.
- **UPL / legal-advice boundaries**, because consumer-specific legal conclusions are separately risky even if the product is not a CRO or CRA. `.scratch/personal-credit-analysis-platform/issues/12-pilot-legal-conditions.md`; `packages/output-guard/src/index.ts`.
- **GLBA/Safeguards-style security obligations**, because the repo records unresolved risk that the business could be treated as a covered financial institution depending on activity. `docs/adr/0004-glba-safeguards-as-applicable.md`.

**Inference:** Nationwide, analogous state credit-services / debt-adjusting / consumer-reporting / privacy / UPL regimes likely need a 50-state scan before any paid launch, because the repo itself only documents California specifically plus a nationwide caution around paid models.

### 3) Does paid vs. free change risk?

**Verified:** Yes.  
ADR-0003 approves only a **free** invite-only pilot. Ticket 12 says no payment, no data sale, no advertising, and no unrelated model training of report data. The same ticket says a **paid** launch requires final counsel clearance and explicit review of California Credit Services Act obligations. `docs/adr/0003-conditional-free-pilot.md`; `.scratch/personal-credit-analysis-platform/issues/12-pilot-legal-conditions.md`.

**Inference:** Charging money strengthens arguments that the business is selling a service concerning credit improvement or credit assistance, and likely increases scrutiny under CROA and state credit-services laws.

### 4) What product or marketing language increases risk?

**Verified high-risk language** is codified in `packages/output-guard/src/index.ts` and includes:

- "credit repair"
- "fix your credit" / "fix credit"
- "clean your credit" / "clean up your report"
- "remove negative" / "remove items" / "delete negative" / "erase negative"
- "boost your score" / "improve your score"
- "get approved faster"
- "guarantee" / "guaranteed"

**Verified prohibited dispute language** includes:

- "dispute letter"
- "file a dispute"
- "send a dispute"
- "we will dispute" / "we can dispute"
- "contact the bureau"
- "contact the furnisher"

**Verified prohibited legal-conclusion language** includes:

- "violated the FCRA"
- "FCRA violation"
- "you have a legal claim"
- "legally invalid" / "legally unenforceable"
- "entitled to deletion" / "entitled to damages"
- "sue the bureau" / "file a lawsuit"

These repo-enforced boundaries directly support the conclusion that improvement promises, dispute assistance, and consumer-specific legal conclusions raise classification and UPL risk. `packages/output-guard/src/index.ts`.

### 5) What does a lower-risk launch boundary look like?

**Verified lower-risk boundary in accepted repo materials:**

- consumer uploads a report they already hold and are authorized to use;
- the product never self-fetches reports;
- output is delivered only to the authenticated consumer;
- no sharing with lenders, employers, landlords, insurers, brokers, attorneys, or credit-repair businesses;
- no underwriting integration, public links, or eligibility API;
- no comparative rankings, approval odds, or proprietary score outputs;
- genuinely free pilot: no payment, no data sale, no ad use, no unrelated training;
- express written authorization before processing;
- SSNs and unnecessary identifiers redacted before analysis;
- visible deletion control and short retention boundary;
- no disputes, no bureau/furnisher contact, no legal verdicts or legal-claim language;
- GLBA-style safeguards assumed until formally cleared.

Sources: `docs/adr/0003-conditional-free-pilot.md`; `.scratch/personal-credit-analysis-platform/issues/12-pilot-legal-conditions.md`; `packages/output-guard/src/index.ts`; `docs/adr/0004-glba-safeguards-as-applicable.md`.

## Verified vs. inference

### Verified

- There is **not** a repo-verified conclusion that analysis-only is categorically outside CROA or state credit-services laws nationwide.
- The repo's strongest accepted posture is a **conditional** one: free, consumer-only, no disputes, no outcome promises, no third-party delivery, and no paid launch without further counsel review.
- Paid launch materially increases unresolved legal review requirements.
- Risky language is concretely identified and blocked in code.
- California-specific review remains necessary at minimum.

### Inference

- A carefully bounded analysis-only product likely has a better argument against CROA classification than a product that promises improvement or handles disputes.
- A nationwide paid launch would likely require a dedicated 50-state review of credit-services / debt-adjusting / privacy / UPL / licensing regimes beyond what is already documented here.

## Primary sources already cited by repo materials

- 15 U.S.C. § 1681a (FCRA definitions)
- 15 U.S.C. § 1681b (permissible purposes)
- 15 U.S.C. §§ 1679, 1679a, 1679b (CROA)
- Cal. Civ. Code § 1785.1 et seq. (CCRAA)
- Cal. Civ. Code § 1798.100 et seq. (CCPA/CPRA)

## Important conflict to preserve

The repo's **legal pre-mortem** says CROA is "likely NO, if we hold the line," but the later **accepted ADR** based on preliminary counsel does **not** clear a paid or broad launch. It preserves only a conditional free-pilot path and keeps paid launch behind further legal review. That later, more specific record should be treated as the stronger current posture inside this repo.
