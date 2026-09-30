import type { Metadata } from 'next'
import { Suspense } from 'react'
import { CertificateTab } from '@/components/studio/certificates/certificate-tab'

export const metadata: Metadata = { title: 'Certificate' }

// docs/20 §5 `/teach/courses/[id]/certificate`: what earns it, a sample PDF, outside exam results
// and the certificates issued so far.
export default function CertificatePage() {
  return (
    <Suspense fallback={null}>
      <CertificateTab />
    </Suspense>
  )
}
