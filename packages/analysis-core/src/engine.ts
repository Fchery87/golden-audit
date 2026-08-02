import { randomUUID } from 'node:crypto'
import type { FindingClassification, Severity } from './taxonomy.js'
import type { Evidence, SourceReference } from './evidence.js'
import type { Analysis, Finding, RuleAudit } from './findings.js'
import {
  comparableIdentityValues, datesOfBirthAgree, identityEvidence, namesAgree,
  type AttestedIdentity, type EvaluableIdentityValue, type ReportedIdentity,
} from './identity.js'

/**
 * Ingest-agnostic deterministic analysis engine (ADR-0002).
 *
 * It operates ONLY on already-normalized inputs. It has no dependency on storage,
 * sessions, ingestion, or the host application — it imports nothing from `platform`
 * or `domain`. That is what makes it safe to harden during the legal de-risk period:
 * its value survives "legal says no", a B2B pivot, or an education-only pivot.
 */

export type EvaluableRule = {
  id: string
  name: string
  status: 'draft' | 'approved' | 'rejected' | 'published' | 'disabled'
  minimumConfidence: number
  /** Optional trivial-magnitude threshold (in minor units / cents). When the balance difference
   *  is below this, the finding still fires but is down-ranked to 'low' severity and flagged as a
   *  likely reporting-date artifact — it is NOT suppressed (CONTEXT.md: suppression is for
   *  missing/low-confidence/ambiguous/non-comparable evidence, not 'real but trivial'). */
  minimumMagnitude?: number
  classification: FindingClassification
  limitations: string[]
  authorityIds: string[]
  educationModuleIds: string[]
}

/** Minimal tradeline slice the built-in evaluators need. The host's richer Tradeline
 *  type satisfies this structurally, so no type duplication is required. */
export type EvaluableTradeline = {
  id: string
  bureau?: string
  creditor?: { normalized: string | null; source?: SourceReference }
  maskedAccount?: { normalized: string | null; source?: SourceReference }
  accountType?: { normalized: string | null; confidence?: number; source?: SourceReference }
  balance: { normalized: number | null; confidence: number; source: SourceReference }
  creditLimit?: { normalized: number | null; confidence: number; source: SourceReference }
  pastDue?: { normalized: number | null; confidence: number; source: SourceReference }
  status?: { normalized: string | null; confidence: number; source: SourceReference }
  opened?: { normalized: string | null; confidence: number; source: SourceReference }
  updated?: { normalized: string | null; confidence: number; source: SourceReference }
  /** Month-keyed payment status cells. Each carries the month the document itself stated. */
  paymentHistory?: Array<{ yearMonth: string; normalized: string | null; confidence: number; source: SourceReference }>
}

export type MatchRef = { tradelineIds: string[] }

type EvaluatorContext = {
  rule: EvaluableRule
  tradelinesById: Map<string, EvaluableTradeline>
  confirmedMatches: MatchRef[]
  attestedIdentity?: AttestedIdentity
  reportedIdentity?: ReportedIdentity
}

type EvaluatorResult = { audits: RuleAudit[]; findings: Omit<Finding, 'id'>[] }

export type RuleEvaluator = (ctx: EvaluatorContext) => EvaluatorResult

const evaluators = new Map<string, RuleEvaluator>()

export function registerRuleEvaluator(name: string, evaluator: RuleEvaluator): void {
  evaluators.set(name, evaluator)
}

function matchEvidenceSignature(match: MatchRef): string {
  return JSON.stringify([...match.tradelineIds].sort())
}

function suppress(ruleId: string, reason: string): RuleAudit {
  return { ruleId, outcome: 'suppressed', reason }
}

function skip(ruleId: string, reason: string): RuleAudit {
  return { ruleId, outcome: 'skipped', reason }
}

function trigger(ruleId: string, reason: string): RuleAudit {
  return { ruleId, outcome: 'triggered', reason }
}

function confidenceOf(value: { confidence?: number } | undefined): number {
  return value?.confidence ?? 0
}

function distinctBureauLines(lines: EvaluableTradeline[]): EvaluableTradeline[] {
  const unique = new Map<string, EvaluableTradeline>()
  for (const line of lines) {
    const bureau = line.bureau ?? `unknown:${line.id}`
    if (!unique.has(bureau)) unique.set(bureau, line)
  }
  return [...unique.values()]
}

function duplicateBureauLines(lines: EvaluableTradeline[]): EvaluableTradeline[][] {
  const byBureau = new Map<string, EvaluableTradeline[]>()
  for (const line of lines) {
    const bureau = line.bureau ?? 'unknown'
    byBureau.set(bureau, [...(byBureau.get(bureau) ?? []), line])
  }
  return [...byBureau.values()].filter(group => group.length > 1)
}

