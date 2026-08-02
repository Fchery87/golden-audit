import { Download, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { type ConsumerReport, type ReportSummary, type ReportScoreRow, type ReimportDiff, type ReimportAccountRef, type ReportIdentityRow, api } from '@/lib/api'
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
      <AuditSummary summary={report.content.summary} scoreRows={report.content.scoreRows} pendingMatchGroups={report.content.pendingMatchGroups} />
      <ChangesSinceLastReading reimport={report.content.reimport} />
      <IdentitySection rows={report.content.identityRows} />
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

const money = (cents: number | null | undefined): string => cents === null || cents === undefined ? 'Not available' : (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })

/**
 * The audit summary — what this reading found, before the detail.
 *
 * Every figure counts accounts, not per-bureau entries. Where bureaus disagree on a money value
 * for the same account, the highest reported figure is used; the note under the totals says so,
 * because a total whose derivation is unstated is a number a reader cannot check.
 */
function AuditSummary({ summary, scoreRows, pendingMatchGroups }: { summary: ReportSummary | undefined; scoreRows: ReportScoreRow[] | undefined; pendingMatchGroups: number | undefined }) {
  if (!summary) return null
  const negative = summary.negativeItems
  return <section className="mt-10" aria-labelledby="audit-summary-heading">
    <h2 className="font-serif text-2xl" id="audit-summary-heading">Audit summary</h2>
    <p className="mt-2 text-sm text-muted-foreground">Counts of what this reading read. Nothing here predicts a score or states that an entry is incorrect.</p>

    {scoreRows && scoreRows.length > 0 && <div className="mt-5 grid gap-4 sm:grid-cols-3">
      {scoreRows.map(score => <div className="border border-rule bg-paper p-5" key={score.bureau}>
        <p className="eyebrow capitalize">{score.bureau}</p>
        <p className="mt-2 font-serif text-4xl tnum">{score.score}</p>
        <p className="mt-1 text-sm text-muted-foreground">Reported scale {score.scoreScale}</p>
      </div>)}
    </div>}

    <dl className="mt-6 grid gap-x-8 gap-y-5 sm:grid-cols-3">
      <SummaryStat label="Accounts read" value={String(summary.accountsRead)} detail={`${summary.openAccounts} open · ${summary.closedAccounts} closed`} />
      <SummaryStat label="Accounts with a negative marker" value={String(negative.total)} detail={`${negative.collections} collection · ${negative.pastDueAccounts} past due · ${negative.derogatoryStatusAccounts} derogatory status`} />
      <SummaryStat label="Cross-bureau differences found" value={String(summary.crossBureauInconsistencies)} detail="Same account, different values between bureaus" />
      <SummaryStat label="Personal-information observations" value={String(summary.identityObservations)} detail="Details that differ from the ones you provided" />
      <SummaryStat label="Total balance reported" value={money(summary.totalBalanceCents)} detail="Highest figure any bureau reported per account" />
      <SummaryStat label="Total past due reported" value={money(summary.totalPastDueCents)} detail="Highest figure any bureau reported per account" />
      <SummaryStat label="Revolving balance to limit" value={summary.utilization.ratio === null ? 'Not available' : `${Math.round(summary.utilization.ratio * 100)}%`} detail={summary.utilization.ratio === null ? 'No revolving account showed both a balance and a limit' : `Across ${summary.utilization.accountsCounted} revolving ${summary.utilization.accountsCounted === 1 ? 'account' : 'accounts'}`} />
      <SummaryStat label="Inquiries read" value={String(summary.inquiriesRead)} detail="Reproduced without classification" />
      <SummaryStat label="Accounts with no readable status" value={String(negative.statusUnavailable)} detail="Excluded from the negative counts rather than assumed clean" />
    </dl>

    {negative.statusUnavailable > 0 && <p className="mt-5 text-sm text-muted-foreground">
      {negative.statusUnavailable} {negative.statusUnavailable === 1 ? 'account has' : 'accounts have'} no status this parser could read, so {negative.statusUnavailable === 1 ? 'it is' : 'they are'} absent from the negative-marker count above. That count is a floor, not a total.
    </p>}
    {summary.utilization.accountsWithoutLimit > 0 && <p className="mt-2 text-sm text-muted-foreground">
      {summary.utilization.accountsWithoutLimit} revolving {summary.utilization.accountsWithoutLimit === 1 ? 'account reports' : 'accounts report'} a balance without a credit limit, so {summary.utilization.accountsWithoutLimit === 1 ? 'it is' : 'they are'} excluded from the ratio above.
    </p>}
    {pendingMatchGroups ? <p className="mt-4 border border-rule bg-paper p-4 text-sm">
      <strong>{pendingMatchGroups} account {pendingMatchGroups === 1 ? 'group needs' : 'groups need'} your confirmation.</strong>{' '}
      Cross-bureau checks did not run on {pendingMatchGroups === 1 ? 'it' : 'them'} because it is not certain the entries describe the same account. The checks that were skipped are named in the coverage table below.
    </p> : null}
  </section>
}

