import { schema } from '@tokslearn/db'
import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { enrolledCourseIds } from '../enrollments'
import { isUser } from '../kernel/actor'
import type { Ctx } from '../kernel/ctx'
import { DomainError, RuleViolationError } from '../kernel/errors'
import { requireUser } from '../kernel/guards'
import { attributionFacts } from './attribution'
import { type ItemRef, type ItemView, loadItems } from './catalog-items'
import { loadActiveRules } from './commission'
import { findUsableCoupon } from './coupons'
import { PricingError, priceOrder } from './pricing'

// Cart and wishlist (docs/20 `/cart`, `/account` Wishlist). Signed-in users have one server
// cart; visitors keep a list in the browser and merge it on sign-in (`mergeCart`). Totals shown
// here come from the same pricing engine as checkout.
// Foreign reads (docs/03 §3): courses (via catalog-items).

const { carts, cartItems, wishlistItems } = schema

export const MAX_CART_ITEMS = 20

export type RemovedReason = 'owned' | 'unavailable' | 'own_course'

export interface CartView {
  items: ItemView[]
  /** Items taken out since the last look, with why (shown once as a notice). */
  removed: Array<{ title: string; reason: RemovedReason }>
  couponCode: string | null
  /** Why the saved coupon doesn't work right now, if it doesn't. */
  couponError: string | null
  subtotalKobo: bigint
  discountKobo: bigint
  totalKobo: bigint
}

async function cartFor(ctx: Ctx, userId: string) {
  const [existing] = await ctx.db.select().from(carts).where(eq(carts.userId, userId))
  if (existing) return existing
  const [created] = await ctx.db
    .insert(carts)
    .values({ userId })
    .onConflictDoNothing({ target: carts.userId })
    .returning()
  if (created) return created
  const [again] = await ctx.db.select().from(carts).where(eq(carts.userId, userId))
  if (!again) throw new Error('cart missing after insert')
  return again
}

async function cartRefs(ctx: Ctx, cartId: string): Promise<ItemRef[]> {
  const rows = await ctx.db
    .select({ itemType: cartItems.itemType, itemId: cartItems.itemId })
    .from(cartItems)
    .where(eq(cartItems.cartId, cartId))
    .orderBy(asc(cartItems.createdAt))
  return rows
}

/** Why a user can't buy an item (null when they can). */
function blocker(item: ItemView, userId: string | null, owned: Set<string>): RemovedReason | null {
  if (item.courseIds.length > 0 && item.courseIds.every((id) => owned.has(id))) return 'owned'
  if (userId && item.instructorId === userId) return 'own_course'
  if (item.unavailable) return 'unavailable'
  return null
}

/**
 * Prices a list of items for a user (or a visitor) the way checkout would. Coupon problems don't
 * fail the view; they come back as `couponError`.
 */
async function priceView(
  ctx: Ctx,
  items: ItemView[],
  couponCode: string | null,
  userId: string | null,
  anonymousId: string | null,
): Promise<Pick<CartView, 'couponError' | 'subtotalKobo' | 'discountKobo' | 'totalKobo'>> {
  const empty = { couponError: null, subtotalKobo: 0n, discountKobo: 0n, totalKobo: 0n }
  if (items.length === 0) return empty
  const rules = await loadActiveRules(ctx)
  const attribution =
    userId && isUser(ctx.actor)
      ? await attributionFacts(ctx, { anonymousId })
      : { referralInstructorIds: new Set<string>(), paidCampaign: false }
  const base = { lines: items.map((i) => i.line), rules, attribution, now: ctx.now }
  let couponError: string | null = null
  if (couponCode) {
    try {
      const coupon = await findUsableCoupon(ctx, couponCode, userId)
      const order = priceOrder({ ...base, coupon })
      return {
        couponError: null,
        subtotalKobo: order.subtotalKobo,
        discountKobo: order.discountKobo,
        totalKobo: order.totalKobo,
      }
    } catch (e) {
      if (e instanceof DomainError) couponError = e.code
      else if (e instanceof PricingError && e.problem === 'COUPON_NOT_APPLICABLE') {
        couponError = 'COUPON_NOT_APPLICABLE'
      } else throw e
    }
  }
  const order = priceOrder({ ...base, coupon: null })
  return {
    couponError,
    subtotalKobo: order.subtotalKobo,
    discountKobo: order.discountKobo,
    totalKobo: order.totalKobo,
  }
}

