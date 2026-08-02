import { Download, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { type ConsumerReport, api } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { AccountAnalysisTable, FindingEvidenceTable } from './account-analysis-tables'

export function ReportActions({ exportId }: { exportId: string | null }) {
  async function download() {
    if (!exportId) throw new Error('No export is available for this report')
    const artifact = await api.getExport(exportId)
    const url = URL.createObjectURL(new Blob([artifact.content], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = url; anchor.download = 'golden-audit-report.json'; anchor.click(); URL.revokeObjectURL(url)
  }
  return <div className="flex gap-3"><Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" />Print / Save PDF</Button><Button variant="outline" onClick={() => void download()}><Download className="h-4 w-4" />Download my data</Button></div>
}

export function ReportDocument({ report }: { report: ConsumerReport }) {
  const profile = report.presentation
  const recipient = report.recipient?.displayName
  const reportTitle = profile.reportTitle ?? 'Your report overview'
  const contact = [profile.supportEmail, profile.websiteUrl, profile.supportPhone, profile.mailingAddress].filter((item): item is string => Boolean(item))
  return <article className={`report-document report-accent-${profile.accent} report-print-${profile.printStyle}`}>
    <header className="border-b border-rule pb-8">
      <div className="report-identity">
        {profile.logoUrl ? <img src={profile.logoUrl} alt="" className="report-logo" /> : null}
        <div><p className="eyebrow">{profile.organizationName}</p><h1 className="mt-3 font-serif text-3xl tracking-tight">{recipient ? `Prepared for ${recipient}` : reportTitle}</h1>{recipient && <p className="mt-2 text-lg">{reportTitle}</p>}</div>
        {(profile.preparedByLabel || profile.preparedByTitle) && <p className="report-prepared-by">{[profile.preparedByLabel, profile.preparedByTitle].filter(Boolean).join(' · ')}</p>}
      </div>
      {profile.reportSubtitle && <p className="mt-3 text-lg">{profile.reportSubtitle}</p>}
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Generated {report.generatedAt ? new Date(report.generatedAt).toLocaleString() : 'for your review'} (generation time; not the source report date). This educational reading shows what this parser could read and which deterministic checks ran. A lack of findings does not mean every possible field or check was available.</p>
    </header>
    <section className="report-overview" aria-label="Report overview"><Metric label="Findings to review" value={report.findings.length} /><Metric label="Accounts read" value={report.overview.tradelines} /><Metric label="Open accounts read" value={report.overview.openAccounts} /></section>
    {report.content && <>
      <section className="mt-10"><h2 className="font-serif text-2xl">Report walkthrough</h2><div className="mt-4 grid gap-4 md:grid-cols-2">{report.content.sectionPrimers.map(item => <article className="report-card border border-rule bg-paper p-5" key={item.id}><h3 className="font-serif text-xl">{item.title}</h3><p className="mt-2 text-sm text-muted-foreground">{item.body}</p><AuthorityList authorities={item.authorities} /></article>)}</div></section>
      <section className="mt-10"><h2 className="font-serif text-2xl">Findings</h2>{report.findings.length === 0 ? <p className="mt-3 text-muted-foreground">No findings were produced by the supported checks in this reading.</p> : <ul className="mt-4 space-y-5">{report.findings.map(item => <li className="report-card border border-rule bg-paper p-6" key={item.id}><div className="flex flex-wrap gap-3"><Badge variant={severityVariant(item.severity)}>{item.severity}</Badge><span className="text-sm text-muted-foreground">{item.classification.replaceAll('-', ' ')} · confidence {Math.round(item.confidence * 100)}%</span></div><h3 className="mt-3 font-serif text-2xl">{item.title}</h3><FindingEvidenceTable evidence={item.evidence} /><List heading="Other explanations to consider" items={item.alternativeExplanations}/><p className="mt-5 text-sm"><strong>Suggested next step: </strong>{item.suggestedAction}</p><List heading="Documents that may help you verify" items={item.verificationDocuments}/><section className="mt-5"><h4 className="font-medium">Education</h4>{item.educationModules.map(module => <p className="mt-2 text-sm text-muted-foreground" key={module.id}><strong className="text-foreground">{module.title}: </strong>{module.body}</p>)}</section><List heading="Limitations" items={item.limitations}/><AuthorityList authorities={item.authorities}/></li>)}</ul>}</section>
      <ScoreAndInquiryTables scores={report.content.scoreRows} inquiries={report.content.inquiryRows} />
      <AccountAnalysisTable rows={report.content.accountRows} />
      <section className="mt-10"><h2 className="font-serif text-2xl">Checks and coverage</h2><Table headers={['Check', 'Required fields', 'Outcome']} rows={report.content.coverage.map(row => [row.name.replaceAll('-', ' '), row.requiredInputs.join(', '), row.outcomes.map(item => `${item.outcome} — ${item.reason}`).join('\n') || 'No confirmed matches were available for this check.'])}/></section>
      <section className="mt-10"><h2 className="font-serif text-2xl">What this parser could read</h2><Table headers={['Field', 'Availability', 'Values shown']} rows={report.content.parserFields.map(field => [field.field, field.capability === 'supported' ? 'Supported by this parser' : 'Not yet supported by this parser', field.capability === 'supported' ? `${field.states.known ?? 0} read; ${field.states.unknown ?? 0} unavailable; ${field.states['parser-failed'] ?? 0} parser failures` : 'Planned for a later parser slice'])}/></section>
    </>}
    <List heading="Report limitations" items={report.limitations}/>
    {profile.closingNote && <p className="report-closing-note">{profile.closingNote}</p>}
    {contact.length > 0 && <footer className="report-contact"><strong>{profile.organizationName}</strong><span>{contact.join(' · ')}</span></footer>}
  </article>
}

function ScoreAndInquiryTables({ scores, inquiries }: { scores: NonNullable<ConsumerReport['content']>['scoreRows']; inquiries: NonNullable<ConsumerReport['content']>['inquiryRows'] }) {
  return <>
    {scores && scores.length > 0 && <section className="mt-10"><h2 className="font-serif text-2xl">Reported credit scores</h2><p className="mt-2 text-sm text-muted-foreground">These are scores reported in the uploaded document. They are shown without interpretation, comparison, prediction, or recommendation.</p><Table headers={['Bureau', 'Reported score', 'Reported scale', 'Score source', 'Scale source']} rows={scores.map(score => [score.bureau, String(score.score), score.scoreScale, score.source.locator, score.scaleSource.locator])}/></section>}
    {inquiries && inquiries.length > 0 && <section className="mt-10"><h2 className="font-serif text-2xl">Report-provided inquiries</h2><p className="mt-2 text-sm text-muted-foreground">These entries are reproduced from the uploaded document. This reading does not classify them or assess an effect.</p><Table headers={['Creditor', 'Business type', 'Date', 'Bureau', 'Source reference']} rows={inquiries.map(inquiry => [inquiry.creditor, inquiry.businessType ?? 'Not shown in source', inquiry.date, inquiry.bureau, inquiry.source.locator])}/></section>}
  </>
}

function Metric({ label, value }: { label: string; value: number | undefined }) { return <div><span>{label}</span><strong>{value ?? 'Unavailable'}</strong></div> }
function Table({ headers, rows }: { headers: string[]; rows: string[][] }) { return <div className="mt-4 overflow-x-auto border border-rule"><table className="w-full min-w-[40rem] text-left text-sm"><thead><tr>{headers.map(header => <th className="border-b border-rule p-3" key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr className="border-b border-rule last:border-0" key={rowIndex}>{row.map((cell, index) => <td className="whitespace-pre-line p-3 align-top text-muted-foreground" key={index}>{cell}</td>)}</tr>)}</tbody></table></div> }
function List({ heading, items }: { heading: string; items: string[] }) { return items.length === 0 ? null : <section className="mt-5"><h4 className="font-medium">{heading}</h4><ul className="mt-2 space-y-1 text-sm text-muted-foreground">{items.map(item => <li key={item}>— {item}</li>)}</ul></section> }
function AuthorityList({ authorities }: { authorities: Array<{ id: string; title: string; sourceUrl: string; citation: string }> }) { return <section className="mt-5"><h4 className="text-sm font-medium">Documentation basis</h4><ul className="mt-2 space-y-1 text-sm">{authorities.map(authority => <li key={authority.id}><a className="underline underline-offset-4" href={authority.sourceUrl} target="_blank" rel="noreferrer">{authority.title}</a><span className="text-muted-foreground"> — {authority.citation}</span></li>)}</ul></section> }
function severityVariant(severity: string): 'positive' | 'negative' | 'medium' { return severity === 'high' ? 'negative' : severity === 'low' ? 'positive' : 'medium' }
