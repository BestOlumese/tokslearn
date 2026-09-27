import { schema, seedCategories } from '@tokslearn/db'
import { seedCatalog } from '@tokslearn/db/seed'
import { closeTestDb, withRollback } from '@tokslearn/db/testing'
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { changeCourseSlug, setCourseListing, setFeatured } from '../courses'
import { insertUser, testUser } from '../kernel/testing'
import { codeOf, people, publishCourse, setup } from '../testing'
import {
  createCategory,
  deleteCategory,
  featuredCourses,
  getCategoryBySlug,
  getCategoryDirectory,
  getPreviewPlayback,
  getPublicCourse,
  getPublicInstructor,
  listCourses,
  searchCourses,
  updateCategory,
} from '.'

afterAll(closeTestDb)

const top = seedCategories[0]
const sub = top?.children[0]

describe('catalog', () => {
  it('lists a published course with filters, counts it in its categories and shows its page', async () => {
    await withRollback(async (db) => {
      await seedCatalog(db)
      const env = setup(db)
      const { owner, reviewer } = await people(db)
      await db.insert(schema.instructorProfiles).values({
        userId: owner.userId,
        slug: 'tobi-adeleke',
        displayName: 'Tobi Adeleke',
        approvedAt: new Date('2026-09-01T00:00:00Z'),
      })
      const course = await publishCourse(env, owner, reviewer)
      const anon = env.ctx({ kind: 'anonymous' })

      const all = await listCourses(anon, { limit: 24 })
      expect(all.items.map((c) => c.slug)).toEqual([course.slug])
      expect(all.items[0]).toMatchObject({
        instructorName: 'Tobi Adeleke',
        priceKobo: 1_500_000n,
        isFree: false,
      })
      expect((await listCourses(anon, { price: 'free', limit: 24 })).items).toEqual([])
      expect(
        (await listCourses(anon, { categoryIds: [top?.id ?? ''], limit: 24 })).items,
      ).toHaveLength(1)
      expect((await listCourses(anon, { level: 'advanced', limit: 24 })).items).toEqual([])

      const directory = await getCategoryDirectory(anon)
      const t = directory.find((c) => c.id === top?.id)
      expect(t?.count).toBe(1)
      expect(t?.children.find((c) => c.id === sub?.id)?.count).toBe(1)

      const page = await getPublicCourse(anon, course.slug)
      expect(page.kind).toBe('course')
      if (page.kind !== 'course') return
      expect(page.course).toMatchObject({
        title: 'Excel for Accountants',
        lessonCount: 3,
        resourceCount: 1,
        category: { slug: sub?.slug },
        topCategory: { slug: top?.slug },
        instructor: { name: 'Tobi Adeleke', slug: 'tobi-adeleke' },
      })
      expect(
        page.course.sections.flatMap((s) => s.lessons).filter((l) => l.isPreview),
      ).toHaveLength(1)

      const profile = await getPublicInstructor(anon, 'tobi-adeleke')
      expect(profile.kind === 'instructor' && profile.instructor.courseCount).toBe(1)
      await db.update(schema.user).set({ banned: true }).where(eq(schema.user.id, owner.userId))
      expect((await getPublicInstructor(anon, 'tobi-adeleke')).kind).toBe('missing')
    })
  })

  it('finds courses despite typos ("javascrpit" → JavaScript)', async () => {
    await withRollback(async (db) => {
      await seedCatalog(db)
      const env = setup(db)
      const { owner, reviewer } = await people(db)
      await publishCourse(env, owner, reviewer, {
        title: 'JavaScript for Beginners',
        tags: ['JavaScript', 'Web'],
      })
      await publishCourse(env, owner, reviewer, { title: 'Excel for Accountants' })
      const anon = env.ctx({ kind: 'anonymous' })

      const typo = await searchCourses(anon, { q: 'javascrpit', limit: 24 })
      expect(typo.items.map((c) => c.title)).toEqual(['JavaScript for Beginners'])
      expect(typo.typoMatch).toBe(true)

      const exact = await searchCourses(anon, { q: 'excel', limit: 24 })
      expect(exact.items[0]?.title).toBe('Excel for Accountants')
      expect(exact.typoMatch).toBe(false)

      expect((await searchCourses(anon, { q: 'photography', limit: 24 })).items).toEqual([])
    })
  })

  it('redirects old slugs, hides unpublished courses and features live ones', async () => {
    await withRollback(async (db) => {
      await seedCatalog(db)
      const env = setup(db)
      const { owner, reviewer } = await people(db)
      const course = await publishCourse(env, owner, reviewer)
      const anon = env.ctx({ kind: 'anonymous' })

      await changeCourseSlug(env.ctx(owner), {
        courseId: course.id,
        version: course.version,
        slug: 'excel-month-end',
      })
      expect(await getPublicCourse(anon, course.slug)).toEqual({
        kind: 'redirect',
        slug: 'excel-month-end',
      })
      expect((await getPublicCourse(anon, 'excel-month-end')).kind).toBe('course')
      expect((await listCourses(anon, { limit: 24 })).items[0]?.slug).toBe('excel-month-end')

      await setFeatured(env.ctx(reviewer), {
        courseId: course.id,
        featured: true,
        reason: 'Strong first course.',
      })
      expect((await featuredCourses(anon)).map((c) => c.courseId)).toEqual([course.id])

      await setCourseListing(env.ctx(reviewer), {
        courseId: course.id,
        action: 'unpublish',
        reason: 'Copied videos reported.',
      })
      expect((await listCourses(anon, { limit: 24 })).items).toEqual([])
      expect(await featuredCourses(anon)).toEqual([])
      expect((await getPublicCourse(anon, 'excel-month-end')).kind).toBe('missing')

      await setCourseListing(env.ctx(reviewer), {
        courseId: course.id,
        action: 'restore',
        reason: 'Checked; original work.',
      })
      expect((await listCourses(anon, { limit: 24 })).items).toHaveLength(1)
      const learnerId = await insertUser(db)
      expect(
        await codeOf(
          setFeatured(env.ctx(testUser(['learner'], { userId: learnerId })), {
            courseId: course.id,
            featured: true,
            reason: 'x',
          }),
        ),
      ).toBe('STAFF_ONLY')
    })
  })

  it('plays preview lessons for anyone and nothing else', async () => {
    await withRollback(async (db) => {
      await seedCatalog(db)
      const env = setup(db)
      const { owner, reviewer } = await people(db)
      const course = await publishCourse(env, owner, reviewer)
      const anon = env.ctx({ kind: 'anonymous' })
      const [video, article] = course.sections[0]?.lessons ?? []

      const preview = await getPreviewPlayback(anon, {
        courseSlug: course.slug,
        lessonId: video?.id ?? '',
      })
      expect(preview.embedUrl).toContain('token=')
      expect(
        await codeOf(
          getPreviewPlayback(anon, { courseSlug: course.slug, lessonId: article?.id ?? '' }),
        ),
      ).toBe('NOT_ENROLLED')
      expect(
        await codeOf(
          getPreviewPlayback(anon, { courseSlug: 'no-such-course', lessonId: video?.id ?? '' }),
        ),
      ).toBe('COURSE_NOT_FOUND')
    })
  })

  it('lets admins edit categories, redirects renamed ones and refuses to delete used ones', async () => {
    await withRollback(async (db) => {
      await seedCatalog(db)
      const env = setup(db)
      const { owner, reviewer } = await people(db)
      await publishCourse(env, owner, reviewer)
      const adminId = await insertUser(db, { roles: ['learner', 'admin'] })
      const admin = env.ctx(testUser(['learner', 'admin'], { userId: adminId }))

      const created = await createCategory(admin, {
        name: 'Spreadsheet automation',
        parentId: top?.id ?? null,
        description: null,
      })
      expect(created.slug).toBe('spreadsheet-automation')
      await updateCategory(admin, {
        id: created.id,
        name: 'Automation',
        slug: 'automation',
        description: null,
      })
      expect(
        await getCategoryBySlug(env.ctx({ kind: 'anonymous' }), 'spreadsheet-automation'),
      ).toEqual({ redirect: 'automation' })

      expect(await codeOf(deleteCategory(admin, sub?.id ?? ''))).toBe('CATEGORY_IN_USE')
      expect(await codeOf(deleteCategory(admin, top?.id ?? ''))).toBe('CATEGORY_IN_USE')
      await deleteCategory(admin, created.id)
      expect(
        await codeOf(
          createCategory(env.ctx(reviewer), { name: 'Nope', parentId: null, description: null }),
        ),
      ).toBe('STAFF_ONLY')
    })
  })
})
