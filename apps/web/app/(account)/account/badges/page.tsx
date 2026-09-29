import * as engagement from '@tokslearn/core/engagement'
import { cn } from '@tokslearn/ui/cn'
import {
  Award,
  Check,
  Flag,
  Flame,
  Layers,
  type LucideIcon,
  MessageCircle,
  Play,
} from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { PageHeader } from '@/components/site/page-header'
import { formatDate } from '@/lib/format'
import { requireSignedInCtx } from '@/lib/require-user'

export const metadata: Metadata = { title: 'Badges', robots: { index: false } }

const icons: Readonly<Record<string, LucideIcon>> = {
  play: Play,
  flag: Flag,
  flame: Flame,
  layers: Layers,
  award: Award,
  check: Check,
  message: MessageCircle,
}

// docs/20 `/account/badges`: earned and still-to-earn badges with what each one takes. Quiet on
// purpose (docs/10 §4): no confetti, just a record.
export default function BadgesPage() {
  return (
    <>
      <PageHeader
        title="Badges"
        width="catalog"
        eyebrow={
          <Link href="/account" className="hover:underline">
            My learning
          </Link>
        }
      />
      <div className="mx-auto max-w-catalog px-4 pt-8 pb-16 sm:px-6 lg:px-8">
        <Suspense fallback={<div className="h-48 animate-pulse rounded-card bg-surface-sunken" />}>
          <Badges />
        </Suspense>
      </div>
    </>
  )
}

async function Badges() {
  const ctx = await requireSignedInCtx('/account/badges')
  const badges = await engagement.listBadges(ctx)
  const earned = badges.filter((b) => b.awardedAt).length
  return (
    <div className="flex flex-col gap-6">
      <p className="text-body text-ink-2">
        {earned === 0
          ? 'You haven’t earned a badge yet. Finishing your first lesson gets you one.'
          : `You’ve earned ${earned} of ${badges.length}.`}
      </p>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {badges.map((b) => {
          const Icon = icons[b.iconKey] ?? Award
          const got = b.awardedAt !== null
          return (
            <li
              key={b.code}
              className={cn(
                'flex flex-col gap-3 rounded-card border p-5',
                got ? 'border-border bg-surface' : 'border-dashed border-border-strong bg-canvas',
              )}
            >
              <span
                className={cn(
                  'flex size-11 items-center justify-center rounded-full',
                  got ? 'bg-accent-soft text-accent-ink' : 'bg-surface-sunken text-ink-3',
                )}
              >
                <Icon aria-hidden className="size-5" />
              </span>
              <div>
                <h2 className={cn('text-body font-semibold', got ? 'text-ink' : 'text-ink-2')}>
                  {b.name}
                </h2>
                <p className="mt-0.5 text-body-sm text-ink-2">{b.description}</p>
              </div>
              <p className="mt-auto text-caption text-ink-3">
                {b.awardedAt ? `Earned ${formatDate(b.awardedAt)}` : 'Not earned yet'}
              </p>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
