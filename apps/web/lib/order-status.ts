/** Order status in words, with a badge tone (docs/11 §8: colour is never the only signal). */
export const orderStatusBadge = {
  pending: ['Confirming', 'info'],
  paid: ['Paid', 'brand'],
  failed: ['Not completed', 'neutral'],
  abandoned: ['Not completed', 'neutral'],
  refunded: ['Refunded', 'neutral'],
  partially_refunded: ['Partly refunded', 'neutral'],
} as const
