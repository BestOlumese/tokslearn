import * as commerce from '@tokslearn/core/commerce'
import { listMyBundles, listMyCourses } from '@tokslearn/core/courses'
import { EmptyState } from '@tokslearn/ui/empty-state'
import { Skeleton } from '@tokslearn/ui/skeleton'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import { CouponForm } from '@/components/shop/coupon-form'
import { CouponTable } from '@/components/shop/coupon-table'
import { NotInstructor } from '@/components/studio/not-instructor'
import { studioCtx } from '@/lib/require-instructor'

export const metadata: Metadata = { title: 'Coupons' }

// docs/20 §5 `/teach/coupons`: coupons with usage, create dialog. Sales with an instructor's own
// coupon earn them 97% (ADR-017).
export default function CouponsPage() {
  return (
    <div>
      <h1 className="text-h1-sm text-ink">Coupons</h1>
      <p className="mt-1 max-w-prose text-body text-ink-2">
        Give your audience a code. Sales that use one of your coupons earn you 97%, the same as your
        referral links.
      </p>
      <div className="mt-6">
        <Suspense fallback={<Skeleton className="h-60 w-full rounded-card" />}>
          <Coupons />
        </Suspense>
      </div>
    </div>
  )
}

async function Coupons() {
  const { ctx, isInstructor } = await studioCtx('/teach/coupons')
  if (!isInstructor) return <NotInstructor />
  const [coupons, courses, bundles] = await Promise.all([
    commerce.listMyCoupons(ctx),
    listMyCourses(ctx),
    listMyBundles(ctx),
  ])
  const form = (
    <CouponForm
      mode="studio"
      courses={courses.filter((c) => c.hasLive).map((c) => ({ id: c.id, title: c.title }))}
      bundles={bundles.map((b) => ({ id: b.id, title: b.title }))}
    />
  )
  if (coupons.length === 0) {
    return (
      <EmptyState
        title="No coupons yet"
        description="Make one for a launch, a class you teach, or your followers. You choose the discount and how long it runs."
        action={form}
      />
    )
  }
  return (
    <div className="flex flex-col gap-4">
      <div>{form}</div>
      <CouponTable coupons={coupons} mode="studio" now={ctx.now} />
    </div>
  )
}
