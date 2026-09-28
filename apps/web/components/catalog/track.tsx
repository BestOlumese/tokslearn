'use client'
// Catalog analytics (docs/24): one tiny island per page. It sends the page's own event on mount
// and, once per tab, listens for clicks on links carrying `data-track` (lib/track-attr.ts), so
// course cards stay server-rendered with no JS. `capture` no-ops without consent.

import type { AnalyticsProperties, ClientAnalyticsEvent } from '@tokslearn/contract'
import { useEffect } from 'react'
import { capture } from '@/lib/analytics'

let listening = false

function onClick(e: MouseEvent) {
  const el = (e.target as Element | null)?.closest<HTMLElement>('[data-track]')
  const raw = el?.dataset.track
  if (!raw) return
  const { e: event, p } = JSON.parse(raw) as { e: ClientAnalyticsEvent; p: AnalyticsProperties }
  capture(event, p)
}

export function Track({
  event,
  props,
}: {
  event?: ClientAnalyticsEvent
  props?: AnalyticsProperties
}) {
  'use no memo' // Ships on every catalog page: the compiler's memo cache isn't worth the bytes.
  const key = JSON.stringify(props ?? {})
  useEffect(() => {
    if (!listening) {
      listening = true
      document.addEventListener('click', onClick)
    }
  }, [])
  useEffect(() => {
    if (event) capture(event, JSON.parse(key) as AnalyticsProperties)
  }, [event, key])
  return null
}
