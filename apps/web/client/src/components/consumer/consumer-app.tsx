import * as React from 'react'
import { AlertCircle, FileText, Loader2, LogIn, ShieldCheck, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { ReportDocument, ReportActions } from '@/components/consumer/report-document'
import { IdentityStep } from '@/components/consumer/identity-intake'
import { ResultsView } from '@/components/flow/results-view'
import { api, type ConsumerDashboard, type ConsumerReport, type Disclosure, type KickoffResult, type CompleteAnalysisResult, type ConsumerValueReview, type ConsumerReviewValue, type ReviewDecision } from '@/lib/api'

const emptyAuth = { email: '', password: '', inviteCode: '' }
type AuthMode = 'sign-in' | 'register'
type AccessPanel = 'credentials' | 'forgot-password' | 'reset-password' | 'verify-email'

export function ConsumerApp() {
  const [dashboard, setDashboard] = React.useState<ConsumerDashboard | null>(null)
  const [report, setReport] = React.useState<{ report: ConsumerReport; exportId: string | null } | null>(null)
  const [screen, setScreen] = React.useState<'home' | 'account'>('home')
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)

  const refresh = React.useCallback(async () => {
    setError(null)
    try {
      const current = await api.getDashboard()
      setDashboard(current)
      if (current.reports.length === 0) setReport(null)
    } catch (cause) {
      if (cause instanceof Error && cause.message !== 'Authentication required') setError(cause.message)
      setDashboard(null)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { void refresh() }, [refresh])

  async function openReport(id: string) {
    setError(null)
    try { const consumerReport = await api.getConsumerReport(id); const summary = dashboard?.reports.find(item => item.id === id); setReport({ report: consumerReport, exportId: summary?.exportId ?? null }); setScreen('home') } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load report') }
  }

  async function openCompletedReport(id: string) {
    setError(null)
    try {
      const [consumerReport, current] = await Promise.all([api.getConsumerReport(id), api.getDashboard()])
      setDashboard(current)
      setReport({ report: consumerReport, exportId: current.reports.find(item => item.id === id)?.exportId ?? null })
      setScreen('home')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load report') }
  }

  const accessParameters = new URLSearchParams(window.location.search)
  const resetToken = accessParameters.get('resetToken')
  const verificationToken = accessParameters.get('verifyEmailToken')
  if (resetToken !== null) return <PasswordResetConfirm token={resetToken} onComplete={() => { setDashboard(null); setReport(null) }} />
  if (verificationToken !== null) return <EmailVerificationConfirm token={verificationToken} onComplete={() => void refresh()} />
  if (loading) return <p className="flex items-center gap-2 py-20 text-sm text-muted-foreground" role="status"><Loader2 className="h-4 w-4 animate-spin" /> Loading your account…</p>
  if (!dashboard) return <AuthScreen onAuthenticated={refresh} />

  return (
    <section className="py-8 sm:py-12">
      <nav className="no-print flex items-center justify-between border-b border-rule pb-5 text-sm" aria-label="Account navigation">
        <span className="text-muted-foreground">Signed in as <strong className="font-medium text-foreground">{dashboard.email}</strong></span>
        <div className="flex gap-4"><button className="underline underline-offset-4" onClick={() => { setScreen('home'); setReport(null) }}>Review</button><button className="underline underline-offset-4" onClick={() => setScreen('account')}>Account</button></div>
      </nav>
      {error && <p role="alert" className="mt-5 flex gap-2 text-sm text-negative"><AlertCircle className="h-4 w-4 shrink-0" /> {error}</p>}
      {screen === 'account' ? <AccountPanel dashboard={dashboard} onDeleted={() => { setDashboard(null); setReport(null); setScreen('home') }} onOpenReport={openReport} /> : report ? <ReportScreen report={report} onBack={() => setReport(null)} onReanalyzed={result => void openCompletedReport(result.consumerReportId)} /> : <Onboarding dashboard={dashboard} onRefresh={refresh} onOpenReport={openReport} onCompletedReport={openCompletedReport} />}
    </section>
  )
}

function AuthScreen({ onAuthenticated }: { onAuthenticated: () => Promise<void> }) {
  const [mode, setMode] = React.useState<AuthMode>('sign-in')
  const [panel, setPanel] = React.useState<AccessPanel>(() => {
    const parameters = new URLSearchParams(window.location.search)
    if (parameters.has('resetToken')) return 'reset-password'
    if (parameters.has('verifyEmailToken')) return 'verify-email'
    return 'credentials'
  })
  const [form, setForm] = React.useState(emptyAuth)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const register = mode === 'register'

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(null)
    try {
      if (register) await api.register(form.email, form.password, form.inviteCode)
      else await api.signIn(form.email, form.password)
      await onAuthenticated()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to continue') } finally { setBusy(false) }
  }

  if (panel === 'forgot-password') return <PasswordResetRequest onBack={() => setPanel('credentials')} />
  if (panel === 'reset-password') return <PasswordResetConfirm token={new URLSearchParams(window.location.search).get('resetToken') ?? ''} onComplete={() => setPanel('credentials')} />
  if (panel === 'verify-email') return <EmailVerificationConfirm token={new URLSearchParams(window.location.search).get('verifyEmailToken') ?? ''} onComplete={() => setPanel('credentials')} />

  return <section className="py-10 sm:py-16" aria-labelledby="access-heading">
    <h1 id="access-heading" className="font-serif text-3xl tracking-tight sm:text-4xl">Review your credit report with care.</h1>
    <p className="mt-4 max-w-2xl text-muted-foreground">This free, invite-only California pilot reads an IdentityIQ PDF and returns educational observations for your own review. It does not provide credit repair, disputes, score guarantees, or legal conclusions.</p>
    <form className="mt-9 max-w-lg border border-rule bg-paper p-6" onSubmit={submit}>
      <div role="tablist" aria-label="Account access" className="mb-6 flex gap-5 border-b border-rule">
        {(['sign-in', 'register'] as const).map(option => <button key={option} type="button" role="tab" aria-selected={mode === option} className={`border-b-2 pb-3 text-sm ${mode === option ? 'border-primary font-medium' : 'border-transparent text-muted-foreground'}`} onClick={() => { setMode(option); setError(null) }}>{option === 'sign-in' ? 'Sign in' : 'Create account'}</button>)}
      </div>
      <div className="grid gap-5">
        <Label>Email<Input required type="email" autoComplete="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} /></Label>
        <Label>Password<Input required minLength={12} type="password" autoComplete={register ? 'new-password' : 'current-password'} value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} /></Label>
        {register && <Label>Invite code<Input required value={form.inviteCode} onChange={event => setForm({ ...form, inviteCode: event.target.value })} /></Label>}
      </div>
      {error && <p className="mt-5 text-sm text-negative" role="alert">{error}</p>}
      <Button className="mt-7" type="submit" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}{register ? 'Create account' : 'Sign in'}</Button>
      {!register && <button type="button" className="ml-4 text-sm underline underline-offset-4" onClick={() => { setPanel('forgot-password'); setError(null) }}>Forgot password?</button>}
    </form>
  </section>
}

function PasswordResetRequest({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = React.useState(''); const [busy, setBusy] = React.useState(false); const [submitted, setSubmitted] = React.useState(false); const [error, setError] = React.useState<string | null>(null)
  async function submit(event: React.FormEvent) { event.preventDefault(); setBusy(true); setError(null); try { await api.requestPasswordReset(email); setSubmitted(true) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to request a reset') } finally { setBusy(false) } }
  return <section className="py-10 sm:py-16"><h1 className="font-serif text-3xl tracking-tight">Reset your password.</h1>{submitted ? <div className="mt-8 max-w-lg border border-rule bg-paper p-6"><p>If an account matches that email, we sent a password-reset link.</p><Button className="mt-6" variant="outline" onClick={onBack}>Back to sign in</Button></div> : <form className="mt-8 max-w-lg border border-rule bg-paper p-6" onSubmit={submit}><p className="text-sm text-muted-foreground">Enter your account email. For privacy, this screen shows the same result whether or not an account exists.</p><Label className="mt-6">Email<Input required type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} /></Label>{error && <p className="mt-4 text-sm text-negative" role="alert">{error}</p>}<div className="mt-6 flex gap-3"><Button type="submit" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Send reset link</Button><Button type="button" variant="outline" onClick={onBack}>Cancel</Button></div></form>}</section>
}

function PasswordResetConfirm({ token, onComplete }: { token: string; onComplete: () => void }) {
  const [password, setPassword] = React.useState(''); const [busy, setBusy] = React.useState(false); const [done, setDone] = React.useState(false); const [error, setError] = React.useState<string | null>(null)
  async function submit(event: React.FormEvent) { event.preventDefault(); if (!token) { setError('This reset link is incomplete. Request a new one.'); return }; setBusy(true); setError(null); try { await api.confirmPasswordReset(token, password); setDone(true); window.history.replaceState({}, '', '/app') } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to reset password') } finally { setBusy(false) } }
  return <section className="py-10 sm:py-16"><h1 className="font-serif text-3xl tracking-tight">Choose a new password.</h1>{done ? <div className="mt-8 max-w-lg border border-rule bg-paper p-6"><p>Your password was reset. Existing sessions were signed out.</p><Button className="mt-6" onClick={onComplete}>Sign in</Button></div> : <form className="mt-8 max-w-lg border border-rule bg-paper p-6" onSubmit={submit}><Label>New password<Input required minLength={12} type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} /></Label><p className="mt-3 text-sm text-muted-foreground">Use at least 12 characters.</p>{error && <p className="mt-4 text-sm text-negative" role="alert">{error}</p>}<Button className="mt-6" type="submit" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Reset password</Button></form>}</section>
}

function EmailVerificationConfirm({ token, onComplete }: { token: string; onComplete: () => void }) {
  const [busy, setBusy] = React.useState(false); const [done, setDone] = React.useState(false); const [error, setError] = React.useState<string | null>(null)
  async function confirm() { if (!token) { setError('This verification link is incomplete.'); return }; setBusy(true); setError(null); try { await api.confirmEmailVerification(token); setDone(true); window.history.replaceState({}, '', '/app') } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to verify email') } finally { setBusy(false) } }
  return <section className="py-10 sm:py-16"><h1 className="font-serif text-3xl tracking-tight">Verify your email.</h1><div className="mt-8 max-w-lg border border-rule bg-paper p-6">{done ? <><p>Your email is verified.</p><Button className="mt-6" onClick={onComplete}>Continue to sign in</Button></> : <><p className="text-sm text-muted-foreground">Confirming verifies the email address associated with this account.</p>{error && <p className="mt-4 text-sm text-negative" role="alert">{error}</p>}<Button className="mt-6" onClick={() => void confirm()} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Verify email</Button></>}</div></section>
}

function Onboarding({ dashboard, onRefresh, onOpenReport, onCompletedReport }: { dashboard: ConsumerDashboard; onRefresh: () => Promise<void>; onOpenReport: (id: string) => Promise<void>; onCompletedReport: (id: string) => Promise<void> }) {
  if (dashboard.pendingReview) return <section className="mt-10"><h1 className="font-serif text-3xl tracking-tight">Finish this reading.</h1><p className="mt-3 text-muted-foreground">This report was read but its reading was not delivered. Continue from where it stopped rather than uploading the document again.</p><ResultsView kickoff={dashboard.pendingReview} onCompleted={(result: CompleteAnalysisResult) => void onCompletedReport(result.consumerReportId)} /></section>
  if (dashboard.reports.length > 0) return <section className="mt-10"><h1 className="font-serif text-3xl tracking-tight">Your reports</h1><p className="mt-3 text-muted-foreground">Open a completed reading, or upload a newer report to see what changed since the last one.</p><ul className="mt-8 divide-y divide-rule border-y border-rule">{dashboard.reports.map(report => <li key={report.id} className="flex flex-wrap items-center justify-between gap-4 py-5"><div><p className="font-medium">Report from {new Date(report.generatedAt).toLocaleDateString()}</p><p className="text-sm text-muted-foreground">{report.findingCount} findings · parser {report.parserVersion}</p></div><Button variant="outline" onClick={() => void onOpenReport(report.id)}><FileText className="h-4 w-4" /> Open report</Button></li>)}</ul><div className="mt-10 border-t border-rule pt-8"><h2 className="font-serif text-2xl">Upload a newer report</h2><UploadStep workspaceId={dashboard.workspaceId} onComplete={onCompletedReport} /></div></section>
  if (!dashboard.identity) return <IdentityStep onComplete={onRefresh} />
  if (!dashboard.consent) return <ConsentStep onComplete={onRefresh} />
  if (!dashboard.authorization) return <AuthorizationStep onComplete={onRefresh} />
  return <UploadStep workspaceId={dashboard.workspaceId} onComplete={onCompletedReport} />
}

function ConsentStep({ onComplete }: { onComplete: () => Promise<void> }) {
  const [state, setState] = React.useState('CA'); const [accepted, setAccepted] = React.useState(false); const [busy, setBusy] = React.useState(false); const [error, setError] = React.useState<string | null>(null)
  async function submit(event: React.FormEvent) { event.preventDefault(); if (!accepted) return; setBusy(true); setError(null); try { await api.consent(state, state); await onComplete() } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to record consent') } finally { setBusy(false) } }
  return <section className="mt-10 max-w-2xl"><h1 className="font-serif text-3xl tracking-tight">Confirm your eligibility.</h1><p className="mt-3 text-muted-foreground">This pilot is currently available only to California residents. Your state selection is a recorded attestation used to determine whether this pilot can process your report.</p><form onSubmit={submit} className="mt-8 border border-rule bg-paper p-6"><Label>State of residence<select className="mt-2 flex h-10 w-full border border-input bg-transparent px-3 text-sm" value={state} onChange={event => setState(event.target.value)}><option value="CA">California</option><option value="NY">New York</option><option value="TX">Texas</option></select></Label><Label className="mt-6 flex items-start gap-3"><input required type="checkbox" className="mt-1" checked={accepted} onChange={event => setAccepted(event.target.checked)} /><span>I am an adult U.S. consumer, I am authorized to use the report I upload, and I understand this is educational analysis only.</span></Label>{error && <p className="mt-4 text-sm text-negative" role="alert">{error}</p>}<Button className="mt-6" type="submit" disabled={!accepted || busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Continue</Button></form></section>
}

function AuthorizationStep({ onComplete }: { onComplete: () => Promise<void> }) {
  const [disclosure, setDisclosure] = React.useState<Disclosure | null>(null); const [accepted, setAccepted] = React.useState(false); const [busy, setBusy] = React.useState(false); const [error, setError] = React.useState<string | null>(null)
  React.useEffect(() => { void api.getDisclosure().then(setDisclosure).catch(cause => setError(cause instanceof Error ? cause.message : 'Unable to load authorization')) }, [])
  async function submit(event: React.FormEvent) { event.preventDefault(); if (!disclosure || !accepted) return; setBusy(true); setError(null); try { await api.acceptAuthorization(disclosure.authorizationVersion, true); await onComplete() } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to record authorization') } finally { setBusy(false) } }
  if (!disclosure) return <p className="mt-10" role="status">Loading authorization…</p>
  return <section className="mt-10 max-w-3xl"><h1 className="font-serif text-3xl tracking-tight">Read and accept the written authorization.</h1><form onSubmit={submit} className="mt-8"><article className="whitespace-pre-line border border-rule bg-paper p-6 text-sm leading-relaxed">{disclosure.authorizationText}</article><article className="mt-5 border border-rule p-6"><h2 className="font-serif text-xl">Retention and deletion</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{disclosure.retentionPolicy.description}</p><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{disclosure.retentionPolicy.deletionControl}</p></article><Label className="mt-6 flex items-start gap-3"><input required type="checkbox" className="mt-1" checked={accepted} onChange={event => setAccepted(event.target.checked)} /><span>I have read this authorization and affirmatively authorize the described personal educational use of my report.</span></Label>{error && <p className="mt-4 text-sm text-negative" role="alert">{error}</p>}<Button className="mt-6" type="submit" disabled={!accepted || busy}><ShieldCheck className="h-4 w-4" />Accept authorization</Button></form></section>
}

function UploadStep({ workspaceId, onComplete }: { workspaceId: string | null; onComplete: (id: string) => Promise<void> }) {
  const [file, setFile] = React.useState<File | null>(null); const [busy, setBusy] = React.useState(false); const [error, setError] = React.useState<string | null>(null); const [review, setReview] = React.useState<KickoffResult | null>(null)
  async function submit(event: React.FormEvent) { event.preventDefault(); if (!file || !workspaceId) return; if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) { setError('Choose an IdentityIQ PDF report.'); return }; setBusy(true); setError(null); try { const initialized = await api.initUpload(workspaceId); const contentBase64 = await fileToBase64(file); await api.completeUpload({ uploadId: initialized.id, token: initialized.token, fileName: file.name, mediaType: 'application/pdf', contentBase64 }); const result = await api.kickoffAnalysis(initialized.id); if (result.status === 'analysis-complete' && result.consumerReportId) await onComplete(result.consumerReportId); else setReview(result) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to process this report') } finally { setBusy(false) } }
  if (review) return <ResultsView kickoff={review} onCompleted={(result: CompleteAnalysisResult) => void onComplete(result.consumerReportId)} />
  return <section className="mt-10 max-w-2xl"><h1 className="font-serif text-3xl tracking-tight">Upload your IdentityIQ PDF.</h1><p className="mt-3 text-muted-foreground">Choose the PDF exported from IdentityIQ. Saved HTML reports are not supported because they do not contain the account data needed for this reading. Your reading is produced as soon as the document is read — there is nothing to fill in afterwards.</p><form onSubmit={submit} className="mt-8 border border-rule bg-paper p-6"><Label>Credit report PDF<Input className="mt-2" required type="file" accept="application/pdf,.pdf" onChange={event => setFile(event.target.files?.[0] ?? null)} /></Label>{file && <p className="mt-4 text-sm text-muted-foreground">{file.name} · {Math.ceil(file.size / 1024)} KB</p>}{error && <p className="mt-4 text-sm text-negative" role="alert">{error}</p>}<Button className="mt-6" type="submit" disabled={!file || busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}{busy ? 'Reading your report…' : 'Read my report'}</Button></form></section>
}

/**
 * Optional corrections for the handful of values the parser was least sure about.
 *
 * It lives behind the delivered reading, not in front of it, and it lists only extraction
 * exceptions — never values the parser read confidently. A consumer who ignores this entirely
 * still has a complete reading; the uncorrected values simply stay suppressed, exactly as the
 * coverage table already says.
 */
function CorrectionsPanel({ reportId, onReanalyzed }: { reportId: string; onReanalyzed: (result: CompleteAnalysisResult) => void }) {
  const [review, setReview] = React.useState<ConsumerValueReview | null>(null)
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [draft, setDraft] = React.useState<Record<string, { decision: ReviewDecision; reason: string; replacement: string }>>({})
  const load = React.useCallback(async () => { try { setReview(await api.getValueReview(reportId)) } catch { /* The reading stands on its own; a failure to load optional corrections is not worth interrupting it. */ } }, [reportId])
  React.useEffect(() => { void load() }, [load])

  const emptyDraft = { decision: 'corrected' as ReviewDecision, reason: '', replacement: '' }
  function patch(id: string, next: Partial<typeof emptyDraft>) {
    setDraft(current => ({ ...current, [id]: { ...emptyDraft, ...current[id], ...next } }))
  }
  async function save(value: ConsumerReviewValue) {
    const entry = draft[value.id] ?? emptyDraft
    if (!entry.reason.trim()) { setError('Add a short note saying what you checked this against.'); return }
    let replacement: string | number | undefined
    if (entry.decision === 'corrected') {
      replacement = typeof value.normalized === 'number' ? Number(entry.replacement) : entry.replacement
      if (!entry.replacement.trim() || (typeof replacement === 'number' && !Number.isFinite(replacement))) { setError('Enter the value as your report shows it.'); return }
    }
    setBusy(value.id); setError(null)
    try { await api.decideValue(reportId, value.id, entry.decision, entry.reason, replacement); await load() } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save that correction') } finally { setBusy(null) }
  }
  async function reanalyze() {
    setBusy('complete'); setError(null)
    try { onReanalyzed(await api.completeValueReview(reportId)) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to re-run this reading') } finally { setBusy(null) }
  }

  if (!review || review.values.length === 0) return null
  return <section className="no-print mt-12 border-t border-rule pt-8">
    <h2 className="font-serif text-2xl">Values this parser was unsure about</h2>
    <p className="mt-3 max-w-3xl text-muted-foreground">
      {review.values.length} {review.values.length === 1 ? 'value' : 'values'} could not be read confidently, so the checks that
      needed {review.values.length === 1 ? 'it' : 'them'} were suppressed rather than guessed. This is optional: if you can see
      the value on your own report, entering it unlocks those checks. Everything else was read confidently and needs nothing from you.
    </p>
    <Button className="mt-5" variant="outline" onClick={() => setOpen(current => !current)}>{open ? 'Hide' : `Show ${review.values.length}`}</Button>
    {error && <p className="mt-4 text-sm text-negative" role="alert">{error}</p>}
    {open && <>
      <ul className="mt-6 space-y-4">{review.values.map(value => {
        const entry = draft[value.id] ?? emptyDraft
        return <li key={value.id} className="border border-rule bg-paper p-5">
          <div className="flex flex-wrap justify-between gap-2">
            <p className="font-medium capitalize">{value.field.replaceAll(/([A-Z])/g, ' $1')} <span className="text-sm font-normal text-muted-foreground">· {value.bureau}</span></p>
            <p className="font-mono text-xs text-muted-foreground">{value.source.locator}</p>
          </div>
          <p className="mt-2 text-sm">Read as: <strong>{value.originalDisplay || 'nothing readable'}</strong>{value.review && <span className="ml-2 text-muted-foreground">— you corrected this</span>}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <select aria-label={`What to do with ${value.field}`} className="h-10 border border-input bg-transparent px-3 text-sm" value={entry.decision} onChange={event => patch(value.id, { decision: event.target.value as ReviewDecision })}>
              <option value="corrected">My report shows a different value</option>
              <option value="confirmed">This matches my report</option>
              <option value="unknown">My report does not show this</option>
            </select>
            {entry.decision === 'corrected' && <Input aria-label={`Value shown on your report for ${value.field}`} value={entry.replacement} onChange={event => patch(value.id, { replacement: event.target.value })} placeholder="Value as your report shows it" />}
            <Input aria-label={`Note for ${value.field}`} value={entry.reason} onChange={event => patch(value.id, { reason: event.target.value })} placeholder="Where you checked (e.g. page 4)" />
          </div>
          <Button className="mt-3" size="sm" variant="outline" disabled={busy === value.id} onClick={() => void save(value)}>{busy === value.id && <Loader2 className="h-4 w-4 animate-spin" />}Save</Button>
        </li>
      })}</ul>
      <Button className="mt-6" disabled={busy !== null || review.decided === 0} onClick={() => void reanalyze()}>
        {busy === 'complete' && <Loader2 className="h-4 w-4 animate-spin" />}Re-read my report with these corrections
      </Button>
      {review.decided === 0 && <p className="mt-3 text-sm text-muted-foreground">Save at least one correction to re-read the report.</p>}
    </>}
  </section>
}

function ReportScreen({ report, onBack, onReanalyzed }: { report: { report: ConsumerReport; exportId: string | null }; onBack: () => void; onReanalyzed: (result: CompleteAnalysisResult) => void }) {
  return <section className="mt-8">
    <div className="no-print mb-8 flex flex-wrap items-center justify-between gap-4"><button className="text-sm underline underline-offset-4" onClick={onBack}>Back to reports</button><ReportActions exportId={report.exportId} /></div>
    <ReportDocument report={report.report} />
    {report.report.sourceReportId && <CorrectionsPanel reportId={report.report.sourceReportId} onReanalyzed={onReanalyzed} />}
  </section>
}

function AccountPanel({ dashboard, onDeleted, onOpenReport }: { dashboard: ConsumerDashboard; onDeleted: () => void; onOpenReport: (id: string) => Promise<void> }) {
  const [confirming, setConfirming] = React.useState(false); const [busy, setBusy] = React.useState(false); const [error, setError] = React.useState<string | null>(null); const [verificationSent, setVerificationSent] = React.useState(false)
  async function signOut() { setBusy(true); try { await api.signOut(); onDeleted() } finally { setBusy(false) } }
  async function requestVerification() { setBusy(true); setError(null); try { await api.requestEmailVerification(); setVerificationSent(true) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to send verification email') } finally { setBusy(false) } }
  async function remove() { setBusy(true); setError(null); try { await api.requestDeletion(); onDeleted() } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to delete account') } finally { setBusy(false) } }
  return <section className="mt-10 max-w-2xl"><h1 className="font-serif text-3xl tracking-tight">Account</h1><dl className="mt-8 divide-y divide-rule border-y border-rule"><div className="py-5"><dt className="text-sm text-muted-foreground">Email</dt><dd className="mt-1">{dashboard.email}</dd></div><div className="py-5"><dt className="text-sm text-muted-foreground">Completed reports</dt><dd className="mt-1">{dashboard.reports.length}</dd></div></dl>{dashboard.reports.length > 0 && <Button className="mt-6" variant="outline" onClick={() => void onOpenReport(dashboard.reports[0]!.id)}><FileText className="h-4 w-4" />Open latest report</Button>}<div className="mt-10 border-t border-rule pt-8"><h2 className="font-serif text-2xl">Email verification</h2><p className="mt-3 text-sm leading-relaxed text-muted-foreground">Verify this email address before relying on account-recovery messages.</p>{verificationSent ? <p className="mt-4 text-sm text-muted-foreground">If delivery is available for this pilot account, a verification link has been sent.</p> : <Button className="mt-5" variant="outline" disabled={busy} onClick={() => void requestVerification()}>Send verification email</Button>}<Button className="mt-10" variant="outline" disabled={busy} onClick={() => void signOut()}>Sign out</Button><h2 className="mt-10 font-serif text-2xl">Delete account</h2><p className="mt-3 text-sm leading-relaxed text-muted-foreground">Deleting your account removes your account, report uploads, analysis artifacts, exports, authorizations, sessions, and account-linked records. We retain only a non-identifying completion receipt for operational evidence.</p>{confirming ? <div className="mt-5 border border-negative p-5"><p className="font-medium">This cannot be undone.</p><p className="mt-2 text-sm text-muted-foreground">Your session will end immediately after deletion completes.</p>{error && <p className="mt-3 text-sm text-negative" role="alert">{error}</p>}<div className="mt-5 flex gap-3"><Button variant="outline" disabled={busy} onClick={() => void remove()}><Trash2 className="h-4 w-4" />Delete my account</Button><Button variant="outline" disabled={busy} onClick={() => setConfirming(false)}>Cancel</Button></div></div> : <Button className="mt-5" variant="outline" onClick={() => setConfirming(true)}><Trash2 className="h-4 w-4" />Delete account</Button>}</div></section>
}

function fileToBase64(file: File): Promise<string> { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error('Unable to read this file')); reader.onload = () => { const result = reader.result; if (typeof result !== 'string') { reject(new Error('Unable to read this file')); return } resolve(result.split(',')[1] ?? '') }; reader.readAsDataURL(file) }) }
