import { getMe } from '@tokslearn/core/identity'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import { ChangePasswordForm } from '@/components/account/change-password-form'
import { SessionsList } from '@/components/account/sessions-list'
import { SettingsPanel } from '@/components/account/settings-panel'
import { SettingsSkeleton } from '@/components/account/settings-skeleton'
import { TwoFactorSettings } from '@/components/account/two-factor-settings'
import { requireSignedInCtx } from '@/lib/require-user'

export const metadata: Metadata = { title: 'Sign-in and security' }

// docs/20 §3 `/account/settings/security`.
export default function SecuritySettingsPage() {
  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <Security />
    </Suspense>
  )
}

async function Security() {
  const me = await getMe(await requireSignedInCtx('/account/settings/security'))
  return (
    <>
      <ChangePasswordForm hasPassword={me.hasPassword} />
      <SettingsPanel
        id="twofactor"
        title="Two-factor authentication"
        description="After your password, you also enter a code from an app on your phone. Instructors and staff must turn this on."
      >
        <TwoFactorSettings enabled={me.twoFactorEnabled} hasPassword={me.hasPassword} />
      </SettingsPanel>
      <SettingsPanel
        id="devices"
        title="Devices"
        description="Browsers and phones signed in to your account. Sign out any you don't recognise."
      >
        <SessionsList />
      </SettingsPanel>
    </>
  )
}
