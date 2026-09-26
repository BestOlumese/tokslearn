import type { MeDto } from '@tokslearn/contract'
import type { Me } from '@tokslearn/core/identity'

/** Server Components pass the same DTO shape the API returns, so client code has one type. */
export const toMeDtoForClient = (me: Me): MeDto => ({
  ...me,
  deletionScheduledFor: me.deletionScheduledFor?.toISOString() ?? null,
  createdAt: me.createdAt.toISOString(),
})
