import { hasRole, type UserActor } from '../kernel/actor'

// Pure rules for authoring and review (docs/07 §3, docs/10 §1, docs/25). Services call these.

export const canReviewCourses = (actor: UserActor): boolean =>
  hasRole(actor, 'reviewer', 'admin', 'super_admin')

/** Create/edit course: the owning instructor or an admin (permission matrix, docs/07 §3). */
export const canEditCourse = (actor: UserActor, course: { instructorId: string }): boolean =>
  actor.userId === course.instructorId || hasRole(actor, 'admin', 'super_admin')

/** TAs can open the course in the studio but not change it. */
export const canViewCourseInStudio = (
  actor: UserActor,
  course: { instructorId: string },
  isStaffMember: boolean,
): boolean => canEditCourse(actor, course) || isStaffMember

/** Paid prices: ₦1,000 to ₦5,000,000. Free is 0. */
export const MIN_PAID_PRICE_KOBO = 100_000n
export const MAX_PRICE_KOBO = 500_000_000n
export const REFUND_POLICY_DAYS = [0, 3, 7, 14] as const
export const MIN_DESCRIPTION_CHARS = 200
export const MIN_OUTCOMES = 3
/** Content policy quality minimum for paid courses (docs/25 §A). */
export const PAID_MIN_VIDEO_SEC = 30 * 60
export const PAID_MIN_LESSONS = 5

export const validPrice = (priceKobo: bigint): boolean =>
  priceKobo === 0n || (priceKobo >= MIN_PAID_PRICE_KOBO && priceKobo <= MAX_PRICE_KOBO)

export interface OutlineLesson {
  type: 'video' | 'article' | 'quiz' | 'assignment' | 'live' | 'resource'
  isPreview: boolean
  durationSec: number
  videoStatus: 'uploading' | 'processing' | 'ready' | 'failed' | null
  hasArticle: boolean
  resourceCount: number
}

export interface ChecklistInput {
  title: string
  subtitle: string | null
  descriptionChars: number
  outcomes: ReadonlyArray<string>
  categoryId: string | null
  hasCover: boolean
  priceKobo: bigint
  sections: ReadonlyArray<{ lessons: ReadonlyArray<OutlineLesson> }>
}

export const checklistKeys = [
  'title',
  'description',
  'outcomes',
  'category',
  'cover',
  'curriculum',
  'preview',
  'videos_ready',
  'lessons_complete',
  'pricing',
  'minimum_content',
] as const
export type ChecklistKey = (typeof checklistKeys)[number]

/** Publish checklist (docs/20 `/teach/courses/[id]/publish`). Missing items block submitting. */
export function publishChecklist(
  input: ChecklistInput,
): Array<{ key: ChecklistKey; done: boolean }> {
  const lessons = input.sections.flatMap((s) => s.lessons)
  const videos = lessons.filter((l) => l.type === 'video')
  const videoSec = videos.reduce(
    (sum, l) => sum + (l.videoStatus === 'ready' ? l.durationSec : 0),
    0,
  )
  const paid = input.priceKobo > 0n
  return [
    { key: 'title', done: input.title.trim().length >= 5 && Boolean(input.subtitle?.trim()) },
    { key: 'description', done: input.descriptionChars >= MIN_DESCRIPTION_CHARS },
    { key: 'outcomes', done: input.outcomes.filter((o) => o.trim()).length >= MIN_OUTCOMES },
    { key: 'category', done: input.categoryId !== null },
    { key: 'cover', done: input.hasCover },
    {
      key: 'curriculum',
      done: input.sections.length > 0 && input.sections.every((s) => s.lessons.length > 0),
    },
    { key: 'preview', done: lessons.some((l) => l.isPreview) },
    { key: 'videos_ready', done: videos.every((l) => l.videoStatus === 'ready') },
    {
      key: 'lessons_complete',
      done: lessons.every(
        (l) =>
          (l.type !== 'article' || l.hasArticle) && (l.type !== 'resource' || l.resourceCount > 0),
      ),
    },
    { key: 'pricing', done: validPrice(input.priceKobo) },
    {
      key: 'minimum_content',
      done: !paid || videoSec >= PAID_MIN_VIDEO_SEC || lessons.length >= PAID_MIN_LESSONS,
    },
  ]
}

const words = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean),
  )

/** Share of words that changed between two texts, 0–1 (Jaccard distance on word sets). */
export function textChangeRatio(before: string, after: string): number {
  const a = words(before)
  const b = words(after)
  if (a.size === 0 && b.size === 0) return 0
  let same = 0
  for (const w of a) if (b.has(w)) same++
  return 1 - same / (a.size + b.size - same)
}

export interface RevisionFacts {
  title: string
  subtitle: string
  description: string
  outcomes: ReadonlyArray<string>
  requirements: ReadonlyArray<string>
  categoryId: string | null
  language: string
  priceKobo: bigint
  certificateMode: string
  coverFileId: string | null
}

export type ReviewReason =
  | 'text_changed'
  | 'price_increase'
  | 'category_changed'
  | 'language_changed'
  | 'certificate_changed'
  | 'cover_changed'
  | 'new_sections'
  | 'new_lessons'
  | 'removals'

/**
 * Why an update to a published course needs a reviewer (docs/10 §1). Empty = auto-approve.
 * Typo-level edits (< 20% of words) and lesson titles pass; adding lessons to an approved
 * section passes for instructors with 3+ approved courses and no strikes.
 */
export function reviewReasons(input: {
  live: RevisionFacts
  draft: RevisionFacts
  newSections: number
  newLessons: number
  removals: number
  trustedInstructor: boolean
}): ReviewReason[] {
  const { live, draft } = input
  const reasons: ReviewReason[] = []
  const text = (r: RevisionFacts) =>
    [r.title, r.subtitle, r.description, ...r.outcomes, ...r.requirements].join(' \n ')
  if (textChangeRatio(text(live), text(draft)) >= 0.2) reasons.push('text_changed')
  if (live.priceKobo > 0n ? draft.priceKobo * 2n > live.priceKobo * 3n : draft.priceKobo > 0n) {
    reasons.push('price_increase')
  }
  if (live.categoryId !== draft.categoryId) reasons.push('category_changed')
  if (live.language !== draft.language) reasons.push('language_changed')
  if (live.certificateMode !== draft.certificateMode) reasons.push('certificate_changed')
  if (live.coverFileId !== draft.coverFileId) reasons.push('cover_changed')
  if (input.newSections > 0) reasons.push('new_sections')
  if (input.newLessons > 0 && !input.trustedInstructor) reasons.push('new_lessons')
  if (input.removals > 0) reasons.push('removals')
  return reasons
}

/** Reviewer checklist (docs/25 §B), shown as checkboxes; all must be ticked to approve. */
export const reviewChecklistKeys = [
  'rights',
  'rules',
  'quality',
  'accuracy',
  'price',
  'previews',
  'resources',
] as const
export type ReviewChecklistKey = (typeof reviewChecklistKeys)[number]

/** URL slug from a course title, max 80 characters. */
export function courseSlug(title: string): string {
  const slug = title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '')
  return slug || 'course'
}
