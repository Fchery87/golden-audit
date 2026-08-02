import { createHash } from 'node:crypto'
import { reviewedCaliforniaCatalog } from '../packages/platform/src/reviewed-content.js'

/** Prints the canonical catalog digest so an approver can paste it into reviewed-content-approval.ts. */
console.log(createHash('sha256').update(JSON.stringify({ ...reviewedCaliforniaCatalog, approval: undefined })).digest('hex'))
