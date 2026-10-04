import { schema } from '@tokslearn/db'
import { eq, inArray } from 'drizzle-orm'
import { hasRecentStepUp, hasRole, type UserActor } from '../kernel/actor'
import { type Ctx, inTransaction } from '../kernel/ctx'
import { ForbiddenError, NotFoundError, ValidationError } from '../kernel/errors'
import { requireStaff } from '../kernel/guards'
import { writeAudit } from './service'

// Platform settings (docs/20 `/admin/settings/platform`, ADR-047). Only keys the code reads are
// editable, each with its limits; super admins change them with a fresh 2FA code, audit-logged.
// Readers call `getSetting` with their own parser and default, so a missing row is fine.

const { settings } = schema

export type SettingKind = 'int' | 'kobo' | 'choice' | 'dates'
export type SettingGroup = 'refunds' | 'payouts' | 'checkout' | 'reviews'

export interface SettingDef {
  key: string
  group: SettingGroup
  label: string
  description: string
  kind: SettingKind
  /** For int and kobo (kobo bounds in kobo). */
  min?: number
  max?: number
  /** For choice. */
  options?: ReadonlyArray<{ value: string; label: string }>
  /** Shown when the row doesn't exist; the readers use the same default. */
  defaultValue: number | string | string[]
}

export const platformSettings: ReadonlyArray<SettingDef> = [
  {
    key: 'refund_consumption_threshold_pct',
    group: 'refunds',
    label: 'Watched share that ends the refund right',
    description: 'Once a learner has watched this much of a course, refunds are declined.',
    kind: 'int',
    min: 5,
    max: 100,
    defaultValue: 30,
  },
  {
    key: 'refund_abuse_limit',
    group: 'refunds',
    label: 'Refunds in 90 days before finance reviews',
    description:
      'A learner with this many approved refunds in 90 days goes to finance instead of an instant approval.',
    kind: 'int',
    min: 1,
    max: 50,
    defaultValue: 3,
  },
  {
    key: 'min_payout_kobo',
    group: 'payouts',
    label: 'Minimum payout',
    description: 'Instructors with less available are paid the next month.',
    kind: 'kobo',
    min: 100_000,
    max: 100_000_000,
    defaultValue: '500000',
  },
  {
    key: 'payout_day',
    group: 'payouts',
    label: 'Payout day of the month',
    description:
      'Transfers start on this day, moved to the next working day past weekends and holidays.',
    kind: 'int',
    min: 2,
    max: 28,
    defaultValue: 5,
  },
  {
    key: 'payout_cosign_threshold_kobo',
    group: 'payouts',
    label: 'Co-sign above',
    description: 'A payout run over this total also needs a super admin who didn’t approve it.',
    kind: 'kobo',
    min: 100_000,
    max: 100_000_000_000,
    defaultValue: '500000000',
  },
  {
    key: 'public_holidays',
    group: 'payouts',
    label: 'Public holidays',
    description:
      'Days (YYYY-MM-DD) when no transfers go out. Add each year’s dates as they’re announced.',
    kind: 'dates',
    defaultValue: [],
  },
  {
    key: 'gateway_fee_bearer',
    group: 'checkout',
    label: 'Who carries the Paystack fee',
    description: 'Applies to orders from now on.',
    kind: 'choice',
    options: [
      { value: 'proportional', label: 'Shared by commission rate (instructor and Tokslearn)' },
      { value: 'platform', label: 'Tokslearn pays all of it' },
    ],
    defaultValue: 'proportional',
  },
  {
    key: 'review_min_progress_pct',
    group: 'reviews',
    label: 'Progress needed to review',
    description:
      'A learner can review after finishing this share of a course, or the learning time below.',
    kind: 'int',
    min: 0,
    max: 100,
    defaultValue: 20,
  },
  {
    key: 'review_min_learning_min',
    group: 'reviews',
    label: 'Learning time needed to review (minutes)',
    description: 'The other way to become eligible to review.',
    kind: 'int',
    min: 0,
    max: 600,
    defaultValue: 30,
  },
]

