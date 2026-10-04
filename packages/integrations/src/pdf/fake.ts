import type {
  CertificatePdfData,
  CertificateRenderer,
  StatementPdfData,
  StatementRenderer,
} from './types'

/** Test stand-in: a tiny "PDF" whose text records what was asked for. */
export function createFakeCertificateRenderer(): CertificateRenderer & {
  rendered: CertificatePdfData[]
} {
  const rendered: CertificatePdfData[] = []
  return {
    rendered,
    async render(data) {
      rendered.push(data)
      return new TextEncoder().encode(`%PDF-fake ${data.code} ${data.recipientName}`)
    },
  }
}

/** Test stand-in for statements: records what was asked for. */
export function createFakeStatementRenderer(): StatementRenderer & {
  rendered: StatementPdfData[]
} {
  const rendered: StatementPdfData[] = []
  return {
    rendered,
    async render(data) {
      rendered.push(data)
      return new TextEncoder().encode(`%PDF-fake statement ${data.monthLabel}`)
    },
  }
}
