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
