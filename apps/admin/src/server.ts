import { createServer } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHealthStatus } from '../../../packages/domain/src/index.js'
import { CreditAnalysisPlatform, type PilotApprovalRecordFile, type PilotDrillEvidenceReport, type PilotGate, type QualityReport } from '../../../packages/platform/src/index.js'
import { loadPlatformRuntime, readRecentRuntimeEvents } from '../../web/src/runtime-store.js'

const port = Number(process.env.ADMIN_PORT ?? 3002)
const runtimeDir = process.env.PILOT_PERSISTENCE_DIR ?? '.scratch/runtime/web'
const approvalRecordPath = process.env.PILOT_APPROVAL_RECORD_PATH ?? 'docs/pilot-approval-records.json'
const approvalRecords = JSON.parse(readFileSync(approvalRecordPath, 'utf8')) as PilotApprovalRecordFile
const platform = new CreditAnalysisPlatform()
if (!loadPlatformRuntime(platform, runtimeDir)) {
  platform.hydrateLaunchScope(approvalRecords)
  platform.loadPilotApprovals(approvalRecords)
}

const approvalAreas: PilotGate['approvals'][number]['area'][] = ['product', 'legal', 'privacy', 'security', 'operations', 'accessibility', 'vendor']

const packetLinks: Array<[string, string]> = [
  ['Approval packet', '/docs/pilot-approval-review-packet.md'],
  ['Approval handoff template', '/docs/approval-handoff-template.md'],
  ['Legal handoff', '/docs/legal-approval-handoff.md'],
  ['Privacy handoff', '/docs/privacy-approval-handoff.md'],
  ['Security handoff', '/docs/security-approval-handoff.md'],
  ['Launch-scope checklist index', '/docs/launch-scope-checklist-index.md'],
  ['One-state checklist', '/docs/checklist-one-state-free-pilot.md'],
  ['Small subset checklist', '/docs/checklist-small-reviewed-state-subset.md'],
  ['Pause-claims checklist', '/docs/checklist-pause-launch-claims.md'],
]

function currentGate(): PilotGate {
  return platform.getPilotGate()
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] ?? ch))
}

function laneSectionList(gate: PilotGate, filter: string): string {
  return approvalAreas.map(area => {
    const approvals = gate.approvals.filter(item => item.area === area)
    const matchesFilter = !filter || area.includes(filter)
    const content = approvals.length
      ? approvals.map(item => `<li id="approval-${item.area}"><strong>${item.area}</strong> — ${item.approver} <code>${item.evidenceReference}</code></li>`).join('')
      : `<li id="approval-${area}"><strong>${area}</strong> — ${matchesFilter ? 'pending review' : 'filtered out'}</li>`
    return `<section id="lane-${area}"><h3>${area}</h3><ul>${content}</ul></section>`
  }).join('')
}

function approvalItems(gate: PilotGate, filter: string): string {
  const approvals = gate.approvals.filter(item => !filter || item.area.includes(filter))
  return approvals.map((item: PilotGate['approvals'][number]) => `<li id="approval-${item.area}"><strong>${item.area}</strong> — ${item.approver} <code>${item.evidenceReference}</code></li>`).join('') || '<li>none recorded</li>'
}

function missingItems(gate: PilotGate, filter: string): string {
  const missing = gate.missing.filter(item => !filter || item.includes(filter))
  return missing.map((item: PilotGate['missing'][number]) => `<li>${item}</li>`).join('') || '<li>none</li>'
}

function runtimeEventItems(filter: string): string {
  const events = readRecentRuntimeEvents(runtimeDir, 12).filter(item => !filter || item.kind.includes(filter))
  return events.map((item: { kind: string; at: string; message?: string }) => `<li id="event-${item.kind}"><strong>${item.kind}</strong> <code>${item.at}</code> ${item.message ?? ''}</li>`).join('') || '<li id="event-none">none recorded</li>'
}

function evidenceSummary(): { gate: PilotGate; quality: QualityReport; drills: PilotDrillEvidenceReport } {
  return {
    gate: currentGate(),
    quality: platform.getQualityReport(),
    drills: platform.getPilotDrillEvidenceReport(),
  }
}

