/** Everything printed on a certificate. Snapshots, so the PDF never depends on live data. */
export interface CertificatePdfData {
  code: string
  recipientName: string
  courseTitle: string
  instructorName: string
  basis: 'completion' | 'exam' | 'external'
  providerName: string | null
  issuedAt: Date
  /** Absolute URL of /verify/{code}; also what the QR code opens. */
  verifyUrl: string
  /** Studio preview: prints a line saying it isn't a real certificate. */
  sample?: boolean
}

export interface CertificateRenderer {
  render(data: CertificatePdfData): Promise<Uint8Array>
}

/** A month of an instructor's earnings (docs/08 §9). Amounts are formatted already (₦). */
export interface StatementPdfData {
  instructorName: string
  /** e.g. "September 2026". */
  monthLabel: string
  /** e.g. "1–30 September 2026, Lagos time". */
  period: string
  summary: Array<{ label: string; value: string; strong?: boolean }>
  courses: Array<{ title: string; sales: number; refunds: number; gross: string; share: string }>
  generatedAt: Date
}

export interface StatementRenderer {
  render(data: StatementPdfData): Promise<Uint8Array>
}
