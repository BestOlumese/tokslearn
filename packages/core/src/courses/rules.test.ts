import { describe, expect, it } from 'vitest'
import { testUser } from '../kernel/testing'
import {
  canEditCourse,
  canReviewCourses,
  canViewCourseInStudio,
  courseSlug,
  type OutlineLesson,
  publishChecklist,
  type RevisionFacts,
  reviewReasons,
  textChangeRatio,
  validPrice,
} from './rules'

const owner = testUser(['learner', 'instructor'])
const course = { instructorId: owner.userId }

const video = (over: Partial<OutlineLesson> = {}): OutlineLesson => ({
  type: 'video',
  isPreview: false,
  durationSec: 600,
  videoStatus: 'ready',
  hasArticle: false,
  resourceCount: 0,
  ...over,
})

const ready = {
  title: 'Excel for Accountants',
  subtitle: 'Month-end reporting without the late nights',
  descriptionChars: 450,
  outcomes: ['Build lookups', 'Reconcile faster', 'Present pivots'],
  categoryId: 'cat',
  hasCover: true,
  priceKobo: 1_500_000n,
  sections: [{ lessons: [video({ isPreview: true }), video(), video()] }],
}

const facts: RevisionFacts = {
  title: 'Excel for Accountants',
  subtitle: 'Month-end reporting',
  description: 'A practical course on lookups, pivots and reconciliations for accountants.',
  outcomes: ['Build lookups'],
  requirements: ['Excel 2016 or newer'],
  categoryId: 'cat',
  language: 'en',
  priceKobo: 1_000_000n,
  certificateMode: 'none',
  certificateRules: '',
  coverFileId: 'cover-1',
}

describe('course permissions', () => {
  it('lets the owner and admins edit; TAs only view; reviewers review', () => {
    expect(canEditCourse(owner, course)).toBe(true)
    expect(canEditCourse(testUser(['learner', 'admin']), course)).toBe(true)
    const ta = testUser(['learner'])
    expect(canEditCourse(ta, course)).toBe(false)
    expect(canViewCourseInStudio(ta, course, true)).toBe(true)
    expect(canViewCourseInStudio(ta, course, false)).toBe(false)
    expect(canReviewCourses(testUser(['learner', 'reviewer']))).toBe(true)
    expect(canReviewCourses(testUser(['learner', 'instructor']))).toBe(false)
  })
})

describe('publish checklist', () => {
  const missing = (input: typeof ready) =>
    publishChecklist(input)
      .filter((i) => !i.done)
      .map((i) => i.key)

  it('passes a complete course', () => {
    expect(missing(ready)).toEqual([])
  })

  it('names what is missing', () => {
    expect(
      missing({
        ...ready,
        subtitle: '',
        descriptionChars: 50,
        hasCover: false,
        sections: [{ lessons: [video({ videoStatus: 'processing' })] }, { lessons: [] }],
      }),
    ).toEqual([
      'title',
      'description',
      'cover',
      'curriculum',
      'preview',
      'videos_ready',
      'minimum_content',
    ])
  })

  it('needs 30 minutes or 5 lessons only for paid courses', () => {
    const short = {
      ...ready,
      sections: [{ lessons: [video({ isPreview: true, durationSec: 300 })] }],
    }
    expect(missing(short)).toEqual(['minimum_content'])
    expect(missing({ ...short, priceKobo: 0n })).toEqual([])
  })

  it('checks prices and empty article/resource lessons', () => {
    expect(validPrice(0n)).toBe(true)
    expect(validPrice(50_000n)).toBe(false)
    expect(validPrice(100_000n)).toBe(true)
    const article: OutlineLesson = {
      ...video(),
      type: 'article',
      videoStatus: null,
      hasArticle: false,
    }
    expect(
      missing({
        ...ready,
        sections: [{ lessons: [...(ready.sections[0]?.lessons ?? []), article] }],
      }),
    ).toEqual(['lessons_complete'])
  })
})

describe('review rules for published courses', () => {
  const base = {
    live: facts,
    draft: facts,
    newSections: 0,
    newLessons: 0,
    removals: 0,
    trustedInstructor: false,
  }

  it('auto-approves typo fixes and lesson title changes', () => {
    expect(
      reviewReasons({
        ...base,
        draft: { ...facts, description: facts.description.replace('practical', 'pratical') },
      }),
    ).toEqual([])
    expect(textChangeRatio('a b c d e f g h i j', 'a b c d e f g h i k')).toBeLessThan(0.2)
  })

  it('sends real changes to a reviewer', () => {
    expect(
      reviewReasons({
        ...base,
        draft: { ...facts, priceKobo: 1_600_000n, categoryId: 'other', coverFileId: 'cover-2' },
        newSections: 1,
        newLessons: 2,
        removals: 1,
      }),
    ).toEqual([
      'price_increase',
      'category_changed',
      'cover_changed',
      'new_sections',
      'new_lessons',
      'removals',
    ])
  })

  it('sends a change of certificate exam or provider to a reviewer', () => {
    const exam = { ...facts, certificateMode: 'exam', certificateRules: 'Exam: “Final exam”' }
    expect(
      reviewReasons({
        ...base,
        live: exam,
        draft: { ...exam, certificateRules: 'Exam: “Final exam” and every lesson' },
      }),
    ).toEqual(['certificate_changed'])
    expect(reviewReasons({ ...base, live: exam, draft: exam })).toEqual([])
  })

  it('allows price rises up to 50% and new lessons from trusted instructors', () => {
    expect(reviewReasons({ ...base, draft: { ...facts, priceKobo: 1_500_000n } })).toEqual([])
    expect(reviewReasons({ ...base, newLessons: 3, trustedInstructor: true })).toEqual([])
    expect(reviewReasons({ ...base, live: { ...facts, priceKobo: 0n } })).toEqual([
      'price_increase',
    ])
  })
})

it('makes course slugs', () => {
  expect(courseSlug('Excel for Accountants: Month-End!')).toBe('excel-for-accountants-month-end')
  expect(courseSlug('!!!')).toBe('course')
})
