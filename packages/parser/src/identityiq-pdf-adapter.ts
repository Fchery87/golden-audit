import { randomUUID } from 'node:crypto'
import type { Bureau, ParserInquiry, ParserPaymentHistoryCell, ParserPersonalInformation, ParserReport, ParserScore, ParserTradeline, ParserValue } from './types.js'
import { emptyPersonalInformation } from './types.js'
import { bureauForX, detectBureauColumns, nearestBureau, xCenter, type Word } from './positional-types.js'

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

/**
 * Distance left of the first bureau column within which a word is a label, not a value.
 *
 * The bureau columns are detected per report because their x-centres move between templates
 * (TransUnion sits at ≈241 in one authorized sample and ≈308 in another), so the boundary between
 * a row's label and its values has to move with them. A fixed cut puts a report's labels on the
 * wrong side of it in both directions: too far right and the label's own words are assigned to the
 * nearest column — always TransUnion — so `Account Type: Revolving` is stored as that bureau's
 * account type; too far left and the joined label no longer matches its field pattern, so the
 * entire account block goes undetected. Both were happening across all four samples.
 */
const LABEL_COLUMN_MARGIN = 60

/**
 * How a row splits into a label and its per-bureau values.
 *
 * When no bureau header row is found there is nothing to derive the boundary from — synthetic
 * fixtures and odd templates — so the legacy fixed cut is retained rather than guessed at.
 */
type Layout = { isLabelWord: (word: Word) => boolean; bureauOf: (x: number) => Bureau | null }

function columnLayout(words: Word[]): Layout {
  const columns = detectBureauColumns(words)
  if (!columns) return { isLabelWord: word => word.xMin < LEFT_LABEL_X_MAX, bureauOf: bureauForX }
  const boundary = Math.min(...columns.map(column => column.x)) - LABEL_COLUMN_MARGIN
  return { isLabelWord: word => xCenter(word) < boundary, bureauOf: x => (x < boundary ? null : nearestBureau(x, columns)) }
}

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
    .filter(t => t.length > 0 && !/^\d+$/.test(t))
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

/** The legacy fixed cut. Retained for the score reader, which derives its own column cutoff. */
function leftLabel(row: Row): string {
  return row.words.filter(w => w.xMin < LEFT_LABEL_X_MAX).map(w => w.text).join(' ').replace(/\s+/g, ' ').trim().toLowerCase()
}

