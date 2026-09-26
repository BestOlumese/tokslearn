import type { Metadata } from 'next'
import { Suspense } from 'react'
import { Styleguide } from '@/components/styleguide/styleguide'
import { StyleguideGate } from '@/components/styleguide/styleguide-gate'
import { env } from '@/env'

export const metadata: Metadata = { title: 'Styleguide', robots: { index: false, follow: false } }

// docs/20 §6 `/styleguide`: staff, and open in local/preview for design review.
export default function StyleguidePage() {
  if (env.NEXT_PUBLIC_APP_ENV === 'local' || env.NEXT_PUBLIC_APP_ENV === 'preview') {
    return <Styleguide />
  }
  return (
    <Suspense fallback={null}>
      <StyleguideGate />
    </Suspense>
  )
}
