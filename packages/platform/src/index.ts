import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import { applicationVersion } from '../../domain/src/index.js'
import { evaluateAnalysis, SEVERITY_RANK, namesAgree, datesOfBirthAgree } from '../../analysis-core/src/index.js'
import type { AttestedIdentity, EvaluableIdentityValue, ReportedIdentity } from '../../analysis-core/src/index.js'
import { redactReportText } from '../../redaction/src/index.js'
import { assertSafeConsumerOutput, type NarrationEvaluation } from '../../output-guard/src/index.js'
import { parseIdentityIqPdfBytes, normalizeAddressForComparison } from '../../parser/src/index.js'
import type { ParserReport, ParserValue } from '../../parser/src/index.js'
import type { AccessibilityEvidenceReport } from '../../../apps/web/src/accessibility-report.js'
import type { ComprehensionEvidenceReport } from '../../../apps/web/src/comprehension-report.js'
import { InMemoryStore, InMemoryBlobStore, randomInviteCode, type PlatformStore, type BlobStore } from './store.js'
import type {
  Id, Jurisdiction, Bureau, Consent, AuthorizationRecord, LaunchScope, User, Session, Workspace,
  UploadStage, Upload, CanonicalValue, Tradeline, CanonicalReport, GovernanceStatus, GovernanceHistory,
  Authority, EducationModule, EducationModuleKind, ReviewedGovernanceCatalog, ReviewerRole, Reviewer, Rule, MatchGroup, Analysis, ActionItem,
  ReportFinding, CoverageRow, ParserFieldAvailability, ReportContent, ConsumerReport, ExportArtifact, DeletionJob, AuditEvent, PilotApprovalArea, PilotApproval, PilotGate,
  ReportScoreRow, ReportInquiryRow, Inquiry, CanonicalScore, ConsumerValueReview, ConsumerReviewValue,
  PilotDrillResult, PilotDrill, PilotDrillEvidenceGap, PilotDrillEvidenceReport, PilotEvidenceSummary,
  PilotApprovalRecordFile, QualityLatencySummary, QualityFindingSummary, QualityMatchingSummary,
  QualityParserSummary, QualityReportSegment, QualityReport, ReportPresentationProfile, ReportRecipient, ReportAccountRow,
  ConsumerIdentity, PostalAddress, ReportSummary, ReportIdentityRow, ReimportDiff, ReimportAccountRef,
  ReportNegativeItemSummary, ReportUtilizationSummary, ReimportFieldChange, RuleAudit,
} from './entities.js'

export type {
  Id, Jurisdiction, Bureau, Consent, AuthorizationRecord, LaunchScope, User, Session, Workspace,
  UploadStage, Upload, CanonicalValue, Tradeline, CanonicalReport, GovernanceStatus, GovernanceHistory,
  Authority, EducationModule, EducationModuleKind, ReviewedGovernanceCatalog, ReviewerRole, Reviewer, Rule, MatchGroup, Analysis, ActionItem,
  ReportFinding, CoverageRow, ParserFieldAvailability, ReportContent, ConsumerReport, ExportArtifact, DeletionJob, AuditEvent, PilotApprovalArea, PilotApproval, PilotGate,
  ReportScoreRow, ReportInquiryRow, Inquiry, CanonicalScore,
  PilotDrillResult, PilotDrill, PilotDrillEvidenceGap, PilotDrillEvidenceReport, PilotEvidenceSummary,
  PilotApprovalRecordFile, QualityLatencySummary, QualityFindingSummary, QualityMatchingSummary,
  QualityParserSummary, QualityReportSegment, QualityReport, ReportPresentationProfile, ReportRecipient, ReportAccountRow,
  ConsumerIdentity, PostalAddress, ReportSummary, ReportIdentityRow, ReimportDiff, ReimportAccountRef,
  ReportNegativeItemSummary, ReportUtilizationSummary,
}
export type { Finding, FindingClassification, RuleAudit, SourceReference } from './entities.js'
export type { PlatformStore, BlobStore } from './store.js'
export { InMemoryStore, InMemoryBlobStore, randomInviteCode } from './store.js'

/** FCRA counsel Q-L3 (ticket 12): standalone written authorization the consumer expressly accepts before any processing. */
export const AUTHORIZATION_VERSION = 'authorization-2026-01'
export const AUTHORIZATION_TEXT = [
  'I authorize this service to do the following with the credit report I upload, for my personal educational use only:',
  '1. Receive the report I provide and parse/analyze it to produce educational Findings.',
  '2. Temporarily store the report under the disclosed retention policy, then delete it on schedule or on my request.',
  '3. Return the Findings only to me — never to lenders, landlords, employers, insurers, brokers, attorneys, or credit-repair businesses.',
  '4. Refrain from selling, sharing, advertising against, or training models on my report data.',
  'This is a free pilot: no payment, no data sale, no advertising. This is educational information only, is not legal advice, and creates no attorney-client relationship.',
].join('\n')

/**
 * Intake attestation. The consumer declares that the identity details they entered are their own
 * and accurate. This is deliberately separate from AUTHORIZATION_TEXT (which governs what we may
 * do with the report) and from Consent (which governs eligibility): it governs the accuracy of
 * the reference values every identity comparison is measured against.
 */
export const IDENTITY_ATTESTATION_VERSION = 'identity-attestation-2026-08'
export const IDENTITY_ATTESTATION_TEXT = [
  'I declare the following about the identity details I have entered:',
  '1. They are my own. I am not entering another person’s identity details.',
  '2. They are accurate and complete to the best of my knowledge.',
  '3. I understand this reading compares these details against what my report displays, and that a difference is an observation for me to verify — not a conclusion that anything is wrong.',
  '4. I understand that entering inaccurate details will produce an inaccurate reading.',
  'Only the last four digits of a Social Security number are ever requested. Do not enter a full Social Security number anywhere in this service.',
].join('\n')

/** FCRA counsel Q-L4 (ticket 12): disclosed retention minimization. */
export const RETENTION_POLICY = {
  originalsMaxDays: 30,
  deletionControl: 'Consumer-initiated deletion available at any time via requestDeletion.',
  description: 'Uploaded reports are retained only as long as operationally necessary to deliver the analysis (at most 30 days), then deleted. Analysis artifacts are deleted on consumer request.',
} as const

/** D10 session hardening: idle timeout invalidates an inactive session even within the absolute window; the absolute cap forces re-authentication regardless of activity. */
export const SESSION_IDLE_TTL_MS = 24 * 60 * 60 * 1000
export const SESSION_ABSOLUTE_TTL_MS = 30 * 24 * 60 * 60 * 1000
/** D10 password-reset / email-verification token lifetime. */
export const TOKEN_TTL_MS = 60 * 60 * 1000

const now = () => new Date().toISOString()
const DEFAULT_REPORT_PRESENTATION: ReportPresentationProfile = {
  revision: 1,
  organizationName: 'Golden Audit',
  accent: 'gold',
  printStyle: 'standard',
}
const PRESENTATION_STRING_FIELDS = ['organizationName', 'preparedByLabel', 'preparedByTitle', 'logoUrl', 'supportEmail', 'websiteUrl', 'supportPhone', 'mailingAddress', 'reportTitle', 'reportSubtitle', 'closingNote'] as const
const OPTIONAL_PRESENTATION_FIELDS = new Set<string>(PRESENTATION_STRING_FIELDS.filter(field => field !== 'organizationName'))

function presentationSnapshot(profile: ReportPresentationProfile | undefined): ReportPresentationProfile {
  return structuredClone(profile ?? DEFAULT_REPORT_PRESENTATION)
}

function validateOptionalUrl(value: string, field: 'logoUrl' | 'websiteUrl'): void {
  if (!value) return
  let parsed: URL
  try { parsed = new URL(value) } catch { throw new Error(`${field} must be a valid HTTPS URL`) }
  if (parsed.protocol !== 'https:') throw new Error(`${field} must be a valid HTTPS URL`)
}

function validateReportPresentationProfile(input: Partial<ReportPresentationProfile>, current: ReportPresentationProfile | undefined, actorId: Id): ReportPresentationProfile {
  const allowedKeys = new Set<string>([...PRESENTATION_STRING_FIELDS, 'accent', 'printStyle'])
  if (Object.keys(input).some(key => !allowedKeys.has(key))) throw new Error('Profile contains an unsupported field')
  const profile: ReportPresentationProfile = { ...presentationSnapshot(current), ...input, revision: (current?.revision ?? 0) + 1, updatedAt: now(), updatedBy: actorId }
  for (const field of PRESENTATION_STRING_FIELDS) {
    const value = profile[field]
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (!trimmed && OPTIONAL_PRESENTATION_FIELDS.has(field)) { delete profile[field]; continue }
    if (!trimmed) throw new Error('organizationName is required')
    if (trimmed.length > 500) throw new Error(`${field} exceeds its allowed length`)
    assertSafeConsumerOutput(trimmed)
    profile[field] = trimmed
  }
  if (!profile.organizationName) throw new Error('organizationName is required')
  if (profile.supportEmail && !/^\S+@\S+\.\S+$/.test(profile.supportEmail)) throw new Error('supportEmail must be valid')
  if (profile.logoUrl) validateOptionalUrl(profile.logoUrl, 'logoUrl')
  if (profile.websiteUrl) validateOptionalUrl(profile.websiteUrl, 'websiteUrl')
  if (!['gold', 'charcoal', 'sage'].includes(profile.accent)) throw new Error('accent is invalid')
  if (!['standard', 'compact'].includes(profile.printStyle)) throw new Error('printStyle is invalid')
  return profile
}
const hashPassword = (password: string, salt: string) => scryptSync(password, salt, 32).toString('hex')
const maskAccount = (value: string) => `••••${value.replace(/\D/g, '').slice(-4)}`

const US_STATE_CODE = /^[A-Z]{2}$/
const POSTAL_CODE = /^\d{5}(-\d{4})?$/
/** Latin letters (incl. accented), spaces, apostrophes, hyphens and periods. Digits are rejected —
 *  a digit in a legal name is always a paste error or an address fragment in the wrong box. */
const PERSON_NAME = /^[\p{L}][\p{L} '.-]{0,98}[\p{L}.]$/u

function requireText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string') throw new Error(`${field} is required`)
  const trimmed = value.trim().replace(/\s+/g, ' ')
  if (!trimmed) throw new Error(`${field} is required`)
  if (trimmed.length > maxLength) throw new Error(`${field} exceeds its allowed length`)
  return trimmed
}

function validatePostalAddress(input: unknown, label: string): PostalAddress {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error(`${label} is required`)
  const record = input as Record<string, unknown>
  const line2Raw = record.line2 === undefined || record.line2 === null ? '' : requireText(record.line2, `${label} line 2`, 100)
  // Validated for shape before length, so entering "California" reports the actual problem
  // rather than an unhelpful "exceeds its allowed length".
  const state = requireText(record.state, `${label} state`, 40).toUpperCase()
  if (!US_STATE_CODE.test(state)) throw new Error(`${label} state must be a two-letter US state code`)
  const postalCode = requireText(record.postalCode, `${label} ZIP code`, 10)
  if (!POSTAL_CODE.test(postalCode)) throw new Error(`${label} ZIP code must be five digits, optionally with a four-digit extension`)
  return {
    line1: requireText(record.line1, `${label} street address`, 100),
    ...(line2Raw ? { line2: line2Raw } : {}),
    city: requireText(record.city, `${label} city`, 60),
    state, postalCode,
  }
}

/** Full-day age at `asOf`, computed on UTC calendar parts so a birthday is not gained or lost to
 *  timezone offset or to leap-year arithmetic on a fractional-year approximation. */
function ageInYears(dateOfBirth: string, asOf: Date): number {
  const born = new Date(`${dateOfBirth}T00:00:00.000Z`)
  let age = asOf.getUTCFullYear() - born.getUTCFullYear()
  const monthDelta = asOf.getUTCMonth() - born.getUTCMonth()
  if (monthDelta < 0 || (monthDelta === 0 && asOf.getUTCDate() < born.getUTCDate())) age -= 1
  return age
}

