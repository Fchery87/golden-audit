// Browser API client. Every request uses the Pages-compatible /api contract.
export type PilotAvailability = { status: string; eligible: boolean; approvedStates: string[]; provisionalSelectedState?: string | null; availabilityClaim?: string; fixtureOnly?: boolean; stateChecked: string | null; statePrompt?: string; blockedStateMessage?: string; boundary?: string }
export type RegisterResult = { userId: string }
export type SignInResult = { status: string }
export type DeletionResult = { status: 'complete'; receipt: { completedAt: string; outcome: 'account-deleted' } }
export type ConsentResult = { workspaceId: string }
export type AuthorizationResult = { id: string; version: string }
export type UploadInitResult = { id: string; token: string; stage: string }
export type UploadCompleteResult = { id: string; stage: string; mediaType: string }
export type Disclosure = { authorizationVersion: string; authorizationText: string; retentionPolicy: { originalsMaxDays: number; deletionControl: string; description: string } }
export type ConsumerDashboard = { email: string; workspaceId: string | null; consent: boolean; authorization: boolean; pendingReview: KickoffResult | null; reports: Array<{ id: string; generatedAt: string; findingCount: number; parserVersion: string; exportId: string | null }> }
export type MatchGroupSummary = { id: string; state: string; confidence: number; tradelineIds: string[]; signals: string[] }
export type TradelineSummary = { id: string; bureau: string; creditor: string; maskedAccount: string; balanceCents: number | null }
export type CompleteAnalysisResult = { status: 'analysis-complete'; reportId: string; analysisId: string; consumerReportId: string; exportId: string }
export type KickoffResult = { status: 'analysis-complete' | 'match-review-required'; reportId: string; matches: MatchGroupSummary[]; tradelines?: TradelineSummary[]; analysisId?: string; consumerReportId?: string; exportId?: string }
export type AnalysisFinding = { id: string; title: string; severity: string; confidence: number; limitations?: string[] }
export type ConsumerReport = { id: string; analysisId: string; limitations: string[]; overview: Record<string, number>; generatedAt?: string; findings: Array<Omit<AnalysisFinding, 'limitations'> & { limitations: string[]; classification: string; evidence: Array<{ field: string; value: string | number | null; source: { page?: number; locator?: string; originalDisplay?: string } }>; alternativeExplanations: string[]; suggestedAction: string; verificationDocuments: string[]; educationModules: Array<{ id: string; title: string; body: string; limitations: string[] }>; authorities: Array<{ id: string; title: string; sourceUrl: string; citation: string }> }>; content?: { catalogVersion: string; rulesetVersion: string; parserVersion: string; sectionPrimers: Array<{ id: string; title: string; body: string; limitations: string[]; authorityIds: string[]; authorities: Array<{ id: string; title: string; sourceUrl: string; citation: string }> }>; coverage: Array<{ ruleId: string; name: string; requiredInputs: string[]; outcomes: Array<{ outcome: string; reason: string }> }>; parserFields: Array<{ field: string; capability: 'supported' | 'planned'; states: Record<string, number> }> } }
export type ExportArtifact = { id: string; reportId: string; content: string; formatVersion?: string }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { ...(init?.body ? { 'content-type': 'application/json' } : {}), ...(init?.headers as Record<string, string> | undefined) }
  const response = await fetch(`/api${path}`, { ...init, headers, credentials: 'same-origin' })
  const text = await response.text()
  let body: unknown = {}
  try { body = text ? JSON.parse(text) : {} } catch { throw new Error('Unexpected server response') }
  if (!response.ok) throw new Error(body && typeof body === 'object' && 'error' in body && typeof body.error === 'string' ? body.error : `HTTP ${response.status}`)
  return body as T
}
const post = <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) })
export const api = {
  getAvailability: (state: string) => request<PilotAvailability>(`/pilot-availability?${new URLSearchParams({ state })}`),
  register: (email: string, password: string, inviteCode: string) => post<RegisterResult>('/consumer/register', { email, password, inviteCode }),
  signIn: (email: string, password: string) => post<SignInResult>('/consumer/sign-in', { email, password }),
  signOut: () => post<SignInResult>('/consumer/sign-out', {}),
  getDisclosure: () => request<Disclosure>('/consumer/disclosures'),
  getDashboard: () => request<ConsumerDashboard>('/consumer/dashboard'),
  consent: (residence: string, analysisJurisdiction: string) => post<ConsentResult>('/consumer/consent', { version: '2026-01', adultUSConsumer: true, authorizedReportUse: true, educationalLimitations: true, sensitiveDataHandling: true, residence, analysisJurisdiction }),
  acceptAuthorization: (version: string, accepted: boolean) => post<AuthorizationResult>('/consumer/authorization', { version, accepted }),
  requestDeletion: () => post<DeletionResult>('/consumer/deletion', {}),
  initUpload: (workspaceId: string) => post<UploadInitResult>('/consumer/uploads/init', { workspaceId }),
  completeUpload: (input: { uploadId: string; token: string; fileName: string; mediaType: string; contentBase64: string }) => post<UploadCompleteResult>('/consumer/uploads/complete', input),
  kickoffAnalysis: (uploadId: string, autoConfirm = true) => post<KickoffResult>(`/consumer/uploads/${encodeURIComponent(uploadId)}/kickoff-analysis`, { jurisdiction: 'CA', autoConfirmSimpleMatches: autoConfirm }),
  confirmSubgroup: (matchId: string, tradelineIds: string[], reason: string) => post<MatchGroupSummary>(`/consumer/matches/${encodeURIComponent(matchId)}/confirm-subgroup`, { tradelineIds, reason }),
  completeAnalysis: (reportId: string, jurisdiction = 'CA') => post<CompleteAnalysisResult>(`/consumer/reports/${encodeURIComponent(reportId)}/complete-analysis`, { jurisdiction }),
  getConsumerReport: (id: string) => request<ConsumerReport>(`/consumer/reports/${encodeURIComponent(id)}`),
  getExport: (id: string) => request<ExportArtifact>(`/consumer/exports/${encodeURIComponent(id)}`),
}
