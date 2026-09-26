# 24 — Analytics Events Plan

Product analytics with PostHog (EU cloud). Business numbers (revenue, payouts) come from our database,
never from analytics. Analytics answers: where do people drop off, what drives purchases, what keeps
learners going.

## 1. Rules

- Consent first: analytics loads only after the visitor accepts the consent banner (NDPA). Without consent, capture nothing client-side; server events carry no personal data beyond an internal user id.
- Identify with our `user.id` only (never email/phone). Call `identify` after sign-in, `reset` on sign-out.
- **Server-side capture** (PostHog Node client inside Inngest/event handlers) for anything that must be accurate: purchases, enrollments, completions, certificates, refunds. Client capture for UI behaviour.
- Event names: `object_action` in snake_case, past tense (`course_viewed`, `checkout_started`). Properties snake_case. Add new events here first.
- Common properties: `platform` (web/ios/android), `app_version`, `course_id`, `instructor_id`, `price_kobo` (bucketed for client events), `source` (attribution).
- Autocapture off; pageviews captured manually on route change (App Router).
- Session replay off by default (privacy + performance); enable sampled (5%) on `/checkout` only if funnel investigation needs it, with inputs masked.

## 2. Events

### Acquisition and discovery
| Event | Where | Properties |
|-------|-------|-----------|
| `$pageview` | client | `path`, `referrer`, UTM |
| `search_performed` | client | `query_length`, `results_count`, `filters` |
| `course_card_clicked` | client | `course_id`, `list` (home_popular, category, search…), `position` |
| `course_viewed` | client | `course_id`, `is_enrolled`, `price_kobo`, `has_certificate` |
| `preview_lesson_played` | client | `course_id`, `lesson_id` |
| `referral_link_clicked` | server | `referral_link_id`, `instructor_id` |

### Account
| `signed_up` | server | `method` (password, otp, google), `source` |
| `email_verified` | server | |
| `signed_in` | server | `method` |

### Purchase funnel
| `wishlist_added` / `wishlist_removed` | client | `course_id` |
| `cart_item_added` / `cart_item_removed` | client | `item_type`, `item_id` |
| `coupon_applied` | server | `coupon_scope`, `success`, `error_code` |
| `checkout_started` | server | `order_id`, `items_count`, `total_kobo` |
| `payment_popup_closed` | client | `order_id` (abandoned popup) |
| `order_paid` | server | `order_id`, `total_kobo`, `items_count`, `sources`, `payment_channel` |
| `order_failed` | server | `order_id`, `reason` |
| `enrolled` | server | `course_id`, `source` (purchase, free, bundle…) |

Funnel to build: `course_viewed → cart_item_added → checkout_started → order_paid`.

### Learning
| `lesson_started` | server (first heartbeat) | `course_id`, `lesson_id`, `lesson_type`, `position` |
| `lesson_completed` | server | same + `time_spent_sec` |
| `course_completed` | server | `course_id`, `days_since_enroll` |
| `note_created`, `bookmark_created` | client | `course_id` |
| `resource_downloaded` | server | `is_important` |
| `quiz_submitted` | server | `quiz_id`, `kind`, `score_pct`, `passed`, `attempt_no` |
| `exam_started` / `exam_submitted` | server | `quiz_id`, `duration_sec`, `passed`, `flagged` |
| `assignment_submitted` / `assignment_graded` | server | `assignment_id`, `is_late`, `score_pct` |
| `certificate_issued` | server | `course_id`, `basis` |
| `certificate_verified` | server | `certificate_id` (views of verify page) |
| `streak_extended` | server | `length` |
| `badge_awarded` | server | `badge_code` |
| `live_joined` | server | `session_id`, `minutes_before_start` |
| `question_asked` / `answer_accepted` | server | `course_id` |
| `review_submitted` | server | `rating` |

### Refunds
| `refund_requested` | server | `reason_code`, `eligible`, `decision` |

### Instructors
| `instructor_application_started` / `_submitted` / `_approved` | server | |
| `kyc_completed` | server | `status` |
| `course_created` / `course_submitted` / `course_published` | server | `course_id` |
| `video_uploaded` | server | `size_mb`, `duration_sec`, `upload_duration_sec` |
| `coupon_created` | server | `kind` |

## 3. Dashboards to set up in PostHog

1. Purchase funnel by traffic source and device.
2. Activation: signed up → first lesson started within 7 days.
3. Course health: lesson drop-off per course (lesson_started vs lesson_completed per position).
4. Retention: weekly active learners (lesson_started) cohorts.
5. Instructor pipeline: application started → approved → first course published.
6. Search quality: searches with zero results (top queries).

## 4. Implementation

- `packages/core/src/analytics/track.ts` — server `track(ctx, event, props)` that no-ops in tests; called from event handlers (not inside DB transactions).
- `apps/web/lib/analytics.ts` — client wrapper with typed event names (`AnalyticsEvent` union generated from this file's tables) that no-ops until consent.
- Mobile (Phase 14) uses the same event names with `platform` set.
