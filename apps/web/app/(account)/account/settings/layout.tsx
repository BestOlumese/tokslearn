import type { Metadata } from 'next'
import { type ReactNode, Suspense } from 'react'
import { SettingsNav } from '@/components/account/settings-nav'
import { SignOutButton } from '@/components/account/sign-out-button'
import { SideNavLinks } from '@/components/side-nav-links'
import { settingsNavItems } from '@/lib/nav'

export const metadata: Metadata = { robots: { index: false } }

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-page px-4 pt-8 sm:px-6 sm:pt-12 lg:px-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-h1-sm text-ink sm:text-h1">Settings</h1>
        <SignOutButton />
      </div>
      <div className="mt-6 grid gap-8 md:grid-cols-[220px_1fr] md:gap-12">
        <Suspense
          fallback={<SideNavLinks label="Settings" items={settingsNavItems} activeHref={null} />}
        >
          <SettingsNav />
        </Suspense>
        <div className="min-w-0 max-w-form">{children}</div>
      </div>
    </div>
  )
}
