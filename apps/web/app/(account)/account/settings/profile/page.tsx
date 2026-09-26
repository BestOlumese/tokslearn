import { getMe } from '@tokslearn/core/identity'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import { ProfileForm } from '@/components/account/profile-form'
import { SettingsSkeleton } from '@/components/account/settings-skeleton'
import { toMeDtoForClient } from '@/lib/dto'
import { requireSignedInCtx } from '@/lib/require-user'

export const metadata: Metadata = { title: 'Profile' }

// docs/20 §3 `/account/settings/profile`.
export default function ProfileSettingsPage() {
  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <ProfileLoader />
    </Suspense>
  )
}

async function ProfileLoader() {
  const ctx = await requireSignedInCtx('/account/settings/profile')
  return <ProfileForm me={toMeDtoForClient(await getMe(ctx))} />
}
