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
