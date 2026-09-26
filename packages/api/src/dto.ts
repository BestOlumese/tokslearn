import type { AdminUserRow, AuditEntryDto, MeDto, SessionDto } from '@tokslearn/contract'
import type { AuditEntry } from '@tokslearn/core/admin'
import type * as identity from '@tokslearn/core/identity'

// Core objects → contract DTOs. Dates become ISO strings; nothing else leaves the server.

export const toMeDto = (me: identity.Me): MeDto => ({
  ...me,
  deletionScheduledFor: me.deletionScheduledFor?.toISOString() ?? null,
  createdAt: me.createdAt.toISOString(),
})

export const toSessionDto = (s: identity.SessionView): SessionDto => ({
  id: s.id,
  current: s.current,
  device: s.device,
  ipHint: s.ipHint,
  createdAt: s.createdAt.toISOString(),
  lastActiveAt: s.lastActiveAt.toISOString(),
  expiresAt: s.expiresAt.toISOString(),
})

export const toAdminUserRow = (u: identity.AdminUserRow): AdminUserRow => ({
  ...u,
  deletionScheduledFor: u.deletionScheduledFor?.toISOString() ?? null,
  createdAt: u.createdAt.toISOString(),
})

export const toAuditDto = (e: AuditEntry): AuditEntryDto => ({
  ...e,
  createdAt: e.createdAt.toISOString(),
})
