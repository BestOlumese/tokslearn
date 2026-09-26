import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { PageHeader } from '@/components/site/page-header'
import { VerifyForm } from '@/components/site/verify-form'

export const metadata: Metadata = {
  title: 'Verify a certificate',
  description: 'Check that a Tokslearn certificate is genuine by entering the code printed on it.',
}

// docs/20 §1 `/verify` (lookups arrive with certificates in Phase 7).
export default function VerifyPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  return (
    <>
      <PageHeader
        title="Verify a certificate"
        description="Every Tokslearn certificate has a code. Enter it to see who earned the certificate, for which course, and whether it's still valid."
      >
        <div className="mt-6">
          <VerifyForm />
        </div>
      </PageHeader>
      <Suspense fallback={null}>
        <GoToCode searchParams={searchParams} />
      </Suspense>
      <div className="mx-auto max-w-page px-4 pt-10 sm:px-6 lg:px-8">
        <div className="grid max-w-[880px] gap-8 sm:grid-cols-2">
          <div>
            <h2 className="text-h4 text-ink">Where to find the code</h2>
            <p className="mt-1 text-body text-ink-2">
              At the bottom of the certificate, starting with TL. Links shared from Tokslearn open
              this check directly.
            </p>
          </div>
          <div>
            <h2 className="text-h4 text-ink">What you'll see</h2>
            <p className="mt-1 text-body text-ink-2">
              The learner's name, the course, the instructor, the date it was issued and how it was
              earned. Revoked certificates say so, with the reason.
            </p>
          </div>
        </div>
      </div>
    </>
  )
}

async function GoToCode({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const code = (await searchParams).code
    ?.trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 20)
  if (code) redirect(`/verify/${code}`)
  return null
}
