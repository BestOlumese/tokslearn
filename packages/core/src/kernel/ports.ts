import type { FileStorage } from '@tokslearn/integrations/r2'

/**
 * Session store owned by Better Auth (Postgres + Redis cache). Core decides who may revoke
 * what; this port does the revoking so both copies are cleared.
 */
export interface SessionAdmin {
  revokeSession(sessionId: string): Promise<void>
  revokeAllSessions(userId: string, options?: { exceptSessionId?: string }): Promise<void>
}

/** Absolute URLs for links in emails and public file URLs. */
export interface Urls {
  /** e.g. https://tokslearn.com */
  app: string
  /** Custom domain of the public R2 bucket, if configured. */
  cdn: string | null
}

/** Providers the app injects into `Ctx`. Core never imports SDKs or Better Auth directly. */
export interface Providers {
  storage: FileStorage
  sessions: SessionAdmin
  urls: Urls
}
