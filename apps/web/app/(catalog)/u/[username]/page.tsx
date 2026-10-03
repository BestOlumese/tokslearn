import * as engagement from '@tokslearn/core/engagement'
import * as identity from '@tokslearn/core/identity'
import { isDomainError } from '@tokslearn/core/kernel'
import { Avatar } from '@tokslearn/ui/avatar'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { formatDate } from '@/lib/format'
import { getServerCtx } from '@/lib/server-ctx'

type Params = Promise<{ username: string }>

export const metadata: Metadata = { title: 'Profile', robots: { index: false, follow: false } }

const linkLabel: Readonly<Record<string, string>> = {
  website: 'Website',
  linkedin: 'LinkedIn',
  x: 'X',
  youtube: 'YouTube',
  github: 'GitHub',
  other: 'Link',
}

// docs/20 `/u/[username]`: a learner's public profile (name, headline, bio, links) and, if they
// chose to show them, their badges (ADR-042). Server-rendered with no client JS; not indexed.
export default function PublicProfilePage({ params }: { params: Params }) {
  return (
    <div className="mx-auto w-full max-w-[860px] px-4 py-10 sm:px-6 lg:py-14">
      <Suspense fallback={<div className="h-64 animate-pulse rounded-card bg-surface-sunken" />}>
        <Profile params={params} />
      </Suspense>
    </div>
  )
}

/** Lucide `medal`, inlined: an icon component would add JS to a public page. */
function MedalIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7.2 2h9.6l-3 6.5h-3.6L7.2 2Z" />
      <circle cx="12" cy="15" r="6" />
      <path d="m12 12.5.8 1.7 1.9.2-1.4 1.3.4 1.8-1.7-.9-1.7.9.4-1.8-1.4-1.3 1.9-.2.8-1.7Z" />
    </svg>
  )
}

async function Profile({ params }: { params: Params }) {
  const { username } = await params
  const ctx = await getServerCtx()
  let p: Awaited<ReturnType<typeof identity.getPublicProfile>>
  try {
    p = await identity.getPublicProfile(ctx, decodeURIComponent(username))
  } catch (e) {
    if (isDomainError(e)) notFound()
    throw e
  }
  const badges = await engagement.publicBadges(ctx, p.username)
  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-start gap-4">
        <Avatar src={p.avatarUrl} name={p.name} size="lg" />
        <div className="min-w-0">
          <h1 className="text-h2 break-words text-ink">{p.name}</h1>
          <p className="text-body-sm text-ink-3">@{p.username}</p>
          {p.headline ? <p className="mt-1 text-body text-ink-2">{p.headline}</p> : null}
          <p className="mt-1 text-body-sm text-ink-3">
            On Tokslearn since {formatDate(p.memberSince)}
          </p>
        </div>
      </div>
      {p.bio ? (
        <p className="max-w-[65ch] whitespace-pre-line text-body text-ink">{p.bio}</p>
      ) : null}
      {p.links.length > 0 ? (
        <ul className="flex flex-wrap gap-x-5 gap-y-2">
          {p.links.map((l) => (
            <li key={l.url}>
              <a
                href={l.url}
                rel="nofollow noopener noreferrer"
                target="_blank"
                className="text-body-sm text-brand-ink hover:underline"
              >
                {linkLabel[l.kind] ?? 'Link'}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      {badges.length > 0 ? (
        <section aria-labelledby="badges-title" className="flex flex-col gap-3">
          <h2 id="badges-title" className="text-h4 text-ink">
            Badges
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {badges.map((b) => (
              <li
                key={b.code}
                className="flex items-start gap-3 rounded-card border border-border bg-surface p-4"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft text-brand-ink">
                  <MedalIcon />
                </span>
                <span>
                  <span className="block text-body-sm font-medium text-ink">{b.name}</span>
                  <span className="block text-body-sm text-ink-2">{b.description}</span>
                  <span className="block text-caption text-ink-3">
                    Earned {formatDate(b.awardedAt)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
