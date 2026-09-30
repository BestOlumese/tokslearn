import type { CertificatePdfData, CertificateRenderer } from './types'

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
