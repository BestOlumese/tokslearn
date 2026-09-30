'use client'
// Client component: the cart (docs/20 `/cart`). Signed-in users edit their server cart; visitors
// see their browser cart priced by the server and sign in to check out, which merges it.

import type { CartDto, PublicCohortDto } from '@tokslearn/contract'
import { buttonClasses } from '@tokslearn/ui/button'
import { EmptyState } from '@tokslearn/ui/empty-state'
import { Input } from '@tokslearn/ui/input'
import type { Route } from 'next'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { CourseCover } from '@/components/catalog/course-cover'
import { formatDate, formatNaira } from '@/lib/format'
import { cartChanged, readLocalCart, ShopError, shopApi, writeLocalCart } from '@/lib/shop'

const removedWords = {
  owned: 'is already yours, so we took it out of your cart',
  unavailable: "isn't on sale any more",
  own_course: 'is your own course',
} as const

const couponWords: Record<string, string> = {
  COUPON_INVALID: "This coupon code isn't valid.",
  COUPON_EXPIRED: 'This coupon has expired.',
  COUPON_LIMIT_REACHED: 'This coupon has been fully used.',
  COUPON_NOT_APPLICABLE: "This coupon doesn't apply to the items in your cart.",
}

/** The browser cart keeps the picked start date as well (docs/10 §9). */
const toLocal = (i: CartDto['items'][number]) => ({
  itemType: i.itemType,
  itemId: i.itemId,
  cohortId: i.cohort?.id ?? null,
})

