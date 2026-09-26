import { emailCategory, emailFixtures, emailIds, renderEmail } from '@tokslearn/emails'
import { Badge } from '@tokslearn/ui/badge'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import { StyleguideGateFor } from '@/components/styleguide/styleguide-gate'
import { env } from '@/env'

export const metadata: Metadata = {
  title: 'Email previews',
  robots: { index: false, follow: false },
}

// Phase 1 task: preview every catalog email (docs/23 rules) with fixture data.
export default function EmailPreviewsPage() {
  const open = env.NEXT_PUBLIC_APP_ENV === 'local' || env.NEXT_PUBLIC_APP_ENV === 'preview'
  return open ? (
    <Suspense fallback={null}>
      <EmailPreviews />
    </Suspense>
  ) : (
    <Suspense fallback={null}>
      <StyleguideGateFor>
        <EmailPreviews />
      </StyleguideGateFor>
    </Suspense>
  )
}

async function EmailPreviews() {
  const rendered = await Promise.all(
    emailIds.map(async (id) => ({ id, ...(await renderEmail(id, emailFixtures[id] as never)) })),
  )
  return (
    <div className="mx-auto max-w-page px-4 pt-10 sm:px-6 lg:px-8">
      <h1 className="text-h1-sm text-ink sm:text-h1">Email previews</h1>
      <p className="mt-2 max-w-prose text-body text-ink-2">
        Every email from docs/23 rendered with sample data. Subject lines must stay under 60
        characters, in sentence case, with no exclamation marks.
      </p>
      <div className="mt-8 flex flex-col gap-12">
        {rendered.map((email) => (
          <section
            key={email.id}
            aria-labelledby={`email-${email.id}`}
            className="border-t border-border pt-8"
          >
            <div className="flex flex-wrap items-center gap-2">
              <h2 id={`email-${email.id}`} className="font-mono text-h4 text-ink">
                {email.id}
              </h2>
              <Badge tone={emailCategory[email.id] === 'security' ? 'info' : 'neutral'}>
                {emailCategory[email.id]}
              </Badge>
            </div>
            <p className="mt-1 text-body-sm text-ink-2">
              Subject: <span className="text-ink">{email.subject}</span>{' '}
              <span className="tabular-nums text-ink-3">({email.subject.length} characters)</span>
            </p>
            <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_360px]">
              <iframe
                title={`${email.id} HTML preview`}
                srcDoc={email.html}
                sandbox=""
                className="h-[640px] w-full rounded-card border border-border bg-surface"
              />
              <pre className="h-[640px] overflow-auto rounded-card border border-border bg-surface-sunken p-4 font-mono text-caption whitespace-pre-wrap text-ink-2">
                {email.text}
              </pre>
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
