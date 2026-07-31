import { getDocumentProxy } from 'unpdf'
import type { Word } from './positional-types.js'

/**
 * Pure-JS replacement for the poppler `pdftotext -bbox` extraction path (Phase 0 spike,
 * docs/consumer-workflow-implementation-plan.md D3). Runs on Cloudflare Workers/Pages
 * Functions — no child_process, no native binary.
 *
 * Coordinate flip (load-bearing, do not remove): PDF.js text items report position in PDF
 * user space, origin bottom-left, y increasing upward. `identityiq-pdf-adapter.ts` assumes
 * poppler `-bbox` semantics — origin top-left, y increasing downward — and sorts/bands rows
 * on that assumption (`a.yMin - b.yMin`, banding at <=4 units). Feeding it unflipped
 * bottom-left coordinates silently inverts row order without erroring.
 *
 * PDF.js item.transform = [a, b, c, d, e, f] where (e, f) is the text origin (baseline-ish,
 * bottom-left of the glyph box) in PDF user space. IMPORTANT: item.width/item.height from
 * `getTextContent()` are already-rendered extents in that SAME user-space (points), not
 * unit-glyph-space — do not re-multiply them by the transform's scale (a/d), that double-
 * scales the box. The transform's linear part is only needed to find the box's horizontal/
 * vertical *directions* (for the rare rotated-text case); magnitude comes from width/height.
 * So in PDF space: bottom edge = f, top edge = f + height (for unrotated text).
 * Flipped to top-left/y-down (matching poppler):
 *   yMin (top edge)    = pageHeight - (f + height)
 *   yMax (bottom edge) = pageHeight - f
 */
export async function extractWordsFromPdfBytes(bytes: Uint8Array): Promise<Word[]> {
  // unpdf rejects a Node Buffer outright ("provide binary data as Uint8Array, rather than
  // Buffer") even though Buffer extends Uint8Array. Callers on the Node dev path (readFileSync,
  // Buffer.from) pass Buffers; normalize defensively rather than pushing this onto every caller.
  const plainBytes = bytes.constructor === Uint8Array ? bytes : new Uint8Array(bytes)
  const pdf = await getDocumentProxy(plainBytes)
  const words: Word[] = []

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const viewport = page.getViewport({ scale: 1 })
    const pageHeight = viewport.height
    const content = await page.getTextContent()

    for (const item of content.items) {
      if (!('str' in item) || typeof item.str !== 'string') continue
      const text = item.str
      if (!text.trim()) continue

      // Unit horizontal/vertical direction vectors from the transform's linear part —
      // (1,0)/(0,1) for the common unrotated case, a genuine rotation for skewed text.
      const [a, b, c, d, e, f] = item.transform as [number, number, number, number, number, number]
      const hLen = Math.hypot(a, b) || 1
      const vLen = Math.hypot(c, d) || 1
      const hx = a / hLen, hy = b / hLen
      const vx = c / vLen, vy = d / vLen

      const corners: Array<[number, number]> = [
        [e, f],
        [e + hx * item.width, f + hy * item.width],
        [e + vx * item.height, f + vy * item.height],
        [e + hx * item.width + vx * item.height, f + hy * item.width + vy * item.height],
      ]
      const xs = corners.map(p => p[0])
      const ys = corners.map(p => p[1])
      const xMinPdf = Math.min(...xs)
      const xMaxPdf = Math.max(...xs)
      const yBottomPdf = Math.min(...ys)
      const yTopPdf = Math.max(...ys)

      const yMin = pageHeight - yTopPdf
      const yMax = pageHeight - yBottomPdf

      for (const word of splitIntoWords(text, xMinPdf, xMaxPdf)) {
        words.push({ page: pageNumber, xMin: word.xMin, xMax: word.xMax, yMin, yMax, text: word.text })
      }
    }
  }

  return words
}

/**
 * PDF.js text items are runs of same-style glyphs, not necessarily single words (unlike
 * poppler `-bbox`, which emits one <word> per whitespace-separated token). Split on
 * whitespace and distribute x-extent proportionally by character offset so downstream
 * per-word logic (bureau-column x-center assignment, creditor-name reconstruction) sees
 * the same granularity poppler produced.
 */
function splitIntoWords(text: string, xMin: number, xMax: number): Array<{ text: string; xMin: number; xMax: number }> {
  const totalChars = text.length
  if (totalChars === 0) return []
  const totalWidth = xMax - xMin
  const results: Array<{ text: string; xMin: number; xMax: number }> = []
  const tokenRe = /\S+/g
  let m: RegExpExecArray | null
  while ((m = tokenRe.exec(text)) !== null) {
    const start = m.index
    const end = start + m[0].length
    results.push({
      text: m[0],
      xMin: xMin + (totalWidth * start) / totalChars,
      xMax: xMin + (totalWidth * end) / totalChars,
    })
  }
  return results
}
