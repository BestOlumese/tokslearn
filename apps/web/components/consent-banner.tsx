'use client'
// Client component: the buttons store the visitor's choice. The banner itself is server-rendered
// and hidden by CSS once <html data-consent> is set, so it paints with the page instead of after
// hydration (no LCP delay, no layout shift).

import { Button } from '@tokslearn/ui/button'
import { optOut } from '@/lib/analytics'
import { type Consent, writeConsent } from '@/lib/consent'

export function ConsentBanner() {
  const choose = (value: Consent) => {
    writeConsent(value)
    if (value === 'denied') optOut()
  }

  return (
    <section
      aria-labelledby="consent-title"
      className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 mx-auto max-w-[560px] rounded-card border border-border bg-surface p-5 shadow-pop sm:left-6 sm:mx-0 [html[data-consent]_&]:hidden"
    >
      <h2 id="consent-title" className="text-h4 text-ink">
        Can we count how people use Tokslearn?
      </h2>
      <p className="mt-1 text-body-sm text-ink-2">
        If you say yes, PostHog records which pages you open so we can see where people get stuck.
        No ads, and we never sell your data. You can change this any time from the footer.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => choose('granted')}>
          Yes, count my visits
        </Button>
        <Button variant="secondary" size="sm" onClick={() => choose('denied')}>
          No thanks
        </Button>
      </div>
    </section>
  )
}
