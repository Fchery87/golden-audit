import * as React from 'react'
import { CheckCircle2, AlertCircle, Loader2, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api, type PilotAvailability } from '@/lib/api'

export function Hero({ onBegin }: { onBegin: () => void }) {
  return (
    <section className="animate-fade-in">
      <p className="eyebrow">№ 001 · California · Invite-only</p>
      <h1 className="mt-7 font-serif text-[2.6rem] leading-[1.06] tracking-tight sm:text-6xl sm:leading-[1.04]">
        Your three credit bureaus rarely <span className="italic text-primary">agree.</span>
      </h1>
      <p className="mt-7 max-w-xl text-lg leading-relaxed">
        Upload a report. We read it carefully and tell you — plainly, in writing — where Equifax,
        Experian, and TransUnion differ.
      </p>
      <p className="mt-3 max-w-xl text-base leading-relaxed text-muted-foreground">
        An educational reading of your file. Not a dispute. Not a score promise. Not legal advice.
      </p>

      <div className="mt-10">
        <AvailabilityCheck />
      </div>

      <div className="mt-8 border-t border-rule pt-8">
        <Button size="lg" onClick={onBegin}>
          Begin the reading <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </section>
  )
}

function AvailabilityCheck() {
  const [state, setState] = React.useState('CA')
  const [status, setStatus] = React.useState<
    | { kind: 'idle' }
    | { kind: 'loading' }
    | { kind: 'ok'; data: PilotAvailability }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' })

  async function check() {
    setStatus({ kind: 'loading' })
    try {
      const data = await api.getAvailability(state.trim().toUpperCase())
      setStatus({ kind: 'ok', data })
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'Unexpected error' })
    }
  }

  return (
    <div className="border-t border-rule pt-8">
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-2">
          <span className="eyebrow">State of residence</span>
          <input
            value={state}
            maxLength={2}
            onChange={(event) => setState(event.target.value)}
            className="h-11 w-24 border border-rule bg-transparent px-3 font-mono text-sm uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
        <Button size="lg" onClick={check} disabled={status.kind === 'loading'}>
          {status.kind === 'loading' ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Checking
            </>
          ) : (
            <>Check availability →</>
          )}
        </Button>
      </div>

      <AvailabilityResult status={status} />
    </div>
  )
}

function AvailabilityResult({
  status,
}: {
  status:
    | { kind: 'idle' }
    | { kind: 'loading' }
    | { kind: 'ok'; data: PilotAvailability }
    | { kind: 'error'; message: string }
}) {
  if (status.kind === 'idle' || status.kind === 'loading') {
    return (
      <p className="mt-5 min-h-[1.5rem] text-sm text-muted-foreground">
        Available in California, free, by invitation.
      </p>
    )
  }
  if (status.kind === 'error') {
    return (
      <p className="mt-5 flex items-center gap-2 text-sm text-negative">
        <AlertCircle className="h-4 w-4" /> {status.message}
      </p>
    )
  }
  const { data } = status
  if (data.eligible) {
    return (
      <p className="mt-5 flex items-center gap-2 text-sm">
        <CheckCircle2 className="h-4 w-4 text-positive" />
        <span>
          Available in <span className="font-medium tnum">{data.stateChecked}</span> · free ·
          invite-only.
        </span>
      </p>
    )
  }
  return (
    <p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
      <AlertCircle className="h-4 w-4" />
      {data.blockedStateMessage ?? 'This pilot is not currently available in your state.'}
    </p>
  )
}
