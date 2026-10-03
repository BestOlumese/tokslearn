import * as certificates from '@tokslearn/core/certificates'
import * as commerce from '@tokslearn/core/commerce'
import * as engagement from '@tokslearn/core/engagement'
import * as enrollments from '@tokslearn/core/enrollments'
import * as learning from '@tokslearn/core/learning'
import * as notifications from '@tokslearn/core/notifications'
import { buttonClasses } from '@tokslearn/ui/button'
import { Flame } from 'lucide-react'
import type { Metadata, Route } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { CourseCover } from '@/components/catalog/course-cover'
import { PriceDropOptIn } from '@/components/notifications/price-drop-opt-in'
import { PageHeader } from '@/components/site/page-header'
import { formatNaira } from '@/lib/format'
import { clock } from '@/lib/learn-api'
import { requireSignedInCtx } from '@/lib/require-user'

export const metadata: Metadata = { title: 'My learning', robots: { index: false } }

type Tab = 'active' | 'completed' | 'wishlist'
const tabs: ReadonlyArray<[Tab, string]> = [
  ['active', 'In progress'],
  ['completed', 'Completed'],
  ['wishlist', 'Wishlist'],
]

// docs/20 §3 `/account` (My learning): the lesson to continue, the streak, then the course lists.
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
        <Suspense
          fallback={<div className="mb-10 h-36 animate-pulse rounded-card bg-surface-sunken" />}
        >
          <ContinueAndStreak />
        </Suspense>
        <Suspense fallback={<div className="h-64 animate-pulse rounded-card bg-surface-sunken" />}>
          <Courses searchParams={searchParams} />
        </Suspense>
      </div>
    </>
  )
}

async function ContinueAndStreak() {
  const ctx = await requireSignedInCtx('/account')
  const [card, streak] = await Promise.all([
    learning.continueLearning(ctx),
    engagement.getStreak(ctx),
  ])
  if (!card && streak.current === 0) return null
  const minutesLeft = Math.max(0, Math.ceil((600 - streak.learnedTodaySec) / 60))
  return (
    <div className="mb-10 grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      {card ? (
        <section
          aria-labelledby="continue-title"
          className="flex flex-col gap-4 rounded-card border border-border bg-surface p-4 sm:flex-row sm:items-center sm:p-5"
        >
          <div className="w-full shrink-0 sm:w-56">
            <CourseCover src={card.coverUrl} alt="" sizes="(min-width: 640px) 224px, 92vw" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <p id="continue-title" className="text-caption font-semibold text-ink-3 uppercase">
              Continue learning
            </p>
            <p className="line-clamp-2 text-h4 text-ink">{card.lessonTitle}</p>
            <p className="truncate text-body-sm text-ink-2">
              {card.courseTitle} · {card.progressPct}% done
            </p>
            <div>
              <Link
                href={`/learn/${card.courseSlug}/${card.lessonId}` as Route}
                className={buttonClasses({ className: 'mt-1' })}
              >
                {card.positionSec > 0 && card.lessonType === 'video'
                  ? `Resume at ${clock(card.positionSec)}`
                  : 'Start lesson'}
              </Link>
            </div>
          </div>
        </section>
      ) : null}
      <section
        aria-labelledby="streak-title"
        className="flex flex-col justify-center gap-1 rounded-card border border-border bg-surface p-5"
      >
        <p id="streak-title" className="flex items-center gap-2 text-h4 text-ink">
          <Flame
            aria-hidden
            className={streak.current > 0 ? 'size-5 text-accent' : 'size-5 text-ink-3'}
          />
          {streak.current === 1 ? '1-day streak' : `${streak.current}-day streak`}
        </p>
        <p className="text-body-sm text-ink-2">
          {streak.todayCounted
            ? 'Today counts. Come back tomorrow to keep it going.'
            : `Finish a lesson or learn for ${minutesLeft} more ${minutesLeft === 1 ? 'minute' : 'minutes'} today to keep it.`}
        </p>
        {streak.freezeTokens > 0 ? (
          <p className="text-caption text-ink-3">
            {streak.freezeTokens === 1
              ? '1 streak freeze saved: it covers a day you miss.'
              : `${streak.freezeTokens} streak freezes saved: each covers a day you miss.`}
          </p>
        ) : null}
        <Link
          href="/account/badges"
          className="mt-1 text-body-sm font-medium text-brand-ink hover:underline"
        >
          Your badges
        </Link>
      </section>
    </div>
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
      <Link href="/account/notes" className="shrink-0 pb-3 text-body-sm text-ink-2 hover:text-ink">
        Notes
      </Link>
      <Link
        href="/account/certificates"
        className="shrink-0 pb-3 text-body-sm text-ink-2 hover:text-ink"
      >
        Certificates
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
    const prefs = await notifications.getPreferences(ctx)
    const priceEmails = prefs.find((p) => p.type === 'wishlist.price_drop')?.email ?? false
    return (
      <div className="flex flex-col gap-6">
        <PriceDropOptIn initial={priceEmails} />
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
      </div>
    )
  }

  const [mine, earned] = await Promise.all([
    enrollments.listMyCourses(ctx, { status: tab === 'completed' ? 'completed' : undefined }),
    certificates.listMyCertificates(ctx),
  ])
  const certified = new Set(earned.filter((c) => c.status === 'active').map((c) => c.courseId))
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
            href={`/learn/${c.slug}` as Route}
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
          {certified.has(c.courseId) ? (
            <Link
              href="/account/certificates"
              className="text-body-sm font-medium text-brand-ink hover:underline"
            >
              Your certificate
            </Link>
          ) : null}
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
