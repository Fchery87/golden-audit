import { randomUUID } from 'node:crypto'
import type { Bureau, ParserPaymentHistoryCell, ParserReport, ParserTradeline, ParserValue } from './types.js'
import { bureauForX, detectBureauColumns, nearestBureau, CREDITOR_X_MAX, xCenter, type Word } from './positional-types.js'

/**
 * IdentityIQ tri-bureau PDF adapter.
 *
 * Phase 2 begins the shift from the earlier balance-row spike to account-block reconstruction.
 * We now prefer parsing blocks anchored on `Account #:` and fill the fields the current schema can
 * actually carry: masked account, status, opened date, last reported date, and balance. If no
 * account blocks are detected, we fall back to the earlier balance-row heuristic so the synthetic
 * regression fixtures and odd edge templates still produce a bounded result instead of guessing.
 */

const HEADER_VOCAB = new Set([
  'transunion', 'experian', 'equifax', 'account', 'accounts', 'date', 'opened', 'closed',
  'status', 'recent', 'balance', 'type', 'code', 'collection', 'credit', 'bureau',
  'page', 'report', 'history', 'past', 'due', 'amount', 'high', 'terms', 'remark',
])

const LEFT_LABEL_X_MAX = 220
const BLOCK_ROW_BAND = 4
const FIELD_CONFIDENCE = 1

type BureauValueMap = Partial<Record<Bureau, Word[]>>
type Row = { page: number; yMin: number; words: Word[] }
type FieldName = 'maskedAccount' | 'accountType' | 'status' | 'opened' | 'updated' | 'balance' | 'creditLimit' | 'pastDue' | 'dateOfFirstDelinquency'
type RepeatedFieldName = 'paymentHistory' | 'remarks' | 'specialCommentCodes'

function parseMoney(cell: string): { minor: number | null } {
  const trimmed = cell.trim()
  if (/\d{1,4}[/-]\d{1,2}[/-]\d{1,4}/.test(trimmed)) return { minor: null }
  const cleaned = trimmed.replace(/[^0-9.\-]/g, '')
  const m = cleaned.match(/^(-?\d+)\.(\d{2})$/) ?? cleaned.match(/^(-?\d+)$/)
  if (!m) return { minor: null }
  if (m[2] !== undefined) return { minor: Number(m[1]) * 100 + Math.sign(Number(m[1]) || 1) * Number(m[2]) }
  return { minor: Number(m[1]) * 100 }
}

function rowValue<T>(
  bureau: Bureau, field: string, normalized: T | null, originalDisplay: string,
  page: number, yMin: number, confidence: number, state: ParserValue<T>['state'],
): ParserValue<T> {
  return {
    bureau, field, normalized, originalDisplay, state, confidence,
    source: { kind: 'element', locator: `pdf:p${page}:y${Math.round(yMin)}:${bureau}:${field}`, snippet: originalDisplay.slice(0, 80) },
  }
}

function cleanCreditor(tokens: string[]): string {
  return tokens
    .map(t => t.replace(/[.,;:()]/g, ''))
    .filter(t => t.length > 0 && !HEADER_VOCAB.has(t.toLowerCase()) && !/^\d+$/.test(t))
    .join(' ')
    .trim()
}

function groupRows(words: Word[]): Row[] {
  const byPage = new Map<number, Word[]>()
  for (const w of words) {
    if (!byPage.has(w.page)) byPage.set(w.page, [])
    byPage.get(w.page)?.push(w)
  }
  const rows: Row[] = []
  for (const [page, pageWords] of byPage) {
    pageWords.sort((a, b) => a.yMin - b.yMin || a.xMin - b.xMin)
    const grouped: Word[][] = []
    for (const w of pageWords) {
      const last = grouped[grouped.length - 1]
      if (last && last[0] && Math.abs(last[0].yMin - w.yMin) <= BLOCK_ROW_BAND) last.push(w)
      else grouped.push([w])
    }
    for (const rowWords of grouped) rows.push({ page, yMin: rowWords[0]?.yMin ?? 0, words: rowWords })
  }
  return rows.sort((a, b) => a.page - b.page || a.yMin - b.yMin)
}