function makeEvidenceField(
  line: EvaluableTradeline,
  field: 'balance' | 'creditLimit' | 'pastDue' | 'status' | 'opened' | 'updated' | 'accountType' | 'maskedAccount',
  fallback: SourceReference,
): Evidence {
  const slot = field === 'balance'
    ? line.balance
    : field === 'creditLimit'
      ? line.creditLimit
      : field === 'pastDue'
        ? line.pastDue
        : field === 'status'
          ? line.status
          : field === 'opened'
            ? line.opened
            : field === 'updated'
              ? line.updated
              : field === 'accountType'
                ? line.accountType
                : line.maskedAccount
  return {
    tradelineId: line.id,
    field,
    value: slot?.normalized ?? '',
    source: slot?.source ?? fallback,
  }
}

function compareComparableField<T>(args: {
  rule: EvaluableRule
  lines: EvaluableTradeline[]
  field: 'balance' | 'creditLimit' | 'pastDue' | 'status' | 'opened' | 'updated'
  title: string
  reasonWhenAgree: string
  reasonWhenDiffer: string
  severity: Severity
  alternativeExplanations: string[]
  verificationDocuments: string[]
  suggestedAction: string
  limitationsOnTrivialMagnitude?: string
}): EvaluatorResult {
  const { rule, lines, field, title, reasonWhenAgree, reasonWhenDiffer, severity, alternativeExplanations, verificationDocuments, suggestedAction } = args
  const audits: RuleAudit[] = []
  const findings: Omit<Finding, 'id'>[] = []

  const distinct = distinctBureauLines(lines)
  if (distinct.length < 2) {
    audits.push(skip(rule.id, 'Need at least two distinct bureaus for comparison'))
    return { audits, findings }
  }

  const values = distinct.map(line => field === 'balance' ? line.balance : line[field])
  if (values.some(value => !value || value.normalized === null || confidenceOf(value) < rule.minimumConfidence)) {
    audits.push(suppress(rule.id, `Missing or low-confidence ${field}`))
    return { audits, findings }
  }

  const normalized = values.map(value => value?.normalized)
  const differ = new Set(normalized).size > 1
  if (!differ) {
    audits.push(skip(rule.id, reasonWhenAgree))
    return { audits, findings }
  }

  let finalSeverity = severity
  const finalLimitations = [...rule.limitations]
  if ((field === 'balance' || field === 'creditLimit' || field === 'pastDue') && rule.minimumMagnitude !== undefined) {
    const nums = normalized.filter((value): value is number => typeof value === 'number')
    const magnitude = Math.max(...nums) - Math.min(...nums)
    if (magnitude < rule.minimumMagnitude) {
      finalSeverity = 'low'
      finalLimitations.push(args.limitationsOnTrivialMagnitude ?? 'The balance difference is small and likely a reporting-date artifact')
    }
  }

  findings.push({
    classification: rule.classification,
    title,
    severity: finalSeverity,
    confidence: Math.min(...values.map(value => confidenceOf(value))),
    evidence: distinct.map(line => makeEvidenceField(line, field, line.balance.source)),
    limitations: finalLimitations,
    alternativeExplanations,
    verificationDocuments,
    authorityIds: rule.authorityIds,
    educationModuleIds: rule.educationModuleIds,
    suggestedAction,
  })
  audits.push(trigger(rule.id, reasonWhenDiffer))
  return { audits, findings }
}

// --- Built-in evaluators ---
const crossBureauBalanceDifference: RuleEvaluator = ({ rule, tradelinesById, confirmedMatches }) => {
  const audits: RuleAudit[] = []
  const findings: Omit<Finding, 'id'>[] = []
  for (const match of confirmedMatches) {
    const lines = match.tradelineIds.map(id => tradelinesById.get(id)).filter((line): line is EvaluableTradeline => line !== undefined)
    const result = compareComparableField<number>({
      rule,
      lines,
      field: 'balance',
      title: 'Bureau balances differ',
      reasonWhenAgree: 'Comparable balances agree',
      reasonWhenDiffer: 'Comparable balances differ',
      severity: 'medium',
      alternativeExplanations: ['Bureaus may have received updates on different dates'],
      verificationDocuments: ['Recent creditor statement'],
      suggestedAction: 'Compare the displayed dates and verify the current balance with the creditor',
    })
    audits.push(...result.audits)
    findings.push(...result.findings)
  }
  return { audits, findings }
}
registerRuleEvaluator('cross-bureau-balance-difference', crossBureauBalanceDifference)

