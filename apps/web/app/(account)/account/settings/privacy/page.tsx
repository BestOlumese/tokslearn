import { getMe } from '@tokslearn/core/identity'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import { PrivacySettings } from '@/components/account/privacy-settings'
import { SettingsSkeleton } from '@/components/account/settings-skeleton'
import { requireSignedInCtx } from '@/lib/require-user'

export const metadata: Metadata = { title: 'Privacy and data' }

// docs/20 §3 `/account/settings/privacy`.
export default function PrivacySettingsPage() {
  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <Privacy />
    </Suspense>
  )
}

async function Privacy() {
  const me = await getMe(await requireSignedInCtx('/account/settings/privacy'))
  return <PrivacySettings deletionScheduledFor={me.deletionScheduledFor?.toISOString() ?? null} />
}
