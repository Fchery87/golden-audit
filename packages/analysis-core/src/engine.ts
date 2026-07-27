import { randomUUID } from 'node:crypto'
import type { FindingClassification, Severity } from './taxonomy.js'
import type { Evidence, SourceReference } from './evidence.js'
import type { Analysis, Finding, RuleAudit } from './findings.js'

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
  classification: FindingClassification
  limitations: string[]
  authorityIds: string[]
  educationModuleIds: string[]
}

/** Minimal tradeline slice the built-in evaluators need. The host's richer Tradeline
 *  type satisfies this structurally, so no type duplication is required. */
export type EvaluableTradeline = {
  id: string
  balance: { normalized: number | null; confidence: number; source: SourceReference }
}

export type MatchRef = { tradelineIds: string[] }

type EvaluatorContext = {
  rule: EvaluableRule
  tradelinesById: Map<string, EvaluableTradeline>
  confirmedMatches: MatchRef[]
}

type EvaluatorResult = { audits: RuleAudit[]; findings: Omit<Finding, 'id'>[] }

export type RuleEvaluator = (ctx: EvaluatorContext) => EvaluatorResult

const evaluators = new Map<string, RuleEvaluator>()

export function registerRuleEvaluator(name: string, evaluator: RuleEvaluator): void {
  evaluators.set(name, evaluator)
}

// --- Built-in evaluator: cross-bureau balance difference ---
const crossBureauBalanceDifference: RuleEvaluator = ({ rule, tradelinesById, confirmedMatches }) => {
  const audits: RuleAudit[] = []
  const findings: Omit<Finding, 'id'>[] = []
  for (const match of confirmedMatches) {
    const lines = match.tradelineIds
      .map(id => tradelinesById.get(id))
      .filter((line): line is EvaluableTradeline => line !== undefined)
    if (lines.length === 0) continue
    if (lines.some(line => line.balance.confidence < rule.minimumConfidence || line.balance.normalized === null)) {
      audits.push({ ruleId: rule.id, outcome: 'suppressed', reason: 'Missing or low-confidence balance' })
      continue
    }
    const balances = new Set(lines.map(line => line.balance.normalized))
    if (balances.size > 1) {
      findings.push({
        classification: rule.classification,
        title: 'Bureau balances differ',
        severity: 'medium',
        confidence: Math.min(...lines.map(line => line.balance.confidence)),
        evidence: lines.map(line => ({ tradelineId: line.id, field: 'balance', value: line.balance.normalized ?? 0, source: line.balance.source })),
        limitations: rule.limitations,
        alternativeExplanations: ['Bureaus may have received updates on different dates'],
        verificationDocuments: ['Recent creditor statement'],
        authorityIds: rule.authorityIds,
        educationModuleIds: rule.educationModuleIds,
        suggestedAction: 'Compare the displayed dates and verify the current balance with the creditor',
      })
      audits.push({ ruleId: rule.id, outcome: 'triggered', reason: 'Comparable balances differ' })
    } else {
      audits.push({ ruleId: rule.id, outcome: 'skipped', reason: 'Comparable balances agree' })
    }
  }
  return { audits, findings }
}
registerRuleEvaluator('cross-bureau-balance-difference', crossBureauBalanceDifference)

export type AnalysisInput = {
  rules: EvaluableRule[]
  tradelines: EvaluableTradeline[]
  confirmedMatches: MatchRef[]
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
    const { audits, findings } = evaluator({ rule, tradelinesById, confirmedMatches: input.confirmedMatches })
    audit.push(...audits)
    rawFindings.push(...findings)
  }

  // Deterministic deduplication: findings sharing the same evidence signature
  // (tradelineId + value, sorted) and thus the same consumer action are grouped.
  const signature = (evidence: Evidence[]) => JSON.stringify(evidence.map(item => [item.tradelineId, item.value]).sort())
  const findings: Finding[] = []
  const seen = new Set<string>()
  for (const candidate of rawFindings) {
    const sig = signature(candidate.evidence)
    if (seen.has(sig)) continue
    seen.add(sig)
    findings.push({ ...candidate, id: randomUUID() })
  }

  return { id: randomUUID(), findings, audit, versions: input.versions, createdAt: new Date().toISOString() }
}

export type { Severity }
