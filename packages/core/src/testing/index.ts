// Integration-test helpers shared by modules (courses, catalog). Test code only; not in the
// package exports.
import type { RichTextDoc } from '@tokslearn/contract'
import { type Db, schema, seedCategories } from '@tokslearn/db'
import { createFakeBunny } from '@tokslearn/integrations/bunny'
import { createFakeDaily } from '@tokslearn/integrations/daily'
import { createFakePaystack } from '@tokslearn/integrations/paystack'
import {
  createFakeCertificateRenderer,
  createFakeStatementRenderer,
} from '@tokslearn/integrations/pdf'
import { createFakeStorage } from '@tokslearn/integrations/r2'
import { eq } from 'drizzle-orm'
import { expect, vi } from 'vitest'
import {
  addLesson,
  addResource,
  addSection,
  createCourse,
  decideReview,
  getStudioCourse,
  listReviewQueue,
  onVideoAssetChanged,
  reviewChecklistKeys,
  type StudioCourse,
  startLessonVideoUpload,
  submitForReview,
  updateDetails,
  updateLesson,
  updatePricing,
} from '../courses'
import type { Actor, UserActor } from '../kernel/actor'
import { fixedClock } from '../kernel/clock'
import { createCtx } from '../kernel/ctx'
import { DomainError } from '../kernel/errors'
import { insertUser, testUser } from '../kernel/testing'
import { completeFileUpload, createFileUpload, refreshVideoAsset } from '../media'

export const category = seedCategories[0]?.children[0]?.id ?? ''
export const allTicked = Object.fromEntries(reviewChecklistKeys.map((k) => [k, true]))
export const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ')
export const doc = (text: string): RichTextDoc => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})

export function setup(db: Db) {
  const storage = createFakeStorage()
  const bunny = createFakeBunny()
  const paystack = createFakePaystack()
  const pdf = createFakeCertificateRenderer()
  const daily = createFakeDaily()
  const statements = createFakeStatementRenderer()
  const ctx = (actor: Actor, at = new Date('2026-09-26T10:00:00Z')) =>
    createCtx({
      db,
      actor,
      requestId: 'req-test',
      clock: fixedClock(at),
      providers: {
        storage,
        video: bunny.provider,
        live: daily.provider,
        payments: paystack.provider,
        certificatePdf: pdf,
        statementPdf: statements,
        sessions: { revokeSession: vi.fn(), revokeAllSessions: vi.fn() },
        urls: { app: 'https://tokslearn.test', cdn: 'https://cdn.tokslearn.test' },
        unsubscribe: {
          url: ({ userId, type }) =>
            `https://tokslearn.test/unsubscribe?u=${userId}&t=${type}&s=ok-${userId}`,
          verify: ({ userId, signature }) => signature === `ok-${userId}`,
        },
      },
    })
  return { ctx, storage, bunny, paystack, pdf, daily, statements }
}

export async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p
  } catch (e) {
    if (e instanceof DomainError) return e.code
    throw e
  }
  throw new Error('expected a DomainError')
}

export async function upload(
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

export interface CourseOptions {
  title?: string
  tags?: string[]
  priceKobo?: bigint
  refundPolicyDays?: 0 | 3 | 7 | 14
}

/** A course that passes the publish checklist: 2 sections, video + article + resource lessons. */
export async function buildCourse(
  env: ReturnType<typeof setup>,
  owner: UserActor,
  opts: CourseOptions = {},
): Promise<StudioCourse> {
  const title = opts.title ?? 'Excel for Accountants'
  const c = env.ctx(owner)
  let s = await createCourse(c, { title, categoryId: category })
  const cover = await upload(env, owner, 'cover', 'image/png')
  s = await updateDetails(c, {
    courseId: s.id,
    version: s.version,
    title,
    subtitle: 'Month-end reporting without the late nights',
    description: doc(words(60)),
    outcomes: ['Build lookups', 'Reconcile faster', 'Present pivots'],
    requirements: ['Excel 2016 or newer'],
    level: 'beginner',
    language: 'en',
    categoryId: category,
    coverFileId: cover,
    tags: opts.tags ?? ['Excel', 'Accounting'],
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
    priceKobo: opts.priceKobo ?? 1_500_000n,
    compareAtKobo: null,
    refundPolicyDays: opts.refundPolicyDays ?? 7,
  })
  return s
}

export async function people(db: Db) {
  const ownerId = await insertUser(db, { name: 'Tobi Adeleke', roles: ['learner', 'instructor'] })
  const reviewerId = await insertUser(db, { name: 'Kemi Reviewer', roles: ['learner', 'reviewer'] })
  const owner = testUser(['learner', 'instructor'], { userId: ownerId })
  const reviewer = testUser(['learner', 'reviewer'], { userId: reviewerId })
  return { owner, reviewer }
}

/** Builds a complete course and has a reviewer approve it. */
export async function publishCourse(
  env: ReturnType<typeof setup>,
  owner: UserActor,
  reviewer: UserActor,
  opts: CourseOptions = {},
) {
  const s = await buildCourse(env, owner, opts)
  await submitForReview(env.ctx(owner), { courseId: s.id, version: s.version })
  const [item] = (await listReviewQueue(env.ctx(reviewer))).filter((q) => q.courseId === s.id)
  await decideReview(env.ctx(reviewer), {
    revisionId: item?.revisionId ?? '',
    decision: 'approve',
    notes: 'Fine.',
    checklist: allTicked,
  })
  return getStudioCourse(env.ctx(owner), s.id)
}

/** Submits a published course's pending changes (e.g. a new lesson) and approves them. */
export async function approveChanges(
  env: ReturnType<typeof setup>,
  owner: UserActor,
  reviewer: UserActor,
  courseId: string,
) {
  const s = await getStudioCourse(env.ctx(owner), courseId)
  await submitForReview(env.ctx(owner), { courseId, version: s.version })
  const [item] = (await listReviewQueue(env.ctx(reviewer))).filter((q) => q.courseId === courseId)
  await decideReview(env.ctx(reviewer), {
    revisionId: item?.revisionId ?? '',
    decision: 'approve',
    notes: 'Fine.',
    checklist: allTicked,
  })
  return getStudioCourse(env.ctx(owner), courseId)
}
