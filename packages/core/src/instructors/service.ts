import { ProviderError } from '@tokslearn/integrations/paystack'
import { track } from '../analytics'
import { getUserContact } from '../identity'
import { hasRecentStepUp, hasRole } from '../kernel/actor'
import { type Ctx, inTransaction, provider } from '../kernel/ctx'
import {
  ConflictError,
  ExternalServiceError,
  ForbiddenError,
  RuleViolationError,
} from '../kernel/errors'
import { requireUser } from '../kernel/guards'
import { sendEmail } from '../notifications'
import * as repo from './repo'
import {
  applicationGaps,
  type KycStatus,
  kycOutcome,
  NAME_MATCH_THRESHOLD,
  nameMatchScore,
  PAYOUT_HOLD_HOURS,
  reapplyDate,
} from './rules'

// Applicant side of instructor onboarding (docs/07 §5). Provider calls (Dojah, Paystack) happen
// outside DB transactions (docs/05 §3.6). ID numbers and full account numbers are passed through
// to the provider and never stored or logged.

export interface ApplicationAbout {
  headline: string
  topics: string[]
  experience: string
}

export interface ApplicationView {
  id: string
  status: repo.ApplicationRow['status']
  step: number
  about: Partial<ApplicationAbout>
  expertise: string | null
  sampleUrl: string | null
  decisionReason: string | null
  submittedAt: Date | null
  decidedAt: Date | null
  gaps: ReturnType<typeof applicationGaps>
}

export interface MyApplication {
  application: ApplicationView | null
  kyc: {
    status: repo.KycRow['status']
    method: 'bvn' | 'nin'
    matchedName: string | null
    checkedAt: Date
  } | null
  payoutAccount: repo.PayoutAccountRow | null
  canReapplyAt: Date | null
  isInstructor: boolean
}

const aboutOf = (row: repo.ApplicationRow): Partial<ApplicationAbout> => {
  const a = row.answers as Partial<ApplicationAbout>
  return {
    ...(typeof a.headline === 'string' ? { headline: a.headline } : {}),
    ...(Array.isArray(a.topics) ? { topics: a.topics.filter((t) => typeof t === 'string') } : {}),
    ...(typeof a.experience === 'string' ? { experience: a.experience } : {}),
  }
}

const hasAbout = (about: Partial<ApplicationAbout>) =>
  Boolean(about.headline && about.topics?.length && about.experience)

function view(
  row: repo.ApplicationRow,
  kyc: repo.KycRow | undefined,
  payout: repo.PayoutAccountRow | undefined,
): ApplicationView {
  const about = aboutOf(row)
  return {
    id: row.id,
    status: row.status,
    step: row.step,
    about,
    expertise: row.expertise,
    sampleUrl: row.sampleUrl,
    decisionReason: row.status === 'rejected' ? row.decisionReason : null,
    submittedAt: row.submittedAt,
    decidedAt: row.decidedAt,
    gaps: applicationGaps({
      hasAbout: hasAbout(about),
      hasExpertise: Boolean(row.expertise && row.sampleUrl),
      kycStatus: kyc?.status ?? null,
      hasPayoutAccount: Boolean(payout),
    }),
  }
}

export async function getMyApplication(ctx: Ctx): Promise<MyApplication> {
  const user = requireUser(ctx.actor)
  const [app, kyc, payout] = await Promise.all([
    repo.latestApplication(ctx.db, user.userId),
    repo.latestKyc(ctx.db, user.userId),
    repo.currentPayoutAccount(ctx.db, user.userId),
  ])
  const reapplyAt = app?.status === 'rejected' && app.decidedAt ? reapplyDate(app.decidedAt) : null
  return {
    application: app ? view(app, kyc, payout) : null,
    kyc: kyc
      ? {
          status: kyc.status,
          method: kyc.method,
          matchedName: kyc.matchedName,
          checkedAt: kyc.createdAt,
        }
      : null,
    payoutAccount: payout ?? null,
    canReapplyAt: reapplyAt && reapplyAt > ctx.now ? reapplyAt : null,
    isInstructor: hasRole(user, 'instructor'),
  }
}

/** Returns the open draft, creating one if allowed. Rejects edits once submitted. */
async function openDraft(ctx: Ctx, userId: string): Promise<repo.ApplicationRow> {
  const latest = await repo.latestApplication(ctx.db, userId)
  if (latest?.status === 'draft') return latest
  if (latest?.status === 'submitted' || latest?.status === 'in_review') {
    throw new ConflictError('APPLICATION_NOT_EDITABLE')
  }
  if (latest?.status === 'approved') throw new ConflictError('APPLICATION_EXISTS')
  if (latest?.status === 'rejected' && latest.decidedAt) {
    const allowed = reapplyDate(latest.decidedAt)
    if (allowed > ctx.now) {
      throw new RuleViolationError('REAPPLY_TOO_SOON', { date: allowed.toISOString() })
    }
  }
  const row = await repo.insertApplication(ctx.db, { userId })
  ctx.afterCommit(() => track(ctx, 'instructor_application_started'))
  return row
}

