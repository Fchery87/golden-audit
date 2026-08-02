export const reviewedContentApproval = {
  approvedByGitIdentity: 'fchery87',
  approvedByEmail: 'frantzchery@hotmail.com',
  approvedAt: '2026-08-02T00:00:00.000Z',
  reReviewDueAt: '2026-10-31T00:00:00.000Z',
  reviewIntervalDays: 90,
  // Filled by the human-attributed approval commit. It is the canonical SHA-256
  // of the content catalog excluding this approval record. Regenerate with
  // `npx tsx scripts/print-catalog-digest.ts` after any edit to reviewed-content.ts.
  catalogSha256: '21ef0637471c42efe2f501fd04fb49c1be637a6767a5811f9d41256292ba25c9',
  // PENDING APPROVER ACTION: this still points at the commit that approved the previous catalog.
  // `npm run verify:content` runs `git diff --quiet <reviewedCommit> -- reviewed-content.ts` and
  // will therefore fail until the named reviewer commits the new identity-check content and
  // replaces this SHA with that commit's. That failure is the human review gate doing its job —
  // do not work around it by relaxing the check.
  reviewedCommit: 'e3047aa2c6261868a7791a630b82a385102829ac',
} as const
