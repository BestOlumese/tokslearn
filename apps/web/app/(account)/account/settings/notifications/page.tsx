import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Notifications' }

// docs/20 §3 `/account/settings/notifications` is built in Phase 9. Phase 1 placeholder.
export default function NotificationSettingsPage() {
  return (
    <section aria-labelledby="notif-title">
      <h2 id="notif-title" className="text-h2 text-ink">
        Notifications
      </h2>
      <p className="mt-2 text-body text-ink-2">
        For now we only send emails you need: sign-in codes, password and security notices, and
        receipts. You can't turn those off. Choices for course updates and reminders will appear
        here when those emails start.
      </p>
    </section>
  )
}
