import { Loader2, Check, AlertCircle, Play, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input, Textarea, Label } from '@/components/ui/input'
import { ResultsView } from '@/components/flow/results-view'
import { useFlow, stepDone, type StepKey } from '@/hooks/use-flow'

type StepMeta = {
  key: StepKey
  title: string
  action: string
  detail: (s: ReturnType<typeof useFlow>['snap']) => string | null
}

const STEPS: StepMeta[] = [
  {
    key: 'register',
    title: 'Register a session',
    action: 'Register',
    detail: (s) => (s.userId ? `user …${s.userId.slice(-8)}` : null),
  },
  {
    key: 'consent',
    title: 'Record approved-state consent',
    action: 'Record consent',
    detail: (s) => (s.workspaceId ? `workspace …${s.workspaceId.slice(-8)}` : null),
  },
  {
    key: 'authorization',
    title: 'Accept written authorization',
    action: 'Accept',
    detail: (s) => (s.authorizationVersion ? `authorization ${s.authorizationVersion}` : null),
  },
  {
    key: 'upload-init',
    title: 'Initialize upload',
    action: 'Initialize',
    detail: (s) => (s.uploadId ? `upload …${s.uploadId.slice(-8)}` : null),
  },
  {
    key: 'upload-complete',
    title: 'Complete upload',
    action: 'Complete',
    detail: (s) => (s.uploadComplete ? 'stage: ready-to-parse · text/html' : null),
  },
  {
    key: 'kickoff',
    title: 'Kick off analysis',
    action: 'Kick off',
    detail: (s) => (s.kickoff ? `status: ${s.kickoff.status}` : null),
  },
]

export function FlowWizard() {
  const flow = useFlow()
  const { snap, form, setForm, busy, error } = flow

  return (
    <section className="animate-fade-in">
      <header className="flex items-center gap-4">
        <span className="eyebrow">03</span>
        <span className="h-px flex-1 bg-rule" />
        <span className="eyebrow">The reading</span>
      </header>

      <h2 className="mt-7 font-serif text-3xl tracking-tight sm:text-4xl">Begin the reading.</h2>
      <p className="mt-3 max-w-xl text-base text-muted-foreground">
        A guided, six-step pass through the pilot API. Each step calls the live boundary and stores
        its result in your browser so a refresh resumes where you left off.
      </p>

      <FormPanel form={form} setForm={setForm} disabled={!!busy} />

      <div className="mt-10 flex flex-wrap items-center gap-3">
        <Button size="lg" onClick={() => flow.runAll()} disabled={!!busy}>
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Running
            </>
          ) : (
            <>
              <Play className="h-4 w-4" /> Run entire flow
            </>
          )}
        </Button>
        <Button size="lg" variant="outline" onClick={flow.reset} disabled={!!busy}>
          <RotateCcw className="h-4 w-4" /> Reset session
        </Button>
        {error && (
          <span role="alert" className="flex items-center gap-2 font-mono text-xs text-negative">
            <AlertCircle className="h-4 w-4" /> {error}
          </span>
        )}
      </div>

      <div className="sr-only" role="status" aria-live="polite">
        {busy ? `Running step: ${busy}` : error ? `Step failed: ${error}` : snap.kickoff ? 'Analysis complete.' : 'Ready.'}
      </div>

      <ol className="mt-10">
        {STEPS.map((meta, index) => (
          <Step
            key={meta.key}
            index={index + 1}
            meta={meta}
            snap={snap}
            done={stepDone(meta.key, snap)}
            running={busy === meta.key}
            anyBusy={!!busy}
            onRun={() => flow.runStep(meta.key)}
          />
        ))}
      </ol>

      {snap.kickoff && <ResultsView kickoff={snap.kickoff} />}
    </section>
  )
}

function FormPanel({
  form,
  setForm,
  disabled,
}: {
  form: ReturnType<typeof useFlow>['form']
  setForm: ReturnType<typeof useFlow>['setForm']
  disabled: boolean
}) {
  return (
    <div className="mt-8 border border-rule bg-paper p-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <Label>
          <span className="eyebrow">Email</span>
          <Input
            value={form.email}
            disabled={disabled}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </Label>
        <Label>
          <span className="eyebrow">Password</span>
          <Input
            type="password"
            value={form.password}
            disabled={disabled}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </Label>
        <Label className="sm:col-span-2">
          <span className="eyebrow">Invite code</span>
          <Input
            value={form.inviteCode}
            disabled={disabled}
            placeholder="Minted out of band — see `npm run issue-invite`"
            onChange={(e) => setForm({ ...form, inviteCode: e.target.value })}
          />
        </Label>
      </div>
      <Label className="mt-5">
        <span className="eyebrow">Sample report JSON (fictitious)</span>
        <Textarea
          rows={8}
          value={form.reportJson}
          disabled={disabled}
          onChange={(e) => setForm({ ...form, reportJson: e.target.value })}
        />
      </Label>
    </div>
  )
}

function Step({
  index,
  meta,
  snap,
  done,
  running,
  anyBusy,
  onRun,
}: {
  index: number
  meta: StepMeta
  snap: ReturnType<typeof useFlow>['snap']
  done: boolean
  running: boolean
  anyBusy: boolean
  onRun: () => void
}) {
  const detail = meta.detail(snap)
  const prevIndex = STEPS.findIndex((s) => s.key === meta.key) - 1
  const prereqMet = prevIndex < 0 || stepDone(STEPS[prevIndex]!.key, snap)

  return (
    <li className="flex items-center gap-5 border-b border-rule py-5">
      <span className="w-6 shrink-0 font-mono text-xs text-faint">{String(index).padStart(2, '0')}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-serif text-lg">{meta.title}</span>
          {done && (
            <Badge variant="positive">
              <Check className="h-3 w-3" /> done
            </Badge>
          )}
        </div>
        {detail && <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{detail}</p>}
      </div>
      <Button
        size="sm"
        variant={done ? 'outline' : 'default'}
        disabled={anyBusy || !prereqMet}
        onClick={onRun}
      >
        {running ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin" /> Running
          </>
        ) : done ? (
          'Re-run'
        ) : (
          meta.action
        )}
      </Button>
    </li>
  )
}