const crossBureauCreditLimitDifference: RuleEvaluator = ({ rule, tradelinesById, confirmedMatches }) => {
  const audits: RuleAudit[] = []
  const findings: Omit<Finding, 'id'>[] = []
  for (const match of confirmedMatches) {
    const lines = match.tradelineIds.map(id => tradelinesById.get(id)).filter((line): line is EvaluableTradeline => line !== undefined)
    const result = compareComparableField<number>({
      rule,
      lines,
      field: 'creditLimit',
      title: 'Bureau credit limits differ',
      reasonWhenAgree: 'Comparable credit limits agree',
      reasonWhenDiffer: 'Comparable credit limits differ',
      severity: 'medium',
      alternativeExplanations: ['A bureau may show high credit instead of the current revolving credit limit'],
      verificationDocuments: ['Recent creditor statement'],
      suggestedAction: 'Verify the current credit limit with the creditor and compare it with each bureau entry',
    })
    audits.push(...result.audits)
    findings.push(...result.findings)
  }
  return { audits, findings }
}
registerRuleEvaluator('cross-bureau-credit-limit-difference', crossBureauCreditLimitDifference)

const crossBureauPastDueDifference: RuleEvaluator = ({ rule, tradelinesById, confirmedMatches }) => {
  const audits: RuleAudit[] = []
  const findings: Omit<Finding, 'id'>[] = []
  for (const match of confirmedMatches) {
    const lines = match.tradelineIds.map(id => tradelinesById.get(id)).filter((line): line is EvaluableTradeline => line !== undefined)
    const result = compareComparableField<number>({
      rule,
      lines,
      field: 'pastDue',
      title: 'Bureau past-due amounts differ',
      reasonWhenAgree: 'Comparable past-due amounts agree',
      reasonWhenDiffer: 'Comparable past-due amounts differ',
      severity: 'medium',
      alternativeExplanations: ['Bureaus may have received account updates on different dates'],
      verificationDocuments: ['Recent creditor statement'],
      suggestedAction: 'Verify the current past-due amount with the creditor and compare it with each bureau entry',
    })
    audits.push(...result.audits)
    findings.push(...result.findings)
  }
  return { audits, findings }
}
registerRuleEvaluator('cross-bureau-past-due-difference', crossBureauPastDueDifference)

function isClosedOrPaid(status: string): boolean {
  return /\b(closed|paid|settled)\b/i.test(status)
}

const closedOrPaidWithBalance: RuleEvaluator = ({ rule, tradelinesById, confirmedMatches }) => {
  const audits: RuleAudit[] = []
  const findings: Omit<Finding, 'id'>[] = []
  const seen = new Set<string>()
  for (const match of confirmedMatches) {
    for (const id of match.tradelineIds) {
      const line = tradelinesById.get(id)
      if (!line || seen.has(id)) continue
      seen.add(id)
      if (!line.status || line.status.normalized === null || line.balance.normalized === null || confidenceOf(line.status) < rule.minimumConfidence || line.balance.confidence < rule.minimumConfidence) {
        audits.push(suppress(rule.id, 'Missing or low-confidence account status or balance'))
        continue
      }
      if (!isClosedOrPaid(line.status.normalized) || line.balance.normalized <= 0) {
        audits.push(skip(rule.id, 'Account status and balance are not internally contradictory'))
        continue
      }
      findings.push({
        classification: rule.classification,
        title: 'Closed or paid account reports a balance',
        severity: 'medium',
        confidence: Math.min(confidenceOf(line.status), line.balance.confidence),
        evidence: [makeEvidenceField(line, 'status', line.balance.source), makeEvidenceField(line, 'balance', line.balance.source)],
        limitations: rule.limitations,
        alternativeExplanations: ['The status and balance may have been reported at different times'],
        verificationDocuments: ['Recent creditor statement'],
        authorityIds: rule.authorityIds,
        educationModuleIds: rule.educationModuleIds,
        suggestedAction: 'Compare the status and balance with the creditor’s current account record',
      })
      audits.push(trigger(rule.id, 'Closed or paid status appears with a positive balance'))
    }
  }
  return { audits, findings }
}
registerRuleEvaluator('closed-or-paid-with-balance', closedOrPaidWithBalance)

