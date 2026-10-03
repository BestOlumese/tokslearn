import { Badge } from '@tokslearn/ui/badge'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import { SettingsPanel } from '@/components/account/settings-panel'
import { NotificationSettings } from '@/components/notifications/notification-settings'

export const metadata: Metadata = { title: 'Notifications' }

const alwaysOn = [
  ['Sign-in codes and links', 'Codes, email confirmation and password reset links.'],
  ['Security alerts', 'New devices, password changes and two-factor changes.'],
] as const

// docs/20 §3 `/account/settings/notifications`: kind × channel (email, in app). Security emails
// are always on and not listed as choices.
export default function NotificationSettingsPage() {
  return (
    <>
      <Suspense fallback={null}>
        <NotificationSettings />
      </Suspense>
      <SettingsPanel
        id="security"
        title="Account security"
        description="These keep your account safe, so they can't be turned off."
      >
        <ul className="divide-y divide-border rounded-card border border-border">
          {alwaysOn.map(([title, body]) => (
            <li key={title} className="flex items-start justify-between gap-4 px-4 py-3.5">
              <div>
                <p className="text-body-sm font-medium text-ink">{title}</p>
                <p className="text-body-sm text-ink-2">{body}</p>
              </div>
              <Badge>Always on</Badge>
            </li>
          ))}
        </ul>
      </SettingsPanel>
    </>
  )
}
