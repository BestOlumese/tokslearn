import * as commerce from '@tokslearn/core/commerce'
import * as enrollments from '@tokslearn/core/enrollments'
import { buttonClasses } from '@tokslearn/ui/button'
import type { Metadata, Route } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { CourseCover } from '@/components/catalog/course-cover'
import { PageHeader } from '@/components/site/page-header'
import { formatNaira } from '@/lib/format'
import { requireSignedInCtx } from '@/lib/require-user'

export const metadata: Metadata = { title: 'My learning', robots: { index: false } }

type Tab = 'active' | 'completed' | 'wishlist'
const tabs: ReadonlyArray<[Tab, string]> = [
  ['active', 'In progress'],
  ['completed', 'Completed'],
  ['wishlist', 'Wishlist'],
]

// docs/20 §3 `/account` (My learning). Continue card, streaks and lesson progress arrive with the
// learning experience (Phase 5); the lists and progress bars are live now.
export default function MyLearningPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  return (
    <>
      <PageHeader title="My learning" width="catalog">
        <Suspense fallback={<div className="-mb-8 mt-6 h-9 sm:-mb-10" />}>
          <TabNav searchParams={searchParams} />
        </Suspense>
      </PageHeader>
      <div className="mx-auto max-w-catalog px-4 pt-10 pb-16 sm:px-6 lg:px-8">
        <Suspense fallback={<div className="h-64 animate-pulse rounded-card bg-surface-sunken" />}>
          <Courses searchParams={searchParams} />
        </Suspense>
      </div>
    </>
  )
}

const tabOf = (raw: string | undefined): Tab =>
  raw === 'completed' || raw === 'wishlist' ? raw : 'active'

async function TabNav({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const current = tabOf((await searchParams).tab)
  return (
    <nav aria-label="My learning" className="-mb-8 mt-6 flex gap-6 overflow-x-auto sm:-mb-10">
      {tabs.map(([tab, label]) => (
        <Link
          key={tab}
          href={(tab === 'active' ? '/account' : `/account?tab=${tab}`) as Route}
          aria-current={tab === current ? 'page' : undefined}
          className={
            tab === current
              ? 'shrink-0 border-b-2 border-brand pb-3 text-body-sm font-medium text-ink'
              : 'shrink-0 pb-3 text-body-sm text-ink-2 hover:text-ink'
          }
        >
          {label}
        </Link>
      ))}
      <Link href="/account/orders" className="shrink-0 pb-3 text-body-sm text-ink-2 hover:text-ink">
        Orders
      </Link>
    </nav>
  )
}

async function Courses({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const tab = tabOf((await searchParams).tab)
  const ctx = await requireSignedInCtx(tab === 'active' ? '/account' : `/account?tab=${tab}`)

  if (tab === 'wishlist') {
    const saved = await commerce.listWishlist(ctx)
    if (saved.length === 0) {
      return (
        <Empty
          title="Nothing saved yet"
          body="Tap the heart on a course page to keep it here for later."
        />
      )
    }
    return (
      <ul className="grid gap-x-6 gap-y-9 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {saved.map((c) => (
          <li key={c.itemId} className="flex flex-col gap-2.5">
            <CourseCover
              src={c.coverUrl}
              alt={c.title}
              sizes="(min-width: 1280px) 290px, (min-width: 640px) 45vw, 92vw"
            />
            <Link
              href={`/courses/${c.slug}` as Route}
              className="line-clamp-2 text-body font-semibold text-ink hover:text-brand-ink hover:underline"
            >
              {c.title}
            </Link>
            <p className="text-body-sm text-ink-2">{c.instructorName}</p>
            <p className="text-body font-semibold text-ink">
              {c.priceKobo === 0n ? 'Free' : formatNaira(c.priceKobo)}
            </p>
          </li>
        ))}
      </ul>
    )
  }

  const mine = await enrollments.listMyCourses(ctx, {
    status: tab === 'completed' ? 'completed' : undefined,
  })
  const list = tab === 'active' ? mine.filter((c) => c.status === 'active') : mine
  if (list.length === 0) {
    return tab === 'completed' ? (
      <Empty
        title="No finished courses yet"
        body="Courses you complete move here, with your certificate when the course has one."
      />
    ) : (
      <Empty
        title="You haven’t started a course yet"
        body="Courses you buy or enroll in appear here, with your progress and where you stopped."
      />
    )
  }
  return (
    <ul className="grid gap-x-6 gap-y-9 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {list.map((c) => (
        <li key={c.enrollmentId} className="flex flex-col gap-2.5">
          <CourseCover
            src={c.coverUrl}
            alt={c.title}
            sizes="(min-width: 1280px) 290px, (min-width: 640px) 45vw, 92vw"
          />
          <Link
            href={`/courses/${c.slug}` as Route}
            className="line-clamp-2 text-body font-semibold text-ink hover:text-brand-ink hover:underline"
          >
            {c.title}
          </Link>
          <p className="text-body-sm text-ink-2">{c.instructorName}</p>
          <div
            role="progressbar"
            aria-label={`${c.title} progress`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={c.progressPct}
            className="h-1.5 overflow-hidden rounded-full bg-surface-sunken"
          >
            <div className="h-full bg-brand" style={{ width: `${c.progressPct}%` }} />
          </div>
          <p className="text-body-sm text-ink-2">
            {c.status === 'completed'
              ? 'Completed'
              : c.progressPct === 0
                ? `Not started · ${c.lessonCount} lessons`
                : `${c.progressPct}% done`}
          </p>
        </li>
      ))}
    </ul>
  )
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-start gap-4 rounded-dialog border border-border bg-surface p-8 sm:p-10">
      <h2 className="text-h3 text-ink">{title}</h2>
      <p className="max-w-prose text-body text-ink-2">{body}</p>
      <Link href="/courses" className={buttonClasses()}>
        Browse courses
      </Link>
    </div>
  )
}
