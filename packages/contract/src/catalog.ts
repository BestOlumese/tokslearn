import { z } from 'zod'
import { base } from './base'
import { Cursor, IsoDateTime, Page } from './shared'
import { CourseLevel, CourseStatus, Kobo, LessonType } from './studio'

// Public catalog (docs/20 §1, docs/06 §5 `catalog`, `courses`, `instructors`, `learn`) and the
// admin course and category tools (docs/20 §6). Larger outputs carry named types so the
// contract's declaration file stays small (see the TS7056 fix).

const named = <S extends z.ZodType>(schema: S) =>
  schema as unknown as z.ZodType<z.output<S>, z.input<S>>

const CertificateMode = z.enum(['none', 'completion', 'exam', 'external'])

const CourseCardShape = z.object({
  courseId: z.uuid(),
  slug: z.string(),
  title: z.string(),
  subtitle: z.string().nullable(),
  coverUrl: z.string().nullable(),
  instructorName: z.string(),
  instructorSlug: z.string().nullable(),
  priceKobo: Kobo,
  compareAtKobo: Kobo.nullable(),
  isFree: z.boolean(),
  level: CourseLevel,
  certificateMode: CertificateMode,
  totalDurationSec: z.number().int(),
  lessonCount: z.number().int(),
  ratingAvg: z.number().nullable(),
  ratingCount: z.number().int(),
  enrollmentCount: z.number().int(),
  publishedAt: IsoDateTime,
})
export type CourseCardDto = z.infer<typeof CourseCardShape>
export const CourseCardDto = named(CourseCardShape)

const CategoryDirectoryShape = z.array(
  z.object({
    id: z.uuid(),
    slug: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    count: z.number().int(),
    children: z.array(
      z.object({ id: z.uuid(), slug: z.string(), name: z.string(), count: z.number().int() }),
    ),
  }),
)
export type CategoryDirectoryDto = z.infer<typeof CategoryDirectoryShape>
export const CategoryDirectoryDto = named(CategoryDirectoryShape)

const HomeShape = z.object({
  featured: z.array(CourseCardShape),
  newest: z.array(CourseCardShape),
  free: z.array(CourseCardShape),
  popular: z.array(CourseCardShape),
  categories: CategoryDirectoryShape,
  courseCount: z.number().int(),
})
export type HomeDto = z.infer<typeof HomeShape>
export const HomeDto = named(HomeShape)

const PublicSectionShape = z.object({
  id: z.uuid(),
  title: z.string(),
  durationSec: z.number().int(),
  lessons: z.array(
    z.object({
      id: z.uuid(),
      title: z.string(),
      type: LessonType,
      durationSec: z.number().int(),
      isPreview: z.boolean(),
    }),
  ),
})
export const PublicSectionDto = named(PublicSectionShape)

const PublicCourseShape = z.object({
  id: z.uuid(),
  slug: z.string(),
  status: z.enum(['published', 'unlisted']),
  title: z.string(),
  subtitle: z.string().nullable(),
  descriptionHtml: z.string().nullable(),
  outcomes: z.array(z.string()),
  requirements: z.array(z.string()),
  coverUrl: z.string().nullable(),
  level: CourseLevel,
  language: z.string(),
  category: z.object({ name: z.string(), slug: z.string() }).nullable(),
  topCategory: z.object({ name: z.string(), slug: z.string() }).nullable(),
  priceKobo: Kobo,
  compareAtKobo: Kobo.nullable(),
  refundPolicyDays: z.number().int(),
  certificateMode: CertificateMode,
  totalDurationSec: z.number().int(),
  lessonCount: z.number().int(),
  resourceCount: z.number().int(),
  enrollmentCount: z.number().int(),
  ratingAvg: z.number().nullable(),
  ratingCount: z.number().int(),
  publishedAt: IsoDateTime,
  updatedAt: IsoDateTime,
  instructor: z.object({
    id: z.uuid(),
    name: z.string(),
    slug: z.string().nullable(),
    headline: z.string().nullable(),
    bio: z.string().nullable(),
    avatarUrl: z.string().nullable(),
  }),
  promo: z
    .object({ thumbnailUrl: z.string().nullable(), durationSec: z.number().int().nullable() })
    .nullable(),
  sections: z.array(PublicSectionShape),
})
export type PublicCourseDto = z.infer<typeof PublicCourseShape>
export const PublicCourseDto = named(PublicCourseShape)

