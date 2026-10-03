import { toMyApplicationDto } from '@tokslearn/api'
import { getMyApplication } from '@tokslearn/core/instructors'
import { buttonClasses } from '@tokslearn/ui/button'
import { Skeleton } from '@tokslearn/ui/skeleton'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { SettingsPanel } from '@/components/account/settings-panel'
import { NotInstructor } from '@/components/studio/not-instructor'
import { PayoutSettings } from '@/components/teach/payout-settings'
import { studioCtx } from '@/lib/require-instructor'

export const metadata: Metadata = { title: 'Teaching settings' }

// docs/20 §5 `/teach/settings`: public profile (edited in account settings), identity and the
// payout account. Changing the account needs 2FA and holds payouts for 72 h (docs/07 §5).
export default function TeachSettingsPage() {
  return (
    <div className="max-w-[780px]">
      <h1 className="text-h1-sm text-ink">Teaching settings</h1>
      <p className="mt-1 max-w-prose text-body text-ink-2">
        Your public profile, your verified identity and the bank account we pay you into.
      </p>
      <div className="mt-6 flex flex-col gap-6">
        <SettingsPanel
          id="profile"
          title="Public profile"
          description="Your name, photo, headline and bio show on your instructor page and on every course you teach."
          footer={
            <Link
              href="/account/settings/profile"
              className={buttonClasses({ variant: 'secondary' })}
            >
              Edit profile
            </Link>
          }
        />
        <Suspense fallback={<Skeleton className="h-80 w-full rounded-card" />}>
          <Payouts />
        </Suspense>
      </div>
    </div>
  )
}

async function Payouts() {
  const { ctx, isInstructor } = await studioCtx('/teach/settings')
  if (!isInstructor) return <NotInstructor />
  return <PayoutSettings initial={toMyApplicationDto(await getMyApplication(ctx))} />
}
