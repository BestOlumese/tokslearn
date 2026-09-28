import { sql } from 'drizzle-orm'
import { createDb, type Db } from '../client'
import {
  categories,
  commissionRules,
  featureFlags,
  instructorApplications,
  instructorProfiles,
  kycChecks,
  payoutAccounts,
  settings,
  user,
  userRoles,
} from '../schema'
import {
  seedCategories,
  seedCommissionDefaults,
  seedFeatureFlags,
  seedInstructors,
  seedSettings,
  seedUsers,
} from './data'

/** Demo users and roles (idempotent). Callers must refuse to run this in production. */
export async function seedDemoUsers(db: Db): Promise<void> {
  await db
    .insert(user)
    .values(
      seedUsers.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        username: u.username,
        emailVerified: true,
      })),
    )
    .onConflictDoNothing()
  await db
    .insert(userRoles)
    .values(seedUsers.flatMap((u) => u.roles.map((role) => ({ userId: u.id, role }))))
    .onConflictDoNothing()
  await seedDemoInstructors(db)
}

/** Two demo instructors: one approved (KYC verified, payout account), one awaiting review. */
async function seedDemoInstructors(db: Db): Promise<void> {
  const { approved, pending } = seedInstructors
  const approvedAt = new Date('2026-09-01T09:00:00Z')
  await db
    .insert(user)
    .values(
      [approved, pending].map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        username: u.username,
        emailVerified: true,
      })),
    )
    .onConflictDoNothing()
  await db
    .insert(userRoles)
    .values([
      { userId: approved.id, role: 'learner' as const },
      { userId: approved.id, role: 'instructor' as const },
      { userId: pending.id, role: 'learner' as const },
    ])
    .onConflictDoNothing()
  await db
    .insert(instructorApplications)
    .values([
      {
        id: '01920000-0000-7000-8002-000000000001',
        userId: approved.id,
        status: 'approved',
        step: 4,
        expertise: 'Excel and financial modelling for accountants',
        sampleUrl: 'https://example.com/tobi-sample',
        answers: { headline: 'Chartered accountant, 9 years in audit' },
        submittedAt: new Date('2026-08-28T10:00:00Z'),
        decidedAt: approvedAt,
      },
      {
        id: '01920000-0000-7000-8002-000000000002',
        userId: pending.id,
        status: 'submitted',
        step: 4,
        expertise: 'UI design with Figma',
        sampleUrl: 'https://example.com/grace-sample',
        answers: { headline: 'Product designer at a Lagos fintech' },
        submittedAt: new Date('2026-09-20T14:00:00Z'),
      },
    ])
    .onConflictDoNothing()
  await db
    .insert(kycChecks)
    .values([
      {
        id: '01920000-0000-7000-8003-000000000001',
        userId: approved.id,
        method: 'bvn',
        status: 'verified',
        providerReference: 'seed-kyc-approved',
        matchedName: 'TOBI ADELEKE',
        faceMatchScore: '96.40',
        verifiedAt: new Date('2026-08-28T10:05:00Z'),
      },
      {
        id: '01920000-0000-7000-8003-000000000002',
        userId: pending.id,
        method: 'nin',
        status: 'pending',
        providerReference: 'seed-kyc-pending',
      },
    ])
    .onConflictDoNothing()
  await db
    .insert(payoutAccounts)
    .values({
      id: '01920000-0000-7000-8004-000000000001',
      userId: approved.id,
      bankCode: '058',
      bankName: 'Guaranty Trust Bank',
      accountNumberLast4: '4821',
      accountName: 'TOBI ADELEKE',
      paystackRecipientCode: 'RCP_seedtobi',
      status: 'active',
      nameMatchScore: '1.000',
      payoutsAllowedFrom: approvedAt,
    })
    .onConflictDoNothing()
  await db
    .insert(instructorProfiles)
    .values({
      userId: approved.id,
      slug: approved.slug,
      displayName: approved.name,
      approvedAt,
    })
    .onConflictDoNothing()
}

/** Category tree for every environment. Existing rows (possibly edited by admins) are kept. */
export async function seedCatalog(db: Db): Promise<void> {
  const rows = seedCategories.flatMap((top, i) => [
    {
      id: top.id,
      slug: top.slug,
      name: top.name,
      description: top.description,
      parentId: null,
      position: i,
    },
    ...top.children.map((c, j) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      description: null,
      parentId: top.id,
      position: j,
    })),
  ])
  // Parents first so the self-reference resolves. Admin edits win: only empty descriptions fill.
  await db
    .insert(categories)
    .values(rows.filter((r) => r.parentId === null))
    .onConflictDoUpdate({
      target: categories.id,
      set: { description: sql`coalesce(${categories.description}, excluded.description)` },
    })
  await db
    .insert(categories)
    .values(rows.filter((r) => r.parentId !== null))
    .onConflictDoNothing()
}

/** Idempotent: re-running updates descriptions but never flips a flag someone changed. */
export async function seed(db: Db): Promise<void> {
  await db
    .insert(settings)
    .values(seedSettings.map((s) => ({ key: s.key, value: s.value })))
    .onConflictDoNothing()

  await db
    .insert(featureFlags)
    .values([...seedFeatureFlags])
    .onConflictDoUpdate({
      target: featureFlags.key,
      set: { description: sql`excluded.description` },
    })

  await seedCatalog(db)
  await seedCommission(db)
}

/**
 * Default commission rules. A conflict (the id exists, or an admin already replaced the default
 * for that source) leaves the table alone.
 */
export async function seedCommission(db: Db): Promise<void> {
  await db
    .insert(commissionRules)
    .values(
      seedCommissionDefaults.map((r) => ({
        id: r.id,
        scope: 'default' as const,
        source: r.source,
        platformRateBps: r.platformRateBps,
        startsAt: new Date('2026-01-01T00:00:00Z'),
        note: 'Launch default (ADR-017)',
      })),
    )
    .onConflictDoNothing()
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('Set DATABASE_URL to seed.')
    process.exit(1)
  }
  const handle = createDb(url, { max: 1, tcp: true })
  try {
    await seed(handle.db)
    console.info('Settings, feature flags and categories seeded.')
    if (process.env.NEXT_PUBLIC_APP_ENV === 'production') {
      console.info('Production: demo users skipped.')
    } else {
      await seedDemoUsers(handle.db)
      console.info(
        'Demo users seeded. Run `pnpm --filter @tokslearn/auth seed:passwords` to let them sign in.',
      )
    }
  } finally {
    await handle.close()
  }
}