function leftLabel(row: Row): string {
  return row.words.filter(w => w.xMin < LEFT_LABEL_X_MAX).map(w => w.text).join(' ').replace(/\s+/g, ' ').trim().toLowerCase()
}

function bureauWordBuckets(row: Row, bureauOf: (x: number) => Bureau | null): BureauValueMap {
  const buckets: BureauValueMap = {}
  for (const word of row.words) {
    const bureau = bureauOf(xCenter(word))
    if (!bureau) continue
    buckets[bureau] ??= []
    buckets[bureau]?.push(word)
  }
  return buckets
}

function joined(words: Word[] | undefined): string {
  return (words ?? []).map(word => word.text).join(' ').replace(/\s+/g, ' ').trim()
}

function findCreditor(rows: Row[], startIndex: number): string {
  for (let i = startIndex - 1; i >= 0; i -= 1) {
    const row = rows[i]
    if (!row) continue
    const label = leftLabel(row)
    if (!label || HEADER_VOCAB.has(label)) continue
    const hasBureauValues = row.words.some(word => word.xMin >= LEFT_LABEL_X_MAX)
    if (hasBureauValues) continue
    const candidate = cleanCreditor(row.words.map(w => w.text))
    if (candidate) return candidate
  }
  return ''
}

function isAccountStart(row: Row, bureauOf: (x: number) => Bureau | null): boolean {
  if (!/^account\s+#:?$/i.test(leftLabel(row))) return false
  const buckets = bureauWordBuckets(row, bureauOf)
  return (['transunion', 'experian', 'equifax'] as const)
    .filter(bureau => joined(buckets[bureau]).length > 0).length >= 2
}

function normalizeFieldText(field: FieldName, text: string): string {
  const compact = text.replace(/\s+/g, ' ').trim()
  if (field === 'maskedAccount') return compact.replace(/^#:\s*/, '').trim()
  if (field === 'accountType') return compact.replace(/^type:\s*/i, '').trim()
  if (field === 'status') return compact.replace(/^status:\s*/i, '').trim()
  if (field === 'opened') return compact.replace(/^opened:\s*/i, '').trim()
  if (field === 'updated') return compact.replace(/^reported:\s*/i, '').trim()
  if (field === 'balance') return compact.replace(/^balance:\s*/i, '').trim()
  if (field === 'creditLimit') return compact.replace(/^(credit\s+limit|high\s+credit):\s*/i, '').trim()
  if (field === 'pastDue') return compact.replace(/^past\s+due:\s*/i, '').trim()
  if (field === 'dateOfFirstDelinquency') return compact.replace(/^date\s+of\s+first\s+delinquency:\s*/i, '').trim()
  return compact
}

function parseField(field: FieldName, bureau: Bureau, text: string, page: number, yMin: number): ParserValue<string> | ParserValue<number> {
  const normalizedText = normalizeFieldText(field, text)
  if (field === 'balance' || field === 'creditLimit' || field === 'pastDue') {
    const { minor } = parseMoney(normalizedText)
    return minor === null
      ? rowValue<number>(bureau, field, null, normalizedText, page, yMin, 0, 'unknown')
      : rowValue<number>(bureau, field, minor, normalizedText, page, yMin, FIELD_CONFIDENCE, 'known')
  }
  if (field === 'maskedAccount') {
    const compact = normalizedText.replace(/\s+/g, '')
    const hasMasking = /[*•]/.test(compact)
    const digits = compact.replace(/\D/g, '')
    const normalized = hasMasking ? compact : (digits ? `••••${digits.slice(-4)}` : '')
    return normalized
      ? rowValue<string>(bureau, 'account', normalized, normalizedText, page, yMin, FIELD_CONFIDENCE, 'known')
      : rowValue<string>(bureau, 'account', null, normalizedText, page, yMin, 0, 'unknown')
  }
  return normalizedText
    ? rowValue<string>(bureau, field, normalizedText, normalizedText, page, yMin, FIELD_CONFIDENCE, 'known')
    : rowValue<string>(bureau, field, null, normalizedText, page, yMin, 0, 'unknown')
}

type RepeatedValue = { value: string; yearMonth?: string }

function parseRepeatedValues(field: RepeatedFieldName, bureau: Bureau, text: string, page: number, yMin: number): ParserValue<string>[] {
  const normalized = text.replace(/\s+/g, ' ').trim()
  const content = field === 'remarks' ? normalized.replace(/^remarks?:\s*/i, '') : field === 'specialCommentCodes' ? normalized.replace(/^special\s+comment\s+codes?:\s*/i, '') : normalized
  if (!content) return []
  const values: RepeatedValue[] = field === 'paymentHistory' ? content.split(/\s+/).flatMap(token => {
    const match = /^(\d{4}-\d{2}):(.+)$/.exec(token)
    return match?.[1] && match[2] ? [{ yearMonth: match[1], value: match[2] }] : []
  }) : [{ value: content }]
  return values.map((item, index) => ({
    ...rowValue<string>(bureau, field, item.value, item.value, page, yMin, FIELD_CONFIDENCE, 'known'),
    ...(field === 'paymentHistory' && item.yearMonth ? { yearMonth: item.yearMonth, source: { kind: 'element' as const, locator: `pdf:p${page}:y${Math.round(yMin)}:${bureau}:${field}:${item.yearMonth}`, snippet: item.value.slice(0, 80) } } : {}),
    ...(field !== 'paymentHistory' ? { source: { kind: 'element' as const, locator: `pdf:p${page}:y${Math.round(yMin)}:${bureau}:${field}:${index}`, snippet: item.value.slice(0, 80) } } : {}),
  }))
}

function unknownDateOfFirstDelinquency(bureau: Bureau, page: number, yMin: number): ParserValue<string> {
  return rowValue<string>(bureau, 'dateOfFirstDelinquency', null, '', page, yMin, 0, 'unknown')
}

function parsePaymentHistoryRows(bureau: Bureau, rows: Row[], bureauOf: (x: number) => Bureau | null): ParserPaymentHistoryCell[] {
  const cells = rows.flatMap(row => parseRepeatedValues('paymentHistory', bureau, joined(bureauWordBuckets(row, bureauOf)[bureau]), row.page, row.yMin) as ParserPaymentHistoryCell[])
  const counts = new Map<string, number>()
  for (const cell of cells) counts.set(cell.yearMonth, (counts.get(cell.yearMonth) ?? 0) + 1)
  return cells.filter(cell => counts.get(cell.yearMonth) === 1)
}

function buildTradelinesFromAccountBlocks(words: Word[]): ParserTradeline[] {
  const tradelines: ParserTradeline[] = []
  const detected = detectBureauColumns(words)
  const bureauOf = (x: number) => (detected ? nearestBureau(x, detected) : bureauForX(x))
  const rows = groupRows(words)

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]
    if (!row || !isAccountStart(row, bureauOf)) continue

    const creditor = findCreditor(rows, index)
    if (!creditor) continue

    const fieldRows = new Map<FieldName, Row>()
    const repeatedRows = new Map<RepeatedFieldName, Row[]>()
    fieldRows.set('maskedAccount', row)
    for (let cursor = index + 1; cursor < rows.length; cursor += 1) {
      const candidate = rows[cursor]
      if (!candidate || candidate.page !== row.page) break
      if (isAccountStart(candidate, bureauOf)) break
      const label = leftLabel(candidate)
      if (/^account\s+type:?$/i.test(label)) fieldRows.set('accountType', candidate)
      else if (/^account\s+status:?$/i.test(label)) fieldRows.set('status', candidate)
      else if (/^date\s+opened:?$/i.test(label)) fieldRows.set('opened', candidate)
      else if (/^last\s+reported:?$/i.test(label)) fieldRows.set('updated', candidate)
      else if (/^balance:?$/i.test(label)) fieldRows.set('balance', candidate)
      else if (/^high\s+credit:?$/i.test(label)) fieldRows.set('creditLimit', candidate)
      else if (/^credit\s+limit:?$/i.test(label)) fieldRows.set('creditLimit', candidate)
      else if (/^past\s+due:?$/i.test(label)) fieldRows.set('pastDue', candidate)
      else if (/^date\s+of\s+first\s+delinquency:?$/i.test(label)) fieldRows.set('dateOfFirstDelinquency', candidate)
      else if (/^payment\s+history:?$/i.test(label)) repeatedRows.set('paymentHistory', [...(repeatedRows.get('paymentHistory') ?? []), candidate])
      else if (/^remarks?:?$/i.test(label)) repeatedRows.set('remarks', [...(repeatedRows.get('remarks') ?? []), candidate])
      else if (/^special\s+comment\s+codes?:?$/i.test(label)) repeatedRows.set('specialCommentCodes', [...(repeatedRows.get('specialCommentCodes') ?? []), candidate])
    }

    const fieldMaps = new Map<FieldName, BureauValueMap>()
    for (const [field, sourceRow] of fieldRows) fieldMaps.set(field, bureauWordBuckets(sourceRow, bureauOf))
    const presentBureaus = new Set<Bureau>()
    for (const buckets of fieldMaps.values()) {
      for (const bureau of ['transunion', 'experian', 'equifax'] as const) {
        if (joined(buckets[bureau]).length > 0) presentBureaus.add(bureau)
      }
    }

    for (const bureau of ['transunion', 'experian', 'equifax'] as const) {
      if (!presentBureaus.has(bureau)) continue
      const accountText = joined(fieldMaps.get('maskedAccount')?.[bureau])
      const accountTypeText = joined(fieldMaps.get('accountType')?.[bureau])
      const statusText = joined(fieldMaps.get('status')?.[bureau])
      const openedText = joined(fieldMaps.get('opened')?.[bureau])
      const updatedText = joined(fieldMaps.get('updated')?.[bureau])
      const balanceText = joined(fieldMaps.get('balance')?.[bureau])
      const creditLimitText = joined(fieldMaps.get('creditLimit')?.[bureau])
      const pastDueText = joined(fieldMaps.get('pastDue')?.[bureau])
      const dofdRow = fieldRows.get('dateOfFirstDelinquency')
      const dofdText = joined(fieldMaps.get('dateOfFirstDelinquency')?.[bureau])
      const paymentHistoryRows = repeatedRows.get('paymentHistory') ?? []
      const remarksRows = repeatedRows.get('remarks') ?? []
      const specialCommentCodesRows = repeatedRows.get('specialCommentCodes') ?? []
      const remarks = remarksRows.flatMap(sourceRow => parseRepeatedValues('remarks', bureau, joined(bureauWordBuckets(sourceRow, bureauOf)[bureau]), sourceRow.page, sourceRow.yMin))
      const specialCommentCodes = specialCommentCodesRows.flatMap(sourceRow => parseRepeatedValues('specialCommentCodes', bureau, joined(bureauWordBuckets(sourceRow, bureauOf)[bureau]), sourceRow.page, sourceRow.yMin))
      const balance = parseField('balance', bureau, balanceText, row.page, row.yMin) as ParserValue<number>
      // The adapter only emits a tradeline when the account block contains a usable balance.
      // This preserves the original parser's strict, money-row-backed account boundary and
      // prevents section/header blocks from becoming unknown-value tradelines.
      if (balance.normalized === null) continue
      tradelines.push({
        id: randomUUID(),
        bureau,
        creditor,
        maskedAccount: (parseField('maskedAccount', bureau, accountText, row.page, row.yMin) as ParserValue<string>).normalized ?? '',
        accountType: parseField('accountType', bureau, accountTypeText, row.page, row.yMin) as ParserValue<string>,
        balance,
        creditLimit: parseField('creditLimit', bureau, creditLimitText, row.page, row.yMin) as ParserValue<number>,
        pastDue: parseField('pastDue', bureau, pastDueText, row.page, row.yMin) as ParserValue<number>,
        status: parseField('status', bureau, statusText, row.page, row.yMin) as ParserValue<string>,
        opened: parseField('opened', bureau, openedText, row.page, row.yMin) as ParserValue<string>,
        updated: parseField('updated', bureau, updatedText, row.page, row.yMin) as ParserValue<string>,
        dateOfFirstDelinquency: dofdText ? parseField('dateOfFirstDelinquency', bureau, dofdText, dofdRow?.page ?? row.page, dofdRow?.yMin ?? row.yMin) as ParserValue<string> : unknownDateOfFirstDelinquency(bureau, row.page, row.yMin),
        paymentHistory: parsePaymentHistoryRows(bureau, paymentHistoryRows, bureauOf),
        remarks,
        specialCommentCodes,
      })
    }
  }

  return tradelines
}

