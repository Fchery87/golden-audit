// Thin typed fetch wrapper over the Golden Audit pilot API.
// All endpoints are same-origin (served by apps/web/src/server.ts); in dev,
// Vite proxies these paths to the Node API server (see vite.config.ts).

export type PilotAvailability = {
  status: string
  eligible: boolean
  mode?: string
  approvedStates: string[]
  provisionalSelectedState?: string | null
  availabilityClaim?: string
  pricingMode?: string
  nationwideStatus?: string
  fixtureOnly?: boolean
  stateChecked: string | null
  statePrompt?: string
  continueHelperText?: string
  blockedStateMessage?: string
  boundary?: string
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
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

export function getAvailability(state: string): Promise<PilotAvailability> {
  const params = new URLSearchParams({ state })
  return request<PilotAvailability>(`/pilot-availability?${params.toString()}`)
}