function validateDateOfBirth(input: unknown): string {
  const value = requireText(input, 'Date of birth', 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Date of birth must use the YYYY-MM-DD format')
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error('Date of birth is not a real calendar date')
  const age = ageInYears(value, new Date())
  // Mirrors the Consent adultUSConsumer acknowledgement: the pilot is adults-only, so an
  // under-18 date of birth is a contradiction with an attestation already on record, not a typo
  // to normalize away.
  if (age < 18) throw new Error('This pilot is available to adults only')
  if (age > 120) throw new Error('Date of birth is out of range')
  return value
}

export function formatPostalAddress(address: PostalAddress): string {
  return [address.line1, address.line2, `${address.city} ${address.state} ${address.postalCode}`].filter(Boolean).join(' ')
}

function validateSsnLastFour(input: unknown): string {
  const value = requireText(input, 'Last four digits of your Social Security number', 12).replace(/[\s-]/g, '')
  // A full or partial-but-longer number reaching this field is a data-entry hazard we refuse
  // rather than silently truncate — truncating would store the fragment while having already
  // accepted (and logged the shape of) more than we ever intend to hold.
  if (value.length > 4) throw new Error('Enter only the last four digits of your Social Security number')
  if (!/^\d{4}$/.test(value)) throw new Error('Last four digits must be exactly four digits')
  if (value === '0000') throw new Error('Last four digits cannot be 0000')
  return value
}

/** Long digit runs are masked in place rather than by collapsing the whole string to its last four
 *  digits: identity findings put street addresses and dates into evidence, and the collapsing form
 *  turned "123 MAIN ST SPRINGFIELD CA 90210" into "••••0210". The threshold sits above ZIP and
 *  ZIP+4 segment lengths and below any real account-number length; a bare nine-digit run would
 *  otherwise be rejected outright by the identifier guard that runs after this. */
const EXPORT_DIGIT_RUN_MASK_THRESHOLD = 7
function maskExportValue(value: unknown): unknown {
  if (typeof value === 'string') {
    const safe = value.replace(/No legal verdict/gi, 'No individual legal conclusion').replace(/legal violation/gi, 'legal conclusion')
    return safe.replace(new RegExp(`\\d{${EXPORT_DIGIT_RUN_MASK_THRESHOLD},}`, 'g'), run => `••••${run.slice(-4)}`)
  }
  if (Array.isArray(value)) return value.map(maskExportValue)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, maskExportValue(item)]))
  return value
}
function sourceLinkedAccountRows(tradelines: Tradeline[]): ReportAccountRow[] {
  const fields: Array<{ key: keyof Pick<Tradeline, 'creditor' | 'accountType' | 'status' | 'balance' | 'creditLimit' | 'pastDue' | 'opened' | 'updated' | 'dateOfFirstDelinquency'>; label: string }> = [
    { key: 'creditor', label: 'Creditor' },
    { key: 'accountType', label: 'Account type' },
    { key: 'status', label: 'Status' },
    { key: 'balance', label: 'Balance' },
    { key: 'creditLimit', label: 'Credit limit / high credit' },
    { key: 'pastDue', label: 'Past due' },
    { key: 'opened', label: 'Date opened' },
    { key: 'updated', label: 'Last reported' },
    { key: 'dateOfFirstDelinquency', label: 'Date of first delinquency' },
  ]
  return tradelines.map(line => ({
    id: line.id,
    bureau: line.creditor.bureau,
    cells: fields.flatMap(({ key, label }) => {
      const value = line[key]
      if (value.state !== 'known' || value.normalized === null || !value.source.locator) return []
      const display = typeof value.normalized === 'number' && value.currency === 'USD'
        ? (value.normalized / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
        : String(value.normalized)
      return [{ label, value: display, source: { kind: value.source.kind, locator: value.source.locator } }]
    }),
  }))
}

function sourceLinkedScoreRows(scores: CanonicalScore[]): ReportScoreRow[] {
  return scores.flatMap(score => {
    if (score.state !== 'known' || score.normalized === null || !score.source.locator || score.scale.state !== 'known' || !score.scale.normalized || !score.scale.source.locator) return []
    return [{ bureau: score.bureau, score: score.normalized, scoreScale: score.scale.originalDisplay || score.scale.normalized, source: { kind: score.source.kind, locator: score.source.locator }, scaleSource: { kind: score.scale.source.kind, locator: score.scale.source.locator } }]
  })
}

function sourceLinkedInquiryRows(inquiries: Inquiry[]): ReportInquiryRow[] {
  return inquiries.flatMap(inquiry => {
    if (inquiry.creditor.state !== 'known' || !inquiry.creditor.normalized || inquiry.date.state !== 'known' || !inquiry.date.normalized || !inquiry.creditor.source.locator) return []
    return [{ id: inquiry.id, bureau: inquiry.bureau, creditor: inquiry.creditor.originalDisplay || inquiry.creditor.normalized, ...(inquiry.businessType.state === 'known' && inquiry.businessType.normalized ? { businessType: inquiry.businessType.originalDisplay || inquiry.businessType.normalized } : {}), date: inquiry.date.normalized, source: { kind: inquiry.creditor.source.kind, locator: inquiry.creditor.source.locator } }]
  })
}

/**
 * Groups per-bureau tradeline entries into logical accounts.
 *
 * Every count in the audit summary is per account, not per entry: one credit card furnished to
 * three bureaus is one account, and reporting it as three would inflate every total on the
 * summary by roughly 3x. Confirmed match groups define the grouping; an entry in no confirmed
 * group is its own account, which is the conservative reading — it can only ever split an
 * account apart, never merge two real accounts into one.
 */
function logicalAccounts(tradelines: Tradeline[], confirmedMatches: MatchGroup[]): Tradeline[][] {
  const byId = new Map(tradelines.map(line => [line.id, line]))
  const grouped: Tradeline[][] = []
  const claimed = new Set<Id>()
  for (const match of confirmedMatches) {
    const lines = match.tradelineIds.map(id => byId.get(id)).filter((line): line is Tradeline => line !== undefined && !claimed.has(line.id))
    if (lines.length === 0) continue
    for (const line of lines) claimed.add(line.id)
    grouped.push(lines)
  }
  for (const line of tradelines) if (!claimed.has(line.id)) grouped.push([line])
  return grouped
}

const DEROGATORY_STATUS = /charge[\s-]?off|charged[\s-]?off|collection|repossess|foreclos|settled|derogatory|delinquen|default|past due|write[\s-]?off/i
const COLLECTION_ACCOUNT = /collection/i
const REVOLVING_ACCOUNT = /revolving|credit\s*card|charge\s*account/i

function knownNumber(value: CanonicalValue<number>): number | null {
  return value.state === 'known' && typeof value.normalized === 'number' ? value.normalized : null
}
function knownText(value: CanonicalValue<string>): string | null {
  return value.state === 'known' && typeof value.normalized === 'string' && value.normalized ? value.normalized : null
}

/**
 * The top-of-report audit summary.
 *
 * Where bureaus disagree on a money field for the same account, the highest reported value is
 * used and the report says so. Averaging would invent a figure no bureau reported; taking the
 * lowest would understate what a reader is actually being shown. None of these totals is a score
 * input, a projection, or a claim that any entry is wrong.
 */
function buildReportSummary(args: {
  report: CanonicalReport
  confirmedMatches: MatchGroup[]
  findings: ReportFinding[]
}): ReportSummary {
  const { report, confirmedMatches, findings } = args
  const accounts = logicalAccounts([...report.tradelines, ...report.collections], confirmedMatches)
  const accountsByBureau: Partial<Record<Bureau, number>> = {}
  for (const line of report.tradelines) accountsByBureau[line.creditor.bureau] = (accountsByBureau[line.creditor.bureau] ?? 0) + 1

  let openAccounts = 0, closedAccounts = 0
  let collections = 0, pastDueAccounts = 0, derogatoryStatusAccounts = 0, statusUnavailable = 0, negativeTotal = 0
  let totalBalanceCents = 0, totalPastDueCents = 0
  let anyBalance = false, anyPastDue = false
  let revolvingBalanceCents = 0, revolvingLimitCents = 0, revolvingCounted = 0, revolvingWithoutLimit = 0

  for (const entries of accounts) {
    const statuses = entries.map(line => knownText(line.status)).filter((value): value is string => value !== null)
    const types = entries.map(line => knownText(line.accountType)).filter((value): value is string => value !== null)
    const balances = entries.map(line => knownNumber(line.balance)).filter((value): value is number => value !== null)
    const pastDues = entries.map(line => knownNumber(line.pastDue)).filter((value): value is number => value !== null)
    const limits = entries.map(line => knownNumber(line.creditLimit)).filter((value): value is number => value !== null)

    if (statuses.length === 0) statusUnavailable += 1
    else if (statuses.some(status => /open|current/i.test(status))) openAccounts += 1
    else if (statuses.some(status => /closed|paid/i.test(status))) closedAccounts += 1

    if (balances.length > 0) { totalBalanceCents += Math.max(...balances); anyBalance = true }
    if (pastDues.length > 0) { totalPastDueCents += Math.max(...pastDues); anyPastDue = true }

    const isCollection = types.some(type => COLLECTION_ACCOUNT.test(type)) || statuses.some(status => COLLECTION_ACCOUNT.test(status))
    const isPastDue = pastDues.some(value => value > 0)
    const isDerogatory = statuses.some(status => DEROGATORY_STATUS.test(status))
    if (isCollection) collections += 1
    if (isPastDue) pastDueAccounts += 1
    if (isDerogatory) derogatoryStatusAccounts += 1
    if (isCollection || isPastDue || isDerogatory) negativeTotal += 1

    if (types.some(type => REVOLVING_ACCOUNT.test(type))) {
      if (limits.length > 0 && balances.length > 0) {
        revolvingBalanceCents += Math.max(...balances)
        revolvingLimitCents += Math.max(...limits)
        revolvingCounted += 1
      } else if (balances.length > 0) revolvingWithoutLimit += 1
    }
  }

  const crossBureauInconsistencies = findings.filter(finding => /^The bureaus |^Bureau /.test(finding.title)).length
  const identityObservations = findings.filter(finding => finding.evidence.some(item => item.subject === 'identity')).length

  return {
    accountsRead: accounts.length,
    accountsByBureau,
    openAccounts,
    closedAccounts,
    negativeItems: { total: negativeTotal, collections, pastDueAccounts, derogatoryStatusAccounts, statusUnavailable },
    crossBureauInconsistencies,
    identityObservations,
    inquiriesRead: report.inquiries.length,
    totalBalanceCents: anyBalance ? totalBalanceCents : null,
    totalPastDueCents: anyPastDue ? totalPastDueCents : null,
    utilization: {
      revolvingBalanceCents, revolvingLimitCents,
      ratio: revolvingCounted > 0 && revolvingLimitCents > 0 ? revolvingBalanceCents / revolvingLimitCents : null,
      accountsCounted: revolvingCounted,
      accountsWithoutLimit: revolvingWithoutLimit,
    },
  }
}

/** Personal-information entries as displayed, each labeled with whether it matched the identity
 *  the consumer attested to. `not-compared` covers both "nothing attested" and "unreadable". */
function buildIdentityRows(report: CanonicalReport, attested: AttestedIdentity | undefined): ReportIdentityRow[] {
  const rows: ReportIdentityRow[] = []
  const add = (value: CanonicalValue<string>, match: ReportIdentityRow['attestationMatch']) => {
    if (!value.source.locator) return
    rows.push({ id: value.id, bureau: value.bureau, field: value.field, value: value.originalDisplay || String(value.normalized ?? ''), attestationMatch: match, source: { kind: value.source.kind, locator: value.source.locator } })
  }
  const stringValues = (values: CanonicalValue<unknown>[]) => values.filter((value): value is CanonicalValue<string> => typeof value.normalized !== 'number')
  for (const value of stringValues(report.identity)) {
    const normalized = knownText(value)
    if (!attested || normalized === null) { add(value, 'not-compared'); continue }
    if (value.field === 'name') add(value, namesAgree(attested.fullName, normalized) ? 'matches-attested' : 'differs-from-attested')
    else if (value.field === 'dateOfBirth') add(value, datesOfBirthAgree(attested.dateOfBirth, normalized) ? 'matches-attested' : 'differs-from-attested')
    else if (value.field === 'ssnLastFour') add(value, normalized === attested.ssnLastFour ? 'matches-attested' : 'differs-from-attested')
    else add(value, 'not-compared')
  }
  for (const value of stringValues(report.addresses)) {
    const normalized = knownText(value)
    if (!attested || normalized === null) { add(value, 'not-compared'); continue }
    add(value, attested.addressKeys.includes(normalizeAddressForComparison(normalized)) ? 'matches-attested' : 'differs-from-attested')
  }
  for (const value of stringValues(report.employers)) add(value, 'not-compared')
  return rows
}

const REIMPORT_TRACKED_FIELDS: ReadonlyArray<{ key: 'balance' | 'creditLimit' | 'pastDue'; label: string } | { key: 'status' | 'opened' | 'updated' | 'dateOfFirstDelinquency'; label: string }> = [
  { key: 'balance', label: 'Balance' },
  { key: 'creditLimit', label: 'Credit limit / high credit' },
  { key: 'pastDue', label: 'Past due' },
  { key: 'status', label: 'Status' },
  { key: 'opened', label: 'Date opened' },
  { key: 'updated', label: 'Last reported' },
  { key: 'dateOfFirstDelinquency', label: 'Date of first delinquency' },
]

const accountKey = (line: Tradeline): string => `${(knownText(line.creditor) ?? '').toLowerCase()}|${knownText(line.maskedAccount) ?? ''}|${line.creditor.bureau}`
const accountRef = (line: Tradeline): ReimportAccountRef => ({ creditor: knownText(line.creditor) ?? 'Unknown creditor', bureau: line.creditor.bureau, maskedAccount: knownText(line.maskedAccount) ?? '' })

function displayFieldValue(line: Tradeline, key: (typeof REIMPORT_TRACKED_FIELDS)[number]['key']): string | null {
  const value = line[key]
  if (value.state !== 'known' || value.normalized === null) return null
  if (typeof value.normalized === 'number') return (value.normalized / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
  return String(value.normalized)
}

/**
 * Diffs this reading against the consumer's previous one.
 *
 * Only fields readable in BOTH reports are compared. A field the parser read last time and could
 * not read this time is not a change in the report — it is a change in what we could see — and
 * presenting it as "Status: Open → (missing)" would report our own extraction gap as movement in
 * the consumer's credit file.
 */
function buildReimportDiff(args: {
  previousConsumerReport: ConsumerReport
  previousReport: CanonicalReport
  currentReport: CanonicalReport
  currentFindings: ReportFinding[]
}): ReimportDiff {
  const { previousConsumerReport, previousReport, currentReport, currentFindings } = args
  const previousLines = new Map(previousReport.tradelines.map(line => [accountKey(line), line]))
  const currentLines = new Map(currentReport.tradelines.map(line => [accountKey(line), line]))

  const newAccounts: ReimportAccountRef[] = []
  const changedAccounts: Array<ReimportAccountRef & { changes: ReimportFieldChange[] }> = []
  for (const [key, line] of currentLines) {
    const previous = previousLines.get(key)
    if (!previous) { newAccounts.push(accountRef(line)); continue }
    const changes: ReimportFieldChange[] = []
    for (const { key: field, label } of REIMPORT_TRACKED_FIELDS) {
      const from = displayFieldValue(previous, field)
      const to = displayFieldValue(line, field)
      if (from === null || to === null || from === to) continue
      changes.push({ field: label, from, to })
    }
    if (changes.length > 0) changedAccounts.push({ ...accountRef(line), changes })
  }
  const removedAccounts = [...previousLines].filter(([key]) => !currentLines.has(key)).map(([, line]) => accountRef(line))

  const previousScores = new Map(previousReport.scores.filter(score => score.state === 'known' && score.normalized !== null).map(score => [score.bureau, score.normalized as number]))
  const scoreChanges = currentReport.scores.flatMap(score => {
    if (score.state !== 'known' || score.normalized === null) return []
    const from = previousScores.get(score.bureau)
    if (from === undefined || from === score.normalized) return []
    return [{ bureau: score.bureau, from, to: score.normalized, delta: score.normalized - from }]
  })

  // Findings carry a fresh id per run, so they are compared by title — the stable, human-readable
  // identity of what was observed.
  const previousTitles = new Set(previousConsumerReport.findings.map(finding => finding.title))
  const currentTitles = new Set(currentFindings.map(finding => finding.title))
  return {
    previousConsumerReportId: previousConsumerReport.id,
    previousGeneratedAt: previousConsumerReport.generatedAt,
    newAccounts, removedAccounts, changedAccounts, scoreChanges,
    findingsResolved: [...previousTitles].filter(title => !currentTitles.has(title)),
    findingsNew: [...currentTitles].filter(title => !previousTitles.has(title)),
    findingsUnchanged: [...currentTitles].filter(title => previousTitles.has(title)).length,
  }
}

function exportProjection(report: ConsumerReport) {
  const safe = maskExportValue({
    overview: report.overview,
    limitations: report.limitations.map(limitation => limitation.replace(/No legal verdict/gi, 'No individual legal conclusion').replace(/legal violation/gi, 'legal conclusion')),
    disclaimer: 'Educational information only; no specific outcome is promised.',
    findings: report.findings,
    content: report.content,
    generatedAt: report.generatedAt,
  })
  return safe
}

export class CreditAnalysisPlatform {
  private authorities = new Map<Id, Authority>()
  private modules = new Map<Id, EducationModule>()
  private rules = new Map<Id, Rule>()
  private publishedRulesets = new Map<string, Rule[]>()
  private publishedAuthorities = new Map<Id, Authority>()
  private publishedModules = new Map<Id, EducationModule>()
  private reviewers = new Map<Id, Reviewer>()
  private pilotApprovals = new Map<PilotApprovalArea, PilotApproval>()
  private pilotDrills: PilotDrill[] = []
  private launchScope: LaunchScope | undefined
  /** Ephemeral latency bookkeeping for quality reporting only — was never part of exportSnapshot
   *  either, so this is not a new cross-request durability gap introduced by the D5 rewrite. */
  private timelineBySubject = new Map<Id, { uploadCompletedAt?: string; reportParsedAt?: string; analysisCreatedAt?: string }>()

  private catalog: ReviewedGovernanceCatalog | undefined

  constructor(
    private store: PlatformStore = new InMemoryStore(),
    private blobStore: BlobStore = new InMemoryBlobStore(),
    catalog?: ReviewedGovernanceCatalog,
    private ownerEmail?: string,
  ) {
    if (catalog) this.installReviewedCatalog(catalog)
  }

  // ------------------------------------------------------------------
  // Accounts / sessions / invites (D10)
  // ------------------------------------------------------------------

  async register(input: { email: string; password: string; inviteCode: string }): Promise<{ userId: Id; sessionId: Id }> {
    if (!/^\S+@\S+\.\S+$/.test(input.email)) throw new Error('A valid email is required')
    if (input.password.length < 12) throw new Error('Password must be at least 12 characters')
    const email = input.email.toLowerCase()
    if (await this.store.getUserByEmail(email)) throw new Error('Account already exists')
    // Mint the id and consume the invite with it BEFORE creating the user: consumeInvite is
    // single-use (atomic at the store layer), so this ordering means a failed/duplicate invite
    // never leaves an orphaned user record, and the invite's recorded usedByUserId is always
    // the real id — never a placeholder that a second call would be unable to correct.
    const userId = randomUUID()
    const consumed = await this.store.consumeInvite(input.inviteCode, userId, now())
    if (!consumed) throw new Error('Invite code is invalid or already used')
    const salt = randomBytes(16).toString('hex')
    const user: User = { id: userId, email, passwordSalt: salt, passwordHash: hashPassword(input.password, salt) }
    await this.store.createUser(user)
    const sessionId = await this.createSession(userId)
    await this.audit('account-registered', userId, userId, {})
    return { userId, sessionId }
  }

  async signIn(input: { email: string; password: string }): Promise<Id> {
    const user = await this.store.getUserByEmail(input.email.toLowerCase())
    if (!user) throw new Error('Invalid credentials')
    const actual = Buffer.from(hashPassword(input.password, user.passwordSalt), 'hex'); const expected = Buffer.from(user.passwordHash, 'hex')
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error('Invalid credentials')
    return this.createSession(user.id)
  }

  private async createSession(userId: Id): Promise<Id> {
    const id = randomUUID(); const at = now()
    const session: Session = { id, userId, csrfToken: randomBytes(24).toString('base64url'), createdAt: at, expiresAt: new Date(Date.now() + SESSION_ABSOLUTE_TTL_MS).toISOString(), lastUsedAt: at }
    await this.store.createSession(session)
    return id
  }
  async signOut(sessionId: Id): Promise<void> { await this.revokeSession(sessionId) }
  async revokeSession(sessionId: Id): Promise<void> {
    const session = await this.store.getSession(sessionId); if (!session) return
    session.revokedAt = now(); await this.store.updateSession(session)
    await this.audit('session-revoked', session.userId, sessionId, {})
  }
  async revokeOtherSessions(sessionId: Id): Promise<void> {
    const actor = await this.requireSession(sessionId)
    for (const session of await this.store.listActiveSessionsForUser(actor)) if (session.id !== sessionId) await this.revokeSession(session.id)
  }

  /** Issues a single-use invite code (invite-only pilot — no HTTP route exposes this; operators mint codes out of band). */
  async issueInvite(): Promise<string> {
    const code = randomInviteCode()
    await this.store.createInvite(code, now())
    return code
  }

  async requestPasswordReset(email: string): Promise<{ email: string; token: string } | undefined> {
    const user = await this.store.getUserByEmail(email.toLowerCase())
    if (!user) return undefined
    const token = randomBytes(24).toString('base64url')
    await this.store.createToken('password-reset', token, user.id, new Date(Date.now() + TOKEN_TTL_MS).toISOString())
    return { email: user.email, token }
  }
  async resetPassword(token: string, newPassword: string): Promise<void> {
    if (newPassword.length < 12) throw new Error('Password must be at least 12 characters')
    const consumed = await this.store.consumeToken('password-reset', token)
    if (!consumed) throw new Error('Reset token is invalid or expired')
    const salt = randomBytes(16).toString('hex')
    await this.store.updateUserPassword(consumed.userId, hashPassword(newPassword, salt), salt)
    // Session rotation on privilege change (D10): a password reset invalidates every existing session.
    for (const session of await this.store.listActiveSessionsForUser(consumed.userId)) await this.revokeSession(session.id)
    await this.audit('password-reset', consumed.userId, consumed.userId, {})
  }

  async requestEmailVerification(sessionId: Id): Promise<{ email: string; token: string }> {
    const userId = await this.requireSession(sessionId)
    const user = await this.store.getUserById(userId)
    if (!user) throw new Error('Account not found')
    const token = randomBytes(24).toString('base64url')
    await this.store.createToken('email-verify', token, userId, new Date(Date.now() + TOKEN_TTL_MS).toISOString())
    return { email: user.email, token }
  }
  async verifyEmail(token: string): Promise<void> {
    const consumed = await this.store.consumeToken('email-verify', token)
    if (!consumed) throw new Error('Verification token is invalid or expired')
    await this.store.markEmailVerified(consumed.userId, now())
    await this.audit('email-verified', consumed.userId, consumed.userId, {})
  }

  async getReportPresentationProfile(sessionId: Id): Promise<ReportPresentationProfile> {
    await this.requireSession(sessionId)
    return presentationSnapshot(await this.store.getReportPresentationProfile())
  }

  async updateReportPresentationProfile(sessionId: Id, csrfToken: string, expectedRevision: number, input: Partial<ReportPresentationProfile>): Promise<ReportPresentationProfile> {
    const actorId = await this.requireSessionWithCsrf(sessionId, csrfToken)
    await this.requireOwnerSession(sessionId)
    const current = await this.store.getReportPresentationProfile()
    const currentSnapshot = presentationSnapshot(current)
    if (expectedRevision !== currentSnapshot.revision) throw new Error('Profile has changed; refresh and try again')
    const profile = validateReportPresentationProfile(input, current, actorId)
    await this.store.saveReportPresentationProfile(profile)
    await this.audit('report-presentation-profile-updated', actorId, 'report-presentation-profile', { previousRevision: String(currentSnapshot.revision), revision: String(profile.revision) })
    return structuredClone(profile)
  }

  async getAdminDashboard(sessionId: Id): Promise<{ profile: ReportPresentationProfile; csrfToken: string }> {
    await this.requireOwnerSession(sessionId)
    const session = await this.store.getSession(sessionId)
    if (!session) throw new Error('Authentication required')
    return { profile: presentationSnapshot(await this.store.getReportPresentationProfile()), csrfToken: session.csrfToken }
  }

  // ------------------------------------------------------------------
  // Consent / authorization
  // ------------------------------------------------------------------

  async recordConsent(sessionId: Id, input: Omit<Consent, 'acceptedAt'>): Promise<Workspace> {
    const userId = await this.requireSession(sessionId)
    if (!input.adultUSConsumer || !input.authorizedReportUse || !input.educationalLimitations || !input.sensitiveDataHandling) throw new Error('All required acknowledgements are required')
    if (!this.launchScope) throw new Error('Launch scope is not configured for the pilot')
    if (!this.launchScope.approvedStates.includes(input.residence) || !this.launchScope.approvedStates.includes(input.analysisJurisdiction)) throw new Error('Jurisdiction is not enabled for the pilot')
    const user = await this.store.getUserById(userId); if (!user) throw new Error('User not found')
    const consent: Consent = { ...input, acceptedAt: now() }
    await this.store.updateUserConsent(userId, consent)
    const workspace: Workspace = { id: randomUUID(), userId, createdAt: now() }
    await this.store.createWorkspace(workspace)
    await this.audit('consent-recorded', userId, workspace.id, { version: input.version, jurisdiction: input.analysisJurisdiction })
    return workspace
  }

  async acceptAuthorization(sessionId: Id, acknowledgement: { version: string; accepted: boolean } = { version: AUTHORIZATION_VERSION, accepted: true }): Promise<AuthorizationRecord> {
    const userId = await this.requireSession(sessionId)
    if (!acknowledgement.accepted || acknowledgement.version !== AUTHORIZATION_VERSION) throw new Error('Current written authorization must be affirmatively accepted')
    const record: AuthorizationRecord = { id: randomUUID(), userId, version: AUTHORIZATION_VERSION, acceptedAt: now() }
    await this.store.createAuthorization(record)
    await this.audit('authorization-accepted', userId, record.id, { version: AUTHORIZATION_VERSION })
    return structuredClone(record)
  }
  async getAuthorization(sessionId: Id): Promise<AuthorizationRecord> {
    const userId = await this.requireSession(sessionId)
    const record = await this.store.getAuthorizationByUser(userId)
    if (!record) throw new Error('No written authorization on record')
    return structuredClone(record)
  }

  // ------------------------------------------------------------------
  // Attested identity (intake)
  // ------------------------------------------------------------------

  /**
   * Records the consumer's own identity details plus the accuracy attestation.
   *
   * Re-submitting replaces the record and re-stamps the attestation: identity legitimately
   * changes (marriage, a move), and a stale reference set would produce variance Findings that
   * are artifacts of our own storage rather than of the report.
   */
  async recordConsumerIdentity(sessionId: Id, input: {
    fullName: unknown; dateOfBirth: unknown; ssnLastFour: unknown
    currentAddress: unknown; previousAddresses?: unknown
    attestationVersion?: unknown; accurateAndComplete?: unknown
  }): Promise<ConsumerIdentity> {
    const userId = await this.requireSession(sessionId)
    if (input.accurateAndComplete !== true) throw new Error('The accuracy declaration must be affirmatively accepted')
    if (input.attestationVersion !== undefined && input.attestationVersion !== IDENTITY_ATTESTATION_VERSION) throw new Error('The current accuracy declaration must be accepted')
    const fullName = requireText(input.fullName, 'Full name', 100)
    if (!PERSON_NAME.test(fullName)) throw new Error('Full name may contain only letters, spaces, apostrophes, hyphens, and periods')
    if (!/\p{L}[\p{L}'.-]*\s+\p{L}/u.test(fullName)) throw new Error('Enter your full name as it appears on your report, including a last name')
    const previousRaw = input.previousAddresses ?? []
    if (!Array.isArray(previousRaw)) throw new Error('Previous addresses must be a list')
    if (previousRaw.length > 10) throw new Error('Enter at most ten previous addresses')
    const identity: ConsumerIdentity = {
      userId, fullName,
      dateOfBirth: validateDateOfBirth(input.dateOfBirth),
      ssnLastFour: validateSsnLastFour(input.ssnLastFour),
      currentAddress: validatePostalAddress(input.currentAddress, 'Current address'),
      previousAddresses: previousRaw.map((address, index) => validatePostalAddress(address, `Previous address ${index + 1}`)),
      attestationVersion: IDENTITY_ATTESTATION_VERSION,
      attestedAt: now(),
    }
    await this.store.saveConsumerIdentity(identity)
    // Audit metadata deliberately carries no identity value — only that an attestation happened.
    await this.audit('consumer-identity-attested', userId, userId, { attestationVersion: identity.attestationVersion, previousAddressCount: String(identity.previousAddresses.length) })
    return structuredClone(identity)
  }

  async getConsumerIdentity(sessionId: Id): Promise<ConsumerIdentity | undefined> {
    const userId = await this.requireSession(sessionId)
    const identity = await this.store.getConsumerIdentity(userId)
    return identity ? structuredClone(identity) : undefined
  }

  getRetentionPolicy(): typeof RETENTION_POLICY { return RETENTION_POLICY }
  getDisclosure() { return { authorizationVersion: AUTHORIZATION_VERSION, authorizationText: AUTHORIZATION_TEXT, retentionPolicy: RETENTION_POLICY, identityAttestationVersion: IDENTITY_ATTESTATION_VERSION, identityAttestationText: IDENTITY_ATTESTATION_TEXT } }
  async getConsumerDashboard(sessionId: Id) {
    const userId = await this.requireSession(sessionId)
    const user = await this.store.getUserById(userId); if (!user) throw new Error('Not found')
    const workspaces = await this.store.listWorkspacesForUser(userId)
    const reports = await this.store.listConsumerReportsForUser(userId)
    // A parsed report with no delivered reading is now only possible when analysis failed part-way
    // (it is no longer a normal resting state — kickoff parses, matches, analyzes, and delivers in
    // one call). Surfacing it lets the consumer resume instead of re-uploading the same document.
    const pending = (await this.store.listReportsForUser(userId)).reverse()
    const analyzedReportIds = new Set((await this.store.listAnalysesForUser(userId)).map(analysis => analysis.reportId))
    const pendingReview = await (async () => {
      for (const candidate of pending) {
        if (analyzedReportIds.has(candidate.id)) continue
        const matches = await this.store.listMatchesByReport(candidate.id)
        const unresolved = matches.filter(match => match.state !== 'confirmed' && match.state !== 'rejected')
        return {
          status: 'match-review-required' as const, reportId: candidate.id, matches: unresolved,
          tradelines: reviewedReportProjection(candidate).tradelines.map(line => ({ id: line.id, bureau: String(line.creditor.bureau), creditor: line.creditor.normalized ?? '', maskedAccount: line.maskedAccount.normalized ?? '', balanceCents: line.balance.normalized ?? null })),
        }
      }
      return null
    })()
    return {
      email: user.email, workspaceId: workspaces[0]?.id ?? null,
      identity: !!(await this.store.getConsumerIdentity(userId)),
      consent: !!user.consent, authorization: !!(await this.store.getAuthorizationByUser(userId)), pendingReview,
      reports: await Promise.all(reports.map(async report => ({ id: report.id, generatedAt: report.generatedAt, findingCount: report.findings.length, parserVersion: report.content?.parserVersion ?? 'legacy', exportId: (await this.store.findExportByReport(userId, report.id))?.id ?? null }))),
    }
  }
  private async requireAuthorization(userId: Id): Promise<void> {
    if (!(await this.store.getAuthorizationByUser(userId))) throw new Error('Written authorization required before processing')
  }

  // ------------------------------------------------------------------
  // Launch scope (operator config — stays in-memory, re-seeded per instantiation)
  // ------------------------------------------------------------------

  configureLaunchScope(input: Omit<LaunchScope, 'configuredAt'>): LaunchScope {
    if (input.mode === 'one-state-free-pilot') {
      if (input.approvedStates.length !== 1) throw new Error('One-state pilot requires exactly one approved state')
      if (!input.provisionalSelectedState || input.provisionalSelectedState !== input.approvedStates[0]) throw new Error('One-state pilot requires a matching provisional selected state')
    }
    if (!input.approvedStates.length && input.mode !== 'launch-paused-pending-review') throw new Error('At least one approved state is required unless launch is paused')
    if (!input.stateSelectionEvidenceReference.trim() || !input.availabilityClaim.trim() || !input.notes.trim()) throw new Error('Launch scope requires evidence, availability claim, and notes')
    const scope: LaunchScope = { ...input, approvedStates: [...new Set(input.approvedStates)], configuredAt: now() }
    this.launchScope = scope
    void this.audit('launch-scope-configured', 'system', scope.provisionalSelectedState ?? 'launch-scope', { mode: scope.mode, approvedStates: scope.approvedStates.join(',') })
    return structuredClone(scope)
  }
  getLaunchScope(): LaunchScope {
    if (!this.launchScope) throw new Error('Launch scope is not configured for the pilot')
    return structuredClone(this.launchScope)
  }

  hydrateLaunchScope(input: PilotApprovalRecordFile): LaunchScope | undefined {
    if (!input.launchScope) return undefined
    const approvedStates = input.launchScope.approvedStates.map(state => state.startsWith('US-') ? state as Jurisdiction : `US-${state}` as Jurisdiction)
    const provisionalSelectedState = input.launchScope.provisionalSelectedState
      ? (input.launchScope.provisionalSelectedState.startsWith('US-') ? input.launchScope.provisionalSelectedState as Jurisdiction : `US-${input.launchScope.provisionalSelectedState}` as Jurisdiction)
      : undefined
    return this.configureLaunchScope({
      mode: input.launchScope.mode,
      approvedStates,
      ...(provisionalSelectedState ? { provisionalSelectedState } : {}),
      stateSelectionEvidenceReference: input.launchScope.stateSelectionEvidenceReference,
      availabilityClaim: input.launchScope.availabilityClaim,
      pricingMode: input.launchScope.pricingMode,
      nationwideStatus: input.launchScope.nationwideStatus,
      notes: input.launchScope.notes,
    })
  }

  loadPilotApprovals(input: PilotApprovalRecordFile): { launchScope?: LaunchScope; approvalsLoaded: number; fixtureOnly: boolean } {
    const scope = this.hydrateLaunchScope(input)
    const fixtureOnly = input.scope === 'test-fixture-only' || /fixture/i.test(input.status) || /not approvals?/i.test(input._warning ?? '')
    if (fixtureOnly) return { ...(scope ? { launchScope: scope } : {}), approvalsLoaded: 0, fixtureOnly }
    let approvalsLoaded = 0
    for (const approval of input.approvals) {
      this.recordPilotApproval({ area: approval.area, approver: approval.approver, evidenceReference: approval.evidenceReference })
      approvalsLoaded += 1
    }
    return { ...(scope ? { launchScope: scope } : {}), approvalsLoaded, fixtureOnly }
  }

  // ------------------------------------------------------------------
  // Uploads / parsing
  // ------------------------------------------------------------------

  async getWorkspace(sessionId: Id, workspaceId: Id): Promise<Workspace> {
    const userId = await this.requireSession(sessionId)
    const workspace = await this.store.getWorkspace(workspaceId)
    if (!workspace || workspace.userId !== userId) throw new Error('Not found')
    return structuredClone(workspace)
  }

  async initializeUpload(sessionId: Id, workspaceId: Id, ttlMs = 300_000): Promise<Upload> {
    const userId = await this.requireSession(sessionId)
    const workspace = await this.getWorkspace(sessionId, workspaceId)
    const user = await this.store.getUserById(userId)
    if (!user?.consent) throw new Error('Consent gate incomplete')
    // Identity is required before, not after, a report is read: the reference set has to exist at
    // analysis time or the identity checks silently skip, and a consumer who supplied it only
    // afterwards would get a reading that quietly covered less than the next person's.
    if (!(await this.store.getConsumerIdentity(userId))) throw new Error('Identity details and the accuracy declaration are required before uploading a report')
    const upload: Upload = { id: randomUUID(), userId, workspaceId: workspace.id, token: randomBytes(24).toString('base64url'), tokenExpiresAt: new Date(Date.now() + ttlMs).toISOString(), stage: 'initialized' }
    await this.store.saveUpload(upload)
    return structuredClone(upload)
  }

  async completeUpload(input: { uploadId: Id; token: string; fileName: string; mediaType: string; bytes: Uint8Array }): Promise<Upload> {
    const upload = await this.store.getUpload(input.uploadId)
    if (!upload || upload.token !== input.token) throw new Error('Upload authorization invalid')
    if (Date.parse(upload.tokenExpiresAt) <= Date.now()) throw new Error('Upload authorization expired')
    if (upload.completedAt) return structuredClone(upload)
    await this.requireAuthorization(upload.userId) // FCRA counsel Q-L3: written authorization required before any processing
    upload.stage = 'scanning'
    const content = Buffer.from(input.bytes); const lowerName = input.fileName.toLowerCase(); const isPdf = input.mediaType === 'application/pdf' && lowerName.endsWith('.pdf') && content.subarray(0, 5).toString() === '%PDF-'
    const isHtml = input.mediaType === 'text/html' && lowerName.endsWith('.html') && /^\s*<(?:!doctype html|html)/i.test(content.toString('utf8'))
    if (!isPdf && !isHtml) return this.failUpload(upload, 'final-failure', 'Unsupported or mismatched report format')
    if (content.byteLength > 5_000_000) return this.failUpload(upload, 'final-failure', 'Report exceeds processing limits')
    if (/\/Encrypt\b/i.test(content.toString('latin1'))) return this.failUpload(upload, 'final-failure', 'Password-protected PDFs are not supported')
    // The EICAR/script/iframe/URL guard is an HTML-injection defense; it must not run on raw PDF bytes
    // (binary PDFs legitimately contain URL-like byte sequences). PDF structural safety is covered above.
    if (!isPdf) { const raw = content.toString('utf8'); if (/EICAR|<script|javascript:|<iframe|https?:\/\//i.test(raw)) return this.failUpload(upload, 'quarantined', 'The report could not be processed safely', 'unsafe') }
    const sourceHash = createHash('sha256').update(content).digest('hex'); const hashKey = `${upload.userId}:${sourceHash}`
    const existingId = await this.store.getUploadIdByHash(hashKey)
    if (existingId && existingId !== upload.id) { const existing = await this.store.getUpload(existingId); return structuredClone(existing ?? upload) }
    upload.fileName = input.fileName; upload.mediaType = isPdf ? 'application/pdf' : 'text/html'; upload.size = content.byteLength; upload.sourceHash = sourceHash; upload.scanResult = 'clean'; upload.retentionClass = 'consumer-report'; upload.stage = 'ready-to-parse'
    if (isPdf) { await this.blobStore.put(upload.id, content) } else { const raw = content.toString('utf8'); const sanitized = raw.replace(/<script[\s\S]*?<\/script>/gi, ''); const { redacted, redactions } = redactReportText(sanitized); upload.sanitizedContent = redacted; upload.redactionCount = redactions }
    upload.completedAt = now()
    await this.store.saveUpload(upload, hashKey)
    this.recordTimestamp(upload.id, { uploadCompletedAt: upload.completedAt })
    await this.audit('upload-completed', upload.userId, upload.id, { mediaType: upload.mediaType, sourceHash })
    return structuredClone(upload)
  }

  private async failUpload(upload: Upload, stage: UploadStage, message: string, scanResult?: 'unsafe'): Promise<Upload> {
    upload.stage = stage; upload.failureMessage = message; if (scanResult) upload.scanResult = scanResult
    await this.store.saveUpload(upload)
    await this.audit(stage === 'quarantined' ? 'upload-quarantined' : 'upload-failed', upload.userId, upload.id, {})
    return structuredClone(upload)
  }

  async parseReport(sessionId: Id, uploadId: Id): Promise<CanonicalReport> {
    const userId = await this.requireSession(sessionId)
    const upload = await this.store.getUpload(uploadId)
    if (!upload || upload.userId !== userId) throw new Error('Not found')
    if (upload.stage !== 'ready-to-parse') throw new Error('Upload is not parseable')
    if (upload.mediaType === 'application/pdf') return this.parseIdentityIqPdf(upload, userId)
    if (!upload.sanitizedContent) throw new Error('Upload is not parseable')
    const marker = 'GOLDEN-AUDIT-REPORT:'; const markerIndex = upload.sanitizedContent.indexOf(marker); if (markerIndex < 0) throw new Error('Unsupported report provider or template')
    const json = upload.sanitizedContent.slice(markerIndex + marker.length).replace(/<\/body>[\s\S]*/i, '').replace(/%%EOF[\s\S]*/i, '').trim(); const input: unknown = JSON.parse(json)
    if (!isParserInput(input)) throw new Error('Report schema validation failed')
    const parserVersion = 'fixture-adapter@1'; const extractionMethod = 'html-selector' // synthetic-fixture path is HTML-only (PDFs route to the real adapter)
    const makeValue = <T>(bureau: Bureau, field: string, normalized: T | null, originalDisplay: string, locator: string, confidence = 1): CanonicalValue<T> => ({ id: randomUUID(), bureau, field, normalized, originalDisplay, state: normalized === null ? 'unknown' : 'known', source: { kind: 'element', locator, snippet: originalDisplay.slice(0, 80) }, extractionMethod, parserVersion, confidence })
    const tradelines = input.tradelines.map((line, index): Tradeline => {
      const confidence = line.confidence ?? 1
      const sliceValues = (field: string, values: string[]) => values.map((value, valueIndex) => makeValue(line.bureau, field, value, value, `${index}:${field}:${valueIndex}`, confidence))
      return { id: randomUUID(), creditor: makeValue(line.bureau, 'creditor', line.creditor, line.creditor, `${index}:creditor`, confidence), maskedAccount: makeValue(line.bureau, 'account', maskAccount(line.account), maskAccount(line.account), `${index}:account`), accountType: makeValue(line.bureau, 'accountType', line.accountType, line.accountType, `${index}:type`), balance: { ...makeValue(line.bureau, 'balance', line.balance, `$${(line.balance / 100).toFixed(2)}`, `${index}:balance`, confidence), currency: 'USD' }, creditLimit: { ...makeValue(line.bureau, 'creditLimit', line.creditLimit ?? null, line.creditLimit === undefined ? '' : `$${(line.creditLimit / 100).toFixed(2)}`, `${index}:credit-limit`, confidence), currency: 'USD' }, pastDue: { ...makeValue(line.bureau, 'pastDue', line.pastDue ?? null, line.pastDue === undefined ? '' : `$${(line.pastDue / 100).toFixed(2)}`, `${index}:past-due`, confidence), currency: 'USD' }, status: makeValue(line.bureau, 'status', line.status, line.status, `${index}:status`), opened: { ...makeValue(line.bureau, 'opened', line.opened, line.opened, `${index}:opened`), datePrecision: line.opened.length === 7 ? 'month' : 'day' }, updated: { ...makeValue(line.bureau, 'updated', line.updated, line.updated, `${index}:updated`), datePrecision: line.updated.length === 7 ? 'month' : 'day' }, dateOfFirstDelinquency: { ...makeValue(line.bureau, 'dateOfFirstDelinquency', line.dateOfFirstDelinquency ?? null, line.dateOfFirstDelinquency ?? '', `${index}:date-of-first-delinquency`, confidence), datePrecision: line.dateOfFirstDelinquency?.length === 7 ? 'month' : 'day' }, paymentHistory: (line.paymentHistory ?? []).map((cell, cellIndex) => ({ ...makeValue(line.bureau, 'paymentHistory', cell.status, cell.status, `${index}:payment-history:${cellIndex}`, confidence), yearMonth: cell.yearMonth })), remarks: sliceValues('remark', line.remarks ?? []), specialCommentCodes: sliceValues('specialCommentCode', line.specialCommentCodes ?? []) }
    })
    const firstBureau = input.tradelines[0]?.bureau ?? 'equifax'; const mapText = (items: string[], field: string) => items.map((value, i) => makeValue(firstBureau, field, value, value, `${field}:${i}`))
    const inquiries = input.inquiries.map((value, index): Inquiry => ({
      id: randomUUID(), bureau: firstBureau,
      creditor: makeValue(firstBureau, 'inquiryCreditor', value, value, `inquiry:${index}:creditor`),
      businessType: makeValue<string>(firstBureau, 'inquiryBusinessType', null, '', `inquiry:${index}:businessType`, 0),
      date: makeValue<string>(firstBureau, 'inquiryDate', null, '', `inquiry:${index}:date`, 0),
    }))
    const scores = input.scores.map((score, i): CanonicalScore => ({
      ...makeValue(firstBureau, 'score', score, String(score), `score:${i}`),
      scale: makeValue<string>(firstBureau, 'scoreScale', null, '', `score:${i}:scale`, 0),
    }))
    const report: CanonicalReport = { id: randomUUID(), userId, uploadId, provider: input.provider, template: input.template, parserVersion, normalizedVersion: 1, reportDate: input.reportDate, identity: mapText(input.identity, 'identity'), addresses: mapText(input.addresses, 'address'), employers: mapText(input.employers, 'employer'), tradelines, collections: [], inquiries, publicRecords: mapText(input.publicRecords, 'publicRecord'), scores, remarks: mapText(input.remarks, 'remark'), reviewComplete: false }
    const parsedAt = now()
    await this.store.saveReport(report)
    this.recordTimestamp(report.id, { reportParsedAt: parsedAt, ...(upload.completedAt ? { uploadCompletedAt: upload.completedAt } : {}) })
    await this.audit('report-parsed', userId, report.id, { parserVersion })
    return structuredClone(report)
  }

  async getValueReview(sessionId: Id, reportId: Id): Promise<ConsumerValueReview> {
    const userId = await this.requireSession(sessionId)
    const report = await this.store.getReport(reportId); if (!report || report.userId !== userId) throw new Error('Not found')
    const values = reviewableValues(report).map((value): ConsumerReviewValue => ({
      id: value.id, bureau: value.bureau, field: value.field, normalized: value.normalized,
      originalDisplay: value.originalDisplay, state: value.state,
      source: { kind: value.source.kind, locator: value.source.locator }, confidence: value.confidence,
      ...(value.review ? { review: structuredClone(value.review) } : {}),
    }))
    const decided = values.filter(value => value.review !== undefined).length
    return { reportId, required: values.length, decided, complete: report.reviewComplete, values }
  }

  /**
   * Records a consumer correction to an extraction exception.
   *
   * Available at any time, including after a reading has been delivered — a correction is new
   * information about the source document, and there is no point at which learning the parser
   * misread something should stop mattering. Re-running analysis afterwards produces a fresh
   * reading; the prior one is left intact rather than rewritten.
   */
  async reviewValue(sessionId: Id, reportId: Id, valueId: Id, input: { decision: import('./entities.js').ReviewDecision; reason: string; replacement?: string | number }): Promise<CanonicalReport> {
    const userId = await this.requireSession(sessionId)
    const report = await this.store.getReport(reportId); if (!report || report.userId !== userId) throw new Error('Not found')
    const value = correctableValues(report).find(item => item.id === valueId); if (!value) throw new Error('Value is not reviewable')
    if (!input.reason.trim()) throw new Error('A review reason is required')
    if (input.decision === 'corrected') {
      if (input.replacement === undefined || (typeof input.replacement === 'string' && !input.replacement.trim())) throw new Error('Correction must supply a replacement value')
      // The value the parser could not read at all is precisely where a consumer's answer is most
      // useful, so a null reading cannot supply the expected type. Fall back to the slot's own
      // shape: money fields carry a currency, everything else is text.
      const expected = value.normalized === null ? (value.currency ? 'number' : 'string') : typeof value.normalized
      if (typeof input.replacement !== expected) throw new Error('Correction must match the extracted value type')
      if (typeof input.replacement === 'number' && !Number.isFinite(input.replacement)) throw new Error('Correction must be a finite number')
    } else if (input.replacement !== undefined) throw new Error('Only corrected values may include a replacement')
    value.review = { decision: input.decision, reason: input.reason.trim(), actorId: userId, at: now(), ...(input.replacement !== undefined ? { replacement: input.replacement } : {}) }
    report.normalizedVersion += 1
    await this.store.saveReport(report)
    await this.audit('report-value-reviewed', userId, valueId, { decision: input.decision })
    return structuredClone(report)
  }
  /**
   * Marks the optional correction pass finished. It does not gate anything and never rejects
   * outstanding exceptions: an exception the consumer chose not to answer stays low-confidence,
   * which suppresses the rules that depend on it — the same outcome as before they looked at it.
   */
  async completeReview(sessionId: Id, reportId: Id): Promise<void> {
    const userId = await this.requireSession(sessionId)
    const report = await this.store.getReport(reportId); if (!report || report.userId !== userId) throw new Error('Not found')
    if (report.reviewComplete) return
    report.reviewComplete = true
    report.reviewCompletedAt = now()
    await this.store.saveReport(report)
    const exceptions = reviewableValues(report)
    await this.audit('report-review-completed', userId, report.id, { exceptions: String(exceptions.length), corrected: String(exceptions.filter(value => value.review).length) })
  }

  /** REAL IdentityIQ PDF path: bytes → pdfjs (unpdf) → parser → canonical report. No child_process, no native binary — Workers-safe. */
  private async parseIdentityIqPdf(upload: Upload, userId: Id): Promise<CanonicalReport> {
    const bytes = await this.blobStore.get(upload.id)
    if (!bytes) throw new Error('Report bytes unavailable; re-upload required')
    const parsed = await parseIdentityIqPdfBytes(bytes)
    if (parsed.tradelines.length === 0) throw new Error('Unsupported report provider or template') // reject rather than guess
    const report = mapParserReportToCanonical(parsed, userId, upload.id)
    const parsedAt = now()
    await this.store.saveReport(report)
    this.recordTimestamp(report.id, { reportParsedAt: parsedAt, ...(upload.completedAt ? { uploadCompletedAt: upload.completedAt } : {}) })
    await this.audit('report-parsed', userId, report.id, { parserVersion: report.parserVersion })
    return structuredClone(report)
  }
  async getSourceSnippet(sessionId: Id, reportId: Id, valueId: Id) {
    const userId = await this.requireSession(sessionId)
    const report = await this.store.getReport(reportId); if (!report || report.userId !== userId) throw new Error('Not found')
    const value = allValues(report).find(item => item.id === valueId); if (!value) throw new Error('Not found')
    return structuredClone(value.source)
  }

  // ------------------------------------------------------------------
  // Governance (operator config — stays in-memory, re-seeded per instantiation)
  // ------------------------------------------------------------------

  installReviewedCatalog(catalog: ReviewedGovernanceCatalog): void {
    if (this.catalog) return
    const contentForDigest = { ...catalog, approval: undefined }
    const catalogDigest = createHash('sha256').update(JSON.stringify(contentForDigest)).digest('hex')
    if (catalog.approval.approvedByGitIdentity !== 'fchery87' || catalog.approval.reviewedCommit === 'PENDING' || catalog.approval.catalogSha256 !== catalogDigest) throw new Error('Reviewed content approval does not match this catalog')
    if (catalog.approval.reviewIntervalDays !== 90 || Date.parse(catalog.approval.reReviewDueAt) - Date.parse(catalog.approval.approvedAt) !== 90 * 24 * 60 * 60 * 1000) throw new Error('Reviewed content has an invalid re-review interval')
    if (Date.parse(catalog.approval.reReviewDueAt) < Date.now()) throw new Error('Reviewed content is overdue for re-review')
    const authorityIds = new Set(catalog.authorities.map(item => item.id))
    const moduleIds = new Set(catalog.modules.map(item => item.id))
    if (authorityIds.size !== catalog.authorities.length || moduleIds.size !== catalog.modules.length) throw new Error('Reviewed content has duplicate identifiers')
    for (const authority of catalog.authorities) {
      if (authority.status !== 'published' || !authority.title || !authority.sourceUrl || !/^https:\/\//.test(authority.sourceUrl)) throw new Error('Reviewed authority is incomplete')
      assertSafeConsumerOutput(`${authority.title}\n${authority.citation}\n${authority.limitations.join('\n')}`)
    }
    for (const module of catalog.modules) {
      if (module.status !== 'published' || !module.authorityIds?.length || !module.authorityIds.every(id => authorityIds.has(id))) throw new Error('Reviewed module has an unknown authority')
      assertSafeConsumerOutput(`${module.title}\n${module.body}\n${module.limitations.join('\n')}`)
    }
    for (const rule of catalog.rules) {
      if (rule.status !== 'published' || !rule.requiredInputs.length || !rule.testCases.length || !rule.authorityIds.every(id => authorityIds.has(id)) || !rule.educationModuleIds.every(id => moduleIds.has(id))) throw new Error('Reviewed rule contract is incomplete')
      assertSafeConsumerOutput(`${rule.name}\n${rule.requiredInputs.join('\n')}\n${rule.limitations.join('\n')}`)
    }
    const version = createHash('sha256').update(JSON.stringify(catalog.rules)).digest('hex').slice(0, 12)
    const rules = catalog.rules.map(rule => ({ ...structuredClone(rule), version }))
    this.catalog = structuredClone(catalog)
    for (const authority of catalog.authorities) { this.authorities.set(authority.id, structuredClone(authority)); this.publishedAuthorities.set(authority.id, structuredClone(authority)) }
    for (const module of catalog.modules) { this.modules.set(module.id, structuredClone(module)); this.publishedModules.set(module.id, structuredClone(module)) }
    for (const rule of rules) this.rules.set(rule.id, structuredClone(rule))
    this.publishedRulesets.set(version, rules)
  }

  getReviewedCatalogVersion(): string | undefined { return this.catalog?.catalogVersion }

  registerReviewer(input: Reviewer): void { this.reviewers.set(input.id, structuredClone(input)) }
  private requireReviewer(reviewerId: Id, roles: ReviewerRole[]): Reviewer { const reviewer = this.reviewers.get(reviewerId); if (!reviewer || !roles.includes(reviewer.role)) throw new Error('Reviewer is not authorized'); return reviewer }
  createAuthority(reviewerId: Id, input: Omit<Authority, 'id' | 'status' | 'history'>): Authority { this.requireReviewer(reviewerId, ['compliance-reviewer']); const item = { ...input, title: input.title ?? 'Documentation basis', sourceUrl: input.sourceUrl ?? 'https://www.consumerfinance.gov/', id: randomUUID(), status: 'draft' as const, history: [] }; this.authorities.set(item.id, item); return structuredClone(item) }
  createEducationModule(reviewerId: Id, input: Omit<EducationModule, 'id' | 'status' | 'history'>): EducationModule { this.requireReviewer(reviewerId, ['compliance-reviewer']); const item = { ...input, kind: input.kind ?? 'finding-module' as const, section: input.section ?? 'finding' as const, authorityIds: input.authorityIds ?? [], id: randomUUID(), status: 'draft' as const, history: [] }; this.modules.set(item.id, item); return structuredClone(item) }
  createRule(reviewerId: Id, input: Omit<Rule, 'id' | 'status' | 'history'>): Rule { this.requireReviewer(reviewerId, ['engineering-reviewer']); if (!input.requiredInputs.length || !input.testCases.length) throw new Error('Rule contract is incomplete'); const item = { ...input, id: randomUUID(), status: 'draft' as const, history: [] }; this.rules.set(item.id, item); return structuredClone(item) }
  reviewGovernance(kind: 'authority' | 'module' | 'rule', id: Id, reviewerId: Id, action: Exclude<GovernanceStatus, 'draft'> | 'revision-requested', reason: string): void { this.requireReviewer(reviewerId, ['compliance-reviewer', 'engineering-reviewer']); const map = kind === 'authority' ? this.authorities : kind === 'module' ? this.modules : this.rules; const item = map.get(id); if (!item) throw new Error('Governance item not found'); item.history.push({ action, reviewerId, at: now(), reason }); if (action !== 'revision-requested') item.status = action; void this.audit(`governance-${action}`, reviewerId, id, { kind, reason }) }
  publishRuleset(reviewerId: Id, jurisdiction: Jurisdiction, effectiveDate: string): string { this.requireReviewer(reviewerId, ['release-manager']); const rules = [...this.rules.values()].filter(rule => rule.status === 'approved' && rule.jurisdiction === jurisdiction && rule.effectiveFrom <= effectiveDate && rule.authorityIds.every(id => this.authorities.get(id)?.status === 'approved') && rule.educationModuleIds.every(id => this.modules.get(id)?.status === 'approved')); if (!rules.length) throw new Error('No approved rules available'); for (const rule of rules) { const authorities = rule.authorityIds.map(id => this.authorities.get(id)); const modules = rule.educationModuleIds.map(id => this.modules.get(id)); if (authorities.some(authority => !authority?.title || !authority.sourceUrl || !/^https:\/\//.test(authority.sourceUrl)) || modules.some(module => !module)) throw new Error('Published consumer content is incomplete'); assertSafeConsumerOutput(`${rule.name}\n${rule.requiredInputs.join('\n')}\n${rule.limitations.join('\n')}\n${authorities.flatMap(authority => authority ? [authority.title ?? '', authority.citation] : []).join('\n')}\n${modules.flatMap(module => module ? [module.title, module.body, ...module.limitations] : []).join('\n')}`) } const version = createHash('sha256').update(JSON.stringify(rules)).digest('hex').slice(0, 12); const published = structuredClone(rules).map(rule => ({ ...rule, status: 'published' as const, version })); this.publishedRulesets.set(version, published); for (const rule of rules) rule.status = 'published'; for (const rule of rules) for (const id of rule.authorityIds) { const authority = this.authorities.get(id); if (authority) { authority.status = 'published'; this.publishedAuthorities.set(id, structuredClone(authority)) } } for (const rule of rules) for (const id of rule.educationModuleIds) { const module = this.modules.get(id); if (module) { module.status = 'published'; this.publishedModules.set(id, structuredClone(module)) } } void this.audit('ruleset-published', reviewerId, version, { jurisdiction }); return version }
  disableGovernance(kind: 'authority' | 'module' | 'rule', id: Id, reviewerId: Id, reason: string): void { this.requireReviewer(reviewerId, ['compliance-reviewer', 'release-manager']); this.reviewGovernance(kind, id, reviewerId, 'disabled', reason) }
  getEffectiveRules(jurisdiction: Jurisdiction, effectiveDate: string): Rule[] { return [...this.publishedRulesets.values()].flat().filter(rule => rule.jurisdiction === jurisdiction && rule.effectiveFrom <= effectiveDate && rule.status === 'published' && rule.authorityIds.every(id => this.authorities.get(id)?.status !== 'disabled') && rule.educationModuleIds.every(id => this.modules.get(id)?.status !== 'disabled')).map(rule => structuredClone(rule)) }
  getEffectiveAuthorities(jurisdiction: Jurisdiction, effectiveDate: string): Authority[] { return [...this.publishedAuthorities.values()].filter(item => item.jurisdiction === jurisdiction && item.effectiveFrom <= effectiveDate && this.authorities.get(item.id)?.status !== 'disabled').map(item => structuredClone(item)) }
  getEffectiveEducationModules(jurisdiction: Jurisdiction, effectiveDate: string): EducationModule[] { return [...this.publishedModules.values()].filter(item => item.jurisdiction === jurisdiction && item.effectiveFrom <= effectiveDate && this.modules.get(item.id)?.status !== 'disabled').map(item => structuredClone(item)) }
  /** Exposed so the Cloudflare Pages Functions path can check whether a jurisdiction's ruleset is already published before re-seeding (see apps/web/src/pilot-bootstrap.ts). */
  hasPublishedRuleset(jurisdiction: Jurisdiction): boolean { return [...this.publishedRulesets.values()].some(rules => rules.some(rule => rule.jurisdiction === jurisdiction)) }
  getPublishedRulesetVersionFor(jurisdiction: Jurisdiction): string | undefined { const entry = [...this.publishedRulesets.entries()].find(([, rules]) => rules.some(rule => rule.jurisdiction === jurisdiction)); return entry?.[0] }

  // ------------------------------------------------------------------
  // Matching / analysis / consumer report / export / deletion
  // ------------------------------------------------------------------

  async proposeMatches(sessionId: Id, reportId: Id): Promise<MatchGroup[]> {
    const userId = await this.requireSession(sessionId)
    const report = await this.store.getReport(reportId)
    if (!report || report.userId !== userId) throw new Error('Not found')
    const reviewedTradelines = reviewedTradelinesForAnalysis(report)
    const grouped = new Map<string, Tradeline[]>()
    for (const line of reviewedTradelines) {
      const creditor = line.creditor.normalized?.toLowerCase() ?? ''
      const account = line.maskedAccount.normalized ?? ''
      const key = `${creditor}:${account}`
      grouped.set(key, [...(grouped.get(key) ?? []), line])
    }
    const result: MatchGroup[] = []
    for (const lines of grouped.values()) {
      if (lines.length < 2) continue
      const uniqueBureaus = new Set(lines.map(line => line.balance.bureau))
      const balanceAgreement = new Set(lines.map(line => line.balance.normalized)).size === 1
      const oversized = lines.length > 3
      const duplicateWithinBureau = uniqueBureaus.size < lines.length
      // A masked account that is pure mask characters carries no identifying digits, so the group
      // is really a creditor-name match and cannot be trusted on its own.
      const account = lines[0]?.maskedAccount.normalized ?? ''
      const accountIdentified = account !== '' && !/^[•*x]+$/i.test(account)
      // Balance agreement is recorded as a signal but is deliberately NOT part of the confidence
      // decision. Two bureaus showing the same creditor, the same masked account, and one entry
      // each are the same account whether or not their balances agree — and a *disagreeing*
      // balance is the flagship finding this product exists to surface. Gating the match on
      // agreement meant every account worth reporting on required a manual confirmation first.
      const ambiguous = oversized || duplicateWithinBureau || !accountIdentified
      const confidence = ambiguous ? 0.72 : 0.95
      // An unambiguous group — same creditor, same masked account, agreeing balances, one line per
      // bureau — is not a question a consumer can answer better than the evidence already does.
      // Asking anyway is the pattern that produced a wall of forced decisions; the ambiguous cases
      // below are the ones where a human genuinely knows something the document does not say.
      const autoConfirmed = !ambiguous
      const group: MatchGroup = {
        id: randomUUID(),
        reportId,
        tradelineIds: lines.map(line => line.id),
        confidence,
        signals: ['creditor', 'masked-account', ...(balanceAgreement ? ['balance'] : []), ...(oversized ? ['collision-set'] : []), ...(duplicateWithinBureau ? ['same-bureau-duplicate'] : []), ...(accountIdentified ? [] : ['creditor-only']), ...(autoConfirmed ? ['auto-confirmed'] : [])],
        state: autoConfirmed ? 'confirmed' : 'split',
        history: autoConfirmed ? [{ action: 'confirmed' as const, actorId: 'system', at: now(), reason: 'Same creditor and masked account, one entry per bureau, no collision — matched without ambiguity' }] : [],
      }
      await this.store.saveMatch(group)
      result.push(group)
    }
    return structuredClone(result)
  }
  /**
   * The account groups still awaiting a consumer decision, with enough tradeline detail to decide.
   *
   * Reachable after the reading is delivered, because unresolved groups no longer block delivery —
   * they suppress the checks that needed them. This is how a consumer goes back and unlocks those
   * checks without re-uploading the document.
   */
  async listPendingMatches(sessionId: Id, reportId: Id): Promise<{ reportId: Id; matches: MatchGroup[]; tradelines: Array<{ id: Id; bureau: string; creditor: string; maskedAccount: string; balanceCents: number | null }> }> {
    const userId = await this.requireSession(sessionId)
    const report = await this.store.getReport(reportId); if (!report || report.userId !== userId) throw new Error('Not found')
    const matches = (await this.store.listMatchesByReport(reportId)).filter(match => match.state === 'proposed' || match.state === 'split')
    const involved = new Set(matches.flatMap(match => match.tradelineIds))
    return {
      reportId,
      matches: structuredClone(matches),
      tradelines: reviewedReportProjection(report).tradelines
        .filter(line => involved.has(line.id))
        .map(line => ({ id: line.id, bureau: String(line.creditor.bureau), creditor: line.creditor.normalized ?? '', maskedAccount: line.maskedAccount.normalized ?? '', balanceCents: line.balance.normalized ?? null })),
    }
  }

  async decideMatch(sessionId: Id, matchId: Id, action: 'confirmed' | 'rejected' | 'split' | 'merged', reason: string): Promise<MatchGroup> {
    const userId = await this.requireSession(sessionId)
    const match = await this.store.getMatch(matchId)
    const report = match && await this.store.getReport(match.reportId)
    if (!match || !report || report.userId !== userId) throw new Error('Not found')
    if (action === 'confirmed' && match.tradelineIds.length > 3) throw new Error('Oversized collision sets require subgroup confirmation')
    match.state = action; match.history.push({ action, actorId: userId, at: now(), reason })
    await this.store.saveMatch(match)
    await this.audit('match-decision', userId, match.id, { action })
    return structuredClone(match)
  }

  async confirmMatchSubgroup(sessionId: Id, matchId: Id, tradelineIds: Id[], reason: string): Promise<MatchGroup> {
    const userId = await this.requireSession(sessionId)
    const match = await this.store.getMatch(matchId)
    const report = match && await this.store.getReport(match.reportId)
    if (!match || !report || report.userId !== userId) throw new Error('Not found')
    if (match.state !== 'split') throw new Error('Match subgrouping requires a split collision set')
    const uniqueTradelineIds = [...new Set(tradelineIds)]
    if (uniqueTradelineIds.length < 2) throw new Error('At least two tradelines are required')
    if (!uniqueTradelineIds.every(id => match.tradelineIds.includes(id))) throw new Error('Subset must come from the parent collision set')
    const selected = reviewedTradelinesForAnalysis(report).filter(line => uniqueTradelineIds.includes(line.id))
    const balanceAgreement = new Set(selected.map(line => line.balance.normalized)).size === 1
    const confidence = balanceAgreement ? 0.95 : 0.72
    const subgroup: MatchGroup = {
      id: randomUUID(),
      reportId: match.reportId,
      tradelineIds: uniqueTradelineIds,
      confidence,
      signals: ['consumer-confirmed', 'subgroup', 'creditor', 'masked-account', ...(balanceAgreement ? ['balance'] : [])],
      state: 'confirmed',
      history: [{ action: 'confirmed', actorId: userId, at: now(), reason }],
    }
    await this.store.saveMatch(subgroup)
    await this.audit('match-subgroup-confirmed', userId, subgroup.id, { parentMatchId: match.id, tradelineCount: String(uniqueTradelineIds.length) })
    match.state = 'rejected'
    match.history.push({ action: 'rejected', actorId: userId, at: now(), reason: 'Consumer resolved this collision set through an explicitly confirmed subgroup' })
    await this.store.saveMatch(match)
    await this.audit('match-collision-set-resolved', userId, match.id, { subgroupId: subgroup.id })
    return structuredClone(subgroup)
  }

  async runAnalysis(sessionId: Id, reportId: Id, rulesetVersion: string, jurisdiction: Jurisdiction): Promise<Analysis> {
    const userId = await this.requireSession(sessionId)
    const report = await this.store.getReport(reportId); if (!report || report.userId !== userId) throw new Error('Not found')
    const matches = await this.store.listMatchesByReport(reportId)
    // An unresolved collision set suppresses the checks that would have used it; it does not
    // withhold the whole reading. Suppression is already how this engine handles evidence it
    // cannot stand behind, and a consumer with one ambiguous account group should still get the
    // other twenty-nine accounts read. The suppressed checks are named in the coverage table.
    const unresolvedMatches = matches.filter(match => match.state === 'proposed' || match.state === 'split')
    const rules = this.publishedRulesets.get(rulesetVersion); if (!rules) throw new Error('Ruleset not found')
    if (rules.some(rule => rule.status === 'disabled' || rule.authorityIds.some(id => this.authorities.get(id)?.status === 'disabled') || rule.educationModuleIds.some(id => this.modules.get(id)?.status === 'disabled'))) throw new Error('Ruleset contains disabled content')
    const reviewedReport = reviewedReportProjection(report)
    const core = evaluateAnalysis({
      rules,
      tradelines: reviewedReport.tradelines,
      confirmedMatches: matches.filter(match => match.state === 'confirmed').map(match => ({ tradelineIds: match.tradelineIds })),
      ...(await this.identityInputForAnalysis(userId, reviewedReport)),
      versions: { normalizedInput: report.normalizedVersion, ruleset: rulesetVersion, jurisdiction, parser: report.parserVersion, application: applicationVersion },
    })
    const unresolvedAudit: RuleAudit[] = unresolvedMatches.length === 0 ? [] : rules
      .filter(rule => rule.name.startsWith('cross-bureau-') || rule.name === 'duplicate-tradeline-within-bureau')
      .map(rule => ({ ruleId: rule.id, outcome: 'suppressed' as const, reason: `${unresolvedMatches.length} account group${unresolvedMatches.length === 1 ? '' : 's'} await your confirmation; this check did not run on ${unresolvedMatches.length === 1 ? 'it' : 'them'}` }))
    const parsedAt = this.timelineBySubject.get(report.id)?.reportParsedAt
    const analysis: Analysis = { ...core, audit: [...core.audit, ...unresolvedAudit], userId, reportId }
    await this.store.saveAnalysis(analysis)
    this.recordTimestamp(analysis.id, { analysisCreatedAt: analysis.createdAt, ...(parsedAt ? { reportParsedAt: parsedAt } : {}) })
    await this.audit('analysis-created', userId, analysis.id, { rulesetVersion })
    return structuredClone(analysis)
  }

  /**
   * Assembles the identity comparison inputs for one analysis run.
   *
   * Returns an empty object — not a partial one — when no attestation exists. The identity rules
   * then suppress with an explicit reason instead of comparing against blanks, which would make
   * every displayed value look like a mismatch.
   */
  private async identityInputForAnalysis(userId: Id, report: CanonicalReport): Promise<{ attestedIdentity?: AttestedIdentity; reportedIdentity?: ReportedIdentity }> {
    const stored = await this.store.getConsumerIdentity(userId)
    const toEvaluable = (value: CanonicalValue<string>): EvaluableIdentityValue => ({
      id: value.id, bureau: value.bureau, field: value.field,
      normalized: value.normalized, originalDisplay: value.originalDisplay,
      confidence: value.confidence, source: value.source,
    })
    const identityByField = (field: string) => report.identity.filter((value): value is CanonicalValue<string> => value.field === field && typeof value.normalized !== 'number').map(toEvaluable)
    const reportedIdentity: ReportedIdentity = {
      names: identityByField('name'),
      datesOfBirth: identityByField('dateOfBirth'),
      ssnFragments: identityByField('ssnLastFour'),
      addresses: report.addresses
        .filter((value): value is CanonicalValue<string> => typeof value.normalized !== 'number')
        .map(value => ({ ...toEvaluable(value), comparisonKey: normalizeAddressForComparison(value.normalized ?? '') })),
    }
    if (!stored) return { reportedIdentity }
    return {
      attestedIdentity: {
        fullName: stored.fullName,
        dateOfBirth: stored.dateOfBirth,
        ssnLastFour: stored.ssnLastFour,
        addressKeys: [stored.currentAddress, ...stored.previousAddresses].map(address => normalizeAddressForComparison(formatPostalAddress(address))),
      },
      reportedIdentity,
    }
  }

  async getAnalysis(sessionId: Id, analysisId: Id): Promise<Analysis> {
    const userId = await this.requireSession(sessionId)
    const analysis = await this.store.getAnalysis(analysisId); if (!analysis || analysis.userId !== userId) throw new Error('Not found')
    return structuredClone(analysis)
  }

  async createConsumerReport(sessionId: Id, analysisId: Id): Promise<ConsumerReport> {
    const userId = await this.requireSession(sessionId)
    const analysis = await this.store.getAnalysis(analysisId); if (!analysis || analysis.userId !== userId) throw new Error('Not found')
    const report = await this.store.getReport(analysis.reportId); if (!report) throw new Error('Not found')
    const reviewedReport = reviewedReportProjection(report)
    const activeRules = this.publishedRulesets.get(analysis.versions.ruleset)
    if (!activeRules || activeRules.some(rule => rule.status === 'disabled' || rule.authorityIds.some(id => this.authorities.get(id)?.status === 'disabled') || rule.educationModuleIds.some(id => this.modules.get(id)?.status === 'disabled'))) throw new Error('Report content is disabled')
    const authorityById = new Map([...this.publishedAuthorities.values()].map(item => [item.id, item]))
    const moduleById = new Map([...this.publishedModules.values()].map(item => [item.id, item]))
    const findings: ReportFinding[] = [...analysis.findings]
      .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.confidence - a.confidence)
      .map(finding => {
        const authorities = finding.authorityIds.map(id => authorityById.get(id)).filter((item): item is Authority => item !== undefined)
        const educationModules = finding.educationModuleIds.map(id => moduleById.get(id)).filter((item): item is EducationModule => item !== undefined)
        if (authorities.length !== finding.authorityIds.length || educationModules.length !== finding.educationModuleIds.length) throw new Error('Published finding content cannot be resolved')
        return { ...finding, authorities, educationModules }
      })
    const ruleset = this.publishedRulesets.get(analysis.versions.ruleset)
    if (!ruleset) throw new Error('Published report rules are unavailable')
    const catalogVersion = this.catalog?.catalogVersion ?? 'legacy-runtime-governance'
    const sectionPrimers = this.catalog ? [...this.publishedModules.values()]
      .filter((module): module is EducationModule & { kind: 'section-primer'; authorityIds: Id[] } => module.kind === 'section-primer' && module.jurisdiction === analysis.versions.jurisdiction && module.effectiveFrom <= report.reportDate && !!module.authorityIds)
      .map(module => {
        const authorities = module.authorityIds.map(id => authorityById.get(id)).filter((item): item is Authority => item !== undefined)
        if (authorities.length !== module.authorityIds.length) throw new Error('Published primer authority cannot be resolved')
        return { ...module, authorities }
      }) : []
    const coverage: CoverageRow[] = ruleset.map(rule => ({ ruleId: rule.id, name: rule.name, requiredInputs: [...rule.requiredInputs], outcomes: analysis.audit.filter(audit => audit.ruleId === rule.id) }))
    const fieldNames = ['accountType', 'balance', 'creditLimit', 'pastDue', 'status', 'opened', 'updated', 'dateOfFirstDelinquency'] as const
    const parserFields: ParserFieldAvailability[] = fieldNames.map(field => ({
      field,
      capability: 'supported',
      states: reviewedReport.tradelines.reduce<ParserFieldAvailability['states']>((states, line) => {
        const value = line[field]
        states[value.state] += 1
        return states
      }, { known: 0, unknown: 0, blank: 0, 'not-applicable': 0, 'parser-failed': 0 }),
    }))
    for (const field of ['paymentHistory', 'remarks', 'specialCommentCodes'] as const) parserFields.push({
      field,
      capability: 'supported',
      states: reviewedReport.tradelines.reduce<ParserFieldAvailability['states']>((states, line) => {
        const values = line[field]
        if (values.length === 0) states.unknown += 1
        else for (const value of values) states[value.state] += 1
        return states
      }, { known: 0, unknown: 0, blank: 0, 'not-applicable': 0, 'parser-failed': 0 }),
    })
    const addParserField = (field: string, values: CanonicalValue<unknown>[]) => parserFields.push({
      field,
      capability: 'supported',
      states: values.reduce<ParserFieldAvailability['states']>((states, value) => { states[value.state] += 1; return states }, { known: 0, unknown: 0, blank: 0, 'not-applicable': 0, 'parser-failed': 0 }),
    })
    addParserField('score', reviewedReport.scores.flatMap(score => [score, score.scale]))
    addParserField('inquiry', reviewedReport.inquiries.flatMap(inquiry => [inquiry.creditor, inquiry.date]))
    addParserField('personalInformation', [...reviewedReport.identity, ...reviewedReport.addresses, ...reviewedReport.employers])
    const recipient = displayRecipient(reviewedReport)

    const matches = await this.store.listMatchesByReport(analysis.reportId)
    const confirmedMatches = matches.filter(match => match.state === 'confirmed')
    const pendingMatchGroups = matches.filter(match => match.state === 'proposed' || match.state === 'split').length
    const { attestedIdentity } = await this.identityInputForAnalysis(userId, reviewedReport)
    const scoreRows = sourceLinkedScoreRows(reviewedReport.scores)
    const summary = buildReportSummary({ report: reviewedReport, confirmedMatches, findings })
    const identityRows = buildIdentityRows(reviewedReport, attestedIdentity)
    const reimport = await this.previousReadingFor(userId, analysis.reportId, reviewedReport, findings)
    const consumerReport: ConsumerReport = {
      id: randomUUID(), userId, analysisId, sourceReportId: analysis.reportId,
      limitations: ['Educational information only', 'No legal verdict; no deletion promise or score prediction'],
      overview: { tradelines: reviewedReport.tradelines.length, collections: reviewedReport.collections.length, inquiries: reviewedReport.inquiries.length, openAccounts: reviewedReport.tradelines.filter(line => line.status.normalized?.toLowerCase().includes('open')).length },
      findings,
      actions: analysis.findings.map(finding => ({ id: randomUUID(), findingId: finding.id, status: 'unresolved', documents: [] })),
      content: {
        catalogVersion,
        rulesetVersion: analysis.versions.ruleset,
        parserVersion: report.parserVersion,
        sectionPrimers,
        coverage,
        parserFields,
        summary,
        ...(identityRows.length > 0 ? { identityRows } : {}),
        ...(reimport ? { reimport } : {}),
        ...(pendingMatchGroups > 0 ? { pendingMatchGroups } : {}),
        accountRows: sourceLinkedAccountRows(reviewedReport.tradelines),
        ...(scoreRows.length > 0 ? { scoreRows } : {}),
        ...(sourceLinkedInquiryRows(reviewedReport.inquiries).length > 0 ? { inquiryRows: sourceLinkedInquiryRows(reviewedReport.inquiries) } : {}),
      },
      presentation: presentationSnapshot(await this.store.getReportPresentationProfile()),
      ...(recipient ? { recipient } : {}),
      generatedAt: now(),
    }
    await this.store.saveConsumerReport(consumerReport)
    return structuredClone(consumerReport)
  }
  /** Resolves the reading immediately before this one and diffs against it. Returns undefined on
   *  a first upload, or when the previous reading's source report is no longer retrievable —
   *  retention deletes source reports on a schedule, and a partial diff would be worse than none. */
  private async previousReadingFor(userId: Id, currentReportId: Id, currentReport: CanonicalReport, currentFindings: ReportFinding[]): Promise<ReimportDiff | undefined> {
    const previousConsumerReport = (await this.store.listConsumerReportsForUser(userId))
      .sort((a, b) => Date.parse(b.generatedAt) - Date.parse(a.generatedAt))
      .find(candidate => candidate.id !== currentReportId)
    if (!previousConsumerReport) return undefined
    const previousAnalysis = await this.store.getAnalysis(previousConsumerReport.analysisId)
    if (!previousAnalysis || previousAnalysis.reportId === currentReportId) return undefined
    const previousReport = await this.store.getReport(previousAnalysis.reportId)
    if (!previousReport) return undefined
    return buildReimportDiff({ previousConsumerReport, previousReport, currentReport, currentFindings })
  }

  async getConsumerReport(sessionId: Id, consumerReportId: Id): Promise<ConsumerReport> {
    const userId = await this.requireSession(sessionId)
    const report = await this.store.getConsumerReport(consumerReportId); if (!report || report.userId !== userId) throw new Error('Not found')
    return structuredClone(report)
  }
  async updateAction(sessionId: Id, consumerReportId: Id, actionId: Id, patch: Partial<Pick<ActionItem, 'status' | 'note' | 'reason' | 'documents'>>): Promise<ActionItem> {
    const userId = await this.requireSession(sessionId)
    const report = await this.store.getConsumerReport(consumerReportId); if (!report || report.userId !== userId) throw new Error('Not found')
    const action = report.actions.find(item => item.id === actionId); if (!action) throw new Error('Action not found')
    Object.assign(action, patch)
    await this.store.saveConsumerReport(report)
    await this.audit('action-updated', userId, action.id, { status: action.status })
    return structuredClone(action)
  }

  async createExport(sessionId: Id, consumerReportId: Id): Promise<ExportArtifact> {
    const userId = await this.requireSession(sessionId)
    const report = await this.store.getConsumerReport(consumerReportId); if (!report || report.userId !== userId) throw new Error('Not found')
    const existing = await this.store.findExportByReport(userId, consumerReportId)
    if (existing?.formatVersion === 'consumer-report-v2') return structuredClone(existing)
    const content = JSON.stringify({ formatVersion: 'consumer-report-v2', generatedAt: now(), scope: 'Educational credit-report analysis with coverage limitations', report: exportProjection(report) }, null, 2)
    assertSafeConsumerOutput(content)
    const artifact: ExportArtifact = { id: existing?.id ?? randomUUID(), userId, reportId: consumerReportId, formatVersion: 'consumer-report-v2', content, createdAt: existing?.createdAt ?? now() }
    await this.store.saveExport(artifact)
    if (!existing) await this.audit('export-created', userId, artifact.id, {})
    return structuredClone(artifact)
  }
  async getExport(sessionId: Id, exportId: Id): Promise<ExportArtifact> {
    const userId = await this.requireSession(sessionId)
    const artifact = await this.store.getExport(exportId); if (!artifact || artifact.userId !== userId) throw new Error('Not found')
    return structuredClone(artifact)
  }
  async requestDeletion(sessionId: Id, providerDelayed = false): Promise<{ id: Id; status: 'pending-provider' | 'complete'; deleted: string[]; delayed: string[]; receipt: { completedAt: string; outcome: 'account-deleted' } }> {
    const userId = await this.requireSession(sessionId)
    const uploads = await this.store.listUploadsForUser(userId)
    // Remove raw bytes before relational metadata. On a blob failure, leave the account and
    // upload rows intact so the next authenticated request can retry rather than falsely claim completion.
    for (const upload of uploads) await this.blobStore.delete(upload.id)
    const deleted = await this.store.deleteAllUserData(userId)
    const receipt = { id: randomUUID(), completedAt: now(), outcome: 'account-deleted' as const }
    await this.store.deleteAccount(userId)
    await this.store.saveDeletionReceipt(receipt)
    return { id: receipt.id, status: providerDelayed ? 'pending-provider' : 'complete', deleted, delayed: providerDelayed ? ['backup-lifecycle', 'model-provider'] : [], receipt: { completedAt: receipt.completedAt, outcome: receipt.outcome } }
  }

  async narrate(sessionId: Id, analysisId: Id, provider: (payload: string) => string): Promise<{ text: string; mode: 'generated' | 'fallback'; versions: Record<string, string> }> {
    const userId = await this.requireSession(sessionId)
    const analysis = await this.store.getAnalysis(analysisId); if (!analysis || analysis.userId !== userId) throw new Error('Not found')
    const payload = JSON.stringify({ findings: analysis.findings, jurisdiction: analysis.versions.jurisdiction }).replace(/\b\d{9}\b/g, '[REDACTED]')
    const fallback = () => ({
      text: analysis.findings.map(finding => `${finding.title}. ${finding.suggestedAction}. Limitations: ${finding.limitations.join('; ')}`).join('\n') || 'No publishable findings were produced.',
      mode: 'fallback' as const,
      versions: { model: 'none', prompt: 'deterministic@1', retrieval: 'approved-content@1', application: applicationVersion },
    })
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const text = provider(payload)
        if (validateNarration(text, analysis)) {
          assertSafeConsumerOutput(text)
          return { text, mode: 'generated', versions: { model: 'configured-provider', prompt: 'narration@1', retrieval: 'approved-content@1', application: applicationVersion } }
        }
      } catch {
        // Retry once with the same constrained structured payload, then fall back.
      }
    }
    const fallbackResult = fallback()
    assertSafeConsumerOutput(fallbackResult.text)
    return fallbackResult
  }

  // ------------------------------------------------------------------
  // Pilot governance / evidence (operator/admin surfaces — in-memory except where they read
  // consumer entities, which routes through the store)
  // ------------------------------------------------------------------

  recordPilotApproval(input: { area: PilotApprovalArea; approver: string; evidenceReference: string }): PilotApproval {
    if (!input.approver.trim() || !input.evidenceReference.trim()) throw new Error('Approval requires an accountable approver and evidence reference')
    const approval = { ...input, approvedAt: now() }
    this.pilotApprovals.set(input.area, approval)
    void this.audit('pilot-approval-recorded', input.approver, input.area, { evidenceReference: input.evidenceReference })
    return structuredClone(approval)
  }
  recordPilotDrill(input: { scenario: string; owner: string; result: PilotDrillResult; gaps: string[]; followUpTicket: string }): PilotDrill {
    if (!input.scenario.trim() || !input.owner.trim() || !input.followUpTicket.trim()) throw new Error('Pilot drill requires scenario, owner, and follow-up ticket')
    const drill: PilotDrill = { id: randomUUID(), ...input, gaps: [...input.gaps], recordedAt: now() }
    this.pilotDrills.push(drill)
    void this.audit('pilot-drill-recorded', input.owner, drill.id, { scenario: input.scenario, result: input.result, followUpTicket: input.followUpTicket })
    return structuredClone(drill)
  }
  getPilotDrills(): PilotDrill[] {
    return this.pilotDrills.map(item => structuredClone(item))
  }
  getPilotDrillEvidenceReport(): PilotDrillEvidenceReport {
    const outcomes: Record<PilotDrillResult, number> = { passed: 0, 'passed-with-gaps': 0, blocked: 0 }
    const openGaps: PilotDrillEvidenceGap[] = []
    const followUpTickets = new Set<string>()
    for (const drill of this.pilotDrills) {
      outcomes[drill.result] += 1
      followUpTickets.add(drill.followUpTicket)
      if (drill.result !== 'passed') openGaps.push({ scenario: drill.scenario, owner: drill.owner, result: drill.result, gaps: [...drill.gaps], followUpTicket: drill.followUpTicket })
    }
    return { generatedAt: now(), totalDrills: this.pilotDrills.length, outcomes, openGaps, followUpTickets: [...followUpTickets] }
  }
  async getPilotEvidenceBundle(input: { comprehension: ComprehensionEvidenceReport; accessibility: AccessibilityEvidenceReport; narration?: NarrationEvaluation }) {
    const pilotGate = this.getPilotGate()
    const quality = await this.getQualityReport()
    const drills = this.getPilotDrillEvidenceReport()
    const failingEvidenceSurfaces: PilotEvidenceSummary['failingEvidenceSurfaces'] = []
    if (!input.comprehension.passed) failingEvidenceSurfaces.push('comprehension')
    if (!input.accessibility.passed) failingEvidenceSurfaces.push('accessibility')
    if (drills.openGaps.length > 0) failingEvidenceSurfaces.push('drills')
    if (input.narration && !input.narration.safe) failingEvidenceSurfaces.push('narration')
    return {
      generatedAt: now(), pilotGate, quality, drills,
      comprehension: structuredClone(input.comprehension), accessibility: structuredClone(input.accessibility),
      ...(input.narration ? { narration: structuredClone(input.narration) } : {}),
      summary: { openApprovalAreas: [...pilotGate.missing], failingEvidenceSurfaces },
    }
  }
  async renderPilotReviewerMarkdown(input: { comprehension: ComprehensionEvidenceReport; accessibility: AccessibilityEvidenceReport; narration?: NarrationEvaluation }): Promise<string> {
    const bundle = await this.getPilotEvidenceBundle(input)
    const lines = [
      '# Pilot reviewer export', '', `Generated at: ${bundle.generatedAt}`, `Pilot gate: ${bundle.pilotGate.ready ? 'ready' : 'not ready'}`,
      `Open approval areas: ${bundle.summary.openApprovalAreas.length > 0 ? bundle.summary.openApprovalAreas.join(', ') : 'none'}`,
      `Failing evidence surfaces: ${bundle.summary.failingEvidenceSurfaces.length > 0 ? bundle.summary.failingEvidenceSurfaces.join(', ') : 'none'}`,
      '', '## Approvals', '',
      ...(bundle.pilotGate.approvals.length > 0 ? bundle.pilotGate.approvals.map(approval => `- ${approval.area}: ${approval.approver} (${approval.evidenceReference})`) : ['- None.']),
      '', '## Evidence surfaces', '',
      `- Comprehension: ${bundle.comprehension.passed ? 'passing' : 'failing'} (${bundle.comprehension.coverage.passedChecks}/${bundle.comprehension.coverage.totalChecks} checks passed${bundle.comprehension.missing.length > 0 ? `; missing: ${bundle.comprehension.missing.join(', ')}` : ''})`,
      `- Accessibility: ${bundle.accessibility.passed ? 'passing' : 'failing'} (${bundle.accessibility.coverage.passedChecks}/${bundle.accessibility.coverage.totalChecks} checks passed${bundle.accessibility.missing.length > 0 ? `; missing: ${bundle.accessibility.missing.join(', ')}` : ''})`,
      `- Drills: ${bundle.drills.openGaps.length === 0 ? 'passing' : 'failing'} (${bundle.drills.totalDrills} recorded; open gaps: ${bundle.drills.openGaps.length})`,
      `- Quality: ${bundle.quality.segments.length} segment${bundle.quality.segments.length === 1 ? '' : 's'} recorded`,
      ...(bundle.narration ? [`- Narration: ${bundle.narration.safe ? 'passing' : 'failing'}${bundle.narration.safe ? '' : ` (violations: ${bundle.narration.violations.join(', ')})`}`] : []),
      '', '## Drill follow-ups', '',
      ...(bundle.drills.openGaps.length > 0 ? bundle.drills.openGaps.map(gap => `- ${gap.scenario} — ${gap.result} — owner: ${gap.owner} — follow-up: ${gap.followUpTicket}`) : ['- None.']),
    ]
    return lines.join('\n')
  }
  async renderPilotReviewerJson(input: { comprehension: ComprehensionEvidenceReport; accessibility: AccessibilityEvidenceReport; narration?: NarrationEvaluation }): Promise<string> {
    const bundle = await this.getPilotEvidenceBundle(input)
    return JSON.stringify({ ...bundle, markdown: await this.renderPilotReviewerMarkdown(input) }, null, 2)
  }
  getPilotGate(): PilotGate {
    const required: PilotApprovalArea[] = ['product', 'legal', 'privacy', 'security', 'operations', 'accessibility', 'vendor']
    const missing = required.filter(area => !this.pilotApprovals.has(area))
    return {
      ready: missing.length === 0 && !!this.launchScope,
      missing,
      approvals: [...this.pilotApprovals.values()].map(item => structuredClone(item)),
      ...(this.launchScope ? { launchScope: structuredClone(this.launchScope) } : {}),
      missingLaunchScope: !this.launchScope,
    }
  }
  assertRealConsumerPilotReady(): void {
    const gate = this.getPilotGate()
    if (gate.missingLaunchScope) throw new Error('Pilot launch scope is not configured')
    if (!gate.ready) throw new Error(`Pilot approvals incomplete: ${gate.missing.join(', ')}`)
  }
  private recordTimestamp(subjectId: Id, patch: Partial<{ uploadCompletedAt?: string; reportParsedAt?: string; analysisCreatedAt?: string }>): void {
    const existing = this.timelineBySubject.get(subjectId) ?? {}
    this.timelineBySubject.set(subjectId, { ...existing, ...patch })
  }

  private getLatencySummary(values: number[]): QualityLatencySummary {
    if (values.length === 0) return { sampleSize: 0, averageMs: 0, maxMs: 0 }
    const total = values.reduce((sum, value) => sum + value, 0)
    return { sampleSize: values.length, averageMs: total / values.length, maxMs: Math.max(...values) }
  }

  async getQualityReport(): Promise<QualityReport> {
    const segments = new Map<string, QualityReportSegment>()
    const [uploads, reports, matches, analyses, users] = await Promise.all([
      this.store.listAllUploads(), this.store.listAllReports(), this.store.listAllMatches(), this.store.listAllAnalyses(), this.store.listAllUsers(),
    ])
    const usersById = new Map(users.map(u => [u.id, u]))
    const reportsByUpload = new Map(reports.map(r => [r.uploadId, r]))

    const getSegment = (provider: string, documentType: 'pdf' | 'html', jurisdiction: Jurisdiction): QualityReportSegment => {
      const key = `${provider}|${documentType}|${jurisdiction}`
      const existing = segments.get(key)
      if (existing) return existing
      const created: QualityReportSegment = {
        provider, documentType, jurisdiction, uploads: 0, parsedReports: 0, analyses: 0,
        findings: { total: 0, averagePerAnalysis: 0, bySeverity: { low: 0, medium: 0, high: 0 }, byClassification: { 'observed-fact': 0, 'inconsistency': 0, 'potential-error': 0, 'verification-recommended': 0, 'potential-compliance-concern': 0, 'insufficient-information': 0, 'educational-opportunity': 0 } },
        matching: { proposedGroups: 0, confirmedGroups: 0, highConfidenceProposals: 0, splitGroups: 0 },
        parser: { reportsWithTradelines: 0, averageTradelinesPerReport: 0 },
        latency: { uploadToParse: { sampleSize: 0, averageMs: 0, maxMs: 0 }, parseToAnalysis: { sampleSize: 0, averageMs: 0, maxMs: 0 } },
      }
      segments.set(key, created)
      return created
    }

    const uploadToParseByKey = new Map<string, number[]>()
    const parseToAnalysisByKey = new Map<string, number[]>()
    const tradelineCountsByKey = new Map<string, number[]>()

    for (const upload of uploads) {
      if (upload.stage !== 'ready-to-parse' || !upload.mediaType) continue
      const jurisdiction = usersById.get(upload.userId)?.consent?.analysisJurisdiction
      if (!jurisdiction) continue
      const provider = reportsByUpload.get(upload.id)?.provider ?? 'unknown'
      const documentType = upload.mediaType === 'application/pdf' ? 'pdf' : 'html'
      const key = `${provider}|${documentType}|${jurisdiction}`
      getSegment(provider, documentType, jurisdiction).uploads += 1
      uploadToParseByKey.set(key, uploadToParseByKey.get(key) ?? [])
      parseToAnalysisByKey.set(key, parseToAnalysisByKey.get(key) ?? [])
      tradelineCountsByKey.set(key, tradelineCountsByKey.get(key) ?? [])
    }

    const uploadsById = new Map(uploads.map(u => [u.id, u]))
    for (const report of reports) {
      const upload = uploadsById.get(report.uploadId)
      if (!upload?.mediaType) continue
      const jurisdiction = usersById.get(report.userId)?.consent?.analysisJurisdiction
      if (!jurisdiction) continue
      const documentType = upload.mediaType === 'application/pdf' ? 'pdf' : 'html'
      const key = `${report.provider}|${documentType}|${jurisdiction}`
      const segment = getSegment(report.provider, documentType, jurisdiction)
      segment.parsedReports += 1
      if (report.tradelines.length > 0) segment.parser.reportsWithTradelines += 1
      ;(tradelineCountsByKey.get(key) ?? []).push(report.tradelines.length)
      const times = this.timelineBySubject.get(report.id)
      if (times?.uploadCompletedAt && times.reportParsedAt) {
        const delta = Date.parse(times.reportParsedAt) - Date.parse(times.uploadCompletedAt)
        if (Number.isFinite(delta) && delta >= 0) (uploadToParseByKey.get(key) ?? []).push(delta)
      }
    }

    const reportsById = new Map(reports.map(r => [r.id, r]))
    for (const match of matches) {
      const report = reportsById.get(match.reportId)
      if (!report) continue
      const upload = uploadsById.get(report.uploadId)
      if (!upload?.mediaType) continue
      const jurisdiction = usersById.get(report.userId)?.consent?.analysisJurisdiction
      if (!jurisdiction) continue
      const documentType = upload.mediaType === 'application/pdf' ? 'pdf' : 'html'
      const segment = getSegment(report.provider, documentType, jurisdiction)
      segment.matching.proposedGroups += 1
      if (match.confidence >= 0.9) segment.matching.highConfidenceProposals += 1
      if (match.state === 'confirmed') segment.matching.confirmedGroups += 1
      if (match.state === 'split' || match.confidence < 0.9) segment.matching.splitGroups += 1
    }

    for (const analysis of analyses) {
      const report = reportsById.get(analysis.reportId)
      if (!report) continue
      const upload = uploadsById.get(report.uploadId)
      if (!upload?.mediaType) continue
      const jurisdiction = analysis.versions.jurisdiction as Jurisdiction
      const documentType = upload.mediaType === 'application/pdf' ? 'pdf' : 'html'
      const key = `${report.provider}|${documentType}|${jurisdiction}`
      const segment = getSegment(report.provider, documentType, jurisdiction)
      segment.analyses += 1
      segment.findings.total += analysis.findings.length
      for (const finding of analysis.findings) {
        segment.findings.bySeverity[finding.severity] += 1
        segment.findings.byClassification[finding.classification] += 1
      }
      const times = this.timelineBySubject.get(analysis.id)
      if (times?.reportParsedAt && times.analysisCreatedAt) {
        const delta = Date.parse(times.analysisCreatedAt) - Date.parse(times.reportParsedAt)
        if (Number.isFinite(delta) && delta >= 0) (parseToAnalysisByKey.get(key) ?? []).push(delta)
      }
    }

    for (const [key, segment] of segments.entries()) {
      segment.findings.averagePerAnalysis = segment.analyses === 0 ? 0 : segment.findings.total / segment.analyses
      const tradelineCounts = tradelineCountsByKey.get(key) ?? []
      segment.parser.averageTradelinesPerReport = tradelineCounts.length === 0 ? 0 : tradelineCounts.reduce((sum, value) => sum + value, 0) / tradelineCounts.length
      segment.latency.uploadToParse = this.getLatencySummary(uploadToParseByKey.get(key) ?? [])
      segment.latency.parseToAnalysis = this.getLatencySummary(parseToAnalysisByKey.get(key) ?? [])
    }

    return { generatedAt: now(), segments: [...segments.values()].map(segment => structuredClone(segment)) }
  }

  async getAuditEvents(sessionId: Id): Promise<AuditEvent[]> {
    const userId = await this.requireSession(sessionId)
    return this.store.listAuditEventsForActor(userId)
  }

  private async requireSessionWithCsrf(sessionId: Id, csrfToken: string): Promise<Id> {
    const userId = await this.requireSession(sessionId)
    const session = await this.store.getSession(sessionId)
    if (!session || !csrfToken || session.csrfToken.length !== csrfToken.length || !timingSafeEqual(Buffer.from(session.csrfToken), Buffer.from(csrfToken))) throw new Error('Invalid request protection token')
    return userId
  }
  private async requireOwnerSession(sessionId: Id): Promise<Id> {
    const userId = await this.requireSession(sessionId)
    const configuredOwner = this.ownerEmail?.trim().toLowerCase()
    if (!configuredOwner) throw new Error('Owner dashboard is not configured')
    const user = await this.store.getUserById(userId)
    if (!user || user.email !== configuredOwner) throw new Error('Owner authorization required')
    return userId
  }

  /** Session hardening (D10): fails closed on revocation, absolute expiry, and idle timeout;
   *  refreshes lastUsedAt on every authenticated call (sliding idle window). */
  private async requireSession(sessionId: Id): Promise<Id> {
    const session = await this.store.getSession(sessionId)
    if (!session || session.revokedAt) throw new Error('Authentication required')
    const nowMs = Date.now()
    if (Date.parse(session.expiresAt) <= nowMs) throw new Error('Authentication required')
    if (Date.parse(session.lastUsedAt) + SESSION_IDLE_TTL_MS <= nowMs) throw new Error('Authentication required')
    session.lastUsedAt = now()
    await this.store.updateSession(session)
    return session.userId
  }
  private async audit(type: string, actorId: Id, subjectId: Id, metadata: Record<string, string>): Promise<void> {
    await this.store.appendAuditEvent({ id: randomUUID(), type, actorId, subjectId, at: now(), metadata })
  }
}

type ParserInput = { provider: string; template: string; reportDate: string; identity: string[]; addresses: string[]; employers: string[]; inquiries: string[]; publicRecords: string[]; scores: number[]; remarks: string[]; tradelines: Array<{ bureau: Bureau; creditor: string; account: string; accountType: string; balance: number; creditLimit?: number; pastDue?: number; status: string; opened: string; updated: string; dateOfFirstDelinquency?: string; paymentHistory?: Array<{ yearMonth: string; status: string }>; remarks?: string[]; specialCommentCodes?: string[]; confidence?: number }> }
function isParserInput(value: unknown): value is ParserInput { if (!value || typeof value !== 'object') return false; const item = value as Record<string, unknown>; return typeof item.provider === 'string' && typeof item.template === 'string' && typeof item.reportDate === 'string' && ['identity', 'addresses', 'employers', 'inquiries', 'publicRecords', 'scores', 'remarks', 'tradelines'].every(key => Array.isArray(item[key])) }

/** Map the parser's ProviderReport → the platform's CanonicalReport (bureaus kept separate; unknowns marked). */
function mapParserReportToCanonical(pr: ParserReport, userId: Id, uploadId: Id): CanonicalReport {
  const parserVersion = pr.template
  const toCanonical = <T>(pv: ParserValue<T>, currency?: 'USD'): CanonicalValue<T> => ({
    id: randomUUID(), bureau: pv.bureau as Bureau, field: pv.field, normalized: pv.normalized, originalDisplay: pv.originalDisplay,
    state: pv.state === 'known' ? 'known' : 'unknown', source: pv.source, extractionMethod: 'native-text', parserVersion, confidence: pv.confidence,
    ...(currency ? { currency } : {}),
  })
  const known = (bureau: Bureau, field: string, value: string): CanonicalValue<string> => ({
    id: randomUUID(), bureau, field, normalized: value, originalDisplay: value, state: 'known',
    source: { kind: 'page', locator: field, snippet: value.slice(0, 80) }, extractionMethod: 'native-text', parserVersion, confidence: 1,
  })
  const unknown = (bureau: Bureau, field: string): CanonicalValue<string> => ({
    id: randomUUID(), bureau, field, normalized: null, originalDisplay: '', state: 'unknown',
    source: { kind: 'page', locator: field, snippet: '' }, extractionMethod: 'native-text', parserVersion, confidence: 0,
  })
  const tradelines = pr.tradelines
    .filter(t => t.bureau === 'transunion' || t.bureau === 'experian' || t.bureau === 'equifax')
    .map((t): Tradeline => {
      const bureau = t.bureau as Bureau // filter above excluded 'unknown'; the PDF adapter only emits TU/EX/EQ
      return ({
        id: randomUUID(),
        creditor: toCanonical(t.creditor),
        maskedAccount: known(bureau, 'account', t.maskedAccount || '••••'),
        accountType: toCanonical(t.accountType),
        balance: toCanonical(t.balance, 'USD'),
        creditLimit: toCanonical(t.creditLimit, 'USD'),
        pastDue: toCanonical(t.pastDue, 'USD'),
        status: toCanonical(t.status),
        opened: toCanonical(t.opened),
        updated: toCanonical(t.updated),
        dateOfFirstDelinquency: toCanonical(t.dateOfFirstDelinquency),
        paymentHistory: t.paymentHistory.map(cell => ({ ...toCanonical(cell), yearMonth: cell.yearMonth })),
        remarks: t.remarks.map(value => toCanonical(value)),
        specialCommentCodes: t.specialCommentCodes.map(value => toCanonical(value)),
      })
    })
  const personal = pr.personalInformation
  const bureauScoped = (values: ParserValue<string>[]) => values.filter(value => value.bureau !== 'unknown').map(value => toCanonical(value))
  // Names, dates of birth, and SSN fragments all live in `identity` and are told apart by `field`.
  // Keeping them in one array means allValues() reaches them for review/projection without a
  // parallel traversal per identity kind, and the field name is what every consumer already keys on.
  const parserIdentity = [
    ...pr.identity.map(value => toCanonical(value)),
    ...bureauScoped(personal.names),
    ...bureauScoped(personal.alsoKnownAs),
    ...bureauScoped(personal.datesOfBirth),
    ...bureauScoped(personal.socialSecurityFragments),
  ]
  const addresses = [...bureauScoped(personal.currentAddresses), ...bureauScoped(personal.previousAddresses)]
  const employers = bureauScoped(personal.employers)
  const inquiries = pr.inquiries.map((inquiry): Inquiry => ({ id: randomUUID(), bureau: inquiry.bureau as Bureau, creditor: toCanonical(inquiry.creditor), businessType: toCanonical(inquiry.businessType), date: toCanonical(inquiry.date) }))
  const scores = pr.scores.map((score): CanonicalScore => ({ ...toCanonical(score.score), scale: toCanonical(score.scale) }))
  return { id: randomUUID(), userId, uploadId, provider: pr.provider, template: pr.template, parserVersion, normalizedVersion: 1, reportDate: pr.reportDate ?? '', identity: parserIdentity, addresses, employers, tradelines, collections: [], inquiries, publicRecords: [], scores, remarks: [], reviewComplete: false }
}
function displayRecipient(report: CanonicalReport): ReportRecipient | undefined {
  const candidate = report.identity.find(value => value.field === 'consumer-display-name' && value.state === 'known' && value.normalized && value.confidence >= 0.95)
  return candidate?.normalized ? { displayName: candidate.normalized, source: { kind: candidate.source.kind, locator: candidate.source.locator }, confidence: candidate.confidence } : undefined
}

function allValues(report: CanonicalReport): CanonicalValue<unknown>[] { const direct: CanonicalValue<unknown>[] = [...report.identity, ...report.addresses, ...report.employers, ...report.inquiries.flatMap(inquiry => [inquiry.creditor, inquiry.businessType, inquiry.date]), ...report.publicRecords, ...report.scores.flatMap(score => [score, score.scale]), ...report.remarks]; for (const line of [...report.tradelines, ...report.collections]) direct.push(line.creditor, line.maskedAccount, line.accountType, line.balance, line.creditLimit, line.pastDue, line.status, line.opened, line.updated, line.dateOfFirstDelinquency, ...line.paymentHistory, ...line.remarks, ...line.specialCommentCodes); return direct }

/** The publishable-confidence floor. Every catalog rule sets minimumConfidence at or above this,
 *  so a value below it can never reach a Finding — it suppresses instead. */
export const PUBLISHABLE_CONFIDENCE = 0.9

/**
 * Extraction exceptions the consumer may optionally correct: values this parser failed on, or
 * read below the publishable floor.
 *
 * Deliberately NOT every extracted value. A confidently-read value has nothing to ask about —
 * requiring the consumer to endorse it would make them the parser's QA department, would turn a
 * tri-bureau report into thousands of forced decisions, and would launder parser error into
 * consumer-attested data. Values the parser could not read at all stay absent and are disclosed
 * in the coverage table; they are not questions to answer.
 */
function reviewableValues(report: CanonicalReport): CanonicalValue<string | number>[] {
  return correctableValues(report).filter(value => {
    if (value.review) return true // A correction already made stays visible so it can be revised.
    if (value.state === 'parser-failed') return true
    return value.state === 'known' && value.confidence < PUBLISHABLE_CONFIDENCE
  })
}

/**
 * Every value a consumer is *permitted* to correct — which is any value carrying a comparable
 * normalized reading, not just the exceptions surfaced above.
 *
 * The two sets differ deliberately. We only *ask* about extraction exceptions, because that is
 * the only place a consumer's answer is more informative than the evidence. But if someone reads
 * page 4 and sees that a confidently-extracted value is wrong, their own report is the ground
 * truth and refusing the correction would be indefensible. Bounded prompting, unbounded correction.
 */
function correctableValues(report: CanonicalReport): CanonicalValue<string | number>[] {
  return allValues(report).filter((value): value is CanonicalValue<string | number> =>
    value.normalized === null
      ? value.state === 'parser-failed' || value.state === 'unknown'
      : typeof value.normalized === 'string' || typeof value.normalized === 'number')
}

/** Reviews are an immutable provenance layer on the stored report. Consumers of normalized values
 * receive a clone with corrections/unknown dispositions applied; original display/source/review data
 * remain unchanged in storage for audit and evidence navigation. */
function reviewedReportProjection(report: CanonicalReport): CanonicalReport {
  const projected = structuredClone(report)
  for (const value of allValues(projected)) {
    const review = value.review
    if (!review) continue
    if (review.decision === 'unknown' || review.decision === 'not-shown') {
      value.normalized = null
      value.state = 'unknown'
    } else if (review.decision === 'corrected' && review.replacement !== undefined) {
      value.normalized = review.replacement
      value.state = 'known'
    }
  }
  return projected
}

function reviewedTradelinesForAnalysis(report: CanonicalReport): Tradeline[] {
  return reviewedReportProjection(report).tradelines
}

function validateNarration(text: string, analysis: Analysis): boolean { if (!text.trim() || /guarantee|will be deleted|illegal|violation|\b\d{9}\b|ignore previous|system prompt/i.test(text)) return false; return analysis.findings.every(finding => text.includes(finding.title) && finding.limitations.every(limitation => text.includes(limitation))) }
