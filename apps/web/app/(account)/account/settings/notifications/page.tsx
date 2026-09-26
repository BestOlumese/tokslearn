import { Badge } from '@tokslearn/ui/badge'
import type { Metadata } from 'next'
import { SettingsPanel } from '@/components/account/settings-panel'

export const metadata: Metadata = { title: 'Notifications' }

const alwaysOn = [
  ['Sign-in codes and links', 'Codes, email confirmation and password reset links.'],
  ['Security alerts', 'New devices, password changes and two-factor changes.'],
  ['Receipts', 'A receipt for every payment, with the refund deadline.'],
] as const

// docs/20 §3 `/account/settings/notifications`. Choices for optional emails arrive in Phase 9.
export default function NotificationSettingsPage() {
  return (
    <SettingsPanel
      id="email"
      title="Email"
      description="These emails keep your account safe and your purchases on record, so they can't be turned off."
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
      <p className="mt-4 text-body-sm text-ink-3">
        Course updates and study reminders will be optional, and you'll choose them here.
      </p>
    </SettingsPanel>
  )
}
