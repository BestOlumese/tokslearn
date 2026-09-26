import type { RichTextDoc } from '@tokslearn/contract'
import { type Db, schema, seedCategories } from '@tokslearn/db'
import { seedCatalog } from '@tokslearn/db/seed'
import { closeTestDb, withRollback } from '@tokslearn/db/testing'
import { createFakeBunny } from '@tokslearn/integrations/bunny'
import { createFakeStorage } from '@tokslearn/integrations/r2'
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it, vi } from 'vitest'
import type { Actor, UserActor } from '../kernel/actor'
import { fixedClock } from '../kernel/clock'
import { createCtx } from '../kernel/ctx'
import { DomainError } from '../kernel/errors'
import { insertUser, testUser } from '../kernel/testing'
import { completeFileUpload, createFileUpload } from '../media'
import {
  addLesson,
  addResource,
  addSection,
  addStaff,
  createBundle,
  createCourse,
  decideReview,
  getReview,
  getStudioCourse,
  listReviewQueue,
  onVideoAssetChanged,
  removeLesson,
  reviewChecklistKeys,
  type StudioCourse,
  startLessonVideoUpload,
  submitForReview,
  updateDetails,
  updateLesson,
  updatePricing,
} from '.'

afterAll(closeTestDb)

const category = seedCategories[0]?.children[0]?.id ?? ''
const allTicked = Object.fromEntries(reviewChecklistKeys.map((k) => [k, true]))
const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ')
const doc = (text: string): RichTextDoc => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})

function setup(db: Db) {
  const storage = createFakeStorage()
  const bunny = createFakeBunny()
  const ctx = (actor: Actor, at = new Date('2026-09-26T10:00:00Z')) =>
    createCtx({
      db,
      actor,
      requestId: 'req-test',
      clock: fixedClock(at),
      providers: {
        storage,
        video: bunny.provider,
        sessions: { revokeSession: vi.fn(), revokeAllSessions: vi.fn() },
        urls: { app: 'https://tokslearn.test', cdn: 'https://cdn.tokslearn.test' },
      },
    })
  return { ctx, storage, bunny }
}

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p
  } catch (e) {
    if (e instanceof DomainError) return e.code
    throw e
  }
  throw new Error('expected a DomainError')
}

async function upload(
  env: ReturnType<typeof setup>,
  actor: Actor,
  purpose: 'cover' | 'resource',
  mime: string,
) {
  const up = await createFileUpload(env.ctx(actor), {
    purpose,
    filename: `f.${purpose}`,
    mime,
    sizeBytes: 2048,
  })
  const [file] = await env
    .ctx(actor)
    .db.select()
    .from(schema.files)
    .where(eq(schema.files.id, up.fileId))
  env.storage.putObject(file?.bucket ?? 'public', file?.key ?? '', 2048, mime)
  await completeFileUpload(env.ctx(actor), up.fileId)
  return up.fileId
}