function labelText(row: Row, layout: Layout): string {
  return row.words.filter(layout.isLabelWord).map(word => word.text).join(' ').replace(/\s+/g, ' ').trim().toLowerCase()
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

function findCreditor(rows: Row[], startIndex: number, layout: Layout): { text: string; row: Row } | undefined {
  const accountRow = rows[startIndex]
  if (!accountRow) return undefined
  // The creditor name precedes its `Account #:` row, and that pairing survives a page break too, so
  // the search stops at the previous account or the section heading rather than at the page edge.
  for (let i = startIndex - 1; i >= 0; i -= 1) {
    const row = rows[i]
    if (!row || isAccountStart(row, layout) || isSectionAnchor(row)) break
    const label = labelText(row, layout)
    if (!label || HEADER_VOCAB.has(label)) continue
    const hasBureauValues = row.words.some(word => !layout.isLabelWord(word))
    if (hasBureauValues) continue
    const text = cleanCreditor(row.words.map(w => w.text))
    if (text) return { text, row }
  }
  return undefined
}

/**
 * A section heading. IdentityIQ renders `Back to Top` on every one, which makes it the reliable
 * end-of-section marker — and the only thing besides the next account that should stop a block.
 */
function isSectionAnchor(row: Row): boolean {
  return /back to top/i.test(row.words.map(word => word.text).join(' '))
}

function isAccountStart(row: Row, layout: Layout): boolean {
  if (!/^account\s+#:?$/i.test(labelText(row, layout))) return false
  const buckets = bureauWordBuckets(row, layout.bureauOf)
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

function parsePaymentHistoryRows(bureau: Bureau, rows: Row[], layout: Layout): ParserPaymentHistoryCell[] {
  const cells = rows.flatMap(row => parseRepeatedValues('paymentHistory', bureau, joined(bureauWordBuckets(row, layout.bureauOf)[bureau]), row.page, row.yMin) as ParserPaymentHistoryCell[])
  const counts = new Map<string, number>()
  for (const cell of cells) counts.set(cell.yearMonth, (counts.get(cell.yearMonth) ?? 0) + 1)
  return cells.filter(cell => counts.get(cell.yearMonth) === 1)
}

function buildTradelinesFromAccountBlocks(words: Word[]): ParserTradeline[] {
  const tradelines: ParserTradeline[] = []
  const layout = columnLayout(words)
  const rows = groupRows(words)

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]
    if (!row || !isAccountStart(row, layout)) continue

    const creditor = findCreditor(rows, index, layout)
    if (!creditor) continue

    const fieldRows = new Map<FieldName, Row>()
    const repeatedRows = new Map<RepeatedFieldName, Row[]>()
    fieldRows.set('maskedAccount', row)
    // An account block runs until the next account or the end of the section — not until the end of
    // the page. IdentityIQ paginates mid-block: the rows continuing an account reappear at the top
    // of the next page with no repeated bureau header and no heading. Stopping at the page edge cut
    // those blocks off before their Balance row, and a block with no balance row lost every bureau.
    for (let cursor = index + 1; cursor < rows.length; cursor += 1) {
      const candidate = rows[cursor]
      if (!candidate) break
      if (isAccountStart(candidate, layout) || isSectionAnchor(candidate)) break
      const label = labelText(candidate, layout)
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
    for (const [field, sourceRow] of fieldRows) fieldMaps.set(field, bureauWordBuckets(sourceRow, layout.bureauOf))
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
      const remarks = remarksRows.flatMap(sourceRow => parseRepeatedValues('remarks', bureau, joined(bureauWordBuckets(sourceRow, layout.bureauOf)[bureau]), sourceRow.page, sourceRow.yMin))
      const specialCommentCodes = specialCommentCodesRows.flatMap(sourceRow => parseRepeatedValues('specialCommentCodes', bureau, joined(bureauWordBuckets(sourceRow, layout.bureauOf)[bureau]), sourceRow.page, sourceRow.yMin))
      // A balance is a field of the account, not the definition of one. This used to drop the whole
      // tradeline when the balance was missing, because the balance row was the only thing anchoring
      // an account block against section and header rows becoming tradelines. That job now belongs
      // to `isAccountStart` — which requires an `Account #:` label carrying values in at least two
      // bureau columns — and to the fallback's own guards, so a real account that reports no balance
      // (a paid or closed account rendering "-") is emitted with the balance left `unknown`. Rules
      // that need a balance suppress on the missing value and say so, which is the point of the
      // provenance model; discarding the account instead hid it from every other check as well.
      const balance = parseField('balance', bureau, balanceText, row.page, row.yMin) as ParserValue<number>
      tradelines.push({
        id: randomUUID(),
        bureau,
        creditor: rowValue<string>(bureau, 'creditor', creditor.text, creditor.text, creditor.row.page, creditor.row.yMin, FIELD_CONFIDENCE, 'known'),
        maskedAccount: (parseField('maskedAccount', bureau, accountText, row.page, row.yMin) as ParserValue<string>).normalized ?? '',
        accountType: parseField('accountType', bureau, accountTypeText, row.page, row.yMin) as ParserValue<string>,
        balance,
        creditLimit: parseField('creditLimit', bureau, creditLimitText, row.page, row.yMin) as ParserValue<number>,
        pastDue: parseField('pastDue', bureau, pastDueText, row.page, row.yMin) as ParserValue<number>,
        status: parseField('status', bureau, statusText, row.page, row.yMin) as ParserValue<string>,
        opened: parseField('opened', bureau, openedText, row.page, row.yMin) as ParserValue<string>,
        updated: parseField('updated', bureau, updatedText, row.page, row.yMin) as ParserValue<string>,
        dateOfFirstDelinquency: dofdText ? parseField('dateOfFirstDelinquency', bureau, dofdText, dofdRow?.page ?? row.page, dofdRow?.yMin ?? row.yMin) as ParserValue<string> : unknownDateOfFirstDelinquency(bureau, row.page, row.yMin),
        paymentHistory: parsePaymentHistoryRows(bureau, paymentHistoryRows, layout),
        remarks,
        specialCommentCodes,
      })
    }
  }

  return tradelines
}

/**
 * Every field label in this format ends in a colon; a creditor name does not. That is the whole
 * distinction between an account's balance row and a structural row, and it holds across templates
 * — unlike the allowlist of known label names this replaces, which is what let the Summary
 * section's own tallies through as accounts.
 */
function isFallbackStructuralLabel(row: Word[], layout: Layout): boolean {
  return row.filter(word => layout.isLabelWord(word)).map(word => word.text).join(' ').replace(/\s+/g, ' ').trim().endsWith(':')
}

/**
 * Currency as this format renders it. The fallback must not read a bare integer as an amount: the
 * payment-history year header (`Year 25 24 23 …`), a term count, a masked account number, and every
 * Summary tally are bare integers, and on the authorized samples each one became an account —
 * 28 of one report's 33 "tradelines" were headers and summary totals. The account-block path is
 * unaffected: there the row is already known to be a balance row from its own label.
 */
function parseFallbackMoney(cell: string): { minor: number | null } {
  return cell.includes('$') ? parseMoney(cell) : { minor: null }
}

function buildTradelinesFromBalanceRows(words: Word[]): ParserTradeline[] {
  const tradelines: ParserTradeline[] = []
  const layout = columnLayout(words)

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
      if (isFallbackStructuralLabel(row, layout)) continue
      const bureauMoney = new Map<Bureau, { word: Word; minor: number }>()
      for (const w of row) {
        if (layout.isLabelWord(w)) continue
        const bureau = layout.bureauOf(xCenter(w))
        if (!bureau) continue
        const { minor } = parseFallbackMoney(w.text)
        if (minor !== null) bureauMoney.set(bureau, { word: w, minor })
      }
      if (bureauMoney.size < 2) continue

      const creditor = cleanCreditor(row.filter(w => layout.isLabelWord(w)).map(w => w.text))
      if (!creditor) continue

      for (const [bureau, { word, minor }] of bureauMoney) {
        tradelines.push({
          id: randomUUID(),
          bureau,
          creditor: rowValue<string>(bureau, 'creditor', creditor, creditor, word.page, word.yMin, FIELD_CONFIDENCE, 'known'),
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

type InquiryColumns = { creditorEnd: number; businessStart: number; dateStart: number; bureauStart: number }

function inquiryColumns(row: Row): InquiryColumns | undefined {
  const words = row.words
  const type = words.find(word => /^type$/i.test(word.text))
  const date = words.find(word => /^date$/i.test(word.text))
  const credit = words.find(word => /^credit$/i.test(word.text))
  const hasName = words.some(word => /^name$/i.test(word.text))
  const hasBusiness = words.some(word => /^business$/i.test(word.text))
  const hasInquiry = words.some(word => /^inquiry$/i.test(word.text))
  const hasBureau = words.some(word => /^bureau$/i.test(word.text))
  if (!type || !date || !credit || !hasName || !hasBusiness || !hasInquiry || !hasBureau) return undefined
  return { creditorEnd: type.xMin, businessStart: type.xMin, dateStart: date.xMin, bureauStart: credit.xMin }
}

function parseInquiryDate(display: string): string | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(display.trim())
  if (!match) return null
  const month = Number(match[1]); const day = Number(match[2]); const year = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const parsed = new Date(Date.UTC(year, month - 1, day))
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function parseIdentityIqScores(words: Word[]): ParserScore[] {
  const scores: ParserScore[] = []
  const rows = groupRows(words)
  for (let index = 0; index < rows.length; index += 1) {
    const anchor = rows[index]
    if (!anchor || !/credit score/i.test(anchor.words.map(word => word.text).join(' ')) || !/back to top/i.test(anchor.words.map(word => word.text).join(' '))) continue
    const header = rows.slice(index + 1, index + 8).find(row => row?.page === anchor.page && ['transunion', 'experian', 'equifax'].every(name => row.words.some(word => word.text.toLowerCase() === name)))
    if (!header) continue
    const headerBureauWords = header.words.filter(word => /^(transunion|experian|equifax)$/i.test(word.text))
    const headerCounts = new Map<Bureau, number>()
    for (const word of headerBureauWords) {
      const bureau = word.text.toLowerCase() as Bureau
      headerCounts.set(bureau, (headerCounts.get(bureau) ?? 0) + 1)
    }
    if (headerCounts.get('transunion') !== 1 || headerCounts.get('experian') !== 1 || headerCounts.get('equifax') !== 1) continue
    const columns = new Map<Bureau, number>()
    for (const word of headerBureauWords) {
      const bureau = word.text.toLowerCase() as Bureau
      columns.set(bureau, xCenter(word))
    }
    const columnAnchors = [...columns].map(([bureau, x]) => ({ bureau, x }))
    const firstColumnX = Math.min(...columnAnchors.map(column => column.x))
    const bureauOf = (x: number): Bureau | null => x < firstColumnX - 40 ? null : nearestBureau(x, columnAnchors)
    const sectionRows = rows.slice(index + 1, index + 16).filter(row => row?.page === anchor.page)
    const scoreRow = sectionRows.find(row => /^credit\s+score:?$/i.test(leftLabel(row)))
    const scaleRow = sectionRows.find(row => /^score\s+scale:?$/i.test(leftLabel(row)))
    if (!scoreRow || !scaleRow) continue
    const scoreBuckets = bureauWordBuckets(scoreRow, bureauOf)
    const scaleBuckets = bureauWordBuckets(scaleRow, bureauOf)
    for (const bureau of ['transunion', 'experian', 'equifax'] as const) {
      const scoreTokens = (scoreBuckets[bureau] ?? []).map(word => word.text.trim()).filter(token => /^\d{3}$/.test(token))
      const scaleTokens = (scaleBuckets[bureau] ?? []).map(word => word.text.trim()).filter(token => /^\d{3}-\d{3}$/.test(token))
      const scoreDisplay = scoreTokens[0] ?? ''; const scaleDisplay = scaleTokens[0] ?? ''
      const score = scoreTokens.length === 1 ? Number(scoreDisplay) : null
      const range = scaleTokens.length === 1 ? /^(\d{3})-(\d{3})$/.exec(scaleDisplay) : null
      if (score === null || !range || score < Number(range[1]) || score > Number(range[2])) continue
      scores.push({
        bureau,
        score: rowValue<number>(bureau, 'score', score, scoreDisplay, scoreRow.page, scoreRow.yMin, FIELD_CONFIDENCE, 'known'),
        scale: rowValue<string>(bureau, 'scoreScale', scaleDisplay, scaleDisplay, scaleRow.page, scaleRow.yMin, FIELD_CONFIDENCE, 'known'),
      })
    }
  }
  return scores
}

function parseIdentityIqInquiries(words: Word[]): ParserInquiry[] {
  const inquiries: ParserInquiry[] = []
  const rows = groupRows(words)
  let columns: InquiryColumns | undefined
  let active = false
  for (const row of rows) {
    const text = row.words.map(word => word.text).join(' ')
    if (/inquiries/i.test(text) && /back to top/i.test(text)) { active = true; columns = undefined; continue }
    if (!active) continue
    const header = inquiryColumns(row)
    if (header) { columns = header; continue }
    if (/back to top/i.test(text)) { active = false; columns = undefined; continue }
    if (!columns) continue
    const activeColumns = columns
    const bureauWords = row.words.filter(word => word.xMin >= activeColumns.bureauStart && /^(transunion|experian|equifax)$/i.test(word.text))
    if (bureauWords.length !== 1) continue
    const bureau = bureauWords[0]?.text.toLowerCase() as Bureau
    const dateWords = row.words.filter(word => word.xMin >= activeColumns.dateStart && word.xMin < activeColumns.bureauStart)
    const dateDisplay = joined(dateWords)
    const date = parseInquiryDate(dateDisplay)
    const creditorDisplay = joined(row.words.filter(word => word.xMin < activeColumns.creditorEnd))
    if (!date || !creditorDisplay) continue
    const businessDisplay = joined(row.words.filter(word => word.xMin >= activeColumns.businessStart && word.xMin < activeColumns.dateStart))
    inquiries.push({
      id: randomUUID(), bureau,
      creditor: rowValue<string>(bureau, 'inquiryCreditor', creditorDisplay, creditorDisplay, row.page, row.yMin, FIELD_CONFIDENCE, 'known'),
      businessType: businessDisplay ? rowValue<string>(bureau, 'inquiryBusinessType', businessDisplay, businessDisplay, row.page, row.yMin, FIELD_CONFIDENCE, 'known') : rowValue<string>(bureau, 'inquiryBusinessType', null, '', row.page, row.yMin, 0, 'unknown'),
      date: rowValue<string>(bureau, 'inquiryDate', date, dateDisplay, row.page, row.yMin, FIELD_CONFIDENCE, 'known'),
    })
  }
  return inquiries
}

function findConsumerDisplayName(words: Word[]): ParserValue<string>[] {
  const rows = groupRows(words)
  for (const row of rows) {
    const text = row.words.map(word => word.text).join(' ').replace(/\s+/g, ' ').trim()
    const match = /^name:\s*([A-Z][A-Z .'-]{2,80}?)(?:\s+[A-Z][A-Z .'-]{2,80}?){0,2}\s*$/i.exec(text)
    const candidate = match?.[1]?.trim().replace(/\s+/g, ' ')
    if (!candidate || /^(name|personal information)$/i.test(candidate) || /\d/.test(candidate)) continue
    return [rowValue<string>('unknown', 'consumer-display-name', candidate, candidate, row.page, row.yMin, 0.95, 'known')]
  }
  return []
}

type PersonalFieldName = keyof ParserPersonalInformation

const PERSONAL_FIELD_LABELS: ReadonlyArray<{ field: PersonalFieldName; re: RegExp }> = [
  { field: 'names', re: /^name:?$/ },
  { field: 'alsoKnownAs', re: /^(also\s+known\s+as|aka|former\s+name\(?s?\)?|former):?$/ },
  { field: 'datesOfBirth', re: /^(date\s+of\s+birth|birth\s+date|year\s+of\s+birth):?$/ },
  { field: 'currentAddresses', re: /^current\s+address(\(?es\)?)?:?$/ },
  { field: 'previousAddresses', re: /^(previous|former)\s+address(\(?es\)?)?:?$/ },
  { field: 'employers', re: /^(employers?|employment):?$/ },
  { field: 'socialSecurityFragments', re: /^(ssn|social\s+security(\s+number)?):?$/ },
]

const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

/**
 * Normalizes a displayed date of birth to the precision the report actually states.
 *
 * IdentityIQ shows this field at three different precisions depending on bureau and template
 * (`1985`, `3/1985`, `03/17/1985`). Padding a year-only value out to a full date would invent
 * a month and day the report never claimed, and would then produce a variance Finding against
 * the consumer's real birthday — a fabricated discrepancy. The comparison is prefix-based
 * instead, so a year-only value is compared only as a year.
 */
function normalizeDateOfBirth(display: string): string | null {
  const text = display.trim().replace(/\s+/g, ' ')
  const full = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(text)
  if (full) {
    const month = Number(full[1]); const day = Number(full[2])
    if (month < 1 || month > 12 || day < 1 || day > 31) return null
    return `${full[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  if (iso) return text
  const monthYear = /^(\d{1,2})[/-](\d{4})$/.exec(text)
  if (monthYear) {
    const month = Number(monthYear[1])
    if (month < 1 || month > 12) return null
    return `${monthYear[2]}-${String(month).padStart(2, '0')}`
  }
  const namedMonth = /^([a-z]+)\s+(\d{4})$/i.exec(text)
  if (namedMonth) {
    const index = MONTH_NAMES.indexOf((namedMonth[1] ?? '').toLowerCase())
    if (index >= 0) return `${namedMonth[2]}-${String(index + 1).padStart(2, '0')}`
  }
  const yearOnly = /^(\d{4})$/.exec(text)
  if (yearOnly) {
    const year = Number(yearOnly[1])
    return year >= 1900 && year <= new Date().getUTCFullYear() ? yearOnly[1] ?? null : null
  }
  return null
}

/** Collapses a displayed address to a comparison key: uppercase, punctuation dropped, and the
 *  common street-suffix abbreviations unified so "123 MAIN ST." and "123 Main Street" agree. */
export function normalizeAddressForComparison(display: string): string {
  const suffixes: Record<string, string> = {
    street: 'st', avenue: 'ave', boulevard: 'blvd', drive: 'dr', road: 'rd', lane: 'ln', court: 'ct',
    place: 'pl', terrace: 'ter', parkway: 'pkwy', circle: 'cir', highway: 'hwy', apartment: 'apt',
    suite: 'ste', north: 'n', south: 's', east: 'e', west: 'w', northeast: 'ne', northwest: 'nw',
    southeast: 'se', southwest: 'sw',
  }
  return display
    .toUpperCase()
    .replace(/[.,#]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(token => (suffixes[token.toLowerCase()] ?? token).toUpperCase())
    .join(' ')
    .trim()
}

/**
 * Personal Information reader (tri-bureau).
 *
 * The layout this handles, verified against the authorized samples rather than assumed:
 *   - The section heading is a bare `Personal Information` row; the section ends at the next
 *     `Back to Top` row, which IdentityIQ puts on every section heading.
 *   - Labels sit well to the left of the first bureau column, so label and value are separated by
 *     x-position, not by row. (A left-edge test on xMin does NOT work: TransUnion values start at
 *     x≈202 while labels end at x≈157, and several value words begin left of any fixed xMin cut.)
 *   - A label is vertically CENTERED against a multi-row value, so the label row is in the middle
 *     of its own block, not at the top. Continuation rows are therefore assigned to the nearest
 *     label that accepts continuations — single-line fields such as Name and Date of Birth never
 *     do, which is what keeps an address's first line from attaching to the date above it.
 *   - Addresses wrap across three or four rows with no per-address delimiter, so they are
 *     segmented per bureau column at ZIP boundaries. Anything not terminated by a ZIP is
 *     discarded rather than emitted as a partial address.
 */

const ZIP_TOKEN = /^\d{5}(-\d{4})?$/
const DATE_TOKEN = /^\d{1,2}\/(\d{1,2}\/)?\d{2,4}$/
/** Page furniture that lands inside the section's row range on a page break. */
const PAGE_FURNITURE = /^(https?:\/\/|\d{1,2}\/\d{1,2}\/\d{2},\s|\d+\/\d+$)/

type PersonalLabel = { field: PersonalFieldName; acceptsContinuation: boolean }

const PERSONAL_LABELS: ReadonlyArray<{ re: RegExp } & PersonalLabel> = [
  { re: /^name$/, field: 'names', acceptsContinuation: false },
  { re: /^(also\s+known\s+as|aka|former(\s+names?)?)$/, field: 'alsoKnownAs', acceptsContinuation: false },
  { re: /^(date\s+of\s+birth|birth\s+date|year\s+of\s+birth)$/, field: 'datesOfBirth', acceptsContinuation: false },
  { re: /^(ssn|social\s+security(\s+number)?)$/, field: 'socialSecurityFragments', acceptsContinuation: false },
  { re: /^(current|previous|former)\s+address(\(?es\)?)?$/, field: 'currentAddresses', acceptsContinuation: true },
  { re: /^(employers?|employment)$/, field: 'employers', acceptsContinuation: true },
]

function isPersonalSectionAnchor(row: Row): boolean {
  return /^personal\s+information$/i.test(row.words.map(word => word.text).join(' ').trim())
}

function personalSectionColumns(rows: Row[], anchorIndex: number): { headerIndex: number; bureauOf: (x: number) => Bureau | null } | undefined {
  for (let index = anchorIndex + 1; index < Math.min(rows.length, anchorIndex + 10); index += 1) {
    const row = rows[index]
    if (!row) continue
    const headerWords = row.words.filter(word => /^(transunion|experian|equifax)$/i.test(word.text))
    const columns = new Map<Bureau, number>()
    for (const word of headerWords) {
      const bureau = word.text.toLowerCase() as Bureau
      if (columns.has(bureau)) { columns.clear(); break }
      columns.set(bureau, xCenter(word))
    }
    if (columns.size !== 3) continue
    const anchors = [...columns].map(([bureau, x]) => ({ bureau, x }))
    const firstColumnX = Math.min(...anchors.map(column => column.x))
    return { headerIndex: index, bureauOf: (x: number) => (x < firstColumnX - LABEL_COLUMN_MARGIN ? null : nearestBureau(x, anchors)) }
  }
  return undefined
}

/** Splits one bureau column's accumulated address tokens into complete addresses. A segment is
 *  emitted only when a ZIP closes it; reported-on dates interleaved between addresses are dropped
 *  so they cannot prefix the following address. */
function segmentAddresses(tokens: string[]): string[] {
  const addresses: string[] = []
  let current: string[] = []
  for (const token of tokens) {
    if (DATE_TOKEN.test(token)) continue
    current.push(token)
    if (!ZIP_TOKEN.test(token)) continue
    if (current.length >= 3) addresses.push(current.join(' '))
    current = []
  }
  return addresses
}

function parseIdentityIqPersonalInformation(words: Word[]): ParserPersonalInformation {
  const result = emptyPersonalInformation()
  const rows = groupRows(words)
  const anchorIndex = rows.findIndex(isPersonalSectionAnchor)
  if (anchorIndex < 0) return result
  const columns = personalSectionColumns(rows, anchorIndex)
  if (!columns) return result
  const { bureauOf } = columns

  const sectionRows: Row[] = []
  for (const row of rows.slice(columns.headerIndex + 1)) {
    const text = row.words.map(word => word.text).join(' ').trim()
    if (/back to top/i.test(text)) break
    if (PAGE_FURNITURE.test(text)) continue
    sectionRows.push(row)
  }

  const labelOf = (row: Row): PersonalLabel | undefined => {
    const label = row.words.filter(word => bureauOf(xCenter(word)) === null).map(word => word.text).join(' ').replace(/\s+/g, ' ').trim()
    if (!label.includes(':')) return undefined
    const name = label.slice(0, label.indexOf(':')).trim().toLowerCase()
    return PERSONAL_LABELS.find(entry => entry.re.test(name))
  }

  const labelled = sectionRows.map(row => ({ row, label: labelOf(row) }))
  const continuationHosts = labelled.filter((entry): entry is { row: Row; label: PersonalLabel } => entry.label?.acceptsContinuation === true)

  // Single-line fields read from their own row only.
  for (const { row, label } of labelled) {
    if (!label || label.acceptsContinuation) continue
    const buckets = bureauWordBuckets(row, bureauOf)
    for (const bureau of ['transunion', 'experian', 'equifax'] as const) {
      const value = personalValue(label.field, bureau, joined(buckets[bureau]), row.page, row.yMin)
      if (value) result[label.field].push(value)
    }
  }

  // Continuation-accepting fields collect their own row plus every unlabelled row nearer to them
  // than to any other continuation-accepting label.
  const hostFor = (row: Row): { row: Row; label: PersonalLabel } | undefined => {
    let best: { host: { row: Row; label: PersonalLabel }; distance: number } | undefined
    for (const host of continuationHosts) {
      if (host.row.page !== row.page) continue
      const distance = Math.abs(host.row.yMin - row.yMin)
      if (!best || distance < best.distance) best = { host, distance }
    }
    return best?.host
  }

  const addressTokens = new Map<Bureau, string[]>()
  const addressSource = new Map<Bureau, { page: number; yMin: number }>()
  for (const { row, label } of labelled) {
    const host = label ? (label.acceptsContinuation ? { row, label } : undefined) : hostFor(row)
    if (!host) continue
    const buckets = bureauWordBuckets(row, bureauOf)
    for (const bureau of ['transunion', 'experian', 'equifax'] as const) {
      const bucket = buckets[bureau]
      if (!bucket?.length) continue
      if (host.label.field === 'employers') {
        // One employer per row: the report gives no delimiter between names on separate rows, so
        // joining them across rows would fuse two employers into one value.
        const value = personalValue('employers', bureau, joined(bucket), row.page, row.yMin)
        if (value) result.employers.push(value)
        continue
      }
      addressTokens.set(bureau, [...(addressTokens.get(bureau) ?? []), ...bucket.map(word => word.text)])
      if (!addressSource.has(bureau)) addressSource.set(bureau, { page: row.page, yMin: row.yMin })
    }
  }

  for (const bureau of ['transunion', 'experian', 'equifax'] as const) {
    const source = addressSource.get(bureau)
    if (!source) continue
    // The report lists a bureau's current address first and its former addresses after it. That
    // ordering is the only reliable current/previous signal here: the "Previous Address(es)" label
    // is centred against its block and so sits BELOW rows that already belong to it.
    const addresses = segmentAddresses(addressTokens.get(bureau) ?? [])
    addresses.forEach((address, index) => {
      const field: PersonalFieldName = index === 0 ? 'currentAddresses' : 'previousAddresses'
      const value = personalValue(field, bureau, address, source.page, source.yMin + index)
      if (value) result[field].push(value)
    })
  }
  return result
}

/** The collection name is plural; the value's own `field` names one value, because it is what a
 *  reader sees in a finding's evidence table. */
const PERSONAL_VALUE_FIELD: Record<PersonalFieldName, string> = {
  names: 'name', alsoKnownAs: 'alsoKnownAs', datesOfBirth: 'dateOfBirth',
  currentAddresses: 'currentAddress', previousAddresses: 'previousAddress',
  employers: 'employer', socialSecurityFragments: 'ssnLastFour',
}

function personalValue(field: PersonalFieldName, bureau: Bureau, display: string, page: number, yMin: number): ParserValue<string> | undefined {
  const clean = display.replace(/\s+/g, ' ').trim()
  // A dash is how these reports render "nothing on file". It is an absence, not a value.
  if (!clean || /^(none|n\/a|not reported|-{1,3}|–|—)$/i.test(clean)) return undefined
  const valueField = PERSONAL_VALUE_FIELD[field]
  const locate = (normalized: string | null, confidence: number, state: ParserValue<string>['state']): ParserValue<string> => ({
    bureau, field: valueField, normalized, originalDisplay: clean, state, confidence,
    source: { kind: 'element', locator: `pdf:p${page}:y${Math.round(yMin)}:${bureau}:${valueField}`, snippet: clean.slice(0, 80) },
  })
  if (field === 'datesOfBirth') {
    const normalized = normalizeDateOfBirth(clean)
    return normalized ? locate(normalized, FIELD_CONFIDENCE, 'known') : locate(null, 0, 'unknown')
  }
  if (field === 'socialSecurityFragments') {
    // Only the trailing four digits of an already-masked display are retained. A display carrying
    // more than four digits is treated as unreadable rather than trimmed: the redaction boundary
    // upstream owns that case, and trimming here would quietly paper over its failure.
    const digits = clean.replace(/\D/g, '')
    if (digits.length !== 4) return locate(null, 0, 'unknown')
    return locate(digits, FIELD_CONFIDENCE, 'known')
  }
  if (field === 'currentAddresses' || field === 'previousAddresses') {
    return /\d/.test(clean) ? locate(clean, FIELD_CONFIDENCE, 'known') : locate(null, 0, 'unknown')
  }
  if (field === 'employers') {
    // An employer is a name. A trailing ZIP row from the address block above can land in this
    // block when the two sit close together, and "18301" is not an employer — reject anything
    // without a word in it rather than publish a postal code as an employment record.
    return /[A-Za-z]{2}/.test(clean) ? locate(clean, FIELD_CONFIDENCE, 'known') : undefined
  }
  // A digit in a person's name is a column-bleed or a stray token, not a name.
  if (/\d/.test(clean) && (field === 'names' || field === 'alsoKnownAs')) return locate(null, 0, 'unknown')
  return locate(clean, FIELD_CONFIDENCE, 'known')
}

export function parseIdentityIqPdf(words: Word[]): ParserReport {
  const accountBlockTradelines = buildTradelinesFromAccountBlocks(words)
  const identity = findConsumerDisplayName(words)
  const personalInformation = parseIdentityIqPersonalInformation(words)
  const supportedBureaus = new Set(accountBlockTradelines.map(line => line.bureau))
  const scores = parseIdentityIqScores(words)
  const inquiries = parseIdentityIqInquiries(words)
  if (supportedBureaus.has('transunion') && supportedBureaus.has('experian') && supportedBureaus.has('equifax')) {
    return { provider: 'identityiq', template: 'identityiq-pdf-v1', reportDate: null, identity, personalInformation, tradelines: accountBlockTradelines, inquiries, scores }
  }

  // Some older IdentityIQ layouts omit an account-block balance in one column while still
  // rendering balance-only rows for that bureau. Retain the proven row parser only for the
  // missing bureau(s), rather than inventing a value or discarding the report's tri-bureau
  // coverage. These fallback rows deliberately keep account metadata unknown, so rules that
  // require the omitted fields suppress instead of treating the row as fully reconstructed.
  const fallbackTradelines = buildTradelinesFromBalanceRows(words)
    .filter(line => !supportedBureaus.has(line.bureau))
  return { provider: 'identityiq', template: 'identityiq-pdf-v1', reportDate: null, identity, personalInformation, tradelines: [...accountBlockTradelines, ...fallbackTradelines], inquiries, scores }
}
