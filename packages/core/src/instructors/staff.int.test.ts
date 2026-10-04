import { schema } from '@tokslearn/db'
import { seedCatalog, seedCommission } from '@tokslearn/db/seed'
import { closeTestDb, withRollback } from '@tokslearn/db/testing'
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { insertUser, testUser } from '../kernel/testing'
import { codeOf, people, publishCourse, setup } from '../testing'
import { getInstructorDetail, issueStrike, listInstructors, revokeStrike } from '.'

afterAll(closeTestDb)

const NOW = new Date('2026-10-04T10:00:00Z')

describe('instructors in the back office', () => {
  it('lists and shows instructors, records strikes the instructor hears about, and revokes them', async () => {
    await withRollback(async (db) => {
      await seedCatalog(db)
      await seedCommission(db)
      const env = setup(db)
      const { owner, reviewer } = await people(db)
      const course = await publishCourse(env, owner, reviewer)
      // Approval creates the public profile (people() makes the role only).
      await db
        .insert(schema.instructorProfiles)
        .values({ userId: owner.userId, slug: 'tobi-test', displayName: 'Tobi', approvedAt: NOW })
        .onConflictDoNothing()
      const staff = async (roles: Array<'reviewer' | 'admin' | 'learner'>) => {
        const id = await insertUser(db, { roles: ['learner', ...roles] })
        return env.ctx(testUser(['learner', ...roles], { userId: id }), NOW)
      }
      const rev = await staff(['reviewer'])
      const admin = await staff(['admin'])

      const list = await listInstructors(rev, {})
      const row = list.items.find((i) => i.userId === owner.userId)
      expect(row).toMatchObject({ publishedCourses: 1, learners: 0, availableKobo: 0n, strikes: 0 })
      const [first] = (await listInstructors(rev, { q: row?.email.slice(0, 6) ?? '' })).items
      expect(first?.userId).toBe(owner.userId)

      let detail = await getInstructorDetail(rev, owner.userId)
      expect(detail.courses).toEqual([
        expect.objectContaining({ id: course.id, status: 'published', learners: 0 }),
      ])
      expect(detail).toMatchObject({ activeStrikes: 0, kycStatus: null, payoutAccount: null })

      detail = await issueStrike(rev, {
        instructorId: owner.userId,
        rule: 'A3 Rights',
        reason: 'Lesson 4 uses a paid template pack without a licence.',
        courseId: course.id,
      })
      expect(detail.activeStrikes).toBe(1)
      expect(detail.strikes[0]).toMatchObject({ rule: 'A3 Rights', active: true })
      const notices = await db
        .select()
        .from(schema.notifications)
        .where(eq(schema.notifications.userId, owner.userId))
      expect(notices.map((n) => n.type)).toContain('instructor.strike')
      const mails = (await db.select().from(schema.outbox))
        .map((o) => o.payload as { id?: string })
        .filter((p) => p.id === 'instructor-strike')
      expect(mails).toHaveLength(1)

      // Reviewers issue; only admins revoke. Revoked strikes stay on record.
      const strikeId = detail.strikes[0]?.id ?? ''
      expect(await codeOf(revokeStrike(rev, { strikeId, reason: 'Licence shown.' }))).toBe(
        'STAFF_ONLY',
      )
      detail = await revokeStrike(admin, { strikeId, reason: 'The instructor showed the licence.' })
      expect(detail.activeStrikes).toBe(0)
      expect(detail.strikes[0]).toMatchObject({
        active: false,
        revokeReason: expect.stringContaining('licence'),
      })
      expect(await codeOf(revokeStrike(admin, { strikeId, reason: 'again' }))).toBe(
        'STRIKE_NOT_FOUND',
      )

      const actions = (await db.select().from(schema.auditLog)).map((a) => a.action)
      expect(actions).toEqual(
        expect.arrayContaining(['instructor.strike_issued', 'instructor.strike_revoked']),
      )
      const learner = env.ctx(testUser(['learner'], { userId: owner.userId }), NOW)
      expect(await codeOf(listInstructors(learner, {}))).toBe('STAFF_ONLY')
      expect(await codeOf(getInstructorDetail(rev, reviewer.userId))).toBe('USER_NOT_FOUND')
    })
  })
})
