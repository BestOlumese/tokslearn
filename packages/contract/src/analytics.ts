/**
 * Analytics event names from docs/24-analytics-events.md (add events there first).
 * Shared by the web client, the server `track()` and, later, the Expo app.
 */

/** Captured in the browser (consent-gated). */
export const clientEvents = [
  '$pageview',
  'search_performed',
  'course_card_clicked',
  'course_viewed',
  'preview_lesson_played',
  'wishlist_added',
  'wishlist_removed',
  'cart_item_added',
  'cart_item_removed',
  'payment_popup_closed',
  'note_created',
  'bookmark_created',
] as const

/** Captured on the server from event handlers, never inside DB transactions. */
export const serverEvents = [
  'referral_link_clicked',
  'signed_up',
  'email_verified',
  'signed_in',
  'coupon_applied',
  'checkout_started',
  'order_paid',
  'order_failed',
  'enrolled',
  'lesson_started',
  'lesson_completed',
  'course_completed',
  'resource_downloaded',
  'quiz_submitted',
  'exam_started',
  'exam_submitted',
  'assignment_submitted',
  'assignment_graded',
  'certificate_issued',
  'certificate_verified',
  'streak_extended',
  'badge_awarded',
  'live_joined',
  'question_asked',
  'answer_accepted',
  'review_submitted',
  'refund_requested',
  'instructor_application_started',
  'instructor_application_submitted',
  'instructor_application_approved',
  'kyc_completed',
  'course_created',
  'course_submitted',
  'course_published',
  'video_uploaded',
  'coupon_created',
] as const

export type ClientAnalyticsEvent = (typeof clientEvents)[number]
export type ServerAnalyticsEvent = (typeof serverEvents)[number]
export type AnalyticsEvent = ClientAnalyticsEvent | ServerAnalyticsEvent

/** snake_case keys; values are primitives only. Never emails, phones or names. */
export type AnalyticsProperties = Readonly<Record<string, string | number | boolean | null>>

export type AnalyticsPlatform = 'web' | 'ios' | 'android'
