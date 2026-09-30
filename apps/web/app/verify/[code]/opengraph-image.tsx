import { shareCard, shareSize } from '@/components/seo/share-card'
import { getPublicCertificate, normaliseCertificateCode } from '@/lib/certificate-data'
import { formatDate } from '@/lib/format'

export const alt = 'Certificate on Tokslearn'
export const size = shareSize
export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const code = normaliseCertificateCode(decodeURIComponent((await params).code).slice(0, 40))
  const cert = code ? await getPublicCertificate(code) : null
  if (!cert) {
    return shareCard({
      eyebrow: 'Certificate check',
      title: 'Verify a Tokslearn certificate',
      lines: [],
    })
  }
  return shareCard({
    eyebrow: cert.status === 'revoked' ? 'Certificate · revoked' : 'Certificate',
    title: cert.courseTitle,
    lines: [
      `Awarded to ${cert.recipientName}`,
      `${cert.basisText} · ${formatDate(cert.issuedAt)} · ${cert.code}`,
    ],
  })
}