const pastDueExceedsBalance: RuleEvaluator = ({ rule, tradelinesById, confirmedMatches }) => {
  const audits: RuleAudit[] = []
  const findings: Omit<Finding, 'id'>[] = []
  const seen = new Set<string>()
  for (const match of confirmedMatches) {
    for (const id of match.tradelineIds) {
      const line = tradelinesById.get(id)
      if (!line || seen.has(id)) continue
      seen.add(id)
      if (!line.pastDue || line.pastDue.normalized === null || line.balance.normalized === null || confidenceOf(line.pastDue) < rule.minimumConfidence || line.balance.confidence < rule.minimumConfidence) {
        audits.push(suppress(rule.id, 'Missing or low-confidence past-due amount or balance'))
        continue
      }
      if (line.pastDue.normalized <= line.balance.normalized) {
        audits.push(skip(rule.id, 'Past-due amount does not exceed balance'))
        continue
      }
      findings.push({
        classification: rule.classification,
        title: 'Past-due amount exceeds reported balance',
        severity: 'medium',
        confidence: Math.min(confidenceOf(line.pastDue), line.balance.confidence),
        evidence: [makeEvidenceField(line, 'pastDue', line.balance.source), makeEvidenceField(line, 'balance', line.balance.source)],
        limitations: rule.limitations,
        alternativeExplanations: ['The fields may have been updated on different reporting cycles'],
        verificationDocuments: ['Recent creditor statement'],
        authorityIds: rule.authorityIds,
        educationModuleIds: rule.educationModuleIds,
        suggestedAction: 'Compare the reported balance and past-due amount with the creditor’s current account record',
      })
      audits.push(trigger(rule.id, 'Past-due amount exceeds reported balance'))
    }
  }
  return { audits, findings }
}
registerRuleEvaluator('past-due-exceeds-balance', pastDueExceedsBalance)

const revolvingWithoutCreditLimit: RuleEvaluator = ({ rule, tradelinesById, confirmedMatches }) => {
  const audits: RuleAudit[] = []
  const findings: Omit<Finding, 'id'>[] = []
  const seen = new Set<string>()
  for (const match of confirmedMatches) {
    for (const id of match.tradelineIds) {
      const line = tradelinesById.get(id)
      if (!line || seen.has(id)) continue
      seen.add(id)
      if (!line.accountType || line.accountType.normalized === null || confidenceOf(line.accountType) < rule.minimumConfidence) {
        audits.push(suppress(rule.id, 'Missing or low-confidence account type'))
        continue
      }
      if (!/revolving|credit\s*card/i.test(line.accountType.normalized)) {
        audits.push(skip(rule.id, 'Account is not identified as revolving'))
        continue
      }
      if (line.creditLimit && line.creditLimit.normalized !== null && confidenceOf(line.creditLimit) >= rule.minimumConfidence) {
        audits.push(skip(rule.id, 'Revolving account includes a credit limit or high credit value'))
        continue
      }
      findings.push({
        classification: rule.classification,
        title: 'Revolving account has no reported credit limit',
        severity: 'low',
        confidence: confidenceOf(line.accountType),
        evidence: [makeEvidenceField(line, 'accountType', line.balance.source), makeEvidenceField(line, 'creditLimit', line.balance.source)],
        limitations: rule.limitations,
        alternativeExplanations: ['Some furnishers report high credit instead of a current credit limit'],
        verificationDocuments: ['Recent creditor statement'],
        authorityIds: rule.authorityIds,
        educationModuleIds: rule.educationModuleIds,
        suggestedAction: 'Use the creditor statement to confirm whether a credit limit or high-credit value should appear',
      })
      audits.push(trigger(rule.id, 'Revolving account has no high-credit or credit-limit value'))
    }
  }
  return { audits, findings }
}
registerRuleEvaluator('revolving-without-credit-limit', revolvingWithoutCreditLimit)

const crossBureauStatusDifference: RuleEvaluator = ({ rule, tradelinesById, confirmedMatches }) => {
  const audits: RuleAudit[] = []
  const findings: Omit<Finding, 'id'>[] = []
  for (const match of confirmedMatches) {
    const lines = match.tradelineIds.map(id => tradelinesById.get(id)).filter((line): line is EvaluableTradeline => line !== undefined)
    const result = compareComparableField<string>({
      rule,
      lines,
      field: 'status',
      title: 'Bureau account statuses differ',
      reasonWhenAgree: 'Comparable account statuses agree',
      reasonWhenDiffer: 'Comparable account statuses differ',
      severity: 'medium',
      alternativeExplanations: ['Bureaus may update account status on different dates'],
      verificationDocuments: ['Recent creditor statement'],
      suggestedAction: 'Verify the current account status directly with the creditor and compare it against each bureau entry',
    })
    audits.push(...result.audits)
    findings.push(...result.findings)
  }
  return { audits, findings }
}
registerRuleEvaluator('cross-bureau-status-difference', crossBureauStatusDifference)

const crossBureauDateOpenedDifference: RuleEvaluator = ({ rule, tradelinesById, confirmedMatches }) => {
  const audits: RuleAudit[] = []
  const findings: Omit<Finding, 'id'>[] = []
  for (const match of confirmedMatches) {
    const lines = match.tradelineIds.map(id => tradelinesById.get(id)).filter((line): line is EvaluableTradeline => line !== undefined)
    const result = compareComparableField<string>({
      rule,
      lines,
      field: 'opened',
      title: 'Bureau opened dates differ',
      reasonWhenAgree: 'Comparable opened dates agree',
      reasonWhenDiffer: 'Comparable opened dates differ',
      severity: 'medium',
      alternativeExplanations: ['A bureau may have received the account history later than another bureau'],
      verificationDocuments: ['Original account opening documents', 'Recent creditor statement'],
      suggestedAction: 'Compare the reported opened date with the creditor records for this account',
    })
    audits.push(...result.audits)
    findings.push(...result.findings)
  }
  return { audits, findings }
}
registerRuleEvaluator('cross-bureau-date-opened-difference', crossBureauDateOpenedDifference)

