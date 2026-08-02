import { FormEvent, useEffect, useState } from 'react'
import { api, type ReportPresentationProfile } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function AdminApp() {
  const [profile, setProfile] = useState<ReportPresentationProfile | null>(null)
  const [csrfToken, setCsrfToken] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  async function loadDashboard() {
    const dashboard = await api.getAdminDashboard()
    setProfile(dashboard.profile)
    setCsrfToken(dashboard.csrfToken)
  }
  useEffect(() => { void loadDashboard().catch(() => undefined) }, [])

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    try { await api.signIn(email, password); await loadDashboard() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to sign in') }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!profile) return
    setError(''); setStatus('')
    try {
      const saved = await api.updateAdminProfile(profile.revision, profile, csrfToken)
      setProfile(saved); setStatus(`Saved profile revision ${saved.revision}. New reports will use it.`)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save profile') }
  }

  if (!profile) return <section className="admin-shell" aria-labelledby="admin-access"><h1 id="admin-access">Owner access</h1><p>Sign in with the email designated as the Golden Audit owner. This area does not expose consumer reports.</p><form className="admin-form" onSubmit={signIn}><label>Email<Input type="email" required value={email} onChange={event => setEmail(event.target.value)} /></label><label>Password<Input type="password" required value={password} onChange={event => setPassword(event.target.value)} /></label>{error && <p role="alert" className="form-error">{error}</p>}<Button type="submit">Sign in</Button></form></section>

  return <section className="admin-shell" aria-labelledby="admin-title"><header><h1 id="admin-title">Report presentation</h1><p>These settings affect reports generated after you save. Evidence, coverage, limitations, and required educational boundaries are protected.</p></header><form className="admin-form" onSubmit={save}><ProfileFields profile={profile} onChange={setProfile} />{error && <p role="alert" className="form-error">{error}</p>}{status && <p role="status" className="form-status">{status}</p>}<div className="admin-actions"><Button type="submit">Save profile</Button><Button type="button" variant="outline" onClick={() => void api.signOut().then(() => { setProfile(null); setCsrfToken('') })}>Sign out</Button></div></form></section>
}

function ProfileFields({ profile, onChange }: { profile: ReportPresentationProfile; onChange: (profile: ReportPresentationProfile) => void }) {
  const update = (field: keyof ReportPresentationProfile, value: string) => onChange({ ...profile, [field]: value })
  const fields: Array<[keyof ReportPresentationProfile, string, string]> = [
    ['organizationName', 'Organization name', 'Required'], ['preparedByLabel', 'Prepared-by label', 'Optional'], ['preparedByTitle', 'Prepared-by title', 'Optional'], ['logoUrl', 'Logo URL', 'Optional HTTPS URL'], ['supportEmail', 'Support email', 'Optional'], ['websiteUrl', 'Website URL', 'Optional HTTPS URL'], ['supportPhone', 'Support phone', 'Optional'], ['mailingAddress', 'Mailing address', 'Optional'], ['reportTitle', 'Report title', 'Optional'], ['reportSubtitle', 'Report subtitle', 'Optional'], ['closingNote', 'Closing note', 'Optional; presentation only'],
  ]
  return <><div className="admin-field-grid">{fields.map(([field, label, hint]) => <label key={field}>{label}<span>{hint}</span>{field === 'mailingAddress' || field === 'closingNote' ? <textarea value={typeof profile[field] === 'string' ? profile[field] : ''} onChange={event => update(field, event.target.value)} rows={field === 'closingNote' ? 3 : 2} /> : <Input value={typeof profile[field] === 'string' ? profile[field] : ''} onChange={event => update(field, event.target.value)} />}</label>)}</div><fieldset><legend>Presentation</legend><label>Accent<select value={profile.accent} onChange={event => onChange({ ...profile, accent: event.target.value as ReportPresentationProfile['accent'] })}><option value="gold">Gold</option><option value="charcoal">Charcoal</option><option value="sage">Sage</option></select></label><label>Print style<select value={profile.printStyle} onChange={event => onChange({ ...profile, printStyle: event.target.value as ReportPresentationProfile['printStyle'] })}><option value="standard">Standard</option><option value="compact">Compact</option></select></label></fieldset></>
}