const PublicInstructorShape = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  headline: z.string().nullable(),
  bio: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  links: z.array(z.object({ kind: z.string(), url: z.string() })),
  courseCount: z.number().int(),
  learnerCount: z.number().int(),
  ratingAvg: z.number().nullable(),
  ratingCount: z.number().int(),
  since: IsoDateTime,
  courses: z.array(CourseCardShape),
})
export type PublicInstructorDto = z.infer<typeof PublicInstructorShape>
export const PublicInstructorDto = named(PublicInstructorShape)

export const CourseSort = z.enum(['popular', 'newest', 'rating', 'price_low', 'price_high'])
export const DurationBucket = z.enum(['short', 'medium', 'long'])

/** Shared filters for browse and search (docs/20 `/courses`). */
export const CourseFiltersInput = z.object({
  category: z.string().max(80).optional(),
  price: z.enum(['any', 'free', 'paid']).default('any'),
  level: CourseLevel.optional(),
  language: z.string().max(8).optional(),
  minRating: z.coerce.number().min(1).max(5).optional(),
  duration: DurationBucket.optional(),
  certificate: z.coerce.boolean().optional(),
  sort: CourseSort.default('popular'),
  cursor: Cursor.optional(),
  limit: z.coerce.number().int().min(1).max(48).default(24),
})

const get = (path: `/${string}`, tags: string[], summary: string, description: string) =>
  base.route({ method: 'GET', path, tags, summary, description })

export const catalogPublicContract = {
  home: get(
    '/catalog/home',
    ['Catalog'],
    'Home page',
    'Featured, new, free and popular courses, and categories with counts.',
  ).output(HomeDto),
  directory: get(
    '/catalog/categories',
    ['Catalog'],
    'Categories with counts',
    'Top categories and subcategories with how many courses each has.',
  ).output(CategoryDirectoryDto),
}

export const coursesContract = {
  list: get(
    '/courses',
    ['Courses'],
    'Browse courses',
    'Published courses with filters and sorting; cursor pages of up to 48.',
  )
    .input(CourseFiltersInput)
    .output(Page(CourseCardDto)),
  search: get(
    '/search',
    ['Courses'],
    'Search courses',
    'Full-text search with typo-tolerant matching on titles and tags, plus matching instructors.',
  )
    .input(CourseFiltersInput.extend({ q: z.string().trim().min(1).max(100) }))
    .output(
      z.object({
        items: z.array(CourseCardDto),
        nextCursor: z.string().nullable(),
        typoMatch: z.boolean(),
        instructors: z.array(
          z.object({
            slug: z.string(),
            name: z.string(),
            headline: z.string().nullable(),
            avatarUrl: z.string().nullable(),
          }),
        ),
      }),
    ),
  getBySlug: get(
    '/courses/{slug}',
    ['Courses'],
    'A course',
    'Everything on the course page. An old slug returns the course at its new address.',
  )
    .input(z.object({ slug: z.string().max(120) }))
    .output(PublicCourseDto),
  getCurriculum: get(
    '/courses/{slug}/curriculum',
    ['Courses'],
    'Course curriculum',
    'Sections and lessons with durations and which lessons are free previews.',
  )
    .input(z.object({ slug: z.string().max(120) }))
    .output(z.object({ sections: z.array(PublicSectionDto) })),
}

export const instructorProfileContract = {
  getBySlug: get(
    '/instructors/{slug}',
    ['Instructors'],
    'Instructor profile',
    'Public profile with stats and published courses.',
  )
    .input(z.object({ slug: z.string().max(80) }))
    .output(PublicInstructorDto),
}

export const learnContract = {
  previewPlayback: get(
    '/learn/preview',
    ['Learn'],
    'Play a free preview',
    'A signed video link (30 minutes) or the article for a free preview lesson, or the course trailer (lessonId "promo").',
  )
    .input(
      z.object({
        courseSlug: z.string().max(120),
        lessonId: z.union([z.uuid(), z.literal('promo')]),
      }),
    )
    .output(
      z.object({
        courseId: z.uuid(),
        courseTitle: z.string(),
        lesson: z.object({ id: z.string(), title: z.string(), type: LessonType }),
        embedUrl: z.string().nullable(),
        articleHtml: z.string().nullable(),
      }),
    ),
}

