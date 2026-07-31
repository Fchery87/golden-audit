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

export type RegisterResult = { userId: string }
export type SignInResult = { status: string }
export type DeletionResult = { id: string; status: string; deleted: string[]; delayed: string[] }
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

// D10: the session lives in an httpOnly cookie the browser manages automatically — there is no
// JS-readable bearer token to store or attach (docs/consumer-workflow-implementation-plan.md D10).
// `credentials: 'same-origin'` (the browser default for same-origin fetches, made explicit here)
// is what makes the cookie travel with every request.

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  }

  const response = await fetch(path, { ...init, headers, credentials: 'same-origin' })
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

  register(email: string, password: string, inviteCode: string): Promise<RegisterResult> {
    return post<RegisterResult>('/consumer/register', { email, password, inviteCode })
  },

  signIn(email: string, password: string): Promise<SignInResult> {
    return post<SignInResult>('/consumer/sign-in', { email, password })
  },

  signOut(): Promise<SignInResult> {
    return post<SignInResult>('/consumer/sign-out', {})
  },

  // D10: state is an explicit, consequential attestation the caller must supply — the client no
  // longer hardcodes CA behind the user's back (docs/consumer-workflow-implementation-plan.md D10).
  // Wiring a real state picker into the consumer flow UI is Phase 4 scope; this removes the
  // hardcoding at the layer D10 actually specified.
  consent(residence = 'CA', analysisJurisdiction = 'CA'): Promise<ConsentResult> {
    return post<ConsentResult>('/consumer/consent', {
      version: '2026-01',
      adultUSConsumer: true,
      authorizedReportUse: true,
      educationalLimitations: true,
      sensitiveDataHandling: true,
      residence,
      analysisJurisdiction,
    })
  },

  acceptAuthorization(): Promise<AuthorizationResult> {
    return post<AuthorizationResult>('/consumer/authorization', {})
  },

  requestDeletion(): Promise<DeletionResult> {
    return post<DeletionResult>('/consumer/deletion', {})
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
