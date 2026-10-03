'use client'
// Client component: the course page's buying actions (docs/20 `/courses/[slug]` purchase panel).
// The page is static; this island asks the API what this visitor already has and acts on the
// buttons. Visitors keep a browser cart until sign-in. Prices and access are decided server-side.
// Kept small on purpose: the course page sits near the JS budget (docs/12 §1).

import { buttonClasses } from '@tokslearn/ui/button'
import type { Route } from 'next'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { addLocal, cartChanged, isSignedIn, readLocalCart, shopApi } from '@/lib/shop'

const big = buttonClasses({ size: 'lg', className: 'w-full' })
const second = buttonClasses({ variant: 'secondary', size: 'lg', className: 'w-full' })

export function BuyButtons({
  courseId,
  courseSlug,
  free,
  group = 'cohort',
}: {
  courseId: string
  courseSlug: string
  free: boolean
  /** The picker's radio group name. */
  group?: string
}) {
  'use no memo' // Tiny island near the JS budget: the compiler's memo cache would double it.
  const [user, setUser] = useState(false)
  const [s, setS] = useState({ enrolled: false, inCart: false, saved: false })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isSignedIn()) {
      const inCart = readLocalCart().some((i) => i.itemId === courseId)
      setS((v) => ({ ...v, inCart }))
      return
    }
    setUser(true)
    shopApi<{ enrolled: string[]; wishlisted: string[]; inCart: string[] }>('/enrollments/status', {
      method: 'POST',
      body: { courseIds: [courseId] },
    })
      .then((r) =>
        setS({
          enrolled: r.enrolled.includes(courseId),
          inCart: r.inCart.includes(courseId),
          saved: r.wishlisted.includes(courseId),
        }),
      )
      .catch(() => setUser(false))
  }, [courseId])

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (e) {
      if ((e as { code?: string }).code === 'ALREADY_ENROLLED')
        setS((v) => ({ ...v, enrolled: true }))
      else setError((e as Error).message)
    }
    setBusy(false)
  }

  // The start date picked in the server-rendered picker, read at click time. One is always
  // checked when there is a date to pick; without one the server answers COHORT_REQUIRED.
  const run_ = () =>
    document.querySelector<HTMLInputElement>(`input[name="${group}"]:checked`)?.value ?? null
  const add = async () => {
    const cohortId = run_()
    if (user) {
      const cart = await shopApi<{ items: unknown[] }>('/cart/items', {
        method: 'POST',
        body: { itemType: 'course', itemId: courseId, cohortId },
      })
      cartChanged(cart.items.length)
    } else addLocal({ itemType: 'course', itemId: courseId, cohortId })
    setS((v) => ({ ...v, inCart: true }))
  }

  let primary: React.ReactNode
  if (s.enrolled) {
    primary = (
      <Link href={`/learn/${courseSlug}` as Route} className={big}>
        Continue learning
      </Link>
    )
  } else if (free && !user) {
    primary = (
      <Link href={`/sign-up?next=/courses/${courseSlug}` as Route} className={big}>
        Enroll for free
      </Link>
    )
  } else if (free) {
    primary = (
      <button
        type="button"
        className={big}
        disabled={busy}
        onClick={() =>
          run(async () => {
            await shopApi('/enrollments/free', {
              method: 'POST',
              body: { courseId, cohortId: run_() },
            })
            setS((v) => ({ ...v, enrolled: true }))
          })
        }
      >
        Enroll for free
      </button>
    )
  } else if (s.inCart) {
    primary = (
      <Link
        href="/cart"
        className={big}
        // Cohort courses: the picked date may differ from the cart's, so save it on the way.
      >
        Go to cart
      </Link>
    )
  } else {
    primary = (
      <button type="button" className={big} disabled={busy} onClick={() => run(add)}>
        Add to cart
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <div className="min-w-0 flex-1">{primary}</div>
        {user ? (
          <button
            type="button"
            aria-label={s.saved ? 'Remove from wishlist' : 'Save to wishlist'}
            aria-pressed={s.saved}
            disabled={busy}
            onClick={() =>
              run(async () => {
                await shopApi(s.saved ? '/wishlist/remove' : '/wishlist', {
                  method: 'POST',
                  body: { courseId },
                })
                setS((v) => ({ ...v, saved: !v.saved }))
              })
            }
            className={buttonClasses({ variant: 'secondary', size: 'lg', className: 'w-12 px-0' })}
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="size-5"
              fill={s.saved ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth={2}
            >
              <path d="M12 21 4 13a5 5 0 0 1 8-6 5 5 0 0 1 8 6Z" />
            </svg>
          </button>
        ) : null}
      </div>
      {s.enrolled || free ? null : (
        <button
          type="button"
          className={second}
          disabled={busy}
          onClick={() =>
            run(async () => {
              if (!s.inCart) await add()
              location.assign(user ? '/checkout' : '/sign-in?next=/checkout')
            })
          }
        >
          Buy now
        </button>
      )}
      {error ? (
        <p role="alert" className="text-body-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}