const crossBureauLastReportedDifference: RuleEvaluator = ({ rule, tradelinesById, confirmedMatches }) => {
  const audits: RuleAudit[] = []
  const findings: Omit<Finding, 'id'>[] = []
  for (const match of confirmedMatches) {
    const lines = match.tradelineIds.map(id => tradelinesById.get(id)).filter((line): line is EvaluableTradeline => line !== undefined)
    const result = compareComparableField<string>({
      rule,
      lines,
      field: 'updated',
      title: 'Bureau last-reported dates differ',
      reasonWhenAgree: 'Comparable last-reported dates agree',
      reasonWhenDiffer: 'Comparable last-reported dates differ',
      severity: 'low',
      alternativeExplanations: ['Different bureaus often receive updates on different cycles'],
      verificationDocuments: ['Recent creditor statement'],
      suggestedAction: 'Use the reported dates as context when reviewing other differences on this account',
    })
    audits.push(...result.audits)
    findings.push(...result.findings)
  }
  return { audits, findings }
}
registerRuleEvaluator('cross-bureau-last-reported-difference', crossBureauLastReportedDifference)

/**
 * Cross-bureau payment-history divergence.
 *
 * Unlike the scalar comparisons above, this compares a month-keyed series, so the comparison runs
 * per month and only on months at least two bureaus actually state. A month one bureau omits is an
 * absence, not a disagreement — bureaus commonly hold different lengths of history for the same
 * account — so omitted months are excluded from the comparison rather than read as a difference.
 *
 * One finding per account, citing the months that differ, rather than one per month: a 24-month
 * grid that diverges for half a year would otherwise bury the account it belongs to.
 */
const crossBureauPaymentHistoryDifference: RuleEvaluator = ({ rule, tradelinesById, confirmedMatches }) => {
  const audits: RuleAudit[] = []
  const findings: Omit<Finding, 'id'>[] = []
  for (const match of confirmedMatches) {
    const lines = match.tradelineIds.map(id => tradelinesById.get(id)).filter((line): line is EvaluableTradeline => line !== undefined)
    const distinct = distinctBureauLines(lines)
    if (distinct.length < 2) {
      audits.push(skip(rule.id, 'Need at least two distinct bureaus for comparison'))
      continue
    }

    // Only cells the parser read confidently take part; a low-confidence cell is not evidence of
    // anything, and letting it through would manufacture a difference out of a misread column.
    const byMonth = new Map<string, Array<{ line: EvaluableTradeline; cell: { yearMonth: string; normalized: string | null; confidence: number; source: SourceReference } }>>()
    for (const line of distinct) {
      for (const cell of line.paymentHistory ?? []) {
        if (cell.normalized === null || cell.confidence < rule.minimumConfidence) continue
        byMonth.set(cell.yearMonth, [...(byMonth.get(cell.yearMonth) ?? []), { line, cell }])
      }
    }

    const comparable = [...byMonth.entries()].filter(([, entries]) => entries.length >= 2)
    if (comparable.length === 0) {
      audits.push(suppress(rule.id, 'No month is reported with a usable payment status by two or more bureaus'))
      continue
    }

    const differing = comparable.filter(([, entries]) => new Set(entries.map(entry => entry.cell.normalized)).size > 1)
    if (differing.length === 0) {
      audits.push(skip(rule.id, `Comparable payment statuses agree across ${comparable.length} month${comparable.length === 1 ? '' : 's'}`))
      continue
    }

    const months = differing.map(([yearMonth]) => yearMonth).sort()
    const evidence: Evidence[] = differing.flatMap(([yearMonth, entries]) => entries.map(entry => ({
      tradelineId: entry.line.id,
      field: `paymentHistory:${yearMonth}`,
      value: entry.cell.normalized ?? '',
      source: entry.cell.source,
    })))
    findings.push({
      classification: rule.classification,
      title: `Bureau payment histories differ for ${months.length} month${months.length === 1 ? '' : 's'} (${months[0]}${months.length > 1 ? ` to ${months[months.length - 1]}` : ''})`,
      severity: 'medium',
      confidence: Math.min(...differing.flatMap(([, entries]) => entries.map(entry => entry.cell.confidence))),
      evidence,
      limitations: rule.limitations,
      alternativeExplanations: [
        'Bureaus receive payment updates on different cycles, so one month can differ while the account is reported correctly',
        'A furnisher may have begun reporting to one bureau later than to another',
      ],
      verificationDocuments: ['Statements covering the months listed', 'Payment records for this account'],
      authorityIds: rule.authorityIds,
      educationModuleIds: rule.educationModuleIds,
      suggestedAction: 'Compare your own payment records for the months listed against what each bureau shows for this account',
    })
    audits.push(trigger(rule.id, `Comparable payment statuses differ in ${differing.length} of ${comparable.length} compared months`))
  }
  return { audits, findings }
}
registerRuleEvaluator('cross-bureau-payment-history-difference', crossBureauPaymentHistoryDifference)

