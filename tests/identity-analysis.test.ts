import test from 'node:test'
import assert from 'node:assert/strict'
import {
  evaluateAnalysis, namesAgree, datesOfBirthAgree,
  type AttestedIdentity, type EvaluableRule, type ReportedIdentity,
} from '../packages/analysis-core/src/index.js'

/**
 * Identity comparison is the one check category whose reference value comes from outside the
 * document. These tests pin both halves: the comparison predicates (where over-strictness would
 * bury the real signal under a finding on nearly every report) and the evaluators' suppression
 * behaviour (where a missing attestation must produce an explained non-run, never a false match).
 */

const versions = { normalizedInput: 1, ruleset: 'test', jurisdiction: 'US-CA', parser: 'test', application: 'test' }
const source = { kind: 'element' as const, locator: 'pdf:p2:y49:transunion:name', snippet: '' }

function rule(name: string): EvaluableRule {
  return {
    id: `rule-${name}`, name, status: 'published', minimumConfidence: 0.9,
    classification: 'verification-recommended', limitations: ['limitation'],
    authorityIds: ['authority'], educationModuleIds: ['module'],
  }
}

const attested: AttestedIdentity = {
  fullName: 'ALEXANDER JOSEPH RIVERA',
  dateOfBirth: '1986-01-09',
  ssnLastFour: '4321',
  addressKeys: ['9 HARTMAN RD 2 ALBANY NY 12208'],
}

function identityValue(field: string, normalized: string | null, overrides: Partial<{ bureau: string; confidence: number; id: string }> = {}) {
  return { id: overrides.id ?? `${field}-${normalized ?? 'null'}`, bureau: overrides.bureau ?? 'transunion', field, normalized, confidence: overrides.confidence ?? 1, source }
}

function reported(overrides: Partial<ReportedIdentity> = {}): ReportedIdentity {
  return { names: [], datesOfBirth: [], ssnFragments: [], addresses: [], ...overrides }
}

function run(name: string, input: { attestedIdentity?: AttestedIdentity; reportedIdentity?: ReportedIdentity }) {
  return evaluateAnalysis({ rules: [rule(name)], tradelines: [], confirmedMatches: [], versions, ...input })
}

test('name comparison ignores middle names and suffixes but not a different given or family name', () => {
  // A dropped or abbreviated middle name is on most reports. Treating it as a difference would put
  // a finding on nearly every file and drown the real signal.
  assert.ok(namesAgree('ALEXANDER JOSEPH RIVERA', 'ALEXANDER RIVERA'))
  assert.ok(namesAgree('ALEXANDER J RIVERA', 'ALEXANDER JOSEPH RIVERA'))
  assert.ok(namesAgree('ALEXANDER RIVERA JR', 'ALEXANDER RIVERA'))
  assert.ok(namesAgree('alexander rivera', 'ALEXANDER RIVERA'), 'comparison is case-insensitive')
  assert.ok(!namesAgree('ALEXANDER RIVERA', 'MARCUS RIVERA'), 'a different given name is a real difference')
  assert.ok(!namesAgree('ALEXANDER RIVERA', 'ALEXANDER OKONKWO'), 'a different family name is a real difference')
  // Not comparable rather than "different": a one-token value cannot be split into given/family.
  assert.ok(namesAgree('ALEXANDER RIVERA', 'RIVERA'))
})

test('date-of-birth comparison respects the precision the report actually states', () => {
  // Reports show this at three precisions. Padding a year-only value to a full date would invent a
  // month and day the document never claimed and then report the invention as a discrepancy.
  assert.ok(datesOfBirthAgree('1986-01-09', '1986'))
  assert.ok(datesOfBirthAgree('1986-01-09', '1986-01'))
  assert.ok(datesOfBirthAgree('1986-01-09', '1986-01-09'))
  assert.ok(!datesOfBirthAgree('1986-01-09', '1986-02'))
  assert.ok(!datesOfBirthAgree('1986-01-09', '1987'))
  assert.ok(!datesOfBirthAgree('1986-01-09', '1986-01-10'), 'a one-day difference is still a difference')
})

test('identity rules suppress with a stated reason when no identity was attested', () => {
  for (const name of ['identity-name-not-attested', 'identity-date-of-birth-not-attested', 'identity-ssn-fragment-not-attested', 'identity-address-not-attested']) {
    const analysis = run(name, { reportedIdentity: reported({ names: [identityValue('name', 'SOMEONE ELSE')] }) })
    assert.equal(analysis.findings.length, 0, `${name} must not fire without a reference value`)
    assert.equal(analysis.audit[0]?.outcome, 'suppressed')
    assert.match(analysis.audit[0]?.reason ?? '', /no attested identity/i)
  }
})

