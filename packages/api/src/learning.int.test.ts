import { createRouterClient } from '@orpc/server'
import { people, publishCourse, setup } from '@tokslearn/core/fixtures'
import { type Actor, anonymousActor } from '@tokslearn/core/kernel'
import { insertUser, testUser } from '@tokslearn/core/testing'
import { seedBadgeDefinitions, seedCatalog, seedCommission } from '@tokslearn/db/seed'
import { closeTestDb, withRollback } from '@tokslearn/db/testing'
import { afterAll, describe, expect, it } from 'vitest'
import { router } from './router'
import { testContext } from './test-context'

afterAll(closeTestDb)

describe('learning procedures', () => {
  it('plays, saves progress, keeps notes and refuses strangers', async () => {
    await withRollback(async (db) => {
      await seedCatalog(db)
      await seedCommission(db)
      await seedBadgeDefinitions(db)
      const env = setup(db)
      const { owner, reviewer } = await people(db)
      const course = await publishCourse(env, owner, reviewer)
      const providers = {
        payments: env.paystack.provider,
        video: env.bunny.provider,
        storage: env.storage,
        urls: { app: 'https://tokslearn.test', cdn: null },
      }
      const client = (actor: Actor = anonymousActor) =>
        createRouterClient(router, { context: testContext({ db, actor, providers }) })
      const buyer = client(
        testUser(['learner'], { userId: await insertUser(db, { roles: ['learner'] }) }),
      )
      const stranger = client(
        testUser(['learner'], { userId: await insertUser(db, { roles: ['learner'] }) }),
      )

      await buyer.cart.add({ itemType: 'course', itemId: course.id })
      const started = await buyer.checkout.start({
        expectedTotalKobo: '1500000',
        idempotencyKey: 'learn-checkout',
      })
      await buyer.checkout.confirm({ reference: started.publicId })

      const outline = await buyer.learn.getCourseOutline({ courseSlug: course.slug })
      expect(outline).toMatchObject({ role: 'learner', progressPct: 0 })
      const [video, article] = outline.sections[0]?.lessons ?? []
      expect(video?.type).toBe('video')
      const lessonId = video?.id ?? ''

      const play = await buyer.learn.playback({ lessonId })
      expect(typeof play.expiresAt).toBe('string')
      expect(play.resumeAt).toBe(0)
      const beat = await buyer.progress.heartbeat({
        lessonId,
        positionSec: 40,
        watchedDeltaSec: 20,
      })
      expect(beat).toMatchObject({ recorded: true, status: 'in_progress', positionSec: 40 })
      expect((await buyer.learn.playback({ lessonId })).resumeAt).toBe(40)
      expect(await buyer.learn.continue()).toMatchObject({ lessonId, positionSec: 40 })

      const done = await buyer.progress.markComplete({ lessonId: article?.id ?? '' })
      expect(done).toMatchObject({ completedNow: true, courseProgressPct: 33 })
      const progress = await buyer.progress.getCourse({ courseId: course.id })
      expect(progress.lessons.find((l) => l.status === 'completed')?.completedAt).toEqual(
        expect.any(String),
      )

      const note = await buyer.notes.create({
        lessonId,
        positionSec: 40,
        body: 'Check the SUMIF range',
      })
      expect((await buyer.notes.list({ courseId: course.id })).items[0]).toMatchObject({
        id: note.id,
        positionSec: 40,
      })
      expect((await buyer.notes.export({})).markdown).toContain('[0:40] Check the SUMIF range')
      expect(await buyer.bookmarks.toggle({ lessonId, positionSec: 40 })).toEqual({
        bookmarked: true,
      })
      expect((await buyer.bookmarks.list({ courseId: course.id })).items).toHaveLength(1)
      expect((await buyer.engagement.getStreak()).current).toBe(1)
      expect((await buyer.engagement.listBadges()).items).toHaveLength(8)

      // The video is a free preview; the article is paid-only.
      const paid = article?.id ?? ''
      for (const call of [
        () => stranger.learn.playback({ lessonId: paid }),
        () => stranger.learn.getLesson({ lessonId: paid }),
        () => stranger.notes.create({ lessonId: paid, body: 'x' }),
      ]) {
        await expect(call()).rejects.toMatchObject({
          code: 'FORBIDDEN',
          data: { code: 'NOT_ENROLLED' },
        })
      }
      await expect(client().learn.playback({ lessonId })).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      })
      await expect(stranger.notes.delete({ noteId: note.id })).rejects.toMatchObject({
        data: { code: 'NOTE_NOT_FOUND' },
      })
      await expect(stranger.studio.learners.list({ courseId: course.id })).rejects.toMatchObject({
        data: { code: 'COURSE_NOT_FOUND' },
      })

      const teacher = client(owner)
      const learners = await teacher.studio.learners.list({ courseId: course.id })
      expect(learners.items[0]).toMatchObject({ progressPct: 33, lastActiveAt: expect.any(String) })
      const drip = await teacher.studio.drip.get({ courseId: course.id })
      const saved = await teacher.studio.drip.update({
        courseId: course.id,
        version: drip.version,
        mode: 'fixed_dates',
        lessons: [
          { lessonId: drip.lessons[2]?.lessonId ?? '', offsetDays: null, date: '2030-01-15' },
        ],
      })
      expect(saved.lessons[2]).toMatchObject({ date: '2030-01-15' })
      await expect(
        buyer.learn.getLesson({ lessonId: saved.lessons[2]?.lessonId ?? '' }),
      ).rejects.toMatchObject({
        data: { code: 'LESSON_LOCKED' },
      })
    })
  })
})
