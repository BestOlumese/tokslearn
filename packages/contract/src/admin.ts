import { z } from 'zod'
import { base } from './base'
import { RoleSchema, SessionDto } from './identity'
import { adminInstructorsContract } from './instructors'
import { Cursor, IsoDateTime, Page } from './shared'
import { adminCourseReviewsContract } from './studio'

export const FeatureFlagKey = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z][a-z0-9_]*$/)

export const FeatureFlagDto = z.object({
  key: FeatureFlagKey,
  enabled: z.boolean(),
  description: z.string(),
  updatedAt: IsoDateTime,
})
export type FeatureFlagDto = z.infer<typeof FeatureFlagDto>

export const AdminUserRow = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.email(),
  username: z.string().nullable(),
  roles: z.array(RoleSchema),
  emailVerified: z.boolean(),
  twoFactorEnabled: z.boolean(),
  banned: z.boolean(),
  deletionScheduledFor: IsoDateTime.nullable(),
  createdAt: IsoDateTime,
})
export type AdminUserRow = z.infer<typeof AdminUserRow>

export const AuditEntryDto = z.object({
  id: z.uuid(),
  actorId: z.uuid().nullable(),
  actorName: z.string().nullable(),
  actorKind: z.string(),
  action: z.string(),
  targetType: z.string(),
  targetId: z.string(),
  before: z.unknown(),
  after: z.unknown(),
  requestId: z.string(),
  createdAt: IsoDateTime,
})
export type AuditEntryDto = z.infer<typeof AuditEntryDto>

export const AdminUserDetail = AdminUserRow.extend({
  headline: z.string().nullable(),
  banReason: z.string().nullable(),
  sessions: z.array(SessionDto.omit({ current: true })),
  audit: z.array(AuditEntryDto),
})
export type AdminUserDetail = z.infer<typeof AdminUserDetail>

const Reason = z.string().trim().min(3).max(500)
const ok = z.object({ ok: z.literal(true) })

export const adminContract = {
  listFeatureFlags: base
    .route({
      method: 'GET',
      path: '/admin/feature-flags',
      tags: ['Admin'],
      summary: 'List feature flags',
      description: 'All feature flags with their state. Admins only.',
    })
    .output(z.object({ items: z.array(FeatureFlagDto) })),

  setFeatureFlag: base
    .route({
      method: 'PATCH',
      path: '/admin/feature-flags/{key}',
      tags: ['Admin'],
      summary: 'Turn a feature flag on or off',
      description:
        'Changes take effect within 60 seconds. Every change is written to the audit log.',
    })
    .input(z.strictObject({ key: FeatureFlagKey, enabled: z.boolean() }))
    .output(FeatureFlagDto),

  users: {
    search: base
      .route({
        method: 'GET',
        path: '/admin/users',
        tags: ['Admin'],
        summary: 'Find users',
        description: 'Search by email, name or username; filter by role. Support staff and above.',
      })
      .input(
        z.object({
          q: z.string().trim().max(100).optional(),
          role: RoleSchema.optional(),
          cursor: Cursor.optional(),
          limit: z.coerce.number().int().min(1).max(50).default(25),
        }),
      )
      .output(Page(AdminUserRow)),

    get: base
      .route({
        method: 'GET',
        path: '/admin/users/{userId}',
        tags: ['Admin'],
        summary: 'User detail',
        description: 'Profile, roles, sessions and the latest audit entries for one user.',
      })
      .input(z.object({ userId: z.uuid() }))
      .output(AdminUserDetail),

    setBanned: base
      .route({
        method: 'POST',
        path: '/admin/users/{userId}/ban',
        tags: ['Admin'],
        summary: 'Suspend or restore a user',
        description: 'Suspending signs the user out everywhere. A reason is required and audited.',
      })
      .input(z.strictObject({ userId: z.uuid(), banned: z.boolean(), reason: Reason }))
      .output(ok),

    setRole: base
      .route({
        method: 'POST',
        path: '/admin/users/{userId}/roles',
        tags: ['Admin'],
        summary: 'Grant or remove a role',
        description: 'Admins manage staff roles; only super admins grant admin or super admin.',
      })
      .input(
        z.strictObject({
          userId: z.uuid(),
          role: RoleSchema,
          granted: z.boolean(),
          reason: Reason,
        }),
      )
      .output(z.object({ roles: z.array(RoleSchema) })),

    revokeSessions: base
      .route({
        method: 'POST',
        path: '/admin/users/{userId}/sessions/revoke',
        tags: ['Admin'],
        summary: 'Sign a user out everywhere',
        description: 'Ends every session of the user, including mobile app tokens.',
      })
      .input(z.strictObject({ userId: z.uuid(), reason: Reason }))
      .output(ok),
  },

  audit: {
    list: base
      .route({
        method: 'GET',
        path: '/admin/audit',
        tags: ['Admin'],
        summary: 'Audit log',
        description: 'Staff and money-affecting actions, newest first. Admins only.',
      })
      .input(
        z.object({
          actorId: z.uuid().optional(),
          targetType: z.string().max(40).optional(),
          targetId: z.string().max(100).optional(),
          action: z.string().max(60).optional(),
          cursor: Cursor.optional(),
          limit: z.coerce.number().int().min(1).max(50).default(25),
        }),
      )
      .output(Page(AuditEntryDto)),
  },
  instructors: adminInstructorsContract,
  courseReviews: adminCourseReviewsContract,
}
