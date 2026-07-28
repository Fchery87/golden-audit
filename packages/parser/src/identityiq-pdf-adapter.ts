import { randomUUID } from 'node:crypto'
import type { Bureau, ParserReport, ParserTradeline, ParserValue } from './types.js'
import { bureauForX, CREDITOR_X_MAX, xCenter, type Word } from './positional-types.js'

/**
 * IdentityIQ tri-bureau PDF adapter (spike).
 *
 * Consumes a positional Word[] stream and groups words into account rows by y-band,
 * then assigns each value to a bureau by x-band (TransUnion/Experian/Equifax columns).
 * Emits ONE ParserTradeline per bureau per account-row, so cross-bureau matching +
 * the deterministic analysis engine can consume it directly.
 *
 * Spike simplifications (documented, not hidden):
 *  - Extracts the RECENT BALANCE per bureau (the cross-bureau comparison field).
 *    Account number, status, dates, terms, remarks are not yet reconstructed from
 *    adjacent rows — a later slice walks multi-line account blocks.
 *  - An "account row" is detected as a row with money values in ≥2 bureau columns
 *    (this filters out headers/labels/addresses reliably). Single-bureau accounts
 *    are a later refinement.
 *  - Inbound redaction is applied to the Word[] BEFORE this adapter (see index.ts),
 *    so identifiers never reach the ParserReport.
 */

const HEADER_VOCAB = new Set([
  'transunion', 'experian', 'equifax', 'account', 'accounts', 'date', 'opened', 'closed',
  'status', 'recent', 'balance', 'type', 'code', 'collection', 'credit', 'bureau',
  'page', 'report', 'history', 'past', 'due', 'amount', 'high', 'terms', 'remark',
])

function parseMoney(cell: string): { minor: number | null } {
  const cleaned = cell.replace(/[^0-9.]/g, '')
  const m = cleaned.match(/^(\d+)\.(\d{2})$/) ?? cleaned.match(/^(\d+)$/)
  if (!m) return { minor: null }
  if (m[2] !== undefined) return { minor: Number(m[1]) * 100 + Number(m[2]) }
  return { minor: Number(m[1]) }
}

function rowValue<T>(
  bureau: Bureau, field: string, normalized: T | null, originalDisplay: string,
  page: number, yMin: number, confidence: number, state: ParserValue<T>['state'],
): ParserValue<T> {
  return {
    bureau, field, normalized, originalDisplay, state, confidence,
    source: { kind: 'element', locator: `pdf:p${page}:y${Math.round(yMin)}:${bureau}:balance`, snippet: originalDisplay.slice(0, 80) },
  }
}

function cleanCreditor(tokens: string[]): string {
  return tokens
    .map(t => t.replace(/[.,;:()]/g, ''))
    .filter(t => t.length > 0 && !HEADER_VOCAB.has(t.toLowerCase()) && !/^\d+$/.test(t))
    .join(' ')
    .trim()
}

export function parseIdentityIqPdf(words: Word[]): ParserReport {
  const tradelines: ParserTradeline[] = []

  // Group words into rows per page by y-band.
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
      // money value per bureau in this row
      const bureauMoney = new Map<Bureau, { word: Word; minor: number }>()
      for (const w of row) {
        const bureau = bureauForX(xCenter(w))
        if (!bureau) continue
        const { minor } = parseMoney(w.text)
        if (minor !== null) bureauMoney.set(bureau, { word: w, minor })
      }
      if (bureauMoney.size < 2) continue // not an account balance row

      const creditor = cleanCreditor(row.filter(w => xCenter(w) < CREDITOR_X_MAX).map(w => w.text))
      if (!creditor) continue // skip rows without a real creditor name

      for (const [bureau, { word, minor }] of bureauMoney) {
        tradelines.push({
          id: randomUUID(),
          bureau,
          creditor,
          maskedAccount: '',
          balance: rowValue<number>(bureau, 'balance', minor, word.text, word.page, word.yMin, 1, 'known'),
          status: rowValue<string>(bureau, 'status', null, '', word.page, word.yMin, 0, 'unknown'),
          opened: rowValue<string>(bureau, 'opened', null, '', word.page, word.yMin, 0, 'unknown'),
          updated: rowValue<string>(bureau, 'updated', null, '', word.page, word.yMin, 0, 'unknown'),
        })
      }
    }
  }

  return { provider: 'identityiq', template: 'identityiq-pdf-v1', reportDate: null, tradelines }
}
