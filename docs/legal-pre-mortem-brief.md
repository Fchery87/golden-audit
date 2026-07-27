# Legal pre-mortem brief: D2C credit-report analysis product (California pilot)

> **NOT LEGAL ADVICE.** This is an evidence-gathering *brief* assembled by a non-lawyer (an AI agent) to sharpen the questions we put to a qualified FCRA attorney. Per ADR-0001, the AI gathers evidence; **only a real attorney issues the opinion.** Nothing here is a legal verdict. Statute text is quoted from Cornell LII; verify against current law before relying on it.

**Product shape under review (narrow):** A direct-to-consumer, U.S.-adult, **educational/diagnostic** web product. The *consumer uploads a credit report they already hold and are authorized to use* (native-text PDF / static HTML). The product parses it, normalizes it bureau-preservingly, runs **deterministic, versioned rules**, and surfaces **evidence-linked findings** classified on an observation-oriented taxonomy (observed fact / inconsistency / potential error / verification-recommended / insufficient-information / educational-opportunity). It **does not** send disputes, does not promise deletion or score improvement, and does not claim legal violations. Initial scope: invite-only, California.

---

## 1. Are we a "consumer reporting agency" (CRA) under FCRA? — **biggest open question**

**Statute.** 15 U.S.C. § 1681a(f): a CRA is "any person which, for monetary fees, dues, or on a cooperative nonprofit basis, regularly engages … in the practice of **assembling or evaluating** consumer credit information … **for the purpose of furnishing consumer reports to third parties**." A "consumer report" (§ 1681a(d)) similarly turns on communication bearing on creditworthiness **to a third party**.

**Analysis (non-authoritative).** The definition has two load-bearing elements: (a) *assembling or evaluating* consumer credit information, and (b) doing so *to furnish consumer reports to third parties*. Our product clearly does (a) — it evaluates credit information. The pivotal question is (b): we return analysis **only to the same consumer who supplied their own report**. The strongest argument that we are *not* a CRA is that the consumer is not a "third party" to their own report, so we are not "furnishing consumer reports to third parties." The strongest counter-argument is that our **derived analysis** may itself constitute a new "consumer report" and that the consumer-as-recipient could still count — an unsettled, fact-specific question.

**Why it matters.** If we are a CRA, the entire FCRA compliance burden inverts onto us (furnisher duties, § 607 accuracy/maximum-possible-accuracy, dispute/reinvestigation under § 1681i, user certifications, etc.). This is potentially product-shape-ending for a small D2C launch.

**Open question for counsel (Q-L1):** Does returning AI/deterministic analysis of a consumer's *own* uploaded report *to that same consumer* constitute "furnishing consumer reports to third parties" under § 1681a(f)/(d)? If not, what conditions keep us outside the CRA definition (e.g., no re-sharing, no aggregation across consumers, no furnishing to lenders)?

## 2. Are we a "credit repair organization" (CRO) under CROA? — **likely NO, if we hold the line**

**Statute.** 15 U.S.C. § 1679a(3): a credit repair organization is one that sells/provides/performs (or represents it can) "any service … **for the purpose of improving any consumer's credit record, credit history, or credit rating**." § 1679b prohibits, among other things: (1) making/counseling untrue or misleading statements about a consumer's creditworthiness; (2) advising a consumer to alter their identity; (3) untrue representations about the service; (4) fraud/deception; and (in § 1679b(b)) **charging before services are fully performed**.

**Analysis (non-authoritative).** Our product's *purpose* is educational/diagnostic — it explicitly does **not** improve the credit record, does not dispute, and does not promise deletion or score improvement. On its face this falls *outside* the § 1679a(3) purpose prong, so CROA likely does not apply. **But** this is a marketing-and-behavior defense, not a structural one: any drift toward "we'll help fix your credit," "remove negative items," or pay-for-performance pricing pulls us *inside* CROA, at which point § 1679b's prohibitions (advance-payment ban, mandatory written contract, 3-day cancellation, no misleading statements) become immediately binding.

**Open question for counsel (Q-L2):** Given our exact feature set and marketing language, are we outside CROA? What contractual/marketing guardrails make the "not a CRO" position defensible (e.g., explicit "educational, not credit repair" disclaimers, no per-deletion pricing, no outcome promises)?

