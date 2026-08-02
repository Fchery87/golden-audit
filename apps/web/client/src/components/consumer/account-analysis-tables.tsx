import type { ConsumerReport, ReportAccountRow } from '@/lib/api'

type FindingEvidence = ConsumerReport['findings'][number]['evidence']

export function AccountAnalysisTable({ rows }: { rows: ReportAccountRow[] | undefined }) {
  if (!rows?.length) return null
  const labels = [...new Set(rows.flatMap(row => row.cells.map(cell => cell.label)))]
  return <section className="mt-10" aria-labelledby="accounts-read-heading">
    <h2 className="font-serif text-2xl" id="accounts-read-heading">Accounts read from your report</h2>
    <p className="mt-2 text-sm text-muted-foreground">Only fields this parser read with a source reference are shown. Creditors are not separately identified as furnishers in this report.</p>
    <div className="mt-4 overflow-x-auto border border-rule"><table className="w-full min-w-[70rem] text-left text-sm"><thead><tr><th className="border-b border-rule p-3">Bureau</th>{labels.map(label => <th className="border-b border-rule p-3" key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(row => {
      const cells = new Map(row.cells.map(cell => [cell.label, cell]))
      return <tr className="border-b border-rule last:border-0" key={row.id}><th className="p-3 font-medium capitalize">{row.bureau}</th>{labels.map(label => {
        const cell = cells.get(label)
        return <td className="p-3 align-top text-muted-foreground" key={label}>{cell ? <><span className="block text-foreground">{cell.value}</span><SourceReference source={cell.source} /></> : '—'}</td>
      })}</tr>
    })}</tbody></table></div>
  </section>
}

export function FindingEvidenceTable({ evidence }: { evidence: FindingEvidence }) {
  return <div className="mt-5 overflow-x-auto border border-rule"><table className="w-full min-w-[36rem] text-left text-sm"><thead><tr><th className="border-b border-rule p-3">Field</th><th className="border-b border-rule p-3">Value shown</th><th className="border-b border-rule p-3">Source reference</th></tr></thead><tbody>{evidence.map((item, index) => <tr className="border-b border-rule last:border-0" key={`${item.field}-${index}`}><th className="p-3 font-medium">{item.field}</th><td className="p-3 text-muted-foreground">{String(item.value ?? 'Not shown')}</td><td className="p-3 text-muted-foreground"><SourceReference source={item.source} /></td></tr>)}</tbody></table></div>
}

function SourceReference({ source }: { source: { kind?: string; locator?: string; page?: number } }) {
  return <span className="font-mono text-xs text-faint">{source.locator ?? (source.page ? `page ${source.page}` : source.kind ?? 'Not available')}</span>
}
