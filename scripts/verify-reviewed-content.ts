import { createHash } from 'node:crypto'
import { assertSafeConsumerOutput } from '../packages/output-guard/src/index.js'
import { reviewedContentApproval } from '../packages/platform/src/reviewed-content-approval.js'
import { reviewedCaliforniaCatalog } from '../packages/platform/src/reviewed-content.js'

const approval = reviewedContentApproval
const digest = createHash('sha256').update(JSON.stringify({ ...reviewedCaliforniaCatalog, approval: undefined })).digest('hex')
if (approval.approvedByGitIdentity !== 'fchery87' || approval.reviewIntervalDays !== 90) throw new Error('Reviewed content approval identity or cadence is invalid')
if (approval.catalogSha256 !== digest) throw new Error('Reviewed content approval does not bind this catalog digest')
if (Date.parse(approval.reReviewDueAt) - Date.parse(approval.approvedAt) !== 90 * 24 * 60 * 60 * 1000) throw new Error('Reviewed content re-review date must be 90 days after approval')
if (Date.parse(approval.reReviewDueAt) < Date.now()) throw new Error('Reviewed content is overdue for re-review')
const authorities = new Set(reviewedCaliforniaCatalog.authorities.map(item => item.id))
const modules = new Set(reviewedCaliforniaCatalog.modules.map(item => item.id))
for (const authority of reviewedCaliforniaCatalog.authorities) {
  if (authority.status !== 'published' || !authority.sourceUrl || !/^https:\/\//.test(authority.sourceUrl)) throw new Error(`Authority ${authority.id} lacks an HTTPS published source URL`)
  assertSafeConsumerOutput(`${authority.title}\n${authority.citation}\n${authority.limitations.join('\n')}`)
}
for (const module of reviewedCaliforniaCatalog.modules) {
  if (module.status !== 'published' || !module.authorityIds?.length || !module.authorityIds.every(id => authorities.has(id))) throw new Error(`Module ${module.id} has an unknown authority`)
  assertSafeConsumerOutput(`${module.title}\n${module.body}\n${module.limitations.join('\n')}`)
}
for (const rule of reviewedCaliforniaCatalog.rules) {
  if (rule.status !== 'published' || !rule.authorityIds.every(id => authorities.has(id)) || !rule.educationModuleIds.every(id => modules.has(id))) throw new Error(`Rule ${rule.id} has an unresolved content reference`)
  assertSafeConsumerOutput(`${rule.name}\n${rule.requiredInputs.join('\n')}\n${rule.limitations.join('\n')}`)
}
console.log(`Reviewed content verified: ${reviewedCaliforniaCatalog.catalogVersion} (${digest.slice(0, 12)})`)