const duplicateTradelineWithinBureau: RuleEvaluator = ({ rule, tradelinesById, confirmedMatches }) => {
  const audits: RuleAudit[] = []
  const findings: Omit<Finding, 'id'>[] = []
  for (const match of confirmedMatches) {
    const lines = match.tradelineIds.map(id => tradelinesById.get(id)).filter((line): line is EvaluableTradeline => line !== undefined)
    const duplicates = duplicateBureauLines(lines)
    if (duplicates.length === 0) {
      audits.push(skip(rule.id, 'No same-bureau duplicates in the confirmed match'))
      continue
    }
    for (const group of duplicates) {
      const bureau = group[0]?.bureau ?? 'unknown'
      findings.push({
        classification: rule.classification,
        title: `Possible duplicate tradeline on ${bureau}`,
        severity: 'medium',
        confidence: Math.min(...group.map(line => line.balance.confidence)),
        evidence: group.map(line => makeEvidenceField(line, 'maskedAccount', line.balance.source)),
        limitations: rule.limitations,
        alternativeExplanations: ['A bureau may list separate updates for the same furnisher entry'],
        verificationDocuments: ['Full credit report copy', 'Recent creditor statement'],
        authorityIds: rule.authorityIds,
        educationModuleIds: rule.educationModuleIds,
        suggestedAction: 'Review the bureau entries line by line to confirm whether these are true duplicates or separate accounts',
      })
      audits.push(trigger(rule.id, `Same-bureau duplicate detected for ${bureau}`))
    }
  }
  return { audits, findings }
}
registerRuleEvaluator('duplicate-tradeline-within-bureau', duplicateTradelineWithinBureau)

const partialFurnishingObservation: RuleEvaluator = ({ rule, tradelinesById, confirmedMatches }) => {
  const audits: RuleAudit[] = []
  const findings: Omit<Finding, 'id'>[] = []
  const partialMatches = confirmedMatches
    .map(match => ({ signature: matchEvidenceSignature(match), lines: match.tradelineIds.map(id => tradelinesById.get(id)).filter((line): line is EvaluableTradeline => line !== undefined) }))
    .filter(entry => distinctBureauLines(entry.lines).length >= 2 && distinctBureauLines(entry.lines).length < 3)

  if (partialMatches.length === 0) {
    audits.push(skip(rule.id, 'No partial furnishing matches found'))
    return { audits, findings }
  }

  const evidence = partialMatches.flatMap(entry => distinctBureauLines(entry.lines).map(line => makeEvidenceField(line, 'maskedAccount', line.balance.source)))
  findings.push({
    classification: rule.classification,
    title: `${partialMatches.length} account${partialMatches.length === 1 ? '' : 's'} reported by fewer than three bureaus`,
    severity: 'low',
    confidence: Math.min(...evidence.map(item => item.source ? 1 : 1)),
    evidence,
    limitations: rule.limitations,
    alternativeExplanations: ['Partial furnishing can be normal and does not by itself indicate an error'],
    verificationDocuments: ['Full credit report copy'],
    authorityIds: rule.authorityIds,
    educationModuleIds: rule.educationModuleIds,
    suggestedAction: 'Use this as context when reviewing the rest of the report; not every account is expected to appear on all three bureaus',
  })
  audits.push(trigger(rule.id, 'Observed partial furnishing across confirmed matches'))
  return { audits, findings }
}
registerRuleEvaluator('partial-furnishing-observation', partialFurnishingObservation)

// --- Identity evaluators ---
//
// These are the only rules whose reference value comes from outside the document. When the
// consumer has not supplied one, they suppress with that reason rather than silently skipping —
// the coverage table then says the check did not run and why, instead of implying it passed.

type IdentityEvaluatorArgs = {
  ctx: EvaluatorContext
  values: (reported: ReportedIdentity) => EvaluableIdentityValue[]
  agrees: (attested: AttestedIdentity, value: EvaluableIdentityValue) => boolean
  emptyReason: string
  agreeReason: string
  title: (value: EvaluableIdentityValue) => string
  severity: Severity
  alternativeExplanations: string[]
  verificationDocuments: string[]
  suggestedAction: string
}

