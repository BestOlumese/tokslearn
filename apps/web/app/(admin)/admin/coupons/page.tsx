import * as commerce from '@tokslearn/core/commerce'
import { EmptyState } from '@tokslearn/ui/empty-state'
import { Skeleton } from '@tokslearn/ui/skeleton'
import type { Metadata, Route } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { staffErrorState } from '@/components/admin/staff-error'
import { CouponForm } from '@/components/shop/coupon-form'
import { CouponTable } from '@/components/shop/coupon-table'
import { requireSignedInCtx } from '@/lib/require-user'

export const metadata: Metadata = { title: 'Coupons' }

type Search = Promise<{ scope?: string }>

// docs/20 §6 `/admin/coupons` (admins): platform coupons, and every coupon for oversight.
export default function AdminCouponsPage({ searchParams }: { searchParams: Search }) {
  return (
    <div>
      <AdminPageHeader
        title="Coupons"
        description="Platform coupons come out of Tokslearn's share. Instructors' own coupons are listed under All coupons, and can be switched off here."
      />
      <Suspense fallback={<Skeleton className="mt-6 h-72 w-full rounded-card" />}>
        <Coupons searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

async function Coupons({ searchParams }: { searchParams: Search }) {
  const scope = (await searchParams).scope === 'all' ? 'all' : 'platform'
  const path = '/admin/coupons'
  const ctx = await requireSignedInCtx(path)
  let coupons: commerce.CouponView[]
  try {
    coupons = await commerce.listAllCoupons(ctx, { scope })
  } catch (error) {
    return <div className="mt-6">{staffErrorState(error, path)}</div>
  }
  const tab = (value: 'platform' | 'all', label: string) => (
    <Link
      href={(value === 'platform' ? path : `${path}?scope=all`) as Route}
      aria-current={scope === value ? 'page' : undefined}
      className={
        scope === value
          ? 'border-b-2 border-brand pb-2 text-body-sm font-medium text-ink'
          : 'pb-2 text-body-sm text-ink-2 hover:text-ink'
      }
    >
      {label}
    </Link>
  )
  return (
    <div className="mt-6 flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <nav aria-label="Coupon lists" className="flex gap-6">
          {tab('platform', 'Platform coupons')}
          {tab('all', 'All coupons')}
        </nav>
        <CouponForm mode="admin" courses={[]} bundles={[]} />
      </div>
      {coupons.length === 0 ? (
        <EmptyState
          title="No coupons here yet"
          description="Platform coupons suit campaigns across many instructors, like a back-to-school week."
        />
      ) : (
        <CouponTable coupons={coupons} mode="admin" now={ctx.now} />
      )}
    </div>
  )
}
