import type { Metadata } from 'next'
import { type ReactNode, Suspense } from 'react'
import { AccountHeader, AccountHeaderSkeleton } from '@/components/account/account-header'
import { SettingsNav } from '@/components/account/settings-nav'
import { SignOutButton } from '@/components/account/sign-out-button'
import { SideNavLinks } from '@/components/side-nav-links'
import { settingsNavGroups } from '@/lib/nav'

export const metadata: Metadata = { robots: { index: false } }

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-page items-center justify-between gap-4 px-4 py-7 sm:px-6 lg:px-8">
          <Suspense fallback={<AccountHeaderSkeleton />}>
            <AccountHeader path="/account/settings" />
          </Suspense>
          <div className="hidden sm:block">
            <SignOutButton />
          </div>
        </div>
      </div>
      <div className="mx-auto grid max-w-page gap-6 px-4 pt-6 sm:px-6 md:grid-cols-[220px_minmax(0,1fr)] md:gap-10 md:pt-10 lg:px-8">
        <Suspense
          fallback={<SideNavLinks label="Settings" groups={settingsNavGroups} activeHref={null} />}
        >
          <SettingsNav />
        </Suspense>
        <div className="flex min-w-0 max-w-[780px] flex-col gap-6">{children}</div>
      </div>
    </>
  )
}
