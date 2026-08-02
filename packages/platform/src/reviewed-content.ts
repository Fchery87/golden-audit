import { reviewedContentApproval } from './reviewed-content-approval.js'
import type { FindingClassification } from '../../analysis-core/src/index.js'
import type { ReviewedGovernanceCatalog } from './entities.js'

type ReviewedRuleDefinition = readonly [name: string, requiredInputs: string[], classification: FindingClassification, limitations: string[], moduleId: string]

/**
 * California pilot education corpus. This is declarative source content, deliberately
 * bundled with the application so Node and Pages initialize the identical revision.
 * `scripts/verify-reviewed-content.ts` validates the review metadata before builds.
 */
export const reviewedCaliforniaCatalog = {
  catalogVersion: 'us-ca-education-2026-08-02.1',
  jurisdiction: 'US-CA',
  approval: reviewedContentApproval,
  authorities: [
    {
      id: 'authority-cfpb-credit-reports',
      title: 'CFPB: What is a credit report?',
      citation: 'Consumer Financial Protection Bureau, What is a credit report?',
      sourceUrl: 'https://www.consumerfinance.gov/ask-cfpb/what-is-a-credit-report-en-309/',
      jurisdiction: 'US-CA', effectiveFrom: '2026-07-31', permittedUse: 'education',
      limitations: ['This source provides general information and does not determine whether a report entry is correct.'],
      status: 'published', history: [],
    },
    {
      id: 'authority-ftc-understanding-credit',
      title: 'FTC: Understanding Your Credit',
      citation: 'Federal Trade Commission, Understanding Your Credit',
      sourceUrl: 'https://consumer.ftc.gov/articles/understanding-your-credit',
      jurisdiction: 'US-CA', effectiveFrom: '2026-07-31', permittedUse: 'education',
      limitations: ['This source is educational context, not a conclusion about an individual report.'],
      status: 'published', history: [],
    },
    {
      id: 'authority-cfpb-reporting-accounts',
      title: 'CFPB: Creditors may report account information',
      citation: 'Consumer Financial Protection Bureau, account reporting FAQ',
      sourceUrl: 'https://www.consumerfinance.gov/ask-cfpb/i-do-not-want-creditors-to-report-my-accounts-to-credit-reporting-companies-what-can-i-do-en-1257/',
      jurisdiction: 'US-CA', effectiveFrom: '2026-07-31', permittedUse: 'education',
      limitations: ['A source can explain reporting practices without showing why a particular value appears in this report.'],
      status: 'published', history: [],
    },
    {
      id: 'authority-cfpb-report-errors',
      title: 'CFPB: What should I do if I find an error on my credit report?',
      citation: 'Consumer Financial Protection Bureau, credit report error FAQ',
      sourceUrl: 'https://www.consumerfinance.gov/ask-cfpb/what-should-i-do-if-i-find-an-error-on-my-credit-report-en-1319/',
      jurisdiction: 'US-CA', effectiveFrom: '2026-07-31', permittedUse: 'education',
      limitations: ['This source explains a general process and does not evaluate any entry in an individual report.'],
      status: 'published', history: [],
    },
    {
      id: 'authority-ftc-identity-theft',
      title: 'FTC: Identity Theft',
      citation: 'Federal Trade Commission, identity theft resources',
      sourceUrl: 'https://consumer.ftc.gov/features/identity-theft',
      jurisdiction: 'US-CA', effectiveFrom: '2026-07-31', permittedUse: 'education',
      limitations: ['General identity-theft guidance; it does not establish that any displayed detail is wrong.'],
      status: 'published', history: [],
    },
  ],
  modules: [
    {
      id: 'primer-personal-information', kind: 'section-primer', section: 'personal-information', title: 'Why the personal-information section matters',
      body: 'Each reporting company keeps its own list of names, dates of birth, and addresses for you, and each list is built from what furnishers sent. This reading compares that list against the details you entered so you can see anything you do not recognize. Old addresses and small name variations are common; a detail belonging to someone else is not.',
      authorityIds: ['authority-cfpb-credit-reports'], jurisdiction: 'US-CA', effectiveFrom: '2026-07-31', permittedUse: 'education',
      limitations: ['A difference between a displayed detail and your own records does not by itself establish an error.'], status: 'published', history: [],
    },
    {
      id: 'module-identity-details', kind: 'finding-module', section: 'finding', title: 'When a personal detail does not look like yours',
      body: 'Identifying details reach a report from many furnishers over many years, so variations happen. A detail you do not recognize at all is worth more attention than a formatting difference, because it can mean records belonging to another person were attached to your file. Compare the displayed detail against your identification documents and raise anything unexplained with the reporting company that displayed it.',
      authorityIds: ['authority-cfpb-report-errors', 'authority-ftc-identity-theft'], jurisdiction: 'US-CA', effectiveFrom: '2026-07-31', permittedUse: 'education',
      limitations: ['This reading compares displayed details with the details you provided; it cannot confirm which is correct.'], status: 'published', history: [],
    },
    {
      id: 'primer-tradelines', kind: 'section-primer', section: 'tradelines', title: 'How to read a tradeline',
      body: 'A tradeline is one account entry in a credit report. This reading compares only the fields shown for matched account entries and identifies where more records may help you verify what is displayed.',
      authorityIds: ['authority-cfpb-credit-reports'], jurisdiction: 'US-CA', effectiveFrom: '2026-07-31', permittedUse: 'education',
      limitations: ['A comparison does not establish why two displayed values differ.'], status: 'published', history: [],
    },
    {
      id: 'primer-limits-and-balances', kind: 'section-primer', section: 'balances', title: 'Balances and credit limits',
      body: 'A report can display a balance, a credit limit, or a high-credit value for an account. These fields describe what the report shows at the time it was prepared; this reading does not predict a score or an outcome.',
      authorityIds: ['authority-ftc-understanding-credit'], jurisdiction: 'US-CA', effectiveFrom: '2026-07-31', permittedUse: 'education',
      limitations: ['Not every account entry includes every money field.'], status: 'published', history: [],
    },
    {
      id: 'primer-status-and-history', kind: 'section-primer', section: 'status', title: 'Status and reporting dates',
      body: 'Account status and reporting dates are separate displayed fields. A difference can reflect timing or how information was furnished, so compare the report with your own records before drawing a conclusion.',
      authorityIds: ['authority-cfpb-reporting-accounts'], jurisdiction: 'US-CA', effectiveFrom: '2026-07-31', permittedUse: 'education',
      limitations: ['This reading does not determine the cause of a displayed status or date.'], status: 'published', history: [],
    },
    {
      id: 'primer-inquiries', kind: 'section-primer', section: 'inquiries', title: 'Inquiries',
      body: 'An inquiry section records requests for a report that the report provider chose to display. This version does not evaluate inquiries; it lists that limitation in the coverage section.',
      authorityIds: ['authority-ftc-understanding-credit'], jurisdiction: 'US-CA', effectiveFrom: '2026-07-31', permittedUse: 'education',
      limitations: ['Inquiry evaluation is not supported by this parser version.'], status: 'published', history: [],
    },
    {
      id: 'module-report-differences', kind: 'finding-module', section: 'finding', title: 'Why displayed values can differ',
      body: 'Information may be furnished and updated on different schedules. Use the provenance shown with this finding and your records to verify the displayed value.',
      authorityIds: ['authority-cfpb-reporting-accounts'], jurisdiction: 'US-CA', effectiveFrom: '2026-07-31', permittedUse: 'education',
      limitations: ['A difference alone does not establish an error.'], status: 'published', history: [],
    },
    {
      id: 'module-status-and-balance', kind: 'finding-module', section: 'finding', title: 'Compare related fields',
      body: 'Status, balance, and past-due fields can each reflect different reporting information. Reviewing the source locations and your records can help you understand the displayed combination.',
      authorityIds: ['authority-cfpb-credit-reports'], jurisdiction: 'US-CA', effectiveFrom: '2026-07-31', permittedUse: 'education',
      limitations: ['The displayed combination does not by itself establish a legal conclusion.'], status: 'published', history: [],
    },
    {
      id: 'module-partial-furnishing', kind: 'finding-module', section: 'finding', title: 'Not every account appears everywhere',
      body: 'Creditors choose whether and where to furnish account information. An account appearing on fewer than three report sections is an observation about this report, not a judgment that the account is wrong.',
      authorityIds: ['authority-cfpb-reporting-accounts'], jurisdiction: 'US-CA', effectiveFrom: '2026-07-31', permittedUse: 'education',
      limitations: ['This observation is not an error finding.'], status: 'published', history: [],
    },
    {
      id: 'module-duplicate-tradeline', kind: 'finding-module', section: 'finding', title: 'Similar account entries',
      body: 'Two entries can look similar while representing different account records. Compare the displayed account details and source locations before deciding whether they refer to the same account.',
      authorityIds: ['authority-cfpb-credit-reports'], jurisdiction: 'US-CA', effectiveFrom: '2026-07-31', permittedUse: 'education',
      limitations: ['Similar identifying details do not prove two entries are duplicates.'], status: 'published', history: [],
    },
  ],
  rules: ([
    ['cross-bureau-balance-difference', ['balance', 'updated'], 'verification-recommended', ['Different update dates can explain a difference'], 'module-report-differences'],
    ['cross-bureau-credit-limit-difference', ['creditLimit'], 'verification-recommended', ['A report may show high credit rather than a current credit limit'], 'module-report-differences'],
    ['cross-bureau-past-due-difference', ['pastDue'], 'verification-recommended', ['Different update dates can explain a difference'], 'module-report-differences'],
    ['cross-bureau-status-difference', ['status'], 'verification-recommended', ['Account status can update on different dates'], 'module-report-differences'],
    ['cross-bureau-date-opened-difference', ['opened'], 'verification-recommended', ['Verify the date with creditor records'], 'module-report-differences'],
    ['cross-bureau-last-reported-difference', ['updated'], 'observed-fact', ['Different reporting cycles are common'], 'module-report-differences'],
    ['cross-bureau-payment-history-difference', ['paymentHistory'], 'verification-recommended', ['Only months that two or more companies report are compared', 'A month one company does not report is treated as absent, not as a difference'], 'module-report-differences'],
    ['closed-or-paid-with-balance', ['status', 'balance'], 'verification-recommended', ['Status and balance can be reported on different cycles'], 'module-status-and-balance'],
    ['past-due-exceeds-balance', ['pastDue', 'balance'], 'verification-recommended', ['Fields can be reported on different cycles'], 'module-status-and-balance'],
    ['revolving-without-credit-limit', ['accountType', 'creditLimit'], 'observed-fact', ['Some furnishers report high credit rather than a current limit'], 'module-report-differences'],
    ['duplicate-tradeline-within-bureau', ['maskedAccount'], 'verification-recommended', ['Separate accounts can share similar identifying details'], 'module-duplicate-tradeline'],
    ['partial-furnishing-observation', ['maskedAccount'], 'observed-fact', ['Not every account is expected to appear on all three bureaus'], 'module-partial-furnishing'],
    ['identity-name-not-attested', ['name'], 'verification-recommended', ['A former or shortened name can appear without anything being wrong'], 'module-identity-details'],
    ['identity-date-of-birth-not-attested', ['dateOfBirth'], 'verification-recommended', ['A report may show only a year or a month and year, which is compared at that precision'], 'module-identity-details'],
    ['identity-ssn-fragment-not-attested', ['ssnLastFour'], 'verification-recommended', ['Only the last four displayed digits are compared'], 'module-identity-details'],
    ['identity-address-not-attested', ['currentAddress'], 'observed-fact', ['Reports retain former addresses for years'], 'module-identity-details'],
    ['cross-bureau-identity-name-difference', ['name'], 'observed-fact', ['Reporting companies receive identifying details from different furnishers'], 'module-identity-details'],
  ] satisfies ReviewedRuleDefinition[]).map(([name, requiredInputs, classification, limitations, moduleId]) => ({
    id: `rule-${name}`, name, requiredInputs, classification, limitations,
    jurisdiction: 'US-CA', effectiveFrom: '2026-07-31', minimumConfidence: 0.9,
    authorityIds: name.startsWith('identity-') || name === 'cross-bureau-identity-name-difference'
      ? ['authority-cfpb-report-errors', 'authority-ftc-identity-theft']
      : ['authority-cfpb-credit-reports'],
    educationModuleIds: [moduleId], testCases: [`catalog-${name}`], status: 'published', history: [],
  })),
} satisfies ReviewedGovernanceCatalog