// ─── Admin ─────────────────────────────────────────────────────────────────────────────────────

const AdminCourseRowShape = z.object({
  id: z.uuid(),
  slug: z.string(),
  status: CourseStatus,
  title: z.string(),
  instructorName: z.string(),
  priceKobo: Kobo,
  featuredAt: IsoDateTime.nullable(),
  publishedAt: IsoDateTime.nullable(),
  updatedAt: IsoDateTime,
})
export type AdminCourseRow = z.infer<typeof AdminCourseRowShape>
export const AdminCourseRow = named(AdminCourseRowShape)

const Reason = z.string().trim().min(3).max(500)
const ok = z.object({ ok: z.literal(true) })
const post = (path: `/${string}`, summary: string, description: string) =>
  base.route({ method: 'POST', path, tags: ['Admin'], summary, description })

export const adminCoursesContract = {
  list: get(
    '/admin/courses',
    ['Admin'],
    'All courses',
    'Every course with status filters and title search. Reviewers and admins.',
  )
    .input(
      z.object({
        status: z
          .enum([
            'all',
            'published',
            'in_review',
            'changes_requested',
            'draft',
            'unlisted',
            'archived',
          ])
          .default('all'),
        q: z.string().trim().max(120).optional(),
        cursor: Cursor.optional(),
        limit: z.coerce.number().int().min(1).max(50).default(25),
      }),
    )
    .output(Page(AdminCourseRow)),
  setFeatured: post(
    '/admin/courses/{courseId}/featured',
    'Feature on home',
    'Adds a live course to the home page featured row, or removes it.',
  )
    .input(z.strictObject({ courseId: z.uuid(), featured: z.boolean(), reason: Reason }))
    .output(ok),
  setListing: post(
    '/admin/courses/{courseId}/listing',
    'Unpublish or restore',
    'Unpublish takes a course off the catalog and off sale; learners keep access. Restore puts it back.',
  )
    .input(
      z.strictObject({
        courseId: z.uuid(),
        action: z.enum(['unpublish', 'restore']),
        reason: Reason,
      }),
    )
    .output(ok),
}

const CategoryRowShape = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  parentId: z.uuid().nullable(),
  position: z.number().int(),
})
export const CategoryRow = named(CategoryRowShape)
export type CategoryRow = z.infer<typeof CategoryRowShape>

const CategorySlug = z
  .string()
  .trim()
  .min(2)
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)

const AdminCategoryLeaf = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  position: z.number().int(),
  courseCount: z.number().int(),
})
const AdminCategoryTreeShape = z.array(
  AdminCategoryLeaf.extend({ children: z.array(AdminCategoryLeaf) }),
)
export const AdminCategoryTree = named(AdminCategoryTreeShape)
export type AdminCategoryTree = z.infer<typeof AdminCategoryTreeShape>

export const adminCategoriesContract = {
  list: get(
    '/admin/categories',
    ['Admin'],
    'Category tree',
    'Top categories and subcategories in display order, with how many courses use each. Admins only.',
  ).output(AdminCategoryTree),
  create: post(
    '/admin/categories',
    'Create a category',
    'A top category, or a subcategory under one. Admins only.',
  )
    .input(
      z.strictObject({
        name: z.string().trim().min(2).max(60),
        slug: CategorySlug.optional(),
        parentId: z.uuid().nullable(),
        description: z.string().trim().max(300).nullable(),
      }),
    )
    .output(CategoryRow),
  update: post(
    '/admin/categories/{id}',
    'Edit a category',
    'Name, URL and description. A new URL keeps the old one working.',
  )
    .input(
      z.strictObject({
        id: z.uuid(),
        name: z.string().trim().min(2).max(60),
        slug: CategorySlug,
        description: z.string().trim().max(300).nullable(),
      }),
    )
    .output(CategoryRow),
  move: post(
    '/admin/categories/{id}/move',
    'Reorder a category',
    'Moves a category among its siblings (0-based).',
  )
    .input(z.strictObject({ id: z.uuid(), toIndex: z.number().int().min(0) }))
    .output(ok),
  delete: post(
    '/admin/categories/{id}/delete',
    'Delete a category',
    'Only categories without courses or subcategories.',
  )
    .input(z.strictObject({ id: z.uuid() }))
    .output(ok),
}