## 3. Permissible purpose — does it apply to us at all?

**Statute.** 15 U.S.C. § 1681b limits who may obtain a consumer report and requires a "permissible purpose."

**Analysis (non-authoritative).** Permissible purpose governs *us obtaining* a report. In our model the **consumer provides their own already-obtained report**; we do not pull reports ourselves. That should mean § 1681b does not directly govern our acquisition. The risk is if we ever *fetch* a report on the consumer's behalf (e.g., via a bureau API or annualcreditreport flow) — then permissible purpose and possibly broker/agent questions arise.

**Open question for counsel (Q-L3):** Is user-supplied, user-authorized upload a clean way to avoid § 1681b permissible-purpose obligations? What changes the moment we fetch reports ourselves?

## 4. California overlays — CCRAA and CCPA/CPRA

**CCRAA** (Cal. Civ. Code § 1785.1 et seq.) is broadly modeled on FCRA but can be **stricter** (e.g., security-freeze rights, reinvestigation specifics, some reporting limits). If FCRA's CRA analysis (§1) lands us as a CRA federally, CCRAA likely applies at state level with additional obligations.

**CCPA/CPRA** applies to "businesses" meeting thresholds. Credit-report data implicates **Sensitive Personal Information** (SSNs, financial account numbers): consumers have the right to limit use/disclosure of SPI, and **data minimization** requires collection/use/retention to be reasonably necessary and proportionate to the disclosed purpose. This directly drives our retention classes, deletion design, and the "do we even need full account numbers/SSNs" question.

**Open question for counsel (Q-L4):** Which CCPA/CPRA obligations attach to holding consumer-supplied credit reports (SPI limits, retention-minimization, deletion rights, contract requirements for any subprocessor)? Do California-specific CCRAA duties apply independently of the federal CRA question?

## 5. Other regimes to confirm we're outside

- **GLBA (Gramm-Leach-Bliley):** if deemed a "financial institution" or offering financial-product advice, GLBA Privacy and Safeguards rules apply. Educational-only analysis likely sits outside, but the line ("financial advice") must be confirmed (Q-L5).
- **Unauthorized practice of law (UPL):** our "educational, not legal advice" boundary is designed to avoid UPL; confirm the taxonomy and disclaimers are sufficient (overlaps Q-L2).

---

## Kill / pivot decision map (pre-committed, ADR-0001)

When counsel returns an opinion, act on it — do not relitigate. **Default on ambiguity is STOP/narrow**, because the downside (consumer financial/legal harm) is asymmetric.

| Counsel opinion | Action |
| --- | --- |
| Not a CRA; outside CROA; conditions X (e.g., disclaimers, no per-deletion pricing, no re-sharing) | **Proceed**, build to conditions X |
| You *are* a CRA | **Pivot** to a partnership/licensed-CRA model, or **stop** |
| You are/would be a CRO under current wording | **Narrow** product + marketing to exit CRO scope; re-confirm before proceeding |
| Permissible-purpose problem if we fetch reports | **Keep** user-supplied-upload model only; never self-fetch |
| Ambiguous / "high-cost to defend" | **STOP** unless a willing partner de-risks it |

## Deliverable to counsel

Hand the attorney: (1) this brief, (2) `CONTEXT.md` (domain language, especially Finding vs Legal verdict vs Educational), (3) the spec's "educational product boundary" language, (4) representative marketing copy, (5) the retention/deletion design in `docs/pilot-readiness.md`. Ask for written answers to Q-L1 … Q-L5 and an explicit CRA/non-CRA determination.

## Sources (primary)

- 15 U.S.C. § 1681a (FCRA definitions, incl. § 1681a(f) CRA, § 1681a(d) consumer report) — Cornell LII
- 15 U.S.C. § 1681b (FCRA permissible purposes) — Cornell LII
- 15 U.S.C. § 1679, § 1679a, § 1679b (CROA: findings, definitions, prohibited practices) — Cornell LII
- Cal. Civ. Code § 1785.1 et seq. (CCRAA) — California Legislature
- CCPA/CPRA — Cal. Civ. Code § 1798.100 et seq.; CA AG CCPA guidance
