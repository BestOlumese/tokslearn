import * as commerce from '@tokslearn/core/commerce'
import { Skeleton } from '@tokslearn/ui/skeleton'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import { CopyButton } from '@/components/studio/copy-button'
import { NotInstructor } from '@/components/studio/not-instructor'
import { formatNaira } from '@/lib/format'
import { studioCtx } from '@/lib/require-instructor'

export const metadata: Metadata = { title: 'Referral links' }

// docs/20 §5 `/teach/referrals`: one link per live course and one for the profile, with clicks,
// sales and what they earned. Sales through them keep 97% (ADR-017).
export default function ReferralsPage() {
  return (
    <div>
      <h1 className="text-h1-sm text-ink">Referral links</h1>
      <p className="mt-1 max-w-prose text-body text-ink-2">
        Share these on WhatsApp, Instagram or your website. When someone buys within 30 days of
        clicking your link, you keep 97% of the sale. Other sales on Tokslearn earn you 60%.
      </p>
      <div className="mt-6">
        <Suspense fallback={<Skeleton className="h-60 w-full rounded-card" />}>
          <Links />
        </Suspense>
      </div>
    </div>
  )
}

async function Links() {
  const { ctx, isInstructor } = await studioCtx('/teach/referrals')
  if (!isInstructor) return <NotInstructor />
  const links = await commerce.listMyReferralLinks(ctx)
  return (
    <ul className="flex flex-col divide-y divide-border rounded-card border border-border bg-surface">
      {links.map((l) => (
        <li
          key={l.id}
          className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <p className="text-body font-medium text-ink">{l.targetTitle}</p>
            <p className="truncate font-mono text-body-sm text-ink-2">{l.url}</p>
            <p className="mt-1 text-body-sm text-ink-2">
              {l.clicks.toLocaleString('en-NG')} {l.clicks === 1 ? 'click' : 'clicks'} · {l.sales}{' '}
              {l.sales === 1 ? 'sale' : 'sales'} · {formatNaira(l.earnedKobo)} earned
            </p>
          </div>
          <CopyButton value={l.url} label={`Copy the link for ${l.targetTitle}`} />
        </li>
      ))}
    </ul>
  )
}
