export type ServiceName = 'web' | 'worker' | 'admin'

export type HealthStatus = {
  service: ServiceName
  status: 'ok'
  version: string
  checkedAt: string
}

export type SmokeStatus = {
  status: 'ok'
  services: Record<ServiceName, HealthStatus>
  database: { status: 'ok'; migrationVersion: string }
}

export const applicationVersion = '0.1.0'

export function createHealthStatus(service: ServiceName, now = new Date()): HealthStatus {
  return { service, status: 'ok', version: applicationVersion, checkedAt: now.toISOString() }
}
