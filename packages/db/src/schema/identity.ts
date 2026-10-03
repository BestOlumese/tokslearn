import { relations, sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { baseColumns, timestamps, tstz } from '../columns'
import { newId } from '../ids'

// Better Auth core + plugin tables (generated with `auth generate` for better-auth 1.7.6, then
// adapted: UUIDv7 ids, timestamptz, our extra fields). Property names are what Better Auth reads;
// the Drizzle `casing: 'snake_case'` setting maps them to columns. Regenerate into a scratch file
// and diff when upgrading Better Auth.

const id = () => uuid().primaryKey().$defaultFn(newId)

export const user = pgTable(
  'user',
  {
    id: id(),
    name: text().notNull(),
    email: text().notNull().unique(),
    emailVerified: boolean().notNull().default(false),
    image: text(),
    ...timestamps(),
    // admin plugin
    role: text(),
    banned: boolean().default(false),
    banReason: text(),
    banExpires: tstz(),
    // twoFactor plugin
    twoFactorEnabled: boolean().default(false),
    // Tokslearn (docs/05 identity)
    username: text().unique(),
    headline: text(),
    bio: text(),
    avatarKey: text(),
    /** Show earned badges on the public profile (`/u/{username}`). Off until the person opts in. */
    badgesPublic: boolean().notNull().default(false),
    timezone: text().default('Africa/Lagos'),
    deletionRequestedAt: tstz(),
    deletedAt: tstz(),
  },
  (t) => [index().on(t.deletionRequestedAt).where(sql`${t.deletionRequestedAt} is not null`)],
)

export const session = pgTable(
  'session',
  {
    id: id(),
    expiresAt: tstz().notNull(),
    token: text().notNull().unique(),
    ...timestamps(),
    ipAddress: text(),
    userAgent: text(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    impersonatedBy: text(),
    twoFactorVerifiedAt: tstz(),
  },
  (t) => [index().on(t.userId, t.expiresAt)],
)

export const account = pgTable(
  'account',
  {
    id: id(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: tstz(),
    refreshTokenExpiresAt: tstz(),
    scope: text(),
    password: text(),
    ...timestamps(),
  },
  (t) => [index().on(t.userId), uniqueIndex().on(t.providerId, t.accountId)],
)

export const verification = pgTable(
  'verification',
  {
    id: id(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: tstz().notNull(),
    ...timestamps(),
  },
  (t) => [index().on(t.identifier)],
)

export const twoFactor = pgTable(
  'two_factor',
  {
    id: id(),
    secret: text().notNull(),
    backupCodes: text().notNull(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    verified: boolean().default(true),
    failedVerificationCount: integer().default(0),
    lockedUntil: tstz(),
    ...timestamps(),
  },
  (t) => [index().on(t.secret), index().on(t.userId)],
)

// ── Tokslearn identity tables ────────────────────────────

export const roleEnum = pgEnum('role', [
  'learner',
  'instructor',
  'reviewer',
  'finance',
  'support',
  'admin',
  'super_admin',
])

/** Source of truth for roles (docs/07 §3). `user.role` only mirrors the highest staff role. */
export const userRoles = pgTable(
  'user_roles',
  {
    ...baseColumns(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    role: roleEnum().notNull(),
    grantedBy: uuid().references(() => user.id, { onDelete: 'restrict' }),
  },
  (t) => [uniqueIndex().on(t.userId, t.role), index().on(t.role)],
)

export const linkKindEnum = pgEnum('link_kind', [
  'website',
  'linkedin',
  'x',
  'youtube',
  'github',
  'other',
])

export const userLinks = pgTable(
  'user_links',
  {
    ...baseColumns(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    kind: linkKindEnum().notNull(),
    url: text().notNull(),
    position: smallint().notNull().default(0),
  },
  (t) => [index().on(t.userId, t.position)],
)

// Relations let Better Auth use joins (advanced.database.joins).
export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  twoFactors: many(twoFactor),
}))

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}))

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}))

export const twoFactorRelations = relations(twoFactor, ({ one }) => ({
  user: one(user, { fields: [twoFactor.userId], references: [user.id] }),
}))
