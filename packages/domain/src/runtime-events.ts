export type RuntimeEvent =
  | { kind: 'analysis-complete'; at: string; reportId?: string; uploadId?: string; message: string }
  | { kind: 'analysis-failure'; at: string; reportId?: string; uploadId?: string; message: string }
  | { kind: 'upload-complete'; at: string; uploadId?: string; message: string }
  | { kind: 'upload-failure'; at: string; uploadId?: string; message: string }
  | { kind: 'pilot-transition'; at: string; transition: string; message: string }
  | { kind: 'persistence-failure'; at: string; message: string }
  | { kind: 'release-gate-failure'; at: string; gate: string; message: string }

export function createRuntimeEvent(event: RuntimeEvent): RuntimeEvent {
  return event
}
