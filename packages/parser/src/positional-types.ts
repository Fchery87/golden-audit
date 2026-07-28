import type { Bureau } from './types.js'

/** A positioned word from a PDF page (poppler -bbox / pdfjs-equivalent coordinate stream). */
export type Word = {
  page: number
  xMin: number
  yMin: number
  xMax: number
  yMax: number
  text: string
}

export const xCenter = (w: Word): number => (w.xMin + w.xMax) / 2

/**
 * IdentityIQ tri-bureau column bands (derived empirically from a real report's
 * bureau-header x-centers: TransUnion ≈241, Experian ≈372, Equifax ≈504).
 * These are the adapter's tuning knobs; if a future sample shifts them, adjust here.
 */
export const BUREAU_BANDS: ReadonlyArray<{ bureau: Bureau; lo: number; hi: number }> = [
  { bureau: 'transunion', lo: 190, hi: 310 },
  { bureau: 'experian', lo: 310, hi: 440 },
  { bureau: 'equifax', lo: 440, hi: 560 },
]

/** Left-most zone holds the creditor name. */
export const CREDITOR_X_MAX = 190

export function bureauForX(x: number): Bureau | null {
  for (const b of BUREAU_BANDS) if (x >= b.lo && x < b.hi) return b.bureau
  return null
}

/** A detected bureau column anchor (bureau + its x-center on the page). */
export type BureauColumn = { bureau: Bureau; x: number }

const BUREAU_NAMES: ReadonlyArray<{ bureau: Bureau; re: RegExp }> = [
  { bureau: 'transunion', re: /^trans\s*union$/i },
  { bureau: 'experian', re: /^experian$/i },
  { bureau: 'equifax', re: /^equifax$/i },
]

/**
 * Detect this report's 3 bureau column x-anchors dynamically (cross-template robust).
 * Signal: a row (y-band) that contains all 3 bureau names at DISTINCT, SPREAD x-positions
 * is a columnar header row (the stacked left-list has all 3 at ~the same x). Returns the
 * median x per bureau across all such header rows, or null if none found (caller falls
 * back to the legacy fixed BUREAU_BANDS).
 */
export function detectBureauColumns(words: Word[]): BureauColumn[] | null {
  const byPage = new Map<number, Word[]>()
  for (const w of words) { if (!byPage.has(w.page)) byPage.set(w.page, []); byPage.get(w.page)?.push(w) }
  const candidates: BureauColumn[][] = []
  for (const [, pw] of byPage) {
    pw.sort((a, b) => a.yMin - b.yMin)
    const rows: Word[][] = []
    for (const w of pw) {
      const last = rows[rows.length - 1]
      if (last && last[0] && Math.abs(last[0].yMin - w.yMin) <= 4) last.push(w)
      else rows.push([w])
    }
    for (const row of rows) {
      const found = new Map<Bureau, number>()
      for (const w of row) {
        for (const bn of BUREAU_NAMES) {
          if (bn.re.test(w.text.trim())) { found.set(bn.bureau, xCenter(w)); break }
        }
      }
      if (found.size === 3) {
        const xs = [...found.values()].sort((a, b) => a - b)
        if (xs[0] !== undefined && xs[2] !== undefined && xs[2] - xs[0] > 100) {
          candidates.push([...found].map(([bureau, x]) => ({ bureau, x })))
        }
      }
    }
  }
  if (candidates.length === 0) return null
  const result: BureauColumn[] = []
  for (const bureau of ['transunion', 'experian', 'equifax'] as const) {
    const xs = candidates.map(c => c.find(ci => ci.bureau === bureau)?.x).filter((v): v is number => v !== undefined).sort((a, b) => a - b)
    const median = xs[Math.floor(xs.length / 2)]
    if (median !== undefined) result.push({ bureau, x: median })
  }
  return result.length === 3 ? result : null
}

/** Assign an x-center to its nearest detected bureau column. */
export function nearestBureau(x: number, columns: BureauColumn[]): Bureau | null {
  let best: Bureau | null = null
  let bestD = Infinity
  for (const c of columns) {
    const d = Math.abs(c.x - x)
    if (d < bestD) { bestD = d; best = c.bureau }
  }
  return best
}