/**
 * The signed-in user's cart. Items they now own, their own courses and items that went off sale
 * are taken out and reported once in `removed` (docs/20 `/cart` states).
 */
export async function getCart(
  ctx: Ctx,
  input: { anonymousId?: string | null } = {},
): Promise<CartView> {
  const actor = requireUser(ctx.actor)
  const cart = await cartFor(ctx, actor.userId)
  const items = await loadItems(ctx, await cartRefs(ctx, cart.id))
  const owned = await enrolledCourseIds(
    ctx,
    actor.userId,
    items.flatMap((i) => i.courseIds),
  )
  const keep: ItemView[] = []
  const removed: CartView['removed'] = []
  for (const item of items) {
    const reason = blocker(item, actor.userId, owned)
    if (reason) removed.push({ title: item.title, reason })
    else keep.push(item)
  }
  if (removed.length > 0) {
    const gone = items.filter((i) => !keep.includes(i))
    for (const g of gone) {
      await ctx.db
        .delete(cartItems)
        .where(
          and(
            eq(cartItems.cartId, cart.id),
            eq(cartItems.itemType, g.itemType),
            eq(cartItems.itemId, g.itemId),
          ),
        )
    }
  }
  const prices = await priceView(
    ctx,
    keep,
    cart.couponCode,
    actor.userId,
    input.anonymousId ?? null,
  )
  return { items: keep, removed, couponCode: cart.couponCode, ...prices }
}

/**
 * Prices a visitor's browser cart without saving anything (docs/20 `/cart` for visitors; the
 * mobile app uses it too). No attribution or per-user coupon limits before sign-in.
 */
export async function previewCart(
  ctx: Ctx,
  input: { items: ReadonlyArray<ItemRef>; couponCode?: string | null },
): Promise<CartView> {
  const refs = dedupe(input.items).slice(0, MAX_CART_ITEMS)
  const items = await loadItems(ctx, refs)
  const userId = isUser(ctx.actor) ? ctx.actor.userId : null
  const owned = userId
    ? await enrolledCourseIds(
        ctx,
        userId,
        items.flatMap((i) => i.courseIds),
      )
    : new Set<string>()
  const keep = items.filter((i) => !blocker(i, userId, owned))
  const removed = items
    .filter((i) => !keep.includes(i))
    .map((i) => ({ title: i.title, reason: blocker(i, userId, owned) ?? 'unavailable' }))
  const prices = await priceView(ctx, keep, input.couponCode ?? null, null, null)
  return { items: keep, removed, couponCode: input.couponCode ?? null, ...prices }
}