/** A course that passes the publish checklist: 2 sections, video + article + resource lessons. */
async function buildCourse(env: ReturnType<typeof setup>, owner: UserActor): Promise<StudioCourse> {
  const c = env.ctx(owner)
  let s = await createCourse(c, { title: 'Excel for Accountants', categoryId: category })
  const cover = await upload(env, owner, 'cover', 'image/png')
  s = await updateDetails(c, {
    courseId: s.id,
    version: s.version,
    title: 'Excel for Accountants',
    subtitle: 'Month-end reporting without the late nights',
    description: doc(words(60)),
    outcomes: ['Build lookups', 'Reconcile faster', 'Present pivots'],
    requirements: ['Excel 2016 or newer'],
    level: 'beginner',
    language: 'en',
    categoryId: category,
    coverFileId: cover,
    tags: ['Excel', 'Accounting'],
  })
  s = await addSection(c, { courseId: s.id, version: s.version, title: 'Getting started' })
  s = await addSection(c, { courseId: s.id, version: s.version, title: 'Reporting' })
  const [first, second] = s.sections
  s = await addLesson(c, {
    courseId: s.id,
    version: s.version,
    sectionId: first?.id ?? '',
    type: 'video',
    title: 'Welcome',
  })
  s = await addLesson(c, {
    courseId: s.id,
    version: s.version,
    sectionId: first?.id ?? '',
    type: 'article',
    title: 'Shortcuts',
  })
  s = await addLesson(c, {
    courseId: s.id,
    version: s.version,
    sectionId: second?.id ?? '',
    type: 'resource',
    title: 'Templates',
  })
  const [video, article] = s.sections[0]?.lessons ?? []
  const resourceLesson = s.sections[1]?.lessons[0]

  const started = await startLessonVideoUpload(c, {
    courseId: s.id,
    version: s.version,
    lessonId: video?.id ?? '',
    filename: 'welcome.mp4',
    sizeBytes: 50_000_000,
    mime: 'video/mp4',
  })
  expect(started.upload.headers.AuthorizationSignature).toBeTruthy()
  expect(JSON.stringify(started.upload)).not.toContain('api')
  s = started.studio
  const [asset] = await c.db
    .select()
    .from(schema.videoAssets)
    .where(eq(schema.videoAssets.id, started.videoAssetId))
  env.bunny.setVideo(asset?.providerVideoId ?? '', { status: 'ready', durationSec: 1900 })
  const { refreshVideoAsset } = await import('../media')
  await refreshVideoAsset(c, started.videoAssetId)
  await onVideoAssetChanged(c, started.videoAssetId)
  s = await getStudioCourse(c, s.id)

  s = await updateLesson(c, {
    courseId: s.id,
    version: s.version,
    lessonId: video?.id ?? '',
    isPreview: true,
  })
  s = await updateLesson(c, {
    courseId: s.id,
    version: s.version,
    lessonId: article?.id ?? '',
    article: doc(words(400)),
  })
  const file = await upload(env, owner, 'resource', 'application/pdf')
  s = await addResource(c, {
    courseId: s.id,
    version: s.version,
    lessonId: resourceLesson?.id ?? '',
    fileId: file,
    title: 'Month-end template',
    isImportant: true,
  })
  s = await updatePricing(c, {
    courseId: s.id,
    version: s.version,
    priceKobo: 1_500_000n,
    compareAtKobo: null,
    refundPolicyDays: 7,
  })
  return s
}

async function people(db: Db) {
  const ownerId = await insertUser(db, { name: 'Tobi Adeleke', roles: ['learner', 'instructor'] })
  const reviewerId = await insertUser(db, { name: 'Kemi Reviewer', roles: ['learner', 'reviewer'] })
  const owner = testUser(['learner', 'instructor'], { userId: ownerId })
  const reviewer = testUser(['learner', 'reviewer'], { userId: reviewerId })
  return { owner, reviewer }
}

