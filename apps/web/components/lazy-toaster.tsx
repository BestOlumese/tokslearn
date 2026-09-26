'use client'
// Client component: mounts the toast region after the page is idle so sonner (~11 KB) is not
// part of first-load JS on public pages (docs/12 §1). Toasts only follow user actions anyway.

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'

const Toaster = dynamic(() => import('@tokslearn/ui/toast').then((m) => m.Toaster), { ssr: false })

export function LazyToaster() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(() => setReady(true), { timeout: 3000 })
      return () => window.cancelIdleCallback(id)
    }
    const id = setTimeout(() => setReady(true), 1500)
    return () => clearTimeout(id)
  }, [])
  return ready ? <Toaster /> : null
}
