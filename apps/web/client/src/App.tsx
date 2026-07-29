import { ThemeProvider } from '@/hooks/use-theme'
import { ThemeToggle } from '@/components/theme-toggle'
import { Hero } from '@/components/landing/hero'
import { FindingCard } from '@/components/landing/finding-card'

export default function App() {
  return (
    <ThemeProvider>
      <div className="min-h-screen">
        <Masthead />
        <main className="mx-auto max-w-2xl px-6 pb-28 pt-16 sm:pt-24">
          <Hero />
          <hr className="my-20 border-rule sm:my-28" />
          <FindingCard />
        </main>
        <Boundary />
      </div>
    </ThemeProvider>
  )
}

function Masthead() {
  return (
    <header className="mx-auto flex max-w-2xl items-center justify-between border-b border-rule px-6 py-6">
      <span className="font-mono text-[13px] uppercase tracking-[0.18em] text-muted-foreground">
        Golden Audit · Pilot Edition
      </span>
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
