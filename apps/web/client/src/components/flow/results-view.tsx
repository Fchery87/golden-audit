import * as React from 'react'
import { Loader2, AlertCircle, FileDown } from 'lucide-react'
import { api, type KickoffResult, type ConsumerReport, type ExportArtifact } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export function ResultsView({ kickoff }: { kickoff: KickoffResult }) {
  if (kickoff.status === 'match-review-required') {
    return <MatchReviewNotice kickoff={kickoff} />
  }
  return <Reading kickoff={kickoff} />
}

function Reading({ kickoff }: { kickoff: KickoffResult }) {
  const [report, setReport] = React.useState<ConsumerReport | null>(null)
  const [exportArtifact, setExportArtifact] = React.useState<ExportArtifact | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [showExport, setShowExport] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    async function load() {
      setError(null)
      try {
        const [r, x] = await Promise.all([
          api.getConsumerReport(kickoff.consumerReportId ?? ''),
          api.getExport(kickoff.exportId ?? ''),
        ])
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
  }, [kickoff.consumerReportId, kickoff.exportId])

  return (
    <section className="mt-16 animate-fade-in border-t border-rule pt-12">
      <header className="flex items-center gap-4">
        <span className="eyebrow">04</span>
        <span className="h-px flex-1 bg-rule" />
        <span className="eyebrow">Your reading</span>
      </header>

      {error && (
        <p className="mt-6 flex items-center gap-2 font-mono text-xs text-negative">
          <AlertCircle className="h-4 w-4" /> {error}
        </p>
      )}

      {!report && !error && (
        <p className="mt-6 flex items-center gap-2 font-mono text-xs text-muted-foreground">
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
                  <span className="font-mono text-xs text-faint">
                    confidence {Math.round(f.confidence * 100)}%
                  </span>
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

function MatchReviewNotice({ kickoff }: { kickoff: KickoffResult }) {
  const open = kickoff.matches.filter((m) => m.state !== 'confirmed' && m.state !== 'rejected')
  return (
    <section className="mt-16 border-t border-rule pt-12">
      <header className="flex items-center gap-4">
        <span className="eyebrow">04</span>
        <span className="h-px flex-1 bg-rule" />
        <span className="eyebrow">Review required</span>
      </header>
      <p className="mt-6 flex items-start gap-3 border border-rule bg-paper p-5 text-base">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
        <span>
          {open.length === 1 ? 'One account group' : `${open.length} account groups`} could not be
          matched automatically (collision set with &gt;3 tradelines). These require your
          confirmation before analysis can run.
        </span>
      </p>
      <p className="mt-4 font-mono text-xs text-muted-foreground">
        A dedicated collision-review screen is the next increment.
      </p>
    </section>
  )
}

function severityVariant(severity: string): React.ComponentProps<typeof Badge>['variant'] {
  const s = severity.toLowerCase()
  if (s === 'high') return 'negative'
  if (s === 'low') return 'low'
  return 'medium'
}
