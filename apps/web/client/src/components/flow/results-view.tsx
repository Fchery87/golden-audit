import * as React from 'react'
import { Loader2, AlertCircle, FileDown, Check, RotateCcw } from 'lucide-react'
import {
  api,
  type KickoffResult,
  type ConsumerReport,
  type ExportArtifact,
  type TradelineSummary,
  type CompleteAnalysisResult,
} from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export function ResultsView({ kickoff }: { kickoff: KickoffResult }) {
  if (kickoff.status === 'match-review-required') {
    return <CollisionReview kickoff={kickoff} />
  }
  return <Reading consumerReportId={kickoff.consumerReportId ?? ''} exportId={kickoff.exportId ?? ''} />
}

function formatCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '—'
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function Reading({ consumerReportId, exportId }: { consumerReportId: string; exportId: string }) {
  const [report, setReport] = React.useState<ConsumerReport | null>(null)
  const [exportArtifact, setExportArtifact] = React.useState<ExportArtifact | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [showExport, setShowExport] = React.useState(false)
  const [retryKey, setRetryKey] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    async function load() {
      setError(null)
      try {
        const [r, x] = await Promise.all([api.getConsumerReport(consumerReportId), api.getExport(exportId)])
        if (cancelled) return
        setReport(r)
        setExportArtifact(x)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Unexpected error')
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [consumerReportId, exportId, retryKey])

  return (
    <section className="mt-16 animate-fade-in border-t border-rule pt-12">
      <Header index="04" label="Your reading" />

      {error && (
        <div className="mt-6 flex items-center gap-4">
          <p role="alert" className="flex items-center gap-2 font-mono text-xs text-negative">
            <AlertCircle className="h-4 w-4" /> {error}
          </p>
          <Button size="sm" variant="outline" onClick={() => setRetryKey((k) => k + 1)}>
            <RotateCcw /> Retry
          </Button>
        </div>
      )}

      {!report && !error && (
        <p role="status" aria-live="polite" className="mt-6 flex items-center gap-2 font-mono text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Reading the report…
        </p>
      )}

      {report && (
        <>
          <h3 className="mt-6 font-serif text-3xl tracking-tight">
            {report.findings.length === 0
              ? 'No report differences surfaced in the checks that ran.'
              : `${report.findings.length} ${report.findings.length === 1 ? 'finding' : 'findings'} to review.`}
          </h3>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            This educational reading shows what this parser could read and which deterministic checks ran. A lack of findings does not mean every possible field or check was available.
          </p>

          {report.content ? <>
          <section className="mt-10" aria-labelledby="primers-heading">
            <p className="eyebrow" id="primers-heading">Report walkthrough</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {report.content.sectionPrimers.map((module) => (
                <article key={module.id} className="border border-rule bg-paper p-5">
                  <h4 className="font-serif text-xl">{module.title}</h4>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{module.body}</p>
                  <ul className="mt-3 text-xs text-faint">{module.limitations.map((limitation) => <li key={limitation}>— {limitation}</li>)}</ul>
                  <p className="mt-4 eyebrow">Documentation Basis</p>
                  <ul className="mt-2 space-y-1 text-sm">{module.authorities.map((authority) => <li key={authority.id}><a className="underline decoration-rule underline-offset-4 hover:decoration-foreground" href={authority.sourceUrl} target="_blank" rel="noreferrer">{authority.title}</a></li>)}</ul>
                </article>
              ))}
            </div>
          </section>

          {report.findings.length > 0 && <ul className="mt-10 space-y-6">
            {report.findings.map((f) => (
              <li key={f.id} className="border border-rule bg-paper p-6">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant={severityVariant(f.severity)}>{f.severity}</Badge>
                  <span className="font-mono text-xs text-faint">{f.classification.replaceAll('-', ' ')} · confidence {Math.round(f.confidence * 100)}%</span>
                </div>
                <h4 className="mt-3 font-serif text-2xl leading-snug">{f.title}</h4>
                <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
                  {f.evidence.map((item, index) => <div key={`${item.field}-${index}`}><dt className="font-mono text-xs uppercase text-faint">{item.field}</dt><dd className="mt-1">{String(item.value ?? 'Not shown')} {item.source.page ? <span className="text-muted-foreground">(page {item.source.page})</span> : null}</dd></div>)}
                </dl>
                <ReportList label="Other explanations to consider" items={f.alternativeExplanations} />
                <p className="mt-5 text-sm leading-relaxed"><span className="font-medium">Suggested next step: </span>{f.suggestedAction}</p>
                <ReportList label="Documents that may help you verify" items={f.verificationDocuments} />
                <section className="mt-5 border-t border-rule pt-4" aria-label="Education">
                  {f.educationModules.map((module) => <div key={module.id} className="mt-3"><h5 className="font-medium">{module.title}</h5><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{module.body}</p></div>)}
                </section>
                <ReportList label="Limitations" items={f.limitations} />
                <section className="mt-5" aria-label="Documentation Basis">
                  <p className="eyebrow">Documentation Basis</p>
                  <ul className="mt-2 space-y-1 text-sm">{f.authorities.map((authority) => <li key={authority.id}><a className="underline decoration-rule underline-offset-4 hover:decoration-foreground" href={authority.sourceUrl} target="_blank" rel="noreferrer">{authority.title}</a><span className="text-muted-foreground"> — {authority.citation}</span></li>)}</ul>
                </section>
              </li>
            ))}
          </ul>}

          <section className="mt-10" aria-labelledby="coverage-heading">
            <p className="eyebrow" id="coverage-heading">Checks and coverage</p>
            <div className="mt-3 overflow-x-auto border border-rule"><table className="w-full min-w-[42rem] text-left text-sm"><thead className="border-b border-rule text-xs uppercase text-faint"><tr><th className="p-3">Check</th><th className="p-3">Required fields</th><th className="p-3">Outcome</th></tr></thead><tbody>{report.content.coverage.map((row) => <tr className="border-b border-rule last:border-0" key={row.ruleId}><th className="p-3 font-medium">{row.name.replaceAll('-', ' ')}</th><td className="p-3 text-muted-foreground">{row.requiredInputs.join(', ')}</td><td className="p-3">{row.outcomes.length === 0 ? 'No confirmed matches were available for this check.' : row.outcomes.map((outcome, index) => <p key={`${outcome.outcome}-${index}`}><span className="font-medium">{outcome.outcome}</span> — {outcome.reason}</p>)}</td></tr>)}</tbody></table></div>
          </section>

          <section className="mt-10" aria-labelledby="parser-heading">
            <p className="eyebrow" id="parser-heading">What this parser could read</p>
            <div className="mt-3 overflow-x-auto border border-rule"><table className="w-full min-w-[42rem] text-left text-sm"><thead className="border-b border-rule text-xs uppercase text-faint"><tr><th className="p-3">Field</th><th className="p-3">Availability</th><th className="p-3">Values shown</th></tr></thead><tbody>{report.content.parserFields.map((field) => <tr className="border-b border-rule last:border-0" key={field.field}><th className="p-3 font-medium capitalize">{field.field}</th><td className="p-3">{field.capability === 'supported' ? 'Supported by this parser' : 'Not yet supported by this parser'}</td><td className="p-3 text-muted-foreground">{field.capability === 'supported' ? `${field.states.known ?? 0} read; ${field.states.unknown ?? 0} unavailable; ${field.states['parser-failed'] ?? 0} parser failures` : 'Planned for a later parser slice'}</td></tr>)}</tbody></table></div>
          </section>

          <div className="mt-10">
            <p className="eyebrow">Report limitations</p>
            <ul className="mt-3 space-y-1.5 text-base text-muted-foreground">
              {report.limitations.map((l) => (
                <li key={l}>— {l}</li>
              ))}
            </ul>
          </div>
          </> : <section className="mt-8"><p className="text-sm leading-relaxed text-muted-foreground">This earlier report predates the current content and coverage detail. Its findings and report limitations remain available below.</p><ul className="mt-6 space-y-5">{report.findings.map((finding) => <li key={finding.id} className="border-l-2 border-primary pl-5"><Badge variant={severityVariant(finding.severity)}>{finding.severity}</Badge><p className="mt-2 font-serif text-xl leading-snug">{finding.title}</p></li>)}</ul><ReportList label="Report limitations" items={report.limitations} /></section>}

          <div className="mt-10">
            <Button variant="outline" onClick={() => setShowExport((v) => !v)}>
              <FileDown className="h-4 w-4" /> {showExport ? 'Hide' : 'Show'} export artifact
            </Button>
            {showExport && exportArtifact && (
              <pre className="mt-4 max-h-96 overflow-auto border border-rule bg-paper p-4 font-mono text-xs leading-relaxed">
                {JSON.stringify(JSON.parse(exportArtifact.content), null, 2)}
              </pre>
            )}
          </div>
        </>
      )}
    </section>
  )
}

function ReportList({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null
  return <section className="mt-5"><p className="eyebrow">{label}</p><ul className="mt-2 space-y-1 text-sm text-muted-foreground">{items.map((item) => <li key={item}>— {item}</li>)}</ul></section>
}

function CollisionReview({ kickoff }: { kickoff: KickoffResult }) {
  const groups = kickoff.matches.filter((m) => m.state === 'split')
  const tlById = React.useMemo(() => {
    const map = new Map<string, TradelineSummary>()
    for (const t of kickoff.tradelines ?? []) map.set(t.id, t)
    return map
  }, [kickoff.tradelines])

  const [selections, setSelections] = React.useState<Record<string, Set<string>>>({})
  const [confirmed, setConfirmed] = React.useState<Record<string, boolean>>({})
  const [busy, setBusy] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [result, setResult] = React.useState<CompleteAnalysisResult | null>(null)

  const allConfirmed = groups.every((g) => confirmed[g.id])

  function toggle(groupId: string, tlId: string) {
    setSelections((prev) => {
      const next = new Set(prev[groupId] ?? [])
      if (next.has(tlId)) next.delete(tlId)
      else next.add(tlId)
      return { ...prev, [groupId]: next }
    })
  }

  async function confirmGroup(groupId: string) {
    const ids = [...(selections[groupId] ?? [])]
    if (ids.length < 2) return
    setBusy(groupId)
    setError(null)
    try {
      await api.confirmSubgroup(groupId, ids, 'Consumer confirmed subgroup')
      setConfirmed((prev) => ({ ...prev, [groupId]: true }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unexpected error')
    } finally {
      setBusy(null)
    }
  }

  async function complete() {
    setBusy('complete')
    setError(null)
    try {
      const res = await api.completeAnalysis(kickoff.reportId)
      setResult(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unexpected error')
    } finally {
      setBusy(null)
    }
  }

  if (result) {
    return <Reading consumerReportId={result.consumerReportId} exportId={result.exportId} />
  }

  return (
    <section className="mt-16 animate-fade-in border-t border-rule pt-12">
      <Header index="04" label="Review required" />

      <p className="mt-6 max-w-xl text-base leading-relaxed">
        These account groups are large enough (more than three tradelines) that we won’t guess.
        Select the entries that are the same account to confirm a subgroup, then complete the reading.
      </p>

      {error && (
        <p className="mt-6 flex items-center gap-2 font-mono text-xs text-negative">
          <AlertCircle className="h-4 w-4" /> {error}
        </p>
      )}

      <div className="mt-8 space-y-8">
        {groups.map((group, gi) => {
          const sel = selections[group.id] ?? new Set<string>()
          const isConfirmed = !!confirmed[group.id]
          return (
            <div key={group.id} className="border border-rule bg-paper">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule px-5 py-4">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-faint">{String(gi + 1).padStart(2, '0')}</span>
                  <span className="font-serif text-lg">Collision set</span>
                  <Badge variant="medium">{group.tradelineIds.length} tradelines</Badge>
                </div>
                {isConfirmed ? (
                  <Badge variant="positive">
                    <Check className="h-3 w-3" /> subgroup confirmed
                  </Badge>
                ) : (
                  <Button
                    size="sm"
                    disabled={!!busy || sel.size < 2}
                    onClick={() => confirmGroup(group.id)}
                  >
                    {busy === group.id ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" /> Confirming
                      </>
                    ) : (
                      <>Confirm subgroup ({sel.size})</>
                    )}
                  </Button>
                )}
              </div>
              <ul>
                {group.tradelineIds.map((tlId) => {
                  const t = tlById.get(tlId)
                  const checked = sel.has(tlId)
                  return (
                    <li key={tlId} className="flex items-center gap-4 border-b border-rule px-5 py-3 last:border-b-0">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={isConfirmed || !!busy}
                        onChange={() => toggle(group.id, tlId)}
                        className="h-4 w-4 accent-[var(--primary)]"
                      />
                      <span className="w-24 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                        {t?.bureau ?? '—'}
                      </span>
                      <span className="flex-1 font-serif text-base">{t?.creditor ?? 'Unknown'}</span>
                      <span className="font-mono text-xs text-muted-foreground">{t?.maskedAccount ?? '—'}</span>
                      <span className="w-24 text-right font-mono text-xs tnum">{formatCents(t?.balanceCents)}</span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </div>

      <div className="mt-8">
        <Button size="lg" disabled={!allConfirmed || !!busy} onClick={complete}>
          {busy === 'complete' ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Completing
            </>
          ) : (
            <>Complete the reading →</>
          )}
        </Button>
        {!allConfirmed && (
          <p className="mt-3 font-mono text-xs text-muted-foreground">
            Confirm a subgroup for each collision set to continue.
          </p>
        )}
      </div>
    </section>
  )
}

function Header({ index, label }: { index: string; label: string }) {
  return (
    <header className="flex items-center gap-4">
      <span className="eyebrow">{index}</span>
      <span className="h-px flex-1 bg-rule" />
      <span className="eyebrow">{label}</span>
    </header>
  )
}

function severityVariant(severity: string): React.ComponentProps<typeof Badge>['variant'] {
  const s = severity.toLowerCase()
  if (s === 'high') return 'negative'
  if (s === 'low') return 'low'
  return 'medium'
}