export async function saveApplication(
  ctx: Ctx,
  input: {
    about?: ApplicationAbout | undefined
    expertise?: { expertise: string; sampleUrl: string } | undefined
    step: number
  },
): Promise<MyApplication> {
  const user = requireUser(ctx.actor)
  if (hasRole(user, 'instructor')) throw new ConflictError('APPLICATION_EXISTS')
  await inTransaction(ctx, async (tx) => {
    const draft = await openDraft(tx, user.userId)
    await repo.updateApplication(tx.db, draft.id, {
      ...(input.about
        ? {
            answers: {
              ...draft.answers,
              headline: input.about.headline,
              topics: input.about.topics,
              experience: input.about.experience,
            },
          }
        : {}),
      ...(input.expertise
        ? { expertise: input.expertise.expertise, sampleUrl: input.expertise.sampleUrl }
        : {}),
      step: Math.max(draft.step, input.step),
    })
  })
  return getMyApplication(ctx)
}

export async function submitApplication(ctx: Ctx): Promise<MyApplication> {
  const user = requireUser(ctx.actor)
  const contact = await getUserContact(ctx, user.userId)
  const applicationId = await inTransaction(ctx, async (tx) => {
    const draft = await openDraft(tx, user.userId)
    const [kyc, payout] = await Promise.all([
      repo.latestKyc(tx.db, user.userId),
      repo.currentPayoutAccount(tx.db, user.userId),
    ])
    const { gaps } = view(draft, kyc, payout)
    if (gaps.length > 0) throw new RuleViolationError('APPLICATION_INCOMPLETE', { missing: gaps })
    await repo.updateApplication(tx.db, draft.id, {
      status: 'submitted',
      step: 4,
      submittedAt: tx.now,
    })
    await tx.events.emit('instructor.application_submitted', {
      applicationId: draft.id,
      userId: user.userId,
    })
    await sendEmail(tx, {
      id: 'application-received',
      to: contact.email,
      data: {
        name: contact.name,
        statusUrl: `${provider(tx, 'urls').app}/teach/apply`,
      },
      businessKey: draft.id,
    })
    return draft.id
  })
  ctx.afterCommit(() =>
    track(ctx, 'instructor_application_submitted', { application_id: applicationId }),
  )
  return getMyApplication(ctx)
}

// ─── Identity (KYC) ─────────────────────────────────────────────────────────────────────────────

export async function startKyc(
  ctx: Ctx,
  input: { method: 'bvn' | 'nin'; number: string; selfieImage: string },
) {
  const user = requireUser(ctx.actor)
  const latest = await repo.latestKyc(ctx.db, user.userId)
  if (latest?.status === 'verified') return latest
  const contact = await getUserContact(ctx, user.userId)

  let result: Awaited<ReturnType<ReturnType<typeof provider<'kyc'>>['verifyWithSelfie']>>
  try {
    result = await provider(ctx, 'kyc').verifyWithSelfie({
      method: input.method,
      number: input.number,
      selfieImageBase64: input.selfieImage,
    })
  } catch (error) {
    if (error instanceof ProviderError) {
      throw new ExternalServiceError('KYC_PROVIDER_UNAVAILABLE', {}, { cause: error })
    }
    throw error
  }

  const registeredName = [result.firstName, result.middleName, result.lastName]
    .filter(Boolean)
    .join(' ')
  const status: KycStatus = kycOutcome({
    found: result.outcome !== 'not_found',
    faceMatchScore: result.outcome === 'not_found' ? null : result.faceMatchScore,
    registeredName: registeredName || null,
    accountName: contact.name,
  })

  const check = await inTransaction(ctx, async (tx) => {
    const row = await repo.insertKyc(tx.db, {
      userId: user.userId,
      method: input.method,
      status,
      providerReference: result.providerReference,
      matchedName: registeredName || null,
      faceMatchScore: result.faceMatchScore === null ? null : result.faceMatchScore.toFixed(2),
      rawResultRedacted: result.redacted,
      verifiedAt: status === 'verified' ? tx.now : null,
    })
    await tx.events.emit('kyc.completed', { userId: user.userId, kycCheckId: row.id, status })
    if (status !== 'failed') {
      await sendEmail(tx, {
        id: 'kyc-result',
        to: contact.email,
        data: {
          name: contact.name,
          outcome: status,
          applyUrl: `${provider(tx, 'urls').app}/teach/apply`,
        },
        businessKey: row.id,
      })
    }
    return row
  })
  ctx.afterCommit(() => track(ctx, 'kyc_completed', { status }))
  if (status === 'failed') throw new RuleViolationError('KYC_FAILED')
  return check
}

