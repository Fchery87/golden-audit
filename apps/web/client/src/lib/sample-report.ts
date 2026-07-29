// A fictitious sample report used only for local pilot testing.
// Mirrors the synthetic-fixture shape the server parses via the
// GOLDEN-AUDIT-REPORT: marker. Never real consumer data.
export const SAMPLE_REPORT = {
  provider: 'synthetic-provider',
  template: 'pilot-v1',
  reportDate: '2026-07-01',
  identity: ['A Consumer'],
  addresses: ['1 Main St'],
  employers: [],
  inquiries: ['Example Bank 2026-06'],
  publicRecords: [],
  scores: [700],
  remarks: [],
  tradelines: [
    {
      bureau: 'equifax',
      creditor: 'Example Bank',
      account: '12345678',
      accountType: 'revolving',
      balance: 12500,
      status: 'open',
      opened: '2020-01',
      updated: '2026-06-30',
    },
    {
      bureau: 'experian',
      creditor: 'Example Bank',
      account: '12345678',
      accountType: 'revolving',
      balance: 15000,
      status: 'open',
      opened: '2020-01',
      updated: '2026-06-28',
    },
  ],
}

// The marker the parser looks for, wrapped as the server's fixture expects.
export function encodeReportForUpload(reportJson: string): string {
  return btoa(`<html>GOLDEN-AUDIT-REPORT:${reportJson}</body></html>`)
}
