import * as React from 'react'
import { AlertCircle, FileText, Loader2, LogIn, ShieldCheck, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { ReportDocument, ReportActions } from '@/components/consumer/report-document'
import { api, type ConsumerDashboard, type ConsumerReport, type Disclosure, type KickoffResult } from '@/lib/api'

const emptyAuth = { email: '', password: '', inviteCode: '' }
type AuthMode = 'sign-in' | 'register'

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

  if (loading) return <p className="flex items-center gap-2 py-20 text-sm text-muted-foreground" role="status"><Loader2 className="h-4 w-4 animate-spin" /> Loading your account…</p>
  if (!dashboard) return <AuthScreen onAuthenticated={refresh} />

  return (
    <section className="py-8 sm:py-12">
      <nav className="no-print flex items-center justify-between border-b border-rule pb-5 text-sm" aria-label="Account navigation">
        <span className="text-muted-foreground">Signed in as <strong className="font-medium text-foreground">{dashboard.email}</strong></span>
        <div className="flex gap-4"><button className="underline underline-offset-4" onClick={() => { setScreen('home'); setReport(null) }}>Review</button><button className="underline underline-offset-4" onClick={() => setScreen('account')}>Account</button></div>
      </nav>
      {error && <p role="alert" className="mt-5 flex gap-2 text-sm text-negative"><AlertCircle className="h-4 w-4 shrink-0" /> {error}</p>}
      {screen === 'account' ? <AccountPanel dashboard={dashboard} onDeleted={() => { setDashboard(null); setReport(null); setScreen('home') }} onOpenReport={openReport} /> : report ? <ReportScreen report={report} onBack={() => setReport(null)} /> : <Onboarding dashboard={dashboard} onRefresh={refresh} onOpenReport={openReport} />}
    </section>
  )
}

function AuthScreen({ onAuthenticated }: { onAuthenticated: () => Promise<void> }) {
  const [mode, setMode] = React.useState<AuthMode>('sign-in')
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
    </form>
  </section>
}

