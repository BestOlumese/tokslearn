import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { NotificationList } from '@/components/notifications/notification-list'
import { PageHeader } from '@/components/site/page-header'

export const metadata: Metadata = { title: 'Notifications', robots: { index: false } }

// docs/20 `/account/notifications`: the full list behind the bell, mark all read.
export default function NotificationsPage() {
  return (
    <>
      <PageHeader
        title="Notifications"
        eyebrow={
          <Link href="/account" className="hover:underline">
            My learning
          </Link>
        }
      />
      <div className="mx-auto max-w-page px-4 pt-8 pb-16 sm:px-6 lg:px-8">
        <div className="max-w-[780px]">
          <Suspense fallback={null}>
            <NotificationList />
          </Suspense>
        </div>
      </div>
    </>
  )
}