function compareAgainstAttestedIdentity(args: IdentityEvaluatorArgs): EvaluatorResult {
  const { ctx, rule } = { ...args, rule: args.ctx.rule }
  const audits: RuleAudit[] = []
  const findings: Omit<Finding, 'id'>[] = []
  if (!ctx.attestedIdentity || !ctx.reportedIdentity) {
    audits.push(suppress(rule.id, 'No attested identity is on record for this account, so there is nothing to compare the report against'))
    return { audits, findings }
  }
  const comparable = comparableIdentityValues(args.values(ctx.reportedIdentity), rule.minimumConfidence)
  if (comparable.length === 0) {
    audits.push(suppress(rule.id, args.emptyReason))
    return { audits, findings }
  }
  const differing = comparable.filter(value => !args.agrees(ctx.attestedIdentity!, value))
  if (differing.length === 0) {
    audits.push(skip(rule.id, args.agreeReason))
    return { audits, findings }
  }
  for (const value of differing) {
    findings.push({
      classification: rule.classification,
      title: args.title(value),
      severity: args.severity,
      confidence: value.confidence,
      evidence: [identityEvidence(value)],
      limitations: rule.limitations,
      alternativeExplanations: args.alternativeExplanations,
      verificationDocuments: args.verificationDocuments,
      authorityIds: rule.authorityIds,
      educationModuleIds: rule.educationModuleIds,
      suggestedAction: args.suggestedAction,
    })
    audits.push(trigger(rule.id, `A displayed ${value.field} does not match the details on record for this account`))
  }
  return { audits, findings }
}

const bureauLabel = (value: EvaluableIdentityValue): string => value.bureau && value.bureau !== 'unknown' ? ` on ${value.bureau}` : ''

registerRuleEvaluator('identity-name-not-attested', ctx => compareAgainstAttestedIdentity({
  ctx,
  values: reported => reported.names,
  agrees: (attested, value) => namesAgree(attested.fullName, value.normalized ?? ''),
  emptyReason: 'No readable name appears in the personal-information section',
  agreeReason: 'Every displayed name matches the name on record for this account',
  title: value => `A name shown${bureauLabel(value)} does not match the name you provided`,
  severity: 'medium',
  alternativeExplanations: [
    'A former name, a maiden name, or a data-entry variation can appear without anything being wrong',
    'Reports frequently display a name in a different order or with a middle name omitted',
  ],
  verificationDocuments: ['Government-issued photo identification', 'Social Security card'],
  suggestedAction: 'Compare the displayed name with your identification documents and take any unexplained difference to the reporting company',
}))

registerRuleEvaluator('identity-date-of-birth-not-attested', ctx => compareAgainstAttestedIdentity({
  ctx,
  values: reported => reported.datesOfBirth,
  agrees: (attested, value) => datesOfBirthAgree(attested.dateOfBirth, value.normalized ?? ''),
  emptyReason: 'No readable date of birth appears in the personal-information section',
  agreeReason: 'Every displayed date of birth is consistent with the date on record for this account',
  title: value => `A date of birth shown${bureauLabel(value)} does not match the date you provided`,
  severity: 'high',
  alternativeExplanations: ['A transposed digit at the furnisher or the reporting company can produce this difference'],
  verificationDocuments: ['Birth certificate', 'Government-issued photo identification'],
  suggestedAction: 'Verify the displayed date of birth against your identification documents and take any difference to the reporting company',
}))

registerRuleEvaluator('identity-ssn-fragment-not-attested', ctx => compareAgainstAttestedIdentity({
  ctx,
  values: reported => reported.ssnFragments,
  agrees: (attested, value) => (value.normalized ?? '') === attested.ssnLastFour,
  emptyReason: 'No readable Social Security number fragment appears in the personal-information section',
  agreeReason: 'Every displayed Social Security number fragment matches the digits on record for this account',
  title: value => `The Social Security number fragment shown${bureauLabel(value)} does not match the digits you provided`,
  severity: 'high',
  alternativeExplanations: ['A single transposed digit at the furnisher can produce this difference'],
  verificationDocuments: ['Social Security card', 'Government-issued photo identification'],
  suggestedAction: 'Verify the displayed digits against your Social Security card and take any difference to the reporting company',
}))

registerRuleEvaluator('identity-address-not-attested', ctx => compareAgainstAttestedIdentity({
  ctx,
  values: reported => ctx.reportedIdentity?.addresses ?? [],
  agrees: (attested, value) => {
    const key = (value as ReportedIdentity['addresses'][number]).comparisonKey
    return attested.addressKeys.includes(key)
  },
  emptyReason: 'No readable address appears in the personal-information section',
  agreeReason: 'Every displayed address matches an address you provided',
  title: value => `An address shown${bureauLabel(value)} is not one you listed`,
  severity: 'low',
  alternativeExplanations: [
    'An older address you did not list, a temporary address, or a formatting difference can all produce this',
    'Addresses are often retained long after a move',
  ],
  verificationDocuments: ['Utility bill or lease showing your address history'],
  suggestedAction: 'Check whether this is an address you have used; if you do not recognize it at all, raise it with the reporting company',
}))