test('a name that does not match the attested name produces one finding per differing entry', () => {
  const analysis = run('identity-name-not-attested', {
    attestedIdentity: attested,
    reportedIdentity: reported({
      names: [
        identityValue('name', 'ALEXANDER RIVERA', { id: 'tu', bureau: 'transunion' }),
        identityValue('name', 'MARCUS OKONKWO', { id: 'ex', bureau: 'experian' }),
      ],
    }),
  })
  assert.equal(analysis.findings.length, 1, 'the matching entry produces nothing')
  const finding = analysis.findings[0]!
  assert.match(finding.title, /experian/)
  assert.equal(finding.evidence[0]?.subject, 'identity', 'identity evidence is distinguishable from tradeline evidence')
  assert.equal(finding.evidence[0]?.tradelineId, 'ex')
  assert.ok(finding.alternativeExplanations.length > 0, 'a difference is never presented as a conclusion')
  assert.ok(finding.verificationDocuments.length > 0)
  assert.doesNotMatch(`${finding.title} ${finding.suggestedAction}`, /violation|illegal|unlawful|fraud/i)
})

test('a low-confidence identity value suppresses instead of producing a weak finding', () => {
  const analysis = run('identity-name-not-attested', {
    attestedIdentity: attested,
    reportedIdentity: reported({ names: [identityValue('name', 'MARCUS OKONKWO', { confidence: 0.4 })] }),
  })
  assert.equal(analysis.findings.length, 0)
  assert.equal(analysis.audit[0]?.outcome, 'suppressed')
})

test('date of birth, SSN fragment, and address differences each surface at their own severity', () => {
  const dob = run('identity-date-of-birth-not-attested', {
    attestedIdentity: attested,
    reportedIdentity: reported({ datesOfBirth: [identityValue('dateOfBirth', '1991-04-02')] }),
  })
  assert.equal(dob.findings[0]?.severity, 'high', 'a mismatched birth date is a strong mixed-file signal')

  const ssn = run('identity-ssn-fragment-not-attested', {
    attestedIdentity: attested,
    reportedIdentity: reported({ ssnFragments: [identityValue('ssnLastFour', '9999')] }),
  })
  assert.equal(ssn.findings[0]?.severity, 'high')

  const address = run('identity-address-not-attested', {
    attestedIdentity: attested,
    reportedIdentity: reported({
      addresses: [
        { ...identityValue('currentAddress', '9 HARTMAN RD 2 ALBANY NY 12208', { id: 'known' }), comparisonKey: '9 HARTMAN RD 2 ALBANY NY 12208' },
        { ...identityValue('previousAddress', '400 ELSEWHERE LN PHOENIX AZ 85001', { id: 'unknown' }), comparisonKey: '400 ELSEWHERE LN PHOENIX AZ 85001' },
      ],
    }),
  })
  assert.equal(address.findings.length, 1)
  assert.equal(address.findings[0]?.severity, 'low', 'reports retain old addresses for years, so this stays an observation')
  assert.equal(address.findings[0]?.evidence[0]?.tradelineId, 'unknown')
})

test('agreeing identity values are recorded as a skip, not silence', () => {
  const analysis = run('identity-name-not-attested', {
    attestedIdentity: attested,
    reportedIdentity: reported({ names: [identityValue('name', 'ALEXANDER J RIVERA')] }),
  })
  assert.equal(analysis.findings.length, 0)
  assert.equal(analysis.audit[0]?.outcome, 'skipped')
  assert.match(analysis.audit[0]?.reason ?? '', /matches the name on record/i)
})

test('cross-bureau name divergence needs no attested identity and ignores same-bureau repeats', () => {
  const diverging = run('cross-bureau-identity-name-difference', {
    reportedIdentity: reported({
      names: [
        identityValue('name', 'ALEXANDER RIVERA', { id: 'tu', bureau: 'transunion' }),
        identityValue('name', 'MARCUS OKONKWO', { id: 'ex', bureau: 'experian' }),
      ],
    }),
  })
  assert.equal(diverging.findings.length, 1)
  assert.equal(diverging.findings[0]?.evidence.length, 2, 'both bureau entries are cited as evidence')

  const singleBureau = run('cross-bureau-identity-name-difference', {
    reportedIdentity: reported({
      names: [
        identityValue('name', 'ALEXANDER RIVERA', { id: 'a', bureau: 'transunion' }),
        identityValue('name', 'MARCUS OKONKWO', { id: 'b', bureau: 'transunion' }),
      ],
    }),
  })
  assert.equal(singleBureau.findings.length, 0, 'two entries from one bureau are not a cross-bureau difference')
  assert.equal(singleBureau.audit[0]?.outcome, 'skipped')
})
