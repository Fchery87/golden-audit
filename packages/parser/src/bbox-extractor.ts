import type { Word } from './positional-types.js'

/**
 * Parse poppler `pdftotext -bbox` HTML into a positional word stream.
 *
 * This keeps the heavy grouping logic (identityiq-pdf-adapter) pure and testable
 * against synthetic Word[] fixtures. The extraction mechanism is a swappable
 * boundary: production may replace this with pdfjs-dist producing the same Word[]
 * shape, with no changes downstream.
 */
export function parseBboxHtml(html: string): Word[] {
  const words: Word[] = []
  const pageRe = /<page\b[^>]*>([\s\S]*?)<\/page>/g
  const wordRe = /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)<\/word>/g
  let page = 0
  let pm: RegExpExecArray | null
  while ((pm = pageRe.exec(html)) !== null) {
    page += 1
    wordRe.lastIndex = 0
    let wm: RegExpExecArray | null
    while ((wm = wordRe.exec(pm[1] as string)) !== null) {
      words.push({
        page,
        xMin: Number(wm[1]),
        yMin: Number(wm[2]),
        xMax: Number(wm[3]),
        yMax: Number(wm[4]),
        text: decodeEntities(wm[5] as string),
      })
    }
  }
  return words
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d)))
}
