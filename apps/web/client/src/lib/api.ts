// Browser API client. Every request uses the Pages-compatible /api contract.
export type PilotAvailability = { status: string; eligible: boolean; approvedStates: string[]; provisionalSelectedState?: string | null; availabilityClaim?: string; fixtureOnly?: boolean; stateChecked: string | null; statePrompt?: string; blockedStateMessage?: string; boundary?: string }
export type RegisterResult = { userId: string }
export type SignInResult = { status: string }
export type DeletionResult = { status: 'complete'; receipt: { completedAt: string; outcome: 'account-deleted' } }
export type ConsentResult = { workspaceId: string }
export type AuthorizationResult = { id: string; version: string }
export type UploadInitResult = { id: string; token: string; stage: string }
export type UploadCompleteResult = { id: string; stage: string; mediaType: string }
export type Disclosure = { authorizationVersion: string; authorizationText: string; retentionPolicy: { originalsMaxDays: number; deletionControl: string; description: string }; identityAttestationVersion: string; identityAttestationText: string }
export type PostalAddress = { line1: string; line2?: string; city: string; state: string; postalCode: string }
export type ConsumerIdentityInput = { fullName: string; dateOfBirth: string; ssnLastFour: string; currentAddress: PostalAddress; previousAddresses: PostalAddress[]; attestationVersion: string; accurateAndComplete: true }
export type ConsumerIdentity = Omit<ConsumerIdentityInput, 'accurateAndComplete'> & { attestedAt: string }
export type ConsumerDashboard = { email: string; workspaceId: string | null; identity: boolean; consent: boolean; authorization: boolean; pendingReview: KickoffResult | null; reports: Array<{ id: string; generatedAt: string; findingCount: number; parserVersion: string; exportId: string | null }> }
export type ReviewDecision = 'confirmed' | 'corrected' | 'unknown' | 'not-shown'
export type ConsumerReviewValue = { id: string; bureau: string; field: string; normalized: string | number | null; originalDisplay: string; state: string; source: { kind: string; locator: string }; confidence: number; review?: { decision: ReviewDecision; reason: string; replacement?: string | number } }
export type ConsumerValueReview = { reportId: string; required: number; decided: number; complete: boolean; values: ConsumerReviewValue[] }
export type MatchGroupSummary = { id: string; state: string; confidence: number; tradelineIds: string[]; signals: string[] }
export type TradelineSummary = { id: string; bureau: string; creditor: string; maskedAccount: string; balanceCents: number | null }
export type CompleteAnalysisResult = { status: 'analysis-complete'; reportId: string; analysisId: string; consumerReportId: string; exportId: string }
export type KickoffResult = { status: 'analysis-complete' | 'match-review-required'; reportId: string; matches?: MatchGroupSummary[]; tradelines?: TradelineSummary[]; required?: number; decided?: number; analysisId?: string; consumerReportId?: string; exportId?: string }
export type AnalysisFinding = { id: string; title: string; severity: string; confidence: number; limitations?: string[] }
export type ReportPresentationProfile = { revision: number; organizationName: string; preparedByLabel?: string; preparedByTitle?: string; logoUrl?: string; supportEmail?: string; websiteUrl?: string; supportPhone?: string; mailingAddress?: string; reportTitle?: string; reportSubtitle?: string; accent: 'gold' | 'charcoal' | 'sage'; printStyle: 'standard' | 'compact'; closingNote?: string }
export type AdminDashboard = { profile: ReportPresentationProfile; csrfToken: string }
export type ReportAccountCell = { label: string; value: string; source: { kind: string; locator: string } }
export type ReportAccountRow = { id: string; bureau: string; cells: ReportAccountCell[] }
export type ReportScoreRow = { bureau: string; score: number; scoreScale: string; source: { kind: string; locator: string }; scaleSource: { kind: string; locator: string } }
export type ReportInquiryRow = { id: string; bureau: string; creditor: string; businessType?: string; date: string; source: { kind: string; locator: string } }
export type ReportIdentityRow = { id: string; bureau: string; field: string; value: string; attestationMatch: 'matches-attested' | 'differs-from-attested' | 'not-compared'; source: { kind: string; locator: string } }
export type ReportSummary = {
  accountsRead: number
  accountsByBureau: Record<string, number>
  openAccounts: number
  closedAccounts: number
  negativeItems: { total: number; collections: number; pastDueAccounts: number; derogatoryStatusAccounts: number; statusUnavailable: number }
  crossBureauInconsistencies: number
  identityObservations: number
  inquiriesRead: number
  totalBalanceCents: number | null
  totalPastDueCents: number | null
  utilization: { revolvingBalanceCents: number; revolvingLimitCents: number; ratio: number | null; accountsCounted: number; accountsWithoutLimit: number }
}
export type ReimportAccountRef = { creditor: string; bureau: string; maskedAccount: string }
export type ReimportDiff = {
  previousConsumerReportId: string
  previousGeneratedAt: string
  newAccounts: ReimportAccountRef[]
  removedAccounts: ReimportAccountRef[]
  changedAccounts: Array<ReimportAccountRef & { changes: Array<{ field: string; from: string; to: string }> }>
  scoreChanges: Array<{ bureau: string; from: number; to: number; delta: number }>
  findingsResolved: string[]
  findingsNew: string[]
  findingsUnchanged: number
}
export type ConsumerReport = { id: string; analysisId: string; sourceReportId?: string; limitations: string[]; overview: Record<string, number>; generatedAt?: string; presentation: ReportPresentationProfile; recipient?: { displayName: string; source: { kind: string; locator: string }; confidence: number }; findings: Array<Omit<AnalysisFinding, 'limitations'> & { limitations: string[]; classification: string; evidence: Array<{ field: string; subject?: 'tradeline' | 'identity'; value: string | number | null; source: { page?: number; locator?: string; originalDisplay?: string } }>; alternativeExplanations: string[]; suggestedAction: string; verificationDocuments: string[]; educationModules: Array<{ id: string; title: string; body: string; limitations: string[] }>; authorities: Array<{ id: string; title: string; sourceUrl: string; citation: string }> }>; content?: { catalogVersion: string; rulesetVersion: string; parserVersion: string; sectionPrimers: Array<{ id: string; title: string; body: string; limitations: string[]; authorityIds: string[]; authorities: Array<{ id: string; title: string; sourceUrl: string; citation: string }> }>; coverage: Array<{ ruleId: string; name: string; requiredInputs: string[]; outcomes: Array<{ outcome: string; reason: string }> }>; parserFields: Array<{ field: string; capability: 'supported' | 'planned'; states: Record<string, number> }>; summary?: ReportSummary; identityRows?: ReportIdentityRow[]; reimport?: ReimportDiff; pendingMatchGroups?: number; accountRows?: ReportAccountRow[]; scoreRows?: ReportScoreRow[]; inquiryRows?: ReportInquiryRow[] } }
export type PasswordResetRequestResult = { status: 'if-account-exists-reset-issued' }
export type PasswordResetConfirmResult = { status: 'password-reset' }
export type EmailVerificationRequestResult = { status: 'verification-issued' }
export type EmailVerificationConfirmResult = { status: 'email-verified' }
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
  getIdentity: () => request<{ identity: ConsumerIdentity | null }>('/consumer/identity'),
  recordIdentity: (input: ConsumerIdentityInput) => post<ConsumerIdentity>('/consumer/identity', input),
  getDashboard: () => request<ConsumerDashboard>('/consumer/dashboard'),
  consent: (residence: string, analysisJurisdiction: string) => post<ConsentResult>('/consumer/consent', { version: '2026-01', adultUSConsumer: true, authorizedReportUse: true, educationalLimitations: true, sensitiveDataHandling: true, residence, analysisJurisdiction }),
  acceptAuthorization: (version: string, accepted: boolean) => post<AuthorizationResult>('/consumer/authorization', { version, accepted }),
  requestPasswordReset: (email: string) => post<PasswordResetRequestResult>('/consumer/password-reset/request', { email }),
  confirmPasswordReset: (token: string, newPassword: string) => post<PasswordResetConfirmResult>('/consumer/password-reset/confirm', { token, newPassword }),
  requestEmailVerification: () => post<EmailVerificationRequestResult>('/consumer/email-verification/request', {}),
  confirmEmailVerification: (token: string) => post<EmailVerificationConfirmResult>('/consumer/email-verification/confirm', { token }),
  requestDeletion: () => post<DeletionResult>('/consumer/deletion', {}),
  initUpload: (workspaceId: string) => post<UploadInitResult>('/consumer/uploads/init', { workspaceId }),
  completeUpload: (input: { uploadId: string; token: string; fileName: string; mediaType: string; contentBase64: string }) => post<UploadCompleteResult>('/consumer/uploads/complete', input),
  kickoffAnalysis: (uploadId: string) => post<KickoffResult>(`/consumer/uploads/${encodeURIComponent(uploadId)}/kickoff-analysis`, { jurisdiction: 'CA' }),
  getValueReview: (reportId: string) => request<ConsumerValueReview>(`/consumer/reports/${encodeURIComponent(reportId)}/value-review`),
  decideValue: (reportId: string, valueId: string, decision: ReviewDecision, reason: string, replacement?: string | number) => post<ConsumerValueReview>(`/consumer/reports/${encodeURIComponent(reportId)}/values/${encodeURIComponent(valueId)}/decision`, { decision, reason, ...(replacement !== undefined ? { replacement } : {}) }),
  getPendingMatches: (reportId: string) => request<{ reportId: string; matches: MatchGroupSummary[]; tradelines: TradelineSummary[] }>(`/consumer/reports/${encodeURIComponent(reportId)}/pending-matches`),
  completeValueReview: (reportId: string) => post<CompleteAnalysisResult>(`/consumer/reports/${encodeURIComponent(reportId)}/value-review`, {}),
  decideMatch: (matchId: string, action: 'confirmed' | 'rejected', reason: string) => post<MatchGroupSummary>(`/consumer/matches/${encodeURIComponent(matchId)}/decision`, { action, reason }),
  confirmSubgroup: (matchId: string, tradelineIds: string[], reason: string) => post<MatchGroupSummary>(`/consumer/matches/${encodeURIComponent(matchId)}/confirm-subgroup`, { tradelineIds, reason }),
  completeAnalysis: (reportId: string, jurisdiction = 'CA') => post<CompleteAnalysisResult>(`/consumer/reports/${encodeURIComponent(reportId)}/complete-analysis`, { jurisdiction }),
  getAdminDashboard: () => request<AdminDashboard>('/admin/dashboard'),
  updateAdminProfile: (expectedRevision: number, profile: ReportPresentationProfile, csrfToken: string) => request<ReportPresentationProfile>('/admin/profile', { method: 'POST', headers: { 'x-golden-audit-csrf': csrfToken }, body: JSON.stringify({ expectedRevision, profile }) }),
  getConsumerReport: (id: string) => request<ConsumerReport>(`/consumer/reports/${encodeURIComponent(id)}`),
  getExport: (id: string) => request<ExportArtifact>(`/consumer/exports/${encodeURIComponent(id)}`),
}