const canViewSettings = (a: UserActor) => hasRole(a, 'finance', 'admin', 'super_admin')

export interface PlatformSetting extends SettingDef {
  value: number | string | string[]
  updatedAt: Date | null
}

/** `admin.settings.list`: every editable setting with its current value. */
export async function listPlatformSettings(ctx: Ctx): Promise<PlatformSetting[]> {
  requireStaff(ctx.actor, canViewSettings)
  const rows = await ctx.db
    .select()
    .from(settings)
    .where(
      inArray(
        settings.key,
        platformSettings.map((s) => s.key),
      ),
    )
  return platformSettings.map((def) => {
    const row = rows.find((r) => r.key === def.key)
    return {
      ...def,
      value: row ? normalizeStored(def, row.value) : def.defaultValue,
      updatedAt: row?.updatedAt ?? null,
    }
  })
}

function normalizeStored(def: SettingDef, v: unknown): number | string | string[] {
  if (def.kind === 'dates') return Array.isArray(v) ? v.map(String) : []
  if (def.kind === 'int') return Number(v)
  return String(v)
}

/** Validates a value for a key; returns what's stored. Kobo is kept as a string (bigint-safe). */
export function parseSettingValue(def: SettingDef, input: unknown): number | string | string[] {
  const bad = (message: string) => new ValidationError([{ path: 'value', message }])
  switch (def.kind) {
    case 'int': {
      const n = typeof input === 'number' ? input : Number(input)
      if (!Number.isInteger(n)) throw bad('Enter a whole number.')
      if ((def.min !== undefined && n < def.min) || (def.max !== undefined && n > def.max)) {
        throw bad(`Enter a number from ${def.min} to ${def.max}.`)
      }
      return n
    }
    case 'kobo': {
      const s = String(input)
      if (!/^\d+$/.test(s)) throw bad('Enter an amount in kobo, digits only.')
      const k = BigInt(s)
      if (
        (def.min !== undefined && k < BigInt(def.min)) ||
        (def.max !== undefined && k > BigInt(def.max))
      ) {
        throw bad('That amount is outside the allowed range.')
      }
      return k.toString()
    }
    case 'choice': {
      const s = String(input)
      if (!def.options?.some((o) => o.value === s)) throw bad('Choose one of the options.')
      return s
    }
    case 'dates': {
      if (!Array.isArray(input)) throw bad('Send a list of dates.')
      const days = [...new Set(input.map(String))].sort()
      for (const d of days) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(`${d}T00:00:00Z`))) {
          throw bad(`“${d}” isn’t a date like 2026-12-25.`)
        }
      }
      if (days.length > 60) throw bad('Keep it to 60 dates or fewer.')
      return days
    }
  }
}

/** `admin.settings.update`: super admin, 2FA in the last 12 hours, audit-logged with before/after. */
export async function updatePlatformSetting(
  ctx: Ctx,
  input: { key: string; value: unknown },
): Promise<PlatformSetting> {
  const staff = requireStaff(ctx.actor, (a) => hasRole(a, 'super_admin'))
  if (!hasRecentStepUp(staff, ctx.now)) throw new ForbiddenError('STEP_UP_REQUIRED')
  const def = platformSettings.find((s) => s.key === input.key)
  if (!def) throw new NotFoundError('SETTING_NOT_FOUND', { key: input.key })
  const value = parseSettingValue(def, input.value)
  await inTransaction(ctx, async (tx) => {
    const [before] = await tx.db.select().from(settings).where(eq(settings.key, def.key))
    await tx.db
      .insert(settings)
      .values({ key: def.key, value, updatedBy: staff.userId, updatedAt: tx.now })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value, updatedBy: staff.userId, updatedAt: tx.now },
      })
    await writeAudit(tx, {
      action: 'setting.updated',
      targetType: 'setting',
      targetId: def.key,
      before: { value: before?.value ?? null },
      after: { value },
    })
  })
  const all = await listPlatformSettings(ctx)
  const updated = all.find((s) => s.key === def.key)
  if (!updated) throw new NotFoundError('SETTING_NOT_FOUND', { key: def.key })
  return updated
}
