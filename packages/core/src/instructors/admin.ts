import { writeAudit } from '../admin'
import { track } from '../analytics'
import { getUserContact, grantInstructorRole } from '../identity'
import { type Ctx, inTransaction, provider } from '../kernel/ctx'
import { ConflictError, ForbiddenError, NotFoundError } from '../kernel/errors'
import { requireStaff } from '../kernel/guards'
import { sendEmail } from '../notifications'
import * as repo from './repo'
import { canReviewApplications, namesMatch, reapplyDate, slugify } from './rules'

// Reviewer side of onboarding (docs/07 §5 step 5, docs/20 /admin/instructors/applications).
// Staff need 2FA verified in this session (requireStaff). Every decision is audited.

const encodeCursor = (at: Date, id: string) =>
  Buffer.from(`${at.toISOString()}|${id}`).toString('base64url')

function decodeCursor(cursor: string | undefined): { at: Date; id: string } | null {
  if (!cursor) return null
  const [iso, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|')
  const at = new Date(iso ?? '')
  return id && !Number.isNaN(at.getTime()) ? { at, id } : null
}

const headlineOf = (answers: Record<string, unknown>) =>
  typeof answers.headline === 'string' ? answers.headline : null

export async function listApplications(
  ctx: Ctx,
  input: { status: repo.QueueFilter; cursor?: string | undefined; limit: number },
) {
  requireStaff(ctx.actor, canReviewApplications)
  const rows = await repo.listApplications(ctx.db, {
    filter: input.status,
    after: decodeCursor(input.cursor),
    limit: input.limit,
  })
  const page = rows.slice(0, input.limit)
  const userIds = page.map((r) => r.userId)
  const [kyc, payouts] = await Promise.all([
    repo.latestKycOfMany(ctx.db, userIds),
    repo.currentPayoutOfMany(ctx.db, userIds),
  ])
  const last = page.at(-1)
  const lastAt = last ? (input.status === 'open' ? last.submittedAt : last.decidedAt) : null
  return {
    items: page.map((r) => ({
      id: r.id,
      userId: r.userId,
      name: r.name,
      headline: headlineOf(r.answers),
      status: r.status,
      kycStatus: kyc.get(r.userId)?.status ?? null,
      payoutAccountStatus: payouts.get(r.userId)?.status ?? null,
      submittedAt: r.submittedAt,
    })),
    nextCursor: rows.length > input.limit && last && lastAt ? encodeCursor(lastAt, last.id) : null,
  }
}

export async function getApplicationDetail(ctx: Ctx, id: string) {
  requireStaff(ctx.actor, canReviewApplications)
  const app = await repo.getApplication(ctx.db, id)
  if (!app || app.status === 'draft') throw new NotFoundError('APPLICATION_NOT_FOUND')
  const [who, kyc, attempts, payout, previous, reviewer] = await Promise.all([
    repo.userSummary(ctx.db, app.userId),
    repo.latestKyc(ctx.db, app.userId),
    repo.kycAttempts(ctx.db, app.userId),
    repo.currentPayoutAccount(ctx.db, app.userId),
    repo.previousApplications(ctx.db, app.userId, app.id),
    app.reviewerId ? repo.userSummary(ctx.db, app.reviewerId) : Promise.resolve(undefined),
  ])
  if (!who) throw new NotFoundError('APPLICATION_NOT_FOUND')
  const answers = app.answers as Record<string, unknown>
  return {
    id: app.id,
    userId: app.userId,
    name: who.name,
    email: who.email,
    headline: headlineOf(answers),
    status: app.status,
    about: {
      ...(typeof answers.headline === 'string' ? { headline: answers.headline } : {}),
      ...(Array.isArray(answers.topics)
        ? { topics: answers.topics.filter((t): t is string => typeof t === 'string') }
        : {}),
      ...(typeof answers.experience === 'string' ? { experience: answers.experience } : {}),
    },
    expertise: app.expertise,
    sampleUrl: app.sampleUrl,
    decisionReason: app.decisionReason,
    submittedAt: app.submittedAt,
    decidedAt: app.decidedAt,
    reviewerName: reviewer?.name ?? null,
    kycStatus: kyc?.status ?? null,
    payoutAccountStatus: payout?.status ?? null,
    kyc: kyc
      ? {
          method: kyc.method,
          status: kyc.status,
          matchedName: kyc.matchedName,
          faceMatchScore: kyc.faceMatchScore === null ? null : Number(kyc.faceMatchScore),
          nameMatchesAccount: kyc.matchedName ? namesMatch(kyc.matchedName, who.name) : null,
          checkedAt: kyc.createdAt,
          attempts,
        }
      : null,
    payoutAccount: payout
      ? {
          bankName: payout.bankName,
          accountNumberLast4: payout.accountNumberLast4,
          accountName: payout.accountName,
          status: payout.status,
          nameMatchScore: payout.nameMatchScore === null ? null : Number(payout.nameMatchScore),
        }
      : null,
    previousApplications: previous,
  }
}

async function uniqueProfileSlug(ctx: Ctx, name: string): Promise<string> {
  const base = slugify(name)
  for (let i = 1; i < 50; i++) {
    const slug = i === 1 ? base : `${base}-${i}`
    if (!(await repo.isProfileSlugTaken(ctx.db, slug))) return slug
  }
  return `${base}-${Date.now().toString(36)}`
}

/**
 * Approve: instructor role, public profile, identity accepted (a manual-review KYC becomes
 * verified on the reviewer's word), bank account waiting for review activated. Reject: reason
 * shown to the applicant, who may reapply after 30 days.
 */
export async function decideApplication(
  ctx: Ctx,
  input: { id: string; decision: 'approve' | 'reject'; reason: string },
) {
  const reviewer = requireStaff(ctx.actor, canReviewApplications)
  const approved = input.decision === 'approve'

  const decided = await inTransaction(ctx, async (tx) => {
    const app = await repo.lockApplication(tx.db, input.id)
    if (!app || app.status === 'draft') throw new NotFoundError('APPLICATION_NOT_FOUND')
    if (app.userId === reviewer.userId) throw new ForbiddenError('SELF_REVIEW_NOT_ALLOWED')
    if (app.status !== 'submitted' && app.status !== 'in_review') {
      throw new ConflictError('APPLICATION_ALREADY_DECIDED')
    }
    const contact = await getUserContact(tx, app.userId)
    const urls = provider(tx, 'urls')

    await repo.updateApplication(tx.db, app.id, {
      status: approved ? 'approved' : 'rejected',
      reviewerId: reviewer.userId,
      decisionReason: input.reason,
      decidedAt: tx.now,
    })

    if (approved) {
      await grantInstructorRole(tx, app.userId)
      if (!(await repo.profileOf(tx.db, app.userId))) {
        await repo.insertProfile(tx.db, {
          userId: app.userId,
          slug: await uniqueProfileSlug(tx, contact.name),
          displayName: contact.name,
          approvedAt: tx.now,
        })
      }
      const kyc = await repo.latestKyc(tx.db, app.userId)
      if (kyc && kyc.status === 'manual_review') {
        await repo.updateKyc(tx.db, kyc.id, { status: 'verified', verifiedAt: tx.now })
      }
      const payout = await repo.currentPayoutAccount(tx.db, app.userId)
      if (payout?.status === 'pending_review') await repo.activatePayoutAccount(tx.db, payout.id)
    }

    await writeAudit(tx, {
      action: approved ? 'instructor_application.approve' : 'instructor_application.reject',
      targetType: 'instructor_application',
      targetId: app.id,
      before: { status: app.status },
      after: { status: approved ? 'approved' : 'rejected', reason: input.reason },
    })
    await tx.events.emit('instructor.application_decided', {
      applicationId: app.id,
      userId: app.userId,
      approved,
    })
    await sendEmail(tx, {
      id: 'application-decision',
      to: contact.email,
      data: {
        name: contact.name,
        approved,
        reason: approved ? null : input.reason,
        reapplyOn: approved ? null : reapplyDate(tx.now).toISOString(),
        url: approved ? `${urls.app}/teach/courses` : `${urls.app}/teach`,
      },
      businessKey: app.id,
    })
    return app
  })

  if (approved) {
    ctx.afterCommit(() =>
      track(ctx, 'instructor_application_approved', {}, { distinctId: decided.userId }),
    )
  }
  return getApplicationDetail(ctx, input.id)
}
