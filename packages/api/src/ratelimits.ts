import type { RateLimitPolicy } from '@tokslearn/integrations/upstash'

/**
 * Per-procedure rate limits (docs/06 §3.4). Keys match a full procedure path (`admin.setFeatureFlag`)
 * or a namespace (`auth`). The most specific key wins. Identifier: user id, else IP hash.
 */
export const rateLimits: Readonly<Record<string, RateLimitPolicy>> = {
  default: { limit: 120, windowSec: 60 },
  auth: { limit: 10, windowSec: 60 },
  checkout: { limit: 10, windowSec: 60 },
  search: { limit: 60, windowSec: 60 },
  'progress.heartbeat': { limit: 6, windowSec: 60 },
  health: { limit: 60, windowSec: 60 },
  admin: { limit: 60, windowSec: 60 },
  me: { limit: 60, windowSec: 60 },
  media: { limit: 20, windowSec: 60 },
  users: { limit: 60, windowSec: 60 },
  instructors: { limit: 30, windowSec: 60 },
  // Each check costs money at Dojah and is a brute-force target.
  'kyc.start': { limit: 5, windowSec: 60 * 60 },
  kyc: { limit: 30, windowSec: 60 },
  payoutAccounts: { limit: 20, windowSec: 60 },
  'payoutAccounts.resolve': { limit: 10, windowSec: 60 },
  // Autosave and drag-and-drop send many small writes.
  studio: { limit: 240, windowSec: 60 },
  'studio.lessons.refreshVideo': { limit: 20, windowSec: 60 },
  'media.createVideoUpload': { limit: 30, windowSec: 60 * 60 },
  catalog: { limit: 120, windowSec: 60 },
  courses: { limit: 120, windowSec: 60 },
  'courses.search': { limit: 60, windowSec: 60 },
  'learn.previewPlayback': { limit: 30, windowSec: 60 },
  cart: { limit: 120, windowSec: 60 },
  'cart.preview': { limit: 60, windowSec: 60 },
  // Coupon codes are guessable: slow down trying them.
  'cart.setCoupon': { limit: 20, windowSec: 60 * 10 },
  coupons: { limit: 20, windowSec: 60 * 10 },
  'checkout.confirm': { limit: 30, windowSec: 60 },
  orders: { limit: 60, windowSec: 60 },
  enrollments: { limit: 60, windowSec: 60 },
  'enrollments.enrollFree': { limit: 20, windowSec: 60 },
  wishlist: { limit: 60, windowSec: 60 },
  bundles: { limit: 120, windowSec: 60 },
  referrals: { limit: 30, windowSec: 60 },
  learn: { limit: 120, windowSec: 60 },
  // Each call signs a fresh video link or file link.
  'learn.playback': { limit: 30, windowSec: 60 },
  'learn.resourceDownload': { limit: 20, windowSec: 60 },
  progress: { limit: 60, windowSec: 60 },
  'progress.syncBatch': { limit: 10, windowSec: 60 },
  notes: { limit: 60, windowSec: 60 },
  bookmarks: { limit: 60, windowSec: 60 },
  engagement: { limit: 60, windowSec: 60 },
  // Autosave sends an answer per change; exams must never lose one to a limit.
  quizzes: { limit: 240, windowSec: 60 },
  'quizzes.start': { limit: 20, windowSec: 60 },
  exams: { limit: 240, windowSec: 60 },
  'exams.start': { limit: 10, windowSec: 60 },
  'exams.logIntegrityEvent': { limit: 60, windowSec: 60 },
  assignments: { limit: 120, windowSec: 60 },
  'assignments.submit': { limit: 20, windowSec: 60 },
  grading: { limit: 120, windowSec: 60 },
  certificates: { limit: 60, windowSec: 60 },
  // Public lookups are by IP; a person checks a handful of codes, a scraper many.
  'certificates.verify': { limit: 30, windowSec: 60 },
  // Signs a file link, or renders the PDF if the job hasn't.
  'certificates.download': { limit: 20, windowSec: 60 },
  'certificates.requestNameCorrection': { limit: 5, windowSec: 60 },
  // Each preview renders a PDF.
  'studio.certificates.preview': { limit: 10, windowSec: 60 },
  community: { limit: 120, windowSec: 60 },
  // Posting is where spam comes from (docs/10 §10).
  'community.createThread': { limit: 5, windowSec: 60 },
  'community.reply': { limit: 20, windowSec: 60 },
  'community.report': { limit: 10, windowSec: 60 },
  live: { limit: 60, windowSec: 60 },
  reviews: { limit: 120, windowSec: 60 },
  // The bell polls once a minute per open tab.
  notifications: { limit: 120, windowSec: 60 },
  'reviews.save': { limit: 10, windowSec: 60 },
  'reviews.vote': { limit: 30, windowSec: 60 },
  'reviews.report': { limit: 10, windowSec: 60 },
  // Each join creates a Daily meeting token (and maybe a room).
  'live.join': { limit: 10, windowSec: 60 },
}

export function policyFor(path: ReadonlyArray<string>): {
  bucket: string
  policy: RateLimitPolicy
} {
  for (let i = path.length; i > 0; i--) {
    const bucket = path.slice(0, i).join('.')
    const policy = rateLimits[bucket]
    if (policy) return { bucket, policy }
  }
  return { bucket: 'default', policy: rateLimits.default ?? { limit: 120, windowSec: 60 } }
}

/**
 * Procedures that create money or irreversible state accept an Idempotency-Key (docs/06 §3.5).
 * Phase 4+ adds `checkout.start`, `refunds.request`, `assignments.submit`, `exams.submit`.
 */
export const idempotentProcedures: ReadonlySet<string> = new Set<string>([
  'checkout.start',
  'exams.submit',
  'assignments.submit',
])
