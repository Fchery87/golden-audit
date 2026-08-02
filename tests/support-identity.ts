import type { CreditAnalysisPlatform } from '../packages/platform/src/index.js'

/**
 * Records a fictitious attested identity so a test can reach the upload gate.
 *
 * Uploads require an attested identity because the identity checks have no reference set without
 * one. Tests that only exercise the account-side flow still need to satisfy that gate, so this
 * supplies a consistent fixture. `MORGAN QUINCY RIVERA` and the Springfield address are deliberately
 * unlike anything in the report fixtures — a test asserting on identity findings should set up its
 * own matching or mismatching values explicitly rather than inheriting an accidental agreement here.
 */
export const TEST_IDENTITY = {
  fullName: 'MORGAN QUINCY RIVERA',
  dateOfBirth: '1985-03-17',
  ssnLastFour: '4321',
  currentAddress: { line1: '4120 CEDAR HOLLOW RD', city: 'SPRINGFIELD', state: 'CA', postalCode: '90210' },
  previousAddresses: [{ line1: '88 WESTBROOK AVE', city: 'RIVERTON', state: 'CA', postalCode: '90745' }],
  accurateAndComplete: true as const,
}

export async function attestTestIdentity(platform: CreditAnalysisPlatform, sessionId: string, overrides: Partial<typeof TEST_IDENTITY> = {}) {
  return platform.recordConsumerIdentity(sessionId, { ...TEST_IDENTITY, ...overrides })
}
