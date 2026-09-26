'use client'
// Client component: App Router pageviews are captured manually on route change (docs/24 §1).

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { capture } from '@/lib/analytics'
import { CONSENT_EVENT } from '@/lib/consent'

export function PageviewTracker() {
  const pathname = usePathname()

  useEffect(() => {
    capture('$pageview', { path: pathname })
  }, [pathname])

  useEffect(() => {
    const onConsent = (e: Event) => {
      if ((e as CustomEvent<string>).detail === 'granted') {
        capture('$pageview', { path: window.location.pathname })
      }
    }
    window.addEventListener(CONSENT_EVENT, onConsent)
    return () => window.removeEventListener(CONSENT_EVENT, onConsent)
  }, [])

  return null
}
