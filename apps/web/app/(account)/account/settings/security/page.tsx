import { getMe } from '@tokslearn/core/identity'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import { ChangePasswordForm } from '@/components/account/change-password-form'
import { SessionsList } from '@/components/account/sessions-list'
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
    <div className="flex flex-col gap-12">
      <section aria-labelledby="password-title">
        <h2 id="password-title" className="text-h2 text-ink">
          Password
        </h2>
        <div className="mt-4">
          <ChangePasswordForm hasPassword={me.hasPassword} />
        </div>
      </section>
      <section aria-labelledby="twofactor-title">
        <h2 id="twofactor-title" className="text-h2 text-ink">
          Two-factor authentication
        </h2>
        <div className="mt-4">
          <TwoFactorSettings enabled={me.twoFactorEnabled} hasPassword={me.hasPassword} />
        </div>
      </section>
      <section aria-labelledby="sessions-title">
        <h2 id="sessions-title" className="text-h2 text-ink">
          Where you're signed in
        </h2>
        <p className="mt-1 text-body-sm text-ink-2">
          Browsers and app installs using your account.
        </p>
        <div className="mt-4">
          <SessionsList />
        </div>
      </section>
    </div>
  )
}