function buildTradelinesFromBalanceRows(words: Word[]): ParserTradeline[] {
  const tradelines: ParserTradeline[] = []
  const detected = detectBureauColumns(words)
  const bureauOf = (x: number) => (detected ? nearestBureau(x, detected) : bureauForX(x))

  const byPage = new Map<number, Word[]>()
  for (const w of words) {
    if (!byPage.has(w.page)) byPage.set(w.page, [])
    byPage.get(w.page)?.push(w)
  }

  for (const [, pageWords] of byPage) {
    pageWords.sort((a, b) => a.yMin - b.yMin || a.xMin - b.xMin)
    const rows: Word[][] = []
    for (const w of pageWords) {
      const last = rows[rows.length - 1]
      if (last && last[0] && Math.abs(last[0].yMin - w.yMin) <= 4) last.push(w)
      else rows.push([w])
    }

    for (const row of rows) {
      const bureauMoney = new Map<Bureau, { word: Word; minor: number }>()
      for (const w of row) {
        const bureau = bureauOf(xCenter(w))
        if (!bureau) continue
        const { minor } = parseMoney(w.text)
        if (minor !== null) bureauMoney.set(bureau, { word: w, minor })
      }
      if (bureauMoney.size < 2) continue

      const creditor = cleanCreditor(row.filter(w => xCenter(w) < CREDITOR_X_MAX).map(w => w.text))
      if (!creditor) continue

      for (const [bureau, { word, minor }] of bureauMoney) {
        tradelines.push({
          id: randomUUID(),
          bureau,
          creditor,
          maskedAccount: '',
          accountType: rowValue<string>(bureau, 'accountType', null, '', word.page, word.yMin, 0, 'unknown'),
          balance: rowValue<number>(bureau, 'balance', minor, word.text, word.page, word.yMin, 1, 'known'),
          creditLimit: rowValue<number>(bureau, 'creditLimit', null, '', word.page, word.yMin, 0, 'unknown'),
          pastDue: rowValue<number>(bureau, 'pastDue', null, '', word.page, word.yMin, 0, 'unknown'),
          status: rowValue<string>(bureau, 'status', null, '', word.page, word.yMin, 0, 'unknown'),
          opened: rowValue<string>(bureau, 'opened', null, '', word.page, word.yMin, 0, 'unknown'),
          updated: rowValue<string>(bureau, 'updated', null, '', word.page, word.yMin, 0, 'unknown'),
          dateOfFirstDelinquency: unknownDateOfFirstDelinquency(bureau, word.page, word.yMin),
          paymentHistory: [],
          remarks: [],
          specialCommentCodes: [],
        })
      }
    }
  }

  return tradelines
}

export function parseIdentityIqPdf(words: Word[]): ParserReport {
  const accountBlockTradelines = buildTradelinesFromAccountBlocks(words)
  const supportedBureaus = new Set(accountBlockTradelines.map(line => line.bureau))
  if (supportedBureaus.has('transunion') && supportedBureaus.has('experian') && supportedBureaus.has('equifax')) {
    return { provider: 'identityiq', template: 'identityiq-pdf-v1', reportDate: null, tradelines: accountBlockTradelines }
  }

  // Some older IdentityIQ layouts omit an account-block balance in one column while still
  // rendering balance-only rows for that bureau. Retain the proven row parser only for the
  // missing bureau(s), rather than inventing a value or discarding the report's tri-bureau
  // coverage. These fallback rows deliberately keep account metadata unknown, so rules that
  // require the omitted fields suppress instead of treating the row as fully reconstructed.
  const fallbackTradelines = buildTradelinesFromBalanceRows(words)
    .filter(line => !supportedBureaus.has(line.bureau))
  return { provider: 'identityiq', template: 'identityiq-pdf-v1', reportDate: null, tradelines: [...accountBlockTradelines, ...fallbackTradelines] }
}