function SummaryStat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div><dt className="eyebrow">{label}</dt><dd className="mt-1 font-serif text-2xl tnum">{value}</dd><dd className="mt-1 text-sm text-muted-foreground">{detail}</dd></div>
}

/** Reimport comparison. Only fields readable in both readings are compared, so nothing here is an
 *  artifact of this parser reading a field one time and not the next. */
function ChangesSinceLastReading({ reimport }: { reimport: ReimportDiff | undefined }) {
  if (!reimport) return null
  const nothingChanged = reimport.newAccounts.length === 0 && reimport.removedAccounts.length === 0 && reimport.changedAccounts.length === 0 && reimport.scoreChanges.length === 0 && reimport.findingsResolved.length === 0 && reimport.findingsNew.length === 0
  return <section className="mt-10" aria-labelledby="reimport-heading">
    <h2 className="font-serif text-2xl" id="reimport-heading">What changed since your last reading</h2>
    <p className="mt-2 text-sm text-muted-foreground">Compared against your reading from {new Date(reimport.previousGeneratedAt).toLocaleDateString()}. Only fields both readings could read are compared.</p>
    {nothingChanged
      ? <p className="mt-4 text-muted-foreground">No differences were found between the two readings in the fields this parser reads.</p>
      : <div className="mt-5 space-y-6">
        {reimport.scoreChanges.length > 0 && <Table headers={['Bureau', 'Previous', 'Now', 'Change']} rows={reimport.scoreChanges.map(change => [change.bureau, String(change.from), String(change.to), `${change.delta > 0 ? '+' : ''}${change.delta}`])} />}
        {reimport.changedAccounts.length > 0 && <div>
          <h3 className="font-medium">Accounts with changed values ({reimport.changedAccounts.length})</h3>
          <Table headers={['Account', 'Bureau', 'Field', 'Previous', 'Now']} rows={reimport.changedAccounts.flatMap(account => account.changes.map(change => [`${account.creditor} ${account.maskedAccount}`.trim(), account.bureau, change.field, change.from, change.to]))} />
        </div>}
        {reimport.newAccounts.length > 0 && <ReimportAccountList heading={`Entries not in your last reading (${reimport.newAccounts.length})`} accounts={reimport.newAccounts} />}
        {reimport.removedAccounts.length > 0 && <ReimportAccountList heading={`Entries no longer shown (${reimport.removedAccounts.length})`} accounts={reimport.removedAccounts} />}
        <div className="grid gap-4 sm:grid-cols-3">
          <SummaryStat label="Findings no longer present" value={String(reimport.findingsResolved.length)} detail="Present last time, absent now" />
          <SummaryStat label="New findings" value={String(reimport.findingsNew.length)} detail="Absent last time, present now" />
          <SummaryStat label="Findings still present" value={String(reimport.findingsUnchanged)} detail="Present in both readings" />
        </div>
        <List heading="Findings no longer present" items={reimport.findingsResolved} />
        <List heading="New findings in this reading" items={reimport.findingsNew} />
      </div>}
  </section>
}

function ReimportAccountList({ heading, accounts }: { heading: string; accounts: ReimportAccountRef[] }) {
  return <div><h3 className="font-medium">{heading}</h3><Table headers={['Creditor', 'Account', 'Bureau']} rows={accounts.map(account => [account.creditor, account.maskedAccount || 'Not shown', account.bureau])} /></div>
}

/** Personal information as each bureau displays it, checked against the details the consumer
 *  attested to at intake. This is the mixed-file surface: an entry marked as differing is the
 *  clearest available sign that another person's records may have reached this file. */
function IdentitySection({ rows }: { rows: ReportIdentityRow[] | undefined }) {
  if (!rows?.length) return null
  const differing = rows.filter(row => row.attestationMatch === 'differs-from-attested').length
  const label: Record<ReportIdentityRow['attestationMatch'], string> = {
    'matches-attested': 'Matches what you provided',
    'differs-from-attested': 'Differs from what you provided',
    'not-compared': 'Not compared',
  }
  return <section className="mt-10" aria-labelledby="identity-heading">
    <h2 className="font-serif text-2xl" id="identity-heading">Personal information on your report</h2>
    <p className="mt-2 text-sm text-muted-foreground">
      {differing === 0
        ? 'Every personal detail this parser could read is consistent with the details you provided.'
        : `${differing} ${differing === 1 ? 'entry differs' : 'entries differ'} from the details you provided. A difference is a question to take to the reporting company with your documents, not a conclusion that anything is wrong.`}
    </p>
    <Table headers={['Bureau', 'Field', 'Shown on report', 'Against your details', 'Source reference']} rows={rows.map(row => [row.bureau, row.field.replaceAll(/([A-Z])/g, ' $1'), row.value, label[row.attestationMatch], row.source.locator])} />
  </section>
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
