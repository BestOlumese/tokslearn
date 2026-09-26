import { z } from 'zod'
import { base } from './base'
import { IsoDateTime } from './shared'

export const RoleSchema = z.enum([
  'learner',
  'instructor',
  'reviewer',
  'finance',
  'support',
  'admin',
  'super_admin',
])

export const Username = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(30)
  .regex(/^[a-z0-9](?:[a-z0-9_]*[a-z0-9])?$/, 'Use letters, numbers and underscores.')

export const LinkKind = z.enum(['website', 'linkedin', 'x', 'youtube', 'github', 'other'])

export const ProfileLink = z.object({
  kind: LinkKind,
  url: z.url({ protocol: /^https$/ }).max(300),
})

export const MeDto = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.email(),
  emailVerified: z.boolean(),
  username: z.string().nullable(),
  headline: z.string().nullable(),
  bio: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  timezone: z.string(),
  roles: z.array(RoleSchema),
  twoFactorEnabled: z.boolean(),
  links: z.array(ProfileLink),
  deletionScheduledFor: IsoDateTime.nullable(),
  createdAt: IsoDateTime,
})
export type MeDto = z.infer<typeof MeDto>

export const UpdateMeInput = z.strictObject({
  name: z.string().trim().min(1).max(80).optional(),
  username: Username.optional(),
  headline: z.string().trim().max(120).nullable().optional(),
  bio: z.string().trim().max(1000).nullable().optional(),
  /** File id from `media.completeFileUpload` with purpose `avatar`; null removes the photo. */
  avatarFileId: z.uuid().nullable().optional(),
  links: z.array(ProfileLink).max(5).optional(),
})
export type UpdateMeInput = z.infer<typeof UpdateMeInput>

export const SessionDto = z.object({
  id: z.uuid(),
  current: z.boolean(),
  device: z.string(),
  /** IP with the last part hidden, e.g. `102.89.x.x`. */
  ipHint: z.string().nullable(),
  createdAt: IsoDateTime,
  lastActiveAt: IsoDateTime,
  expiresAt: IsoDateTime,
})
export type SessionDto = z.infer<typeof SessionDto>

export const PublicProfileDto = z.object({
  username: z.string(),
  name: z.string(),
  headline: z.string().nullable(),
  bio: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  links: z.array(ProfileLink),
  memberSince: IsoDateTime,
})
export type PublicProfileDto = z.infer<typeof PublicProfileDto>

const ok = z.object({ ok: z.literal(true) })

export const meContract = {
  get: base
    .route({
      method: 'GET',
      path: '/me',
      tags: ['Me'],
      summary: 'Your account',
      description: 'Profile, roles and security status of the signed-in user.',
    })
    .output(MeDto),

  update: base
    .route({
      method: 'PATCH',
      path: '/me',
      tags: ['Me'],
      summary: 'Update your profile',
      description:
        'Changes name, username, headline, bio, photo or links. Username must be unused.',
    })
    .input(UpdateMeInput)
    .output(MeDto),

  sessions: {
    list: base
      .route({
        method: 'GET',
        path: '/me/sessions',
        tags: ['Me'],
        summary: 'Your active sessions',
        description: 'Browsers and app installs signed in to your account, newest first.',
      })
      .output(z.object({ items: z.array(SessionDto) })),

    revoke: base
      .route({
        method: 'DELETE',
        path: '/me/sessions/{sessionId}',
        tags: ['Me'],
        summary: 'Sign out one session',
        description: 'Ends one of your sessions. Revoking the current one signs you out.',
      })
      .input(z.strictObject({ sessionId: z.uuid() }))
      .output(ok),

    revokeOthers: base
      .route({
        method: 'POST',
        path: '/me/sessions/revoke-others',
        tags: ['Me'],
        summary: 'Sign out everywhere else',
        description: 'Ends every session except the one making this request.',
      })
      .output(ok),
  },

  requestDeletion: base
    .route({
      method: 'POST',
      path: '/me/deletion',
      tags: ['Me'],
      summary: 'Ask to delete your account',
      description:
        'Schedules deletion in 14 days. Personal data is then removed; receipts are kept without your name.',
    })
    .output(z.object({ scheduledFor: IsoDateTime })),

  cancelDeletion: base
    .route({
      method: 'DELETE',
      path: '/me/deletion',
      tags: ['Me'],
      summary: 'Keep your account',
      description: 'Cancels a pending deletion request.',
    })
    .output(ok),

  exportData: base
    .route({
      method: 'POST',
      path: '/me/export',
      tags: ['Me'],
      summary: 'Export your data',
      description: 'Prepares a copy of your data and emails you a download link.',
    })
    .output(z.object({ status: z.literal('queued') })),
}

export const usersContract = {
  getPublicProfile: base
    .route({
      method: 'GET',
      path: '/users/{username}',
      tags: ['Users'],
      summary: 'Public profile',
      description: 'Name, headline, bio, photo and links. Never includes email.',
    })
    .input(z.object({ username: Username }))
    .output(PublicProfileDto),
}
