import type { CreditAnalysisPlatform, Jurisdiction } from '../../../packages/platform/src/index.js'
import { reviewedCaliforniaCatalog } from '../../../packages/platform/src/reviewed-content.js'

/** Installs the reviewed, statically bundled corpus into each runtime instance. */
export function bootstrapGovernance(platform: CreditAnalysisPlatform, jurisdiction: Jurisdiction = 'US-CA'): void {
  if (jurisdiction !== reviewedCaliforniaCatalog.jurisdiction) throw new Error(`No reviewed content is available for ${jurisdiction}`)
  platform.installReviewedCatalog(reviewedCaliforniaCatalog)
}
