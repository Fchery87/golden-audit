// Typed client for the Golden Audit pilot API.
// All endpoints are same-origin (served by apps/web/src/server.ts); in dev,
// Vite proxies these paths to the Node API server (see vite.config.ts).

export type PilotAvailability = {
  status: string
  eligible: boolean
  approvedStates: string[]
  provisionalSelectedState?: string | null
  availabilityClaim?: string
  fixtureOnly?: boolean
  stateChecked: string | null
  statePrompt?: string
  blockedStateMessage?: string
  boundary?: string
}

export type RegisterResult = { sessionId: string; userId: string }
export type ConsentResult = { workspaceId: string }
export type AuthorizationResult = { id: string; version: string }
export type UploadInitResult = { id: string; token: string; stage: string }
export type UploadCompleteResult = { id: string; stage: string; mediaType: string }

export type MatchGroupSummary = {
  id: string
  state: string
  confidence: number
  tradelineIds: string[]
  signals: string[]
}

export type TradelineSummary = {
  id: string
  bureau: string
  creditor: string
  maskedAccount: string
  balanceCents: number | null
}

export type CompleteAnalysisResult = {
  status: 'analysis-complete'
  reportId: string
  analysisId: string
  consumerReportId: string
  exportId: string
}

export type KickoffResult = {
  status: 'analysis-complete' | 'match-review-required'
  reportId: string
  matches: MatchGroupSummary[]
  tradelines?: TradelineSummary[]
  analysisId?: string
  consumerReportId?: string
  exportId?: string
}

export type AnalysisFinding = {
  id: string
  title: string
  severity: string
  confidence: number
  limitations?: string[]
}

export type Analysis = {
  id: string
  reportId: string
  findings: AnalysisFinding[]
}

export type ConsumerReport = {
  id: string
  analysisId: string
  limitations: string[]
  findings: AnalysisFinding[]
}

export type ExportArtifact = { id: string; reportId: string; content: string }

const SESSION_KEY = 'golden-audit-session'

let sessionId: string | null =
  typeof window !== 'undefined' ? window.localStorage.getItem(SESSION_KEY) : null

export function setSession(id: string | null): void {
  sessionId = id
  if (typeof window === 'undefined') return
  if (id) window.localStorage.setItem(SESSION_KEY, id)
  else window.localStorage.removeItem(SESSION_KEY)
}

export function getSession(): string | null {
  return sessionId
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  }
  if (sessionId) headers['x-session-id'] = sessionId

  const response = await fetch(path, { ...init, headers })
  const text = await response.text()
  const body = text ? (JSON.parse(text) as unknown) : {}
  if (!response.ok) {
    let message = `HTTP ${response.status}`
    if (body && typeof body === 'object' && 'error' in body) {
      const errorValue = (body as Record<string, unknown>).error
      if (typeof errorValue === 'string') message = errorValue
    }
    throw new Error(message)
  }
  return body as T
}

function post<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: 'POST', body: JSON.stringify(body) })
}

export const api = {
  getAvailability(state: string): Promise<PilotAvailability> {
    const params = new URLSearchParams({ state })
    return request<PilotAvailability>(`/pilot-availability?${params.toString()}`)
  },

  register(email: string, password: string): Promise<RegisterResult> {
    return post<RegisterResult>('/consumer/register', { email, password })
  },

  consent(): Promise<ConsentResult> {
    return post<ConsentResult>('/consumer/consent', {
      version: '2026-01',
      adultUSConsumer: true,
      authorizedReportUse: true,
      educationalLimitations: true,
      sensitiveDataHandling: true,
      residence: 'CA',
      analysisJurisdiction: 'CA',
    })
  },

  acceptAuthorization(): Promise<AuthorizationResult> {
    return post<AuthorizationResult>('/consumer/authorization', {})
  },

  initUpload(workspaceId: string): Promise<UploadInitResult> {
    return post<UploadInitResult>('/consumer/uploads/init', { workspaceId })
  },

  completeUpload(input: {
    uploadId: string
    token: string
    fileName: string
    mediaType: string
    contentBase64: string
  }): Promise<UploadCompleteResult> {
    return post<UploadCompleteResult>('/consumer/uploads/complete', input)
  },

  kickoffAnalysis(uploadId: string, autoConfirm = true): Promise<KickoffResult> {
    return post<KickoffResult>(
      `/consumer/uploads/${encodeURIComponent(uploadId)}/kickoff-analysis`,
      { jurisdiction: 'CA', autoConfirmSimpleMatches: autoConfirm },
    )
  },

  confirmSubgroup(matchId: string, tradelineIds: string[], reason: string): Promise<MatchGroupSummary> {
    return post<MatchGroupSummary>(`/consumer/matches/${encodeURIComponent(matchId)}/confirm-subgroup`, {
      tradelineIds,
      reason,
    })
  },

  completeAnalysis(reportId: string, jurisdiction = 'CA'): Promise<CompleteAnalysisResult> {
    return post<CompleteAnalysisResult>(
      `/consumer/reports/${encodeURIComponent(reportId)}/complete-analysis`,
      { jurisdiction },
    )
  },

  getAnalysis(id: string): Promise<Analysis> {
    return request<Analysis>(`/consumer/analyses/${encodeURIComponent(id)}`)
  },

  getConsumerReport(id: string): Promise<ConsumerReport> {
    return request<ConsumerReport>(`/consumer/reports/${encodeURIComponent(id)}`)
  },

  getExport(id: string): Promise<ExportArtifact> {
    return request<ExportArtifact>(`/consumer/exports/${encodeURIComponent(id)}`)
  },
}
