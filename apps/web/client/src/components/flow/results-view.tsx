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
              ? 'No disagreements surfaced.'
              : `${report.findings.length} ${report.findings.length === 1 ? 'finding' : 'findings'} across your bureaus.`}
          </h3>

          <ul className="mt-8 space-y-5">
            {report.findings.map((f) => (
              <li key={f.id} className="border-l-2 border-primary pl-5">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant={severityVariant(f.severity)}>{f.severity}</Badge>
                  <span className="font-mono text-xs text-faint">confidence {Math.round(f.confidence * 100)}%</span>
                </div>
                <p className="mt-2 font-serif text-xl leading-snug">{f.title}</p>
              </li>
            ))}
          </ul>

          <div className="mt-10">
            <p className="eyebrow">Limitations</p>
            <ul className="mt-3 space-y-1.5 text-base text-muted-foreground">
              {report.limitations.map((l) => (
                <li key={l}>— {l}</li>
              ))}
            </ul>
          </div>

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