const dedupe = (refs: ReadonlyArray<ItemRef>) => {
  const seen = new Set<string>()
  return refs.filter((r) => {
    const key = `${r.itemType}:${r.itemId}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Adds a course or bundle. Refuses what can't be bought, own courses and owned courses. */
export async function addToCart(ctx: Ctx, ref: ItemRef): Promise<CartView> {
  const actor = requireUser(ctx.actor)
  const [item] = await loadItems(ctx, [ref])
  if (!item) {
    throw new DomainError(ref.itemType === 'course' ? 'COURSE_NOT_FOUND' : 'BUNDLE_NOT_FOUND')
  }
  const owned = await enrolledCourseIds(ctx, actor.userId, item.courseIds)
  const reason = blocker(item, actor.userId, owned)
  if (reason === 'own_course') throw new RuleViolationError('OWN_COURSE')
  if (reason === 'owned') throw new RuleViolationError('ALREADY_ENROLLED')
  if (reason === 'unavailable') throw new RuleViolationError('COURSE_UNAVAILABLE')
  const cart = await cartFor(ctx, actor.userId)
  const refs = await cartRefs(ctx, cart.id)
  const already = refs.some((r) => r.itemType === ref.itemType && r.itemId === ref.itemId)
  if (!already && refs.length >= MAX_CART_ITEMS) throw new RuleViolationError('CART_FULL')
  await ctx.db
    .insert(cartItems)
    .values({ cartId: cart.id, itemType: ref.itemType, itemId: ref.itemId })
    .onConflictDoNothing()
  await ctx.db.update(carts).set({ updatedAt: ctx.now }).where(eq(carts.id, cart.id))
  return getCart(ctx)
}

export async function removeFromCart(ctx: Ctx, ref: ItemRef): Promise<CartView> {
  const actor = requireUser(ctx.actor)
  const cart = await cartFor(ctx, actor.userId)
  await ctx.db
    .delete(cartItems)
    .where(
      and(
        eq(cartItems.cartId, cart.id),
        eq(cartItems.itemType, ref.itemType),
        eq(cartItems.itemId, ref.itemId),
      ),
    )
  return getCart(ctx)
}

/** Moves the browser cart into the account after sign-in; items that can't be added are skipped. */
export async function mergeCart(ctx: Ctx, refs: ReadonlyArray<ItemRef>): Promise<CartView> {
  const actor = requireUser(ctx.actor)
  const cart = await cartFor(ctx, actor.userId)
  const current = await cartRefs(ctx, cart.id)
  const room = MAX_CART_ITEMS - current.length
  const items = await loadItems(ctx, dedupe(refs))
  const owned = await enrolledCourseIds(
    ctx,
    actor.userId,
    items.flatMap((i) => i.courseIds),
  )
  const addable = items.filter((i) => !blocker(i, actor.userId, owned)).slice(0, Math.max(0, room))
  if (addable.length > 0) {
    await ctx.db
      .insert(cartItems)
      .values(addable.map((i) => ({ cartId: cart.id, itemType: i.itemType, itemId: i.itemId })))
      .onConflictDoNothing()
  }
  return getCart(ctx)
}

/**
 * Saves a coupon code on the cart after checking it works for these items (errors are the
 * COUPON_* codes). Null removes it.
 */
export async function setCartCoupon(ctx: Ctx, code: string | null): Promise<CartView> {
  const actor = requireUser(ctx.actor)
  const cart = await cartFor(ctx, actor.userId)
  if (code === null || code.trim() === '') {
    await ctx.db.update(carts).set({ couponCode: null }).where(eq(carts.id, cart.id))
    return getCart(ctx)
  }
  const coupon = await findUsableCoupon(ctx, code, actor.userId)
  const view = await getCart(ctx)
  if (view.items.length === 0) throw new RuleViolationError('CART_EMPTY')
  try {
    priceOrder({
      lines: view.items.map((i) => i.line),
      coupon,
      rules: await loadActiveRules(ctx),
      attribution: { referralInstructorIds: new Set(), paidCampaign: false },
      now: ctx.now,
    })
  } catch (e) {
    if (e instanceof PricingError && e.problem === 'COUPON_NOT_APPLICABLE') {
      throw new RuleViolationError('COUPON_NOT_APPLICABLE')
    }
    throw e
  }
  await ctx.db.update(carts).set({ couponCode: coupon.code }).where(eq(carts.id, cart.id))
  return getCart(ctx)
}

/** After payment: take the bought items and the used coupon out of the cart. */
export async function clearPurchased(
  ctx: Ctx,
  userId: string,
  refs: ReadonlyArray<ItemRef>,
): Promise<void> {
  const [cart] = await ctx.db.select().from(carts).where(eq(carts.userId, userId))
  if (!cart) return
  for (const type of ['course', 'bundle'] as const) {
    const ids = refs.filter((r) => r.itemType === type).map((r) => r.itemId)
    if (ids.length === 0) continue
    await ctx.db
      .delete(cartItems)
      .where(
        and(
          eq(cartItems.cartId, cart.id),
          eq(cartItems.itemType, type),
          inArray(cartItems.itemId, ids),
        ),
      )
  }
  await ctx.db.update(carts).set({ couponCode: null }).where(eq(carts.id, cart.id))
}

/** Number of items, for the header badge. */
export async function cartCount(ctx: Ctx): Promise<number> {
  if (!isUser(ctx.actor)) return 0
  const [cart] = await ctx.db.select().from(carts).where(eq(carts.userId, ctx.actor.userId))
  if (!cart) return 0
  return (await cartRefs(ctx, cart.id)).length
}

// ── Wishlist ─────────────────────────────────────────────────────────────────────

export async function addToWishlist(ctx: Ctx, courseId: string): Promise<void> {
  const actor = requireUser(ctx.actor)
  const [item] = await loadItems(ctx, [{ itemType: 'course', itemId: courseId }])
  if (!item || item.unavailable === 'not_live') throw new DomainError('COURSE_NOT_FOUND')
  await ctx.db
    .insert(wishlistItems)
    .values({ userId: actor.userId, courseId })
    .onConflictDoNothing()
}

export async function removeFromWishlist(ctx: Ctx, courseId: string): Promise<void> {
  const actor = requireUser(ctx.actor)
  await ctx.db
    .delete(wishlistItems)
    .where(and(eq(wishlistItems.userId, actor.userId), eq(wishlistItems.courseId, courseId)))
}

/** Wishlisted courses that are still live, newest first. */
export async function listWishlist(ctx: Ctx): Promise<ItemView[]> {
  const actor = requireUser(ctx.actor)
  const rows = await ctx.db
    .select({ courseId: wishlistItems.courseId })
    .from(wishlistItems)
    .where(eq(wishlistItems.userId, actor.userId))
    .orderBy(desc(wishlistItems.createdAt))
    .limit(200)
  const items = await loadItems(
    ctx,
    rows.map((r) => ({ itemType: 'course' as const, itemId: r.courseId })),
  )
  return items.filter((i) => i.unavailable !== 'not_live')
}

/** Which of these courses the user has wishlisted (for heart buttons). */
export async function wishlistHas(
  ctx: Ctx,
  courseIds: ReadonlyArray<string>,
): Promise<Set<string>> {
  if (!isUser(ctx.actor) || courseIds.length === 0) return new Set()
  const rows = await ctx.db
    .select({ courseId: wishlistItems.courseId })
    .from(wishlistItems)
    .where(
      and(
        eq(wishlistItems.userId, ctx.actor.userId),
        inArray(wishlistItems.courseId, [...courseIds]),
      ),
    )
  return new Set(rows.map((r) => r.courseId))
}

/** Cart → wishlist in one step (docs/20 `/cart` "Move to wishlist"). */
export async function moveToWishlist(ctx: Ctx, courseId: string): Promise<CartView> {
  await addToWishlist(ctx, courseId)
  return removeFromCart(ctx, { itemType: 'course', itemId: courseId })
}

/** Which of these courses sit in the user's cart (directly, not through a bundle). */
export async function cartCourseIds(
  ctx: Ctx,
  courseIds: ReadonlyArray<string>,
): Promise<Set<string>> {
  if (!isUser(ctx.actor) || courseIds.length === 0) return new Set()
  const [cart] = await ctx.db.select().from(carts).where(eq(carts.userId, ctx.actor.userId))
  if (!cart) return new Set()
  const rows = await ctx.db
    .select({ itemId: cartItems.itemId })
    .from(cartItems)
    .where(
      and(
        eq(cartItems.cartId, cart.id),
        eq(cartItems.itemType, 'course'),
        inArray(cartItems.itemId, [...courseIds]),
      ),
    )
  return new Set(rows.map((r) => r.itemId))
}

/**
 * What a code would take off the user's current cart, without saving it (`coupons.validate`).
 * Errors are the COUPON_* codes and CART_EMPTY.
 */
export async function validateCoupon(
  ctx: Ctx,
  code: string,
): Promise<{ code: string; discountKobo: bigint; totalKobo: bigint }> {
  const actor = requireUser(ctx.actor)
  const coupon = await findUsableCoupon(ctx, code, actor.userId)
  const view = await getCart(ctx)
  if (view.items.length === 0) throw new RuleViolationError('CART_EMPTY')
  try {
    const order = priceOrder({
      lines: view.items.map((i) => i.line),
      coupon,
      rules: await loadActiveRules(ctx),
      attribution: { referralInstructorIds: new Set(), paidCampaign: false },
      now: ctx.now,
    })
    return { code: coupon.code, discountKobo: order.discountKobo, totalKobo: order.totalKobo }
  } catch (e) {
    if (e instanceof PricingError && e.problem === 'COUPON_NOT_APPLICABLE') {
      throw new RuleViolationError('COUPON_NOT_APPLICABLE')
    }
    throw e
  }
}