function evidenceSection(): string {
  const { gate, quality, drills } = evidenceSummary()
  const topSegment = quality.segments[0]
  return `<section>
    <h2>Pilot evidence</h2>
    <p>Ready: <strong>${gate.ready}</strong> · segments: <strong>${quality.segments.length}</strong> · drills: <strong>${drills.totalDrills}</strong></p>
    <ul>
      <li>Open approval areas: ${gate.missing.length > 0 ? escapeHtml(gate.missing.join(', ')) : 'none'}</li>
      <li>Drill follow-ups: ${drills.openGaps.length > 0 ? drills.openGaps.length : 'none'}</li>
      <li>Quality sample: ${topSegment ? `${escapeHtml(topSegment.provider)} / ${topSegment.documentType} / ${topSegment.jurisdiction}` : 'none recorded'}</li>
    </ul>
    <p><a href="/pilot-evidence">Open the JSON evidence feed</a></p>
  </section>`
}

function htmlPage(gateFilter = '', eventFilter = ''): string {
  const gate = currentGate()
  const packetNav = packetLinks.map(([label, href]) => `<li><a href="${href}">${label}</a></li>`).join('')
  const laneLinks = gate.approvals.map(item => `<a href="#approval-${item.area}">${item.area}</a>`).join(' · ') || 'none recorded'
  const runtimeLinks = readRecentRuntimeEvents(runtimeDir, 12).map(item => `<a href="#event-${item.kind}">${item.kind}</a>`).join(' · ') || 'none recorded'
  return `<!doctype html>
  <meta charset="utf-8">
  <title>Golden Audit Admin</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 32px; line-height: 1.5; background: #111; color: #eee; }
    code { background: #222; padding: 0 4px; border-radius: 4px; }
    section { margin: 24px 0; padding: 16px; border: 1px solid #333; border-radius: 12px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; }
    a { color: #7dd3fc; }
    label { display: inline-block; margin-right: 12px; }
    input { padding: 8px 10px; border-radius: 8px; border: 1px solid #555; background: #1a1a1a; color: #eee; }
    button { padding: 8px 12px; border-radius: 8px; border: 1px solid #555; background: #222; color: #eee; }
    pre { white-space: pre-wrap; }
  </style>
  <h1>Pilot Gate Dashboard</h1>
  <p>Ready: <strong>${gate.ready}</strong> · Missing launch scope: <strong>${gate.missingLaunchScope}</strong></p>
  <section>
    <h2>Workflow links</h2>
    <div class="grid">
      <div><h3>Packets and handoffs</h3><ul>${packetNav}</ul></div>
      <div><h3>Checklist links</h3><p><a href="/docs/launch-scope-checklist-index.md">Open the launch-scope checklist index</a> to review the approved order of work.</p></div>
      <div><h3>History anchors</h3><p>Approvals: ${laneLinks}</p><p>Runtime events: ${runtimeLinks}</p></div>
    </div>
  </section>
  <section>
    <h2>Filters</h2>
    <form method="GET">
      <label>Approval lane <input name="lane" value="${escapeHtml(gateFilter)}" placeholder="privacy" /></label>
      <label>Event kind <input name="event" value="${escapeHtml(eventFilter)}" placeholder="analysis-complete" /></label>
      <button type="submit">Apply</button>
    </form>
  </section>
  <section><h2>Launch scope</h2><pre>${escapeHtml(JSON.stringify(gate.launchScope ?? null, null, 2))}</pre></section>
  ${evidenceSection()}
  <section>
    <h2>Recorded approvals</h2>
    ${laneSectionList(gate, gateFilter)}
  </section>
  <section><h2>Missing approvals</h2><ul>${missingItems(gate, gateFilter)}</ul></section>
  <section><h2>Recent runtime events</h2><ul>${runtimeEventItems(eventFilter)}</ul></section>`
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`)
  if (request.method === 'GET' && url.pathname === '/health') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    response.end(JSON.stringify(createHealthStatus('admin')))
    return
  }
  if (request.method === 'GET' && url.pathname === '/pilot-evidence') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    response.end(JSON.stringify(evidenceSummary()))
    return
  }
  if (request.method === 'GET' && url.pathname === '/gate') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    response.end(JSON.stringify({ gate: currentGate(), runtimeEvents: readRecentRuntimeEvents(runtimeDir, 12) }))
    return
  }
  if (request.method === 'GET' && url.pathname === '/') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end(htmlPage(url.searchParams.get('lane') ?? '', url.searchParams.get('event') ?? ''))
    return
  }
  response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify({ error: 'Not found' }))
})

server.listen(port, () => console.log(`admin listening on ${port}`))
