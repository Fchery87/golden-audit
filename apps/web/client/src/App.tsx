import { ThemeProvider } from '@/hooks/use-theme'
import { ThemeToggle } from '@/components/theme-toggle'
import { FlowWizard } from '@/components/flow/flow-wizard'
import { ConsumerApp } from '@/components/consumer/consumer-app'
import { AdminApp } from '@/components/admin/admin-app'

export default function App() {
  const debug = window.location.pathname === '/debug'
  const admin = window.location.pathname === '/admin'

  return (
    <ThemeProvider>
      <div className="min-h-screen">
        <a href="#content" className="skip-link">Skip to content</a>
        <Masthead debug={debug} />
        <main id="content" tabIndex={-1} className="mx-auto max-w-3xl px-6 pb-28 pt-10 outline-none sm:pt-16">
          {admin ? <AdminApp /> : debug ? <FlowWizard /> : <ConsumerApp />}
        </main>
        <Boundary />
      </div>
    </ThemeProvider>
  )
}

function Masthead({ debug }: { debug: boolean }) {
  return (
    <header className="no-print mx-auto flex max-w-3xl items-center justify-between border-b border-rule px-6 py-6">
      <span className="font-mono text-[13px] uppercase tracking-[0.18em] text-muted-foreground">Golden Audit · Pilot Edition{debug ? ' · Debug' : ''}</span>
      <ThemeToggle />
    </header>
  )
}

function Boundary() {
  return (
    <footer className="no-print mx-auto max-w-3xl px-6 pb-16">
      <p className="border-t border-rule pt-8 text-sm leading-relaxed text-muted-foreground">This free pilot provides educational credit-report analysis only — not credit repair, disputes, score guarantees, or legal conclusions.</p>
    </footer>
  )
}