describe('course authoring and review', () => {
  it('builds, submits and publishes a course with video, article and resource lessons', async () => {
    await withRollback(async (db) => {
      await seedCatalog(db)
      const env = setup(db)
      const { owner, reviewer } = await people(db)
      let s = await buildCourse(env, owner)
      expect(s.checklist.filter((i) => !i.done)).toEqual([])
      expect(s.sections.map((x) => x.lessons.length)).toEqual([2, 1])

      const submitted = await submitForReview(env.ctx(owner), {
        courseId: s.id,
        version: s.version,
      })
      expect(submitted.outcome).toBe('submitted')
      expect(submitted.studio.status).toBe('in_review')
      expect(
        await codeOf(
          addSection(env.ctx(owner), {
            courseId: s.id,
            version: submitted.studio.version,
            title: 'More',
          }),
        ),
      ).toBe('COURSE_NOT_EDITABLE')

      const queue = await listReviewQueue(env.ctx(reviewer))
      const item = queue.find((q) => q.courseId === s.id)
      expect(item).toMatchObject({ isUpdate: false, instructorName: 'Tobi Adeleke' })
      const review = await getReview(env.ctx(reviewer), item?.revisionId ?? '')
      expect(review.diff.firstVersion).toBe(true)
      expect(review.outline.flatMap((x) => x.lessons).map((l) => l.type)).toEqual([
        'video',
        'article',
        'resource',
      ])

      expect(
        await codeOf(
          decideReview(env.ctx(reviewer), {
            revisionId: review.revisionId,
            decision: 'approve',
            notes: 'Good.',
            checklist: {},
          }),
        ),
      ).toBe('VALIDATION_FAILED')
      await decideReview(env.ctx(reviewer), {
        revisionId: review.revisionId,
        decision: 'approve',
        notes: 'Clear audio, accurate description.',
        checklist: allTicked,
      })
      s = await getStudioCourse(env.ctx(owner), s.id)
      expect(s.status).toBe('published')
      const [course] = await db.select().from(schema.courses).where(eq(schema.courses.id, s.id))
      expect(course).toMatchObject({ priceKobo: 1_500_000n, lessonCount: 3, categoryId: category })
      expect(course?.totalDurationSec).toBeGreaterThanOrEqual(1900)
      const events = await db.select({ name: schema.outbox.eventName }).from(schema.outbox)
      expect(events.map((e) => e.name)).toEqual(
        expect.arrayContaining(['course.submitted', 'course.published']),
      )
    })
  })

  it('blocks submitting an incomplete course and names what is missing', async () => {
    await withRollback(async (db) => {
      await seedCatalog(db)
      const env = setup(db)
      const { owner } = await people(db)
      const s = await createCourse(env.ctx(owner), { title: 'Draft only', categoryId: category })
      try {
        await submitForReview(env.ctx(owner), { courseId: s.id, version: s.version })
        throw new Error('expected failure')
      } catch (e) {
        expect(e).toBeInstanceOf(DomainError)
        expect((e as DomainError).code).toBe('PUBLISH_CHECKLIST_INCOMPLETE')
        expect((e as DomainError).details.missing).toEqual(
          expect.arrayContaining(['cover', 'curriculum', 'description']),
        )
      }
    })
  })

  it('only the owner or an admin edits; a TA cannot change pricing; stale tabs conflict', async () => {
    await withRollback(async (db) => {
      await seedCatalog(db)
      const env = setup(db)
      const { owner } = await people(db)
      const s = await createCourse(env.ctx(owner), {
        title: 'Guarded course',
        categoryId: category,
      })
      const taId = await insertUser(db, {
        name: 'Tayo Assistant',
        username: 'tayo',
        roles: ['learner'],
      })
      await addStaff(env.ctx(owner), { courseId: s.id, emailOrUsername: '@tayo' })
      const ta = testUser(['learner'], { userId: taId })
      const pricing = {
        courseId: s.id,
        version: s.version,
        priceKobo: 200_000n,
        compareAtKobo: null,
        refundPolicyDays: 7 as const,
      }

      expect(await codeOf(updatePricing(env.ctx(ta), pricing))).toBe('NOT_COURSE_OWNER')
      expect((await getStudioCourse(env.ctx(ta), s.id)).canEdit).toBe(false)
      const strangerId = await insertUser(db, { roles: ['learner', 'instructor'] })
      const stranger = testUser(['learner', 'instructor'], { userId: strangerId })
      expect(await codeOf(updatePricing(env.ctx(stranger), pricing))).toBe('COURSE_NOT_FOUND')
      expect(await codeOf(getStudioCourse(env.ctx(stranger), s.id))).toBe('COURSE_NOT_FOUND')

      const adminId = await insertUser(db, { roles: ['learner', 'admin'] })
      const updated = await updatePricing(
        env.ctx(testUser(['learner', 'admin'], { userId: adminId })),
        pricing,
      )
      expect(updated.revision.priceKobo).toBe(200_000n)
      expect(await codeOf(updatePricing(env.ctx(owner), pricing))).toBe('VERSION_CONFLICT')
      expect(await codeOf(createCourse(env.ctx(ta), { title: 'Nope', categoryId: category }))).toBe(
        'INSTRUCTOR_REQUIRED',
      )
    })
  })

  it('after publishing: typo fixes go live at once, a 60% price rise waits for review, removals apply on approval', async () => {
    await withRollback(async (db) => {
      await seedCatalog(db)
      const env = setup(db)
      const { owner, reviewer } = await people(db)
      let s = await buildCourse(env, owner)
      const first = await submitForReview(env.ctx(owner), { courseId: s.id, version: s.version })
      const [rev] = (await listReviewQueue(env.ctx(reviewer))).filter((q) => q.courseId === s.id)
      await decideReview(env.ctx(reviewer), {
        revisionId: rev?.revisionId ?? '',
        decision: 'approve',
        notes: 'Fine.',
        checklist: allTicked,
      })
      s = await getStudioCourse(env.ctx(owner), first.studio.id)

      // Typo in the subtitle → approved automatically.
      s = await updateDetails(env.ctx(owner), {
        courseId: s.id,
        version: s.version,
        title: s.revision.title,
        subtitle: 'Month-end reporting without late nights',
        description: s.revision.descriptionDoc,
        outcomes: s.revision.outcomes,
        requirements: s.revision.requirements,
        level: s.revision.level,
        language: s.revision.language,
        categoryId: category,
        coverFileId: s.revision.coverFileId,
        tags: s.tags,
      })
      const auto = await submitForReview(env.ctx(owner), { courseId: s.id, version: s.version })
      expect(auto.outcome).toBe('auto_approved')
      expect(auto.studio.revision.subtitle).toBe('Month-end reporting without late nights')

      // 60% price rise + removing a live lesson → needs a reviewer; the live price holds.
      s = auto.studio
      s = await updatePricing(env.ctx(owner), {
        courseId: s.id,
        version: s.version,
        priceKobo: 2_400_000n,
        compareAtKobo: null,
        refundPolicyDays: 7,
      })
      const articleId = s.sections[0]?.lessons[1]?.id ?? ''
      s = await removeLesson(env.ctx(owner), {
        courseId: s.id,
        version: s.version,
        lessonId: articleId,
      })
      expect(s.sections[0]?.lessons[1]?.removalRequested).toBe(true)
      const pending = await submitForReview(env.ctx(owner), { courseId: s.id, version: s.version })
      expect(pending.outcome).toBe('submitted')
      expect(pending.studio.status).toBe('published')
      const [live] = await db.select().from(schema.courses).where(eq(schema.courses.id, s.id))
      expect(live?.priceKobo).toBe(1_500_000n)

      const [update] = (await listReviewQueue(env.ctx(reviewer))).filter((q) => q.courseId === s.id)
      expect(update?.isUpdate).toBe(true)
      const review = await getReview(env.ctx(reviewer), update?.revisionId ?? '')
      expect(review.diff.fields.map((f) => f.field)).toContain('priceKobo')
      expect(review.diff.outline).toEqual([
        { kind: 'lesson_removed', title: 'Shortcuts', section: 'Getting started' },
      ])
      await decideReview(env.ctx(reviewer), {
        revisionId: review.revisionId,
        decision: 'approve',
        notes: 'Price is fair.',
        checklist: allTicked,
      })
      const [after] = await db.select().from(schema.courses).where(eq(schema.courses.id, s.id))
      expect(after).toMatchObject({ priceKobo: 2_400_000n, lessonCount: 2 })
    })
  })

  it('request changes sends the course back with notes; editing reopens the draft', async () => {
    await withRollback(async (db) => {
      await seedCatalog(db)
      const env = setup(db)
      const { owner, reviewer } = await people(db)
      let s = await buildCourse(env, owner)
      await submitForReview(env.ctx(owner), { courseId: s.id, version: s.version })
      const [item] = (await listReviewQueue(env.ctx(reviewer))).filter((q) => q.courseId === s.id)
      await decideReview(env.ctx(reviewer), {
        revisionId: item?.revisionId ?? '',
        decision: 'request_changes',
        notes: 'Quality: lesson 1 audio is too quiet. Re-record it.',
        checklist: { rights: true },
      })
      s = await getStudioCourse(env.ctx(owner), s.id)
      expect(s.status).toBe('changes_requested')
      expect(s.revision.reviewNotes).toContain('audio')
      s = await addSection(env.ctx(owner), { courseId: s.id, version: s.version, title: 'Bonus' })
      expect(s.revision.status).toBe('draft')
      const emails = await db.select({ payload: schema.outbox.payload }).from(schema.outbox)
      expect(emails.map((e) => (e.payload as { id?: string }).id)).toContain(
        'course-review-decision',
      )
      expect(
        await codeOf(
          decideReview(env.ctx(owner), {
            revisionId: item?.revisionId ?? '',
            decision: 'approve',
            notes: 'x',
            checklist: allTicked,
          }),
        ),
      ).toBe('STAFF_ONLY')
    })
  })

  it('bundles need two published courses to go active', async () => {
    await withRollback(async (db) => {
      await seedCatalog(db)
      const env = setup(db)
      const { owner } = await people(db)
      const a = await createCourse(env.ctx(owner), { title: 'Course A', categoryId: category })
      const b = await createCourse(env.ctx(owner), { title: 'Course B', categoryId: category })
      const draft = await createBundle(env.ctx(owner), {
        title: 'Excel starter pack',
        description: null,
        priceKobo: 2_000_000n,
        courseIds: [a.id, b.id],
        status: 'draft',
      })
      expect(draft).toMatchObject({ slug: 'excel-starter-pack-bundle', courseIds: [a.id, b.id] })
      expect(
        await codeOf(
          createBundle(env.ctx(owner), {
            title: 'Active pack',
            description: null,
            priceKobo: 2_000_000n,
            courseIds: [a.id, b.id],
            status: 'active',
          }),
        ),
      ).toBe('VALIDATION_FAILED')
    })
  })
})
