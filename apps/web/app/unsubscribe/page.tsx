import { isNotificationType, notificationTypes } from '@tokslearn/core/notifications'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { UnsubscribeButton } from '@/components/notifications/unsubscribe-button'
import { SiteChrome } from '@/components/site/site-chrome'

export const metadata: Metadata = { title: 'Stop emails', robots: { index: false } }

type Search = Promise<{ u?: string; t?: string; s?: string }>

// One-click unsubscribe for opt-in emails (ADR-042, docs/13 §3): the link in the email lands here;
// the button stops them. Works signed out; the signature is checked on the server.
export default function UnsubscribePage({ searchParams }: { searchParams: Search }) {
  return (
    <SiteChrome>
      <div className="mx-auto flex w-full max-w-[560px] flex-col gap-4 px-4 py-16 sm:px-6">
        <Suspense fallback={null}>
          <Body searchParams={searchParams} />
        </Suspense>
      </div>
    </SiteChrome>
  )
}

async function Body({ searchParams }: { searchParams: Search }) {
  const { u, t, s } = await searchParams
  const info = t && isNotificationType(t) ? notificationTypes[t] : null
  if (!u || !s || !info || info.email === 'locked') {
    return (
      <>
        <h1 className="text-h2 text-ink">This link doesn’t work</h1>
        <p className="text-body text-ink-2">
          Sign in and choose what we email you in{' '}
          <Link href="/account/settings/notifications" className="text-brand-ink hover:underline">
            Settings → Notifications
          </Link>
          .
        </p>
      </>
    )
  }
  return (
    <>
      <h1 className="text-h2 text-ink">Stop “{info.label}” emails?</h1>
      <p className="text-body text-ink-2">{info.description}</p>
      <UnsubscribeButton userId={u} type={t ?? ''} signature={s} />
    </>
  )
}
