import type { Route } from 'next'
import Link from 'next/link'
import { supportEmail } from '@/lib/site'

const groups: ReadonlyArray<{ title: string; links: ReadonlyArray<[Route, string]> }> = [
  {
    title: 'Learn',
    links: [
      ['/courses', 'Browse courses'],
      ['/verify', 'Verify a certificate'],
      ['/refund-policy', 'Refund policy'],
      ['/help', 'Help'],
    ],
  },
  {
    title: 'Teach',
    links: [
      ['/teach', 'Teach on Tokslearn'],
      ['/teach#earnings', 'What instructors earn'],
      ['/teach#payouts', 'How payouts work'],
      ['/content-policy', 'Content rules'],
    ],
  },
  {
    title: 'Tokslearn',
    links: [
      ['/about', 'About'],
      ['/terms', 'Terms'],
      ['/privacy', 'Privacy'],
    ],
  },
]

const link =
  'inline-flex min-h-10 items-center text-body-sm text-ink-2 hover:text-ink hover:underline underline-offset-4'

// Light footer in the Coursera pattern: white, one border, link groups (docs/20 §0 chrome).
export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-border bg-surface">
      <div className="mx-auto max-w-catalog px-4 pt-12 pb-8 sm:px-6 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.5fr_repeat(3,1fr)]">
          <div className="max-w-xs">
            <p
              className="text-[1.375rem] leading-none font-bold tracking-[-0.02em] text-ink"
              translate="no"
            >
              Tokslearn
            </p>
            <p className="mt-4 text-body-sm text-ink-2">
              Online courses from Nigerian instructors, paid for in naira.
            </p>
            <p className="mt-3 text-body-sm text-ink-2">
              Questions?{' '}
              <a
                href={`mailto:${supportEmail}`}
                className="text-brand-ink underline underline-offset-4"
              >
                {supportEmail}
              </a>
            </p>
          </div>
          {groups.map((group) => (
            <nav key={group.title} aria-labelledby={`footer-${group.title}`}>
              <h2 id={`footer-${group.title}`} className="text-body font-semibold text-ink">
                {group.title}
              </h2>
              <ul className="mt-2">
                {group.links.map(([href, label]) => (
                  <li key={href}>
                    <Link href={href} className={link}>
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mt-10 flex flex-col gap-2 border-t border-border pt-6 text-body-sm text-ink-3 sm:flex-row sm:items-center sm:justify-between">
          <p>© Tokslearn, Lagos</p>
          <Link href="/privacy#analytics" className={link}>
            Cookie and analytics settings
          </Link>
        </div>
      </div>
    </footer>
  )
}
