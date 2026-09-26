import { buttonClasses } from '@tokslearn/ui/button'
import { EmptyState } from '@tokslearn/ui/empty-state'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { PageHeader } from '@/components/site/page-header'

export const metadata: Metadata = { title: 'Certificate check', robots: { index: false } }

// docs/20 §1 `/verify/[code]`: unknown code → "No certificate found" (Phase 7 adds real lookups).
export default function VerifyCodePage({ params }: { params: Promise<{ code: string }> }) {
  return (
    <>
      <PageHeader title="Certificate check" />
      <div className="mx-auto max-w-page px-4 pt-10 sm:px-6 lg:px-8">
        <Suspense fallback={<div className="h-[180px]" />}>
          <Result params={params} />
        </Suspense>
      </div>
    </>
  )
}

async function Result({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  return (
    <EmptyState
      className="max-w-[640px]"
      headingLevel={2}
      title={`No certificate found with the code ${decodeURIComponent(code).slice(0, 20)}`}
      description="Check the code for typing mistakes. Codes start with TL and use letters and numbers only."
      action={
        <Link href="/verify" className={buttonClasses({ variant: 'secondary' })}>
          Try another code
        </Link>
      }
    />
  )
}
