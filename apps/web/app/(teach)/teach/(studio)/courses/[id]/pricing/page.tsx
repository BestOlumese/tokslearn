import type { Metadata } from 'next'
import { PricingForm } from '@/components/studio/pricing-form'

export const metadata: Metadata = { title: 'Pricing' }

// docs/20 §5 `/teach/courses/[id]/pricing`. Subscription opt-in stays hidden until Phase 12.
export default function PricingPage() {
  return <PricingForm />
}