/**
 * Bureaus disagreeing with each other on a name is a separate signal from any bureau disagreeing
 * with the consumer, and it needs no attested reference — so it stays available even for a report
 * read before intake data existed.
 */
const crossBureauIdentityNameDifference: RuleEvaluator = ({ rule, reportedIdentity }) => {
  const audits: RuleAudit[] = []
  const findings: Omit<Finding, 'id'>[] = []
  if (!reportedIdentity) {
    audits.push(suppress(rule.id, 'No personal-information section was read from this report'))
    return { audits, findings }
  }
  const byBureau = new Map<string, EvaluableIdentityValue>()
  for (const value of comparableIdentityValues(reportedIdentity.names, rule.minimumConfidence)) {
    const bureau = value.bureau ?? 'unknown'
    if (bureau === 'unknown' || byBureau.has(bureau)) continue
    byBureau.set(bureau, value)
  }
  const values = [...byBureau.values()]
  if (values.length < 2) {
    audits.push(skip(rule.id, 'Fewer than two bureaus displayed a readable name'))
    return { audits, findings }
  }
  const reference = values[0]?.normalized ?? ''
  if (values.every(value => namesAgree(reference, value.normalized ?? ''))) {
    audits.push(skip(rule.id, 'Displayed names agree across the bureaus that showed one'))
    return { audits, findings }
  }
  findings.push({
    classification: rule.classification,
    title: 'The bureaus display different names for this file',
    severity: 'medium',
    confidence: Math.min(...values.map(value => value.confidence)),
    evidence: values.map(value => identityEvidence(value)),
    limitations: rule.limitations,
    alternativeExplanations: ['Bureaus receive identifying details from different furnishers and update them on different schedules'],
    verificationDocuments: ['Government-issued photo identification'],
    authorityIds: rule.authorityIds,
    educationModuleIds: rule.educationModuleIds,
    suggestedAction: 'Compare each displayed name with your identification documents and raise any you do not recognize with that reporting company',
  })
  audits.push(trigger(rule.id, 'Displayed names differ across bureaus'))
  return { audits, findings }
}
registerRuleEvaluator('cross-bureau-identity-name-difference', crossBureauIdentityNameDifference)

export type AnalysisInput = {
  rules: EvaluableRule[]
  tradelines: EvaluableTradeline[]
  confirmedMatches: MatchRef[]
  attestedIdentity?: AttestedIdentity
  reportedIdentity?: ReportedIdentity
  versions: Analysis['versions']
}

/** Pure: same input + ruleset → same findings + audit, every time. */
export function evaluateAnalysis(input: AnalysisInput): Analysis {
  const tradelinesById = new Map(input.tradelines.map(line => [line.id, line]))
  const audit: RuleAudit[] = []
  const rawFindings: Omit<Finding, 'id'>[] = []

  for (const rule of input.rules) {
    if (rule.status === 'disabled') {
      audit.push({ ruleId: rule.id, outcome: 'skipped', reason: 'Rule disabled' })
      continue
    }
    const evaluator = evaluators.get(rule.name)
    if (!evaluator) {
      audit.push({ ruleId: rule.id, outcome: 'skipped', reason: 'No supported evaluator for this rule' })
      continue
    }
    const { audits, findings } = evaluator({
      rule, tradelinesById, confirmedMatches: input.confirmedMatches,
      ...(input.attestedIdentity ? { attestedIdentity: input.attestedIdentity } : {}),
      ...(input.reportedIdentity ? { reportedIdentity: input.reportedIdentity } : {}),
    })
    audit.push(...audits)
    rawFindings.push(...findings)
  }

  // Deterministic deduplication: findings sharing the same evidence signature
  // (tradelineId + value, sorted) and thus the same consumer action are grouped.
  const signature = (evidence: Evidence[]) => JSON.stringify(evidence.map(item => [item.tradelineId, item.field, item.value]).sort())
  const findings: Finding[] = []
  const seen = new Set<string>()
  for (const candidate of rawFindings) {
    const sig = `${candidate.title}|${signature(candidate.evidence)}`
    if (seen.has(sig)) continue
    seen.add(sig)
    findings.push({ ...candidate, id: randomUUID() })
  }

  return { id: randomUUID(), findings, audit, versions: input.versions, createdAt: new Date().toISOString() }
}

export type { Severity }