export async function getKycStatus(ctx: Ctx) {
  const user = requireUser(ctx.actor)
  return (await repo.latestKyc(ctx.db, user.userId)) ?? null
}

// ─── Payout accounts ────────────────────────────────────────────────────────────────────────────

async function payoutsCall<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    if (error instanceof ProviderError) {
      throw new ExternalServiceError('BANK_PROVIDER_UNAVAILABLE', {}, { cause: error })
    }
    throw error
  }
}

export async function listBanks(ctx: Ctx) {
  requireUser(ctx.actor)
  return payoutsCall(() => provider(ctx, 'payouts').listBanks())
}

export async function resolveAccount(
  ctx: Ctx,
  input: { bankCode: string; accountNumber: string },
): Promise<{ accountName: string }> {
  requireUser(ctx.actor)
  const resolved = await payoutsCall(() => provider(ctx, 'payouts').resolveAccount(input))
  if (!resolved) throw new RuleViolationError('BANK_ACCOUNT_UNRESOLVED')
  return resolved
}

/**
 * Adds the account payouts go to (docs/07 §5 step 4). The first account during onboarding needs
 * no step-up; replacing one needs 2FA verified in the last 12 hours, starts a 72-hour payout hold
 * and emails a security notice.
 */
export async function addPayoutAccount(
  ctx: Ctx,
  input: { bankCode: string; accountNumber: string },
): Promise<repo.PayoutAccountRow> {
  const user = requireUser(ctx.actor)
  const [kyc, existing] = await Promise.all([
    repo.latestKyc(ctx.db, user.userId),
    repo.currentPayoutAccount(ctx.db, user.userId),
  ])
  if (!kyc?.matchedName || (kyc.status !== 'verified' && kyc.status !== 'manual_review')) {
    throw new ForbiddenError('KYC_REQUIRED')
  }
  if (existing) {
    if (!user.twoFactorEnabled) throw new ForbiddenError('TWO_FACTOR_REQUIRED')
    if (!hasRecentStepUp(user, ctx.now)) throw new ForbiddenError('STEP_UP_REQUIRED')
  }

  const payouts = provider(ctx, 'payouts')
  const [banks, resolved] = await Promise.all([
    payoutsCall(() => payouts.listBanks()),
    payoutsCall(() => payouts.resolveAccount(input)),
  ])
  const bank = banks.find((b) => b.code === input.bankCode)
  if (!bank || !resolved) throw new RuleViolationError('BANK_ACCOUNT_UNRESOLVED')

  const score = nameMatchScore(resolved.accountName, kyc.matchedName)
  const status =
    score >= NAME_MATCH_THRESHOLD && kyc.status === 'verified' ? 'active' : 'pending_review'
  // The recipient is created either way: we never keep the full number, so a reviewer can't
  // create it later. `status` is what gates payouts.
  const recipient = await payoutsCall(() =>
    payouts.createTransferRecipient({
      name: resolved.accountName,
      accountNumber: input.accountNumber,
      bankCode: input.bankCode,
    }),
  )

  const contact = existing ? await getUserContact(ctx, user.userId) : null
  return inTransaction(ctx, async (tx) => {
    await repo.disableOpenPayoutAccounts(tx.db, user.userId, tx.now)
    const payoutsAllowedFrom = existing
      ? new Date(tx.now.getTime() + PAYOUT_HOLD_HOURS * 60 * 60 * 1000)
      : tx.now
    const row = await repo.insertPayoutAccount(tx.db, {
      userId: user.userId,
      bankCode: bank.code,
      bankName: bank.name,
      accountNumberLast4: input.accountNumber.slice(-4),
      accountName: resolved.accountName,
      paystackRecipientCode: recipient.recipientCode,
      status,
      nameMatchScore: score.toFixed(3),
      payoutsAllowedFrom,
    })
    await tx.events.emit('payout_account.added', {
      userId: user.userId,
      payoutAccountId: row.id,
      replaced: Boolean(existing),
    })
    if (contact) {
      await sendEmail(tx, {
        id: 'payout-account-changed',
        to: contact.email,
        data: {
          name: contact.name,
          bankName: bank.name,
          last4: row.accountNumberLast4,
          payoutsFrom: payoutsAllowedFrom.toISOString(),
          securityUrl: `${provider(tx, 'urls').app}/account/settings/security`,
        },
        businessKey: row.id,
      })
    }
    return row
  })
}

export async function listPayoutAccounts(ctx: Ctx) {
  const user = requireUser(ctx.actor)
  return repo.payoutAccountsOf(ctx.db, user.userId)
}
