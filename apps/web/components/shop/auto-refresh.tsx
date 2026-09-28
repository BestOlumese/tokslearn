'use client'
// Client component: re-renders the server page on a timer (a receipt still confirming payment).

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export function AutoRefresh({ everyMs }: { everyMs: number }) {
  const router = useRouter()
  useEffect(() => {
    const id = setInterval(() => router.refresh(), everyMs)
    return () => clearInterval(id)
  }, [router, everyMs])
  return null
}
