import * as React from 'react'
import { api, type KickoffResult } from '@/lib/api'
import { SAMPLE_REPORT, encodeReportForUpload } from '@/lib/sample-report'

export type StepKey =
  | 'register'
  | 'consent'
  | 'authorization'
  | 'upload-init'
  | 'upload-complete'
  | 'kickoff'

export type FlowSnapshot = {
  // D10: the session itself lives in an httpOnly cookie the browser manages — this just tracks
  // whether registration succeeded, for the wizard's own step-done display.
  userId: string | null
  workspaceId: string | null
  authorizationVersion: string | null
  uploadId: string | null
  token: string | null
  uploadComplete: boolean
  kickoff: KickoffResult | null
}

const STORAGE_KEY = 'golden-audit-flow'

const EMPTY: FlowSnapshot = {
  userId: null,
  workspaceId: null,
  authorizationVersion: null,
  uploadId: null,
  token: null,
  uploadComplete: false,
  kickoff: null,
}

export const ORDER: StepKey[] = [
  'register',
  'consent',
  'authorization',
  'upload-init',
  'upload-complete',
  'kickoff',
]

function load(): FlowSnapshot {
  if (typeof window === 'undefined') return EMPTY
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY
    return { ...EMPTY, ...(JSON.parse(raw) as Partial<FlowSnapshot>) }
  } catch {
    return EMPTY
  }
}

export function stepDone(key: StepKey, s: FlowSnapshot): boolean {
  switch (key) {
    case 'register':
      return !!s.userId
    case 'consent':
      return !!s.workspaceId
    case 'authorization':
      return !!s.authorizationVersion
    case 'upload-init':
      return !!s.uploadId && !!s.token
    case 'upload-complete':
      return s.uploadComplete
    case 'kickoff':
      return !!s.kickoff
  }
}

type FormState = {
  email: string
  password: string
  inviteCode: string
  reportJson: string
}

// Pure(ish) single-step advance: reads the snapshot, calls the API, returns the
// next snapshot. No React state — both runStep and runAll use this so reads are
// always against the freshest values, not stale render state.
async function advance(key: StepKey, s: FlowSnapshot, form: FormState): Promise<FlowSnapshot> {
  switch (key) {
    case 'register': {
      const res = await api.register(form.email, form.password, form.inviteCode)
      return { ...EMPTY, userId: res.userId }
    }
    case 'consent': {
      const res = await api.consent('CA', 'CA')
      return {
        ...s,
        workspaceId: res.workspaceId,
        authorizationVersion: null,
        uploadId: null,
        token: null,
        uploadComplete: false,
        kickoff: null,
      }
    }
    case 'authorization': {
      const res = await api.acceptAuthorization('authorization-2026-01', true)
      return { ...s, authorizationVersion: res.version }
    }
    case 'upload-init': {
      const res = await api.initUpload(s.workspaceId ?? '')
      return { ...s, uploadId: res.id, token: res.token, uploadComplete: false, kickoff: null }
    }
    case 'upload-complete': {
      await api.completeUpload({
        uploadId: s.uploadId ?? '',
        token: s.token ?? '',
        fileName: 'report.html',
        mediaType: 'text/html',
        contentBase64: encodeReportForUpload(form.reportJson),
      })
      return { ...s, uploadComplete: true, kickoff: null }
    }
    case 'kickoff': {
      const res = await api.kickoffAnalysis(s.uploadId ?? '')
      return { ...s, kickoff: res }
    }
  }
}

export function useFlow() {
  const [snap, setSnap] = React.useState<FlowSnapshot>(load)
  const [form, setForm] = React.useState<FormState>({
    email: 'pilot@example.com',
    password: 'correct horse battery staple',
    inviteCode: '',
    reportJson: JSON.stringify(SAMPLE_REPORT, null, 2),
  })
  const [busy, setBusy] = React.useState<StepKey | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  // Always-fresh ref so async loops read the latest committed snapshot at call time.
  const snapRef = React.useRef(snap)
  snapRef.current = snap

  React.useEffect(() => {
    if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snap))
  }, [snap])

  async function runStep(key: StepKey): Promise<void> {
    setBusy(key)
    setError(null)
    try {
      const next = await advance(key, snapRef.current, form)
      setSnap(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unexpected error')
    } finally {
      setBusy(null)
    }
  }

  async function runAll(): Promise<void> {
    setError(null)
    // Local accumulator — updated synchronously, immune to React render timing.
    let acc: FlowSnapshot = { ...snapRef.current }
    try {
      for (const key of ORDER) {
        if (stepDone(key, acc)) continue
        setBusy(key)
        acc = await advance(key, acc, form)
        setSnap(acc)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unexpected error')
    } finally {
      setBusy(null)
    }
  }

  async function reset(): Promise<void> {
    // Actually revoke the server-side session and clear the cookie — clearing only local wizard
    // state would leave the user authenticated (D10: the cookie, not this snapshot, is the
    // real session boundary now).
    try { await api.signOut() } catch { /* no active session to revoke — fine */ }
    setSnap(EMPTY)
    if (typeof window !== 'undefined') window.localStorage.removeItem(STORAGE_KEY)
    setError(null)
  }

  return { snap, form, setForm, busy, error, runStep, runAll, reset }
}
