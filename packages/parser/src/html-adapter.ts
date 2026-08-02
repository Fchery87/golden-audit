import { randomUUID } from 'node:crypto'
import type { Bureau, ParserReport, ParserTradeline, ParserValue } from './types.js'

/**
 * SPIKE-QUALITY structured-HTML extractor (fictitious educational fixture).
 *
 * It proves the extraction machinery — element-level provenance, original display
 * text, calibrated confidence, missing-value states, masking — against a controlled
 * fictitious HTML layout modeled on the documented credit-report structure. It is NOT
 * a production HTML parser: production replaces the regex table-walk with a real DOM
 * library (and adds per-provider adapters from authorized real-format fixtures).
 *
 * Fixture contract (see tests/parser.test.ts): a `<section data-cp="tradelines">`
 * containing `<table>` rows like:
 *   <tr data-bureau="equifax"><td>Creditor</td><td>****5678</td><td>$125.00</td>
 *      <td>Open</td><td>2020-01</td><td>2026-06-30</td></tr>
 * Cell order: creditor, account, balance, status, opened, updated.
 */

const ROW_RE = /<tr[^>]*data-bureau=["']([^"']+)["'][^>]*>([\s\S]*?)<\/tr>/gi
const CELL_RE = /<td[^>]*>([\s\S]*?)<\/td>/gi
const METADATA_RE = /<meta[^>]*name=["']report-date["'][^>]*content=["']([^"']+)["']/i

function cellsOf(rowHtml: string): string[] {
  const out: string[] = []
  CELL_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = CELL_RE.exec(rowHtml)) !== null) out.push((m[1] ?? '').trim())
  return out
}

function parseMoney(cell: string): { minor: number | null } {
  const cleaned = cell.replace(/[^0-9.]/g, '')
  const m = cleaned.match(/^(\d+)\.(\d{2})$/) ?? cleaned.match(/^(\d+)$/)
  if (!m) return { minor: null }
  if (m[2] !== undefined) return { minor: Number(m[1]) * 100 + Number(m[2]) }
  return { minor: Number(m[1]) }
}

function maskAccount(display: string): string {
  const digits = display.replace(/\D/g, '')
  return digits.length >= 4 ? `••••${digits.slice(-4)}` : display
}

function value<T>(bureau: Bureau, field: string, normalized: T | null, originalDisplay: string, locator: string, confidence: number, state: ParserValue<T>['state']): ParserValue<T> {
  return { bureau, field, normalized, originalDisplay, state, confidence, source: { kind: 'element', locator, snippet: originalDisplay.slice(0, 80) } }
}

export function parseStructuredHtml(content: string, provider = 'sample-educational', template = 'fictitious-html-v1'): ParserReport {
  const reportDate = METADATA_RE.exec(content)?.[1] ?? null
  const tradelines: ParserTradeline[] = []
  ROW_RE.lastIndex = 0
  let rowMatch: RegExpExecArray | null
  let rowIndex = 0
  while ((rowMatch = ROW_RE.exec(content)) !== null) {
    const bureau = (rowMatch[1] as Bureau) ?? 'unknown'
    const cells = cellsOf(rowMatch[2] ?? '')
    if (cells.length < 6) continue
    const creditor = cells[0] ?? ''
    const account = cells[1] ?? ''
    const balanceCell = cells[2] ?? ''
    const status = cells[3] ?? ''
    const opened = cells[4] ?? ''
    const updated = cells[5] ?? ''
    const { minor } = parseMoney(balanceCell)
    const id = randomUUID()
    const balance: ParserValue<number> = minor === null
      ? value<number>(bureau, 'balance', null, balanceCell, `tradelines/tr[${rowIndex}]/td[3]`, 0, 'unknown')
      : value<number>(bureau, 'balance', minor, balanceCell, `tradelines/tr[${rowIndex}]/td[3]`, 1, 'known')
    tradelines.push({
      id, bureau,
      creditor: value(bureau, 'creditor', creditor, creditor, `tradelines/tr[${rowIndex}]/td[1]`, 1, 'known'),
      maskedAccount: maskAccount(account),
      accountType: value<string>(bureau, 'accountType', null, '', `tradelines/tr[${rowIndex}]/accountType`, 0, 'unknown'),
      balance,
      creditLimit: value<number>(bureau, 'creditLimit', null, '', `tradelines/tr[${rowIndex}]/creditLimit`, 0, 'unknown'),
      pastDue: value<number>(bureau, 'pastDue', null, '', `tradelines/tr[${rowIndex}]/pastDue`, 0, 'unknown'),
      status: value(bureau, 'status', status, status, `tradelines/tr[${rowIndex}]/td[4]`, 1, 'known'),
      opened: value(bureau, 'opened', opened, opened, `tradelines/tr[${rowIndex}]/td[5]`, 1, 'known'),
      updated: value(bureau, 'updated', updated, updated, `tradelines/tr[${rowIndex}]/td[6]`, 1, 'known'),
      dateOfFirstDelinquency: value<string>(bureau, 'dateOfFirstDelinquency', null, '', `tradelines/tr[${rowIndex}]/dateOfFirstDelinquency`, 0, 'unknown'),
      paymentHistory: [],
      remarks: [],
      specialCommentCodes: [],
    })
    rowIndex += 1
  }
  return { provider, template, reportDate, identity: [], tradelines, inquiries: [], scores: [] }
}
