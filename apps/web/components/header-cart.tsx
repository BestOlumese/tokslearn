'use client'
// Client component: cart link with a live count. Signed-in users get it from the API, visitors
// from their browser cart; buy buttons announce changes with the `tl:cart` event. Kept free of
// lib/shop imports: it ships on every page (docs/12 §1).

import Link from 'next/link'
import { useEffect, useState } from 'react'

const localCount = () => {
  try {
    return (JSON.parse(localStorage.getItem('tl_cart') ?? '[]') as unknown[]).length
  } catch {
    return 0
  }
}

export function HeaderCart() {
  'use no memo' // Tiny island near the JS budget: the compiler's memo cache would double it.
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (document.cookie.includes('tl_signed_in=1')) {
      fetch('/api/v1/cart/count')
        .then((r) => (r.ok ? r.json() : { count: localCount() }))
        .then((r: { count: number }) => setCount(r.count))
        .catch(() => undefined)
    } else setCount(localCount())
    const onChange = (e: Event) => setCount(Number((e as CustomEvent).detail) || 0)
    addEventListener('tl:cart', onChange)
    return () => removeEventListener('tl:cart', onChange)
  }, [])

  return (
    <Link
      href="/cart"
      aria-label={count ? `Cart, ${count} ${count === 1 ? 'item' : 'items'}` : 'Cart'}
      className="relative flex size-10 items-center justify-center rounded-control text-ink-2 hover:bg-surface-sunken hover:text-ink"
    >
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
        <circle cx="9" cy="20" r="1.25" />
        <circle cx="18" cy="20" r="1.25" />
        <path d="M2.5 3.5h2.6l2.4 11.2a1.5 1.5 0 0 0 1.5 1.2h8.7a1.5 1.5 0 0 0 1.5-1.1l1.7-6.8H6.1" />
      </svg>
      {count ? (
        <span className="absolute top-0.5 right-0.5 grid min-w-4.5 place-items-center rounded-full bg-brand px-1 text-caption leading-4.5 font-semibold text-ink-inverse">
          {count}
        </span>
      ) : null}
    </Link>
  )
}
