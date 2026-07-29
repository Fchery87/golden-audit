import { Badge } from '@/components/ui/badge'

// A representative finding rendered in the Calm Audit editorial voice —
// a pull-quote with a mono ledger. Real findings are produced by the
// deterministic analysis engine and surfaced via the consumer flow (next slice).
export function FindingCard() {
  return (
    <section className="animate-fade-in">
      <header className="flex items-center gap-4">
        <span className="eyebrow">02</span>
        <span className="h-px flex-1 bg-rule" />
        <span className="eyebrow">An example finding</span>
      </header>

      <blockquote className="mt-8 border-l-2 border-primary pl-7">
        <div className="flex items-center gap-3">
          <Badge variant="medium">Balance difference</Badge>
          <Badge variant="low">Medium</Badge>
          <span className="eyebrow">EQ ↔ EX</span>
        </div>

        <p className="mt-5 font-serif text-2xl leading-snug tracking-tight sm:text-[1.7rem]">
          Experian reports{' '}
          <span className="tnum font-medium">$15,000</span> on a revolving account where Equifax shows{' '}
          <span className="tnum font-medium">$12,500</span> — a difference of{' '}
          <span className="tnum font-medium text-primary">$2,500</span> that may reflect a reporting
          date, not an error.
        </p>

        <p className="mt-4 text-base italic text-muted-foreground">
          We describe what we see. We don’t decide who is right.
        </p>

        <dl className="mt-6 border-t border-rule pt-4 font-mono text-[13px] text-muted-foreground">
          <Row label="Equifax" value="$12,500" />
          <Row label="Experian" value="$15,000" />
          <Row label="Difference" value="+$2,500" emphasis />
        </dl>
      </blockquote>
    </section>
  )
}

function Row({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1">
      <dt>{label}</dt>
      <dd className={`tnum ${emphasis ? 'font-medium text-primary' : 'text-foreground'}`}>{value}</dd>
    </div>
  )
}