export function CartView({ initial, signedIn }: { initial: CartDto | null; signedIn: boolean }) {
  const [cart, setCart] = useState<CartDto | null>(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [code, setCode] = useState('')

  useEffect(() => {
    const local = readLocalCart()
    if (signedIn) {
      if (local.length === 0) {
        cartChanged(initial?.items.length ?? 0)
        return
      }
      // Items collected before signing in join the account's cart.
      shopApi<CartDto>('/cart/merge', { method: 'POST', body: { items: local } })
        .then((c) => {
          writeLocalCart([])
          setCart(c)
          cartChanged(c.items.length)
        })
        .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      return
    }
    shopApi<CartDto>('/cart/preview', { method: 'POST', body: { items: local } })
      .then((c) => {
        setCart(c)
        // Drop what can't be bought from the browser cart too.
        writeLocalCart(c.items.map(toLocal))
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [signedIn, initial])

  const act = async (fn: () => Promise<CartDto>) => {
    setBusy(true)
    setError(null)
    try {
      const next = await fn()
      setCart(next)
      cartChanged(next.items.length)
      if (!signedIn) {
        writeLocalCart(next.items.map(toLocal))
      }
      return next
    } catch (e) {
      setError(e instanceof ShopError ? e.message : String(e))
      return null
    } finally {
      setBusy(false)
    }
  }

  const remove = (itemType: 'course' | 'bundle', itemId: string) =>
    act(() => {
      if (signedIn) {
        return shopApi<CartDto>('/cart/items/remove', {
          method: 'POST',
          body: { itemType, itemId },
        })
      }
      const left = readLocalCart().filter((i) => !(i.itemType === itemType && i.itemId === itemId))
      return shopApi<CartDto>('/cart/preview', { method: 'POST', body: { items: left } })
    })

  /** Switch a cohort course to another start date. */
  const pickDate = (courseId: string, cohortId: string) =>
    act(() => {
      if (signedIn) {
        return shopApi<CartDto>('/cart/items', {
          method: 'POST',
          body: { itemType: 'course', itemId: courseId, cohortId },
        })
      }
      const items = readLocalCart().map((i) => (i.itemId === courseId ? { ...i, cohortId } : i))
      return shopApi<CartDto>('/cart/preview', { method: 'POST', body: { items } })
    })

  if (!cart) {
    return (
      <div aria-busy="true" className="mt-8 h-40 animate-pulse rounded-card bg-surface-sunken" />
    )
  }

  const shortestRefund = Math.min(...cart.items.map((i) => i.refundPolicyDays), 14)
  const checkoutHref = (
    signedIn ? '/checkout' : `/sign-in?next=${encodeURIComponent('/checkout')}`
  ) as Route

  return (
    <div className="mt-8">
      {cart.removed.length > 0 ? (
        <ul className="mb-6 flex flex-col gap-1 rounded-card border border-border bg-surface px-4 py-3 text-body-sm text-ink-2">
          {cart.removed.map((r) => (
            <li key={r.title}>
              {r.title} {removedWords[r.reason]}.
            </li>
          ))}
        </ul>
      ) : null}

      {cart.items.length === 0 ? (
        <EmptyState
          title="Your cart is empty"
          description="Courses you add show up here with the price you'll pay."
          action={
            <Link href="/courses" className={buttonClasses({ variant: 'secondary' })}>
              Browse courses
            </Link>
          }
        />
      ) : (
        <div className="grid gap-8 pb-28 lg:grid-cols-[minmax(0,1fr)_360px] lg:pb-0">
          <ul className="flex flex-col divide-y divide-border self-start rounded-card border border-border bg-surface">
            {cart.items.map((item) => (
              <li key={`${item.itemType}:${item.itemId}`} className="flex gap-4 p-4">
                <CourseCover
                  src={item.coverUrl}
                  alt={item.title}
                  sizes="160px"
                  className="w-28 shrink-0 sm:w-40"
                />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <Link
                    href={
                      (item.itemType === 'bundle'
                        ? `/bundles/${item.slug}`
                        : `/courses/${item.slug}`) as Route
                    }
                    className="line-clamp-2 text-body font-semibold text-ink hover:text-brand-ink hover:underline"
                  >
                    {item.title}
                  </Link>
                  <p className="text-body-sm text-ink-2">
                    {item.itemType === 'bundle'
                      ? `Bundle of ${item.courseIds.length} courses · `
                      : ''}
                    {item.instructorName}
                  </p>
                  {item.cohortBased ? (
                    item.cohort ? (
                      <DatePick
                        courseId={item.itemId}
                        current={item.cohort}
                        disabled={busy}
                        onPick={(id) => pickDate(item.itemId, id)}
                      />
                    ) : (
                      <p className="text-body-sm text-danger">
                        Pick a start date on the{' '}
                        <Link href={`/courses/${item.slug}` as Route} className="underline">
                          course page
                        </Link>{' '}
                        before you pay.
                      </p>
                    )
                  ) : null}
                  <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-1">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => remove(item.itemType, item.itemId)}
                      className="text-body-sm font-medium text-brand hover:underline disabled:opacity-60"
                    >
                      Remove
                    </button>
                    {signedIn && item.itemType === 'course' ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          act(() =>
                            shopApi<CartDto>('/cart/items/move-to-wishlist', {
                              method: 'POST',
                              body: { courseId: item.itemId },
                            }),
                          )
                        }
                        className="text-body-sm font-medium text-brand hover:underline disabled:opacity-60"
                      >
                        Save for later
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-body font-semibold text-ink">{formatNaira(item.priceKobo)}</p>
                  {item.compareAtKobo && item.compareAtKobo !== item.priceKobo ? (
                    <p className="text-body-sm text-ink-3 line-through">
                      <span className="sr-only">Was </span>
                      {formatNaira(item.compareAtKobo)}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>

          <aside
            aria-label="Order summary"
            className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface p-4 lg:static lg:self-start lg:rounded-card lg:border lg:p-6"
          >
            <div className="hidden lg:block">
              <h2 className="text-h4 text-ink">Summary</h2>
              {signedIn ? (
                <form
                  className="mt-4 flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    void act(() =>
                      shopApi<CartDto>('/cart/coupon', { method: 'POST', body: { code } }),
                    ).then((next) => {
                      if (next) setCode('')
                    })
                  }}
                >
                  <label htmlFor="coupon" className="sr-only">
                    Coupon code
                  </label>
                  <Input
                    id="coupon"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="Coupon code"
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={30}
                  />
                  <button
                    type="submit"
                    disabled={busy || code.trim().length < 3}
                    className={buttonClasses({ variant: 'secondary' })}
                  >
                    Apply
                  </button>
                </form>
              ) : (
                <p className="mt-3 text-body-sm text-ink-2">Have a coupon? Sign in to use it.</p>
              )}
              {cart.couponCode ? (
                <p className="mt-2 flex items-center justify-between text-body-sm">
                  <span className={cart.couponError ? 'text-danger' : 'text-ink'}>
                    {cart.couponError
                      ? (couponWords[cart.couponError] ?? "This coupon can't be used now.")
                      : `${cart.couponCode} applied`}
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      act(() =>
                        shopApi<CartDto>('/cart/coupon', { method: 'POST', body: { code: null } }),
                      )
                    }
                    className="font-medium text-brand hover:underline"
                  >
                    Remove
                  </button>
                </p>
              ) : null}
              <dl className="mt-5 flex flex-col gap-2 border-t border-border pt-4 text-body-sm">
                <div className="flex justify-between">
                  <dt className="text-ink-2">Subtotal</dt>
                  <dd className="text-ink">{formatNaira(cart.subtotalKobo)}</dd>
                </div>
                {cart.discountKobo !== '0' ? (
                  <div className="flex justify-between">
                    <dt className="text-ink-2">Discount</dt>
                    <dd className="text-ink">−{formatNaira(cart.discountKobo)}</dd>
                  </div>
                ) : null}
              </dl>
            </div>
            <div className="flex items-center justify-between gap-4 lg:mt-3 lg:border-t lg:border-border lg:pt-4">
              <p>
                <span className="block text-body-sm text-ink-2">Total</span>
                <span className="text-h3 text-ink">{formatNaira(cart.totalKobo)}</span>
              </p>
              <Link
                href={checkoutHref}
                className={buttonClasses({ size: 'lg', className: 'lg:hidden' })}
              >
                Checkout
              </Link>
            </div>
            <Link
              href={checkoutHref}
              className={buttonClasses({
                size: 'lg',
                className: 'mt-4 hidden w-full lg:inline-flex',
              })}
            >
              Checkout
            </Link>
            <p className="mt-3 hidden text-body-sm text-ink-2 lg:block">
              {shortestRefund === 0
                ? 'Some of these courses have no refunds. Each course page says which.'
                : `You can ask for a refund within ${shortestRefund} days, if you've watched less than 30% of the course.`}
            </p>
          </aside>
        </div>
      )}
      {error ? (
        <p role="alert" className="mt-4 text-body-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}

/** A cohort course's start date, switchable to another open run without leaving the cart. */
function DatePick({
  courseId,
  current,
  disabled,
  onPick,
}: {
  courseId: string
  current: { id: string; name: string; startsAt: string }
  disabled: boolean
  onPick: (cohortId: string) => void
}) {
  const [runs, setRuns] = useState<PublicCohortDto[] | null>(null)
  const [failed, setFailed] = useState(false)
  if (!runs) {
    return (
      <p className="text-body-sm text-ink">
        Starts {formatDate(current.startsAt)} · {current.name}{' '}
        <button
          type="button"
          disabled={disabled}
          className="text-brand hover:underline disabled:opacity-60"
          onClick={() =>
            shopApi<{ items: PublicCohortDto[] }>(`/courses/${courseId}/cohorts`)
              .then((r) => setRuns(r.items))
              .catch(() => setFailed(true))
          }
        >
          Change date
        </button>
        {failed ? (
          <span className="block text-danger">Couldn’t load the dates. Try again.</span>
        ) : null}
      </p>
    )
  }
  const id = `date-${courseId}`
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={id} className="text-body-sm text-ink-2">
        Start date
      </label>
      <select
        id={id}
        value={current.id}
        disabled={disabled}
        onChange={(e) => onPick(e.target.value)}
        className="h-9 rounded-control border border-border-strong bg-surface px-2 text-body-sm text-ink"
      >
        {runs.map((r) => (
          <option
            key={r.id}
            value={r.id}
            disabled={r.availability !== 'open' && r.id !== current.id}
          >
            {r.name} · starts {formatDate(r.startsAt)}
            {r.availability === 'full'
              ? ' (full)'
              : r.availability === 'not_open_yet'
                ? ' (not open yet)'
                : ''}
          </option>
        ))}
      </select>
    </div>
  )
}