function Onboarding({ dashboard, onRefresh, onOpenReport }: { dashboard: ConsumerDashboard; onRefresh: () => Promise<void>; onOpenReport: (id: string) => Promise<void> }) {
  if (dashboard.reports.length > 0) return <section className="mt-10"><h1 className="font-serif text-3xl tracking-tight">Your reports</h1><p className="mt-3 text-muted-foreground">Choose a completed reading or start another review when you have a new report.</p><ul className="mt-8 divide-y divide-rule border-y border-rule">{dashboard.reports.map(report => <li key={report.id} className="flex flex-wrap items-center justify-between gap-4 py-5"><div><p className="font-medium">Report from {new Date(report.generatedAt).toLocaleDateString()}</p><p className="text-sm text-muted-foreground">{report.findingCount} findings · parser {report.parserVersion}</p></div><Button variant="outline" onClick={() => void onOpenReport(report.id)}><FileText className="h-4 w-4" /> Open report</Button></li>)}</ul></section>
  if (!dashboard.consent) return <ConsentStep onComplete={onRefresh} />
  if (!dashboard.authorization) return <AuthorizationStep onComplete={onRefresh} />
  return <UploadStep workspaceId={dashboard.workspaceId} onComplete={onOpenReport} />
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
  const [file, setFile] = React.useState<File | null>(null); const [busy, setBusy] = React.useState(false); const [error, setError] = React.useState<string | null>(null)
  async function submit(event: React.FormEvent) { event.preventDefault(); if (!file || !workspaceId) return; if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) { setError('Choose an IdentityIQ PDF report.'); return }; setBusy(true); setError(null); try { const initialized = await api.initUpload(workspaceId); const contentBase64 = await fileToBase64(file); await api.completeUpload({ uploadId: initialized.id, token: initialized.token, fileName: file.name, mediaType: 'application/pdf', contentBase64 }); const result: KickoffResult = await api.kickoffAnalysis(initialized.id, true); if (result.status !== 'analysis-complete' || !result.consumerReportId) throw new Error('This report needs match review before it can be completed.'); await onComplete(result.consumerReportId) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to process this report') } finally { setBusy(false) } }
  return <section className="mt-10 max-w-2xl"><h1 className="font-serif text-3xl tracking-tight">Upload your IdentityIQ PDF.</h1><p className="mt-3 text-muted-foreground">Choose the PDF exported from IdentityIQ. Saved HTML reports are not supported because they do not contain the account data needed for this review.</p><form onSubmit={submit} className="mt-8 border border-rule bg-paper p-6"><Label>Credit report PDF<Input className="mt-2" required type="file" accept="application/pdf,.pdf" onChange={event => setFile(event.target.files?.[0] ?? null)} /></Label>{file && <p className="mt-4 text-sm text-muted-foreground">{file.name} · {Math.ceil(file.size / 1024)} KB</p>}{error && <p className="mt-4 text-sm text-negative" role="alert">{error}</p>}<Button className="mt-6" type="submit" disabled={!file || busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}Review my report</Button></form></section>
}

function ReportScreen({ report, onBack }: { report: { report: ConsumerReport; exportId: string | null }; onBack: () => void }) { return <section className="mt-8"><div className="no-print mb-8 flex flex-wrap items-center justify-between gap-4"><button className="text-sm underline underline-offset-4" onClick={onBack}>Back to reports</button><ReportActions exportId={report.exportId} /></div><ReportDocument report={report.report} /></section> }

function AccountPanel({ dashboard, onDeleted, onOpenReport }: { dashboard: ConsumerDashboard; onDeleted: () => void; onOpenReport: (id: string) => Promise<void> }) {
  const [confirming, setConfirming] = React.useState(false); const [busy, setBusy] = React.useState(false); const [error, setError] = React.useState<string | null>(null)
  async function signOut() { setBusy(true); try { await api.signOut(); onDeleted() } finally { setBusy(false) } }
  async function remove() { setBusy(true); setError(null); try { await api.requestDeletion(); onDeleted() } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to delete account') } finally { setBusy(false) } }
  return <section className="mt-10 max-w-2xl"><h1 className="font-serif text-3xl tracking-tight">Account</h1><dl className="mt-8 divide-y divide-rule border-y border-rule"><div className="py-5"><dt className="text-sm text-muted-foreground">Email</dt><dd className="mt-1">{dashboard.email}</dd></div><div className="py-5"><dt className="text-sm text-muted-foreground">Completed reports</dt><dd className="mt-1">{dashboard.reports.length}</dd></div></dl>{dashboard.reports.length > 0 && <Button className="mt-6" variant="outline" onClick={() => void onOpenReport(dashboard.reports[0]!.id)}><FileText className="h-4 w-4" />Open latest report</Button>}<div className="mt-10 border-t border-rule pt-8"><Button variant="outline" disabled={busy} onClick={() => void signOut()}>Sign out</Button><h2 className="mt-10 font-serif text-2xl">Delete account</h2><p className="mt-3 text-sm leading-relaxed text-muted-foreground">Deleting your account removes your account, report uploads, analysis artifacts, exports, authorizations, sessions, and account-linked records. We retain only a non-identifying completion receipt for operational evidence.</p>{confirming ? <div className="mt-5 border border-negative p-5"><p className="font-medium">This cannot be undone.</p><p className="mt-2 text-sm text-muted-foreground">Your session will end immediately after deletion completes.</p>{error && <p className="mt-3 text-sm text-negative" role="alert">{error}</p>}<div className="mt-5 flex gap-3"><Button variant="outline" disabled={busy} onClick={() => void remove()}><Trash2 className="h-4 w-4" />Delete my account</Button><Button variant="outline" disabled={busy} onClick={() => setConfirming(false)}>Cancel</Button></div></div> : <Button className="mt-5" variant="outline" onClick={() => setConfirming(true)}><Trash2 className="h-4 w-4" />Delete account</Button>}</div></section>
}

function fileToBase64(file: File): Promise<string> { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error('Unable to read this file')); reader.onload = () => { const result = reader.result; if (typeof result !== 'string') { reject(new Error('Unable to read this file')); return } resolve(result.split(',')[1] ?? '') }; reader.readAsDataURL(file) }) }
