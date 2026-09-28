import 'server-only'
import type { CartDto } from '@tokslearn/contract'
import type * as commerce from '@tokslearn/core/commerce'

/** Server pages hand the same shape to client components as the API returns. */
export const toCartDto = (c: commerce.CartView): CartDto => ({
  items: c.items.map((i) => ({
    itemType: i.itemType,
    itemId: i.itemId,
    slug: i.slug,
    title: i.title,
    instructorName: i.instructorName,
    coverUrl: i.coverUrl,
    priceKobo: i.priceKobo.toString(),
    compareAtKobo: i.compareAtKobo?.toString() ?? null,
    courseIds: i.courseIds,
    refundPolicyDays: i.refundPolicyDays,
  })),
  removed: c.removed,
  couponCode: c.couponCode,
  couponError: c.couponError,
  subtotalKobo: c.subtotalKobo.toString(),
  discountKobo: c.discountKobo.toString(),
  totalKobo: c.totalKobo.toString(),
})
