import * as React from 'react'
import { ArrowLeft } from 'lucide-react'
import { ThemeProvider } from '@/hooks/use-theme'
import { ThemeToggle } from '@/components/theme-toggle'
import { Hero } from '@/components/landing/hero'
import { FindingCard } from '@/components/landing/finding-card'
import { FlowWizard } from '@/components/flow/flow-wizard'

export default function App() {
  const [view, setView] = React.useState<'landing' | 'flow'>('landing')

  return (
    <ThemeProvider>
      <div className="min-h-screen">
        <a href="#content" className="skip-link">Skip to content</a>
        <Masthead onBack={view === 'flow' ? () => setView('landing') : undefined} />
        <main id="content" tabIndex={-1} className="mx-auto max-w-2xl px-6 pb-28 pt-16 outline-none sm:pt-24">
          {view === 'landing' ? (
            <>
              <Hero onBegin={() => setView('flow')} />
              <hr className="my-20 border-rule sm:my-28" />
              <FindingCard />
            </>
          ) : (
            <FlowWizard />
          )}
        </main>
        <Boundary />
      </div>
    </ThemeProvider>
  )
}

function Masthead({ onBack }: { onBack?: () => void }) {
  return (
    <header className="mx-auto flex max-w-2xl items-center justify-between border-b border-rule px-6 py-6">
      <div className="flex items-center gap-4">
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center gap-1 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" /> back
          </button>
        )}
        <span className="font-mono text-[13px] uppercase tracking-[0.18em] text-muted-foreground">
          Golden Audit · Pilot Edition
        </span>
      </div>
      <ThemeToggle />
    </header>
  )
}

function Boundary() {
  return (
    <footer className="mx-auto max-w-2xl px-6 pb-16">
      <p className="border-t border-rule pt-8 text-sm leading-relaxed text-muted-foreground">
        This free pilot provides educational credit-report analysis only — not credit repair,
        disputes, score guarantees, or legal conclusions.
      </p>
    </footer>
  )
}
