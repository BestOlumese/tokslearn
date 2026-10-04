import type { VideoProvider } from '@tokslearn/integrations/bunny'
import type { LiveProvider } from '@tokslearn/integrations/daily'
import type { KycProvider } from '@tokslearn/integrations/dojah'
import type { PaymentProvider, PayoutProvider } from '@tokslearn/integrations/paystack'
import type { CertificateRenderer, StatementRenderer } from '@tokslearn/integrations/pdf'
import type { FileStorage } from '@tokslearn/integrations/r2'

/**
 * Session store owned by Better Auth (Postgres + Redis cache). Core decides who may revoke
 * what; this port does the revoking so both copies are cleared.
 */
export interface SessionAdmin {
  revokeSession(sessionId: string): Promise<void>
  revokeAllSessions(userId: string, options?: { exceptSessionId?: string }): Promise<void>
}

/** Counts referral link clicks cheaply; a job moves the totals into the database. */
export interface ClickCounter {
  increment(linkId: string): Promise<void>
  /** Returns counts since the last drain and subtracts them (increments in between survive). */
  drain(): Promise<Array<{ linkId: string; clicks: number }>>
  /** Counts not yet moved into the database, without moving them (for live totals). */
  peek(linkIds: ReadonlyArray<string>): Promise<Map<string, number>>
}

/** Absolute URLs for links in emails and public file URLs. */
export interface Urls {
  /** e.g. https://tokslearn.com */
  app: string
  /** Custom domain of the public R2 bucket, if configured. */
  cdn: string | null
}

/** Signed one-click unsubscribe links for opt-in emails (NDPA): no sign-in needed to stop them. */
export interface UnsubscribeLinks {
  url(input: { userId: string; type: string }): string
  verify(input: { userId: string; type: string; signature: string }): boolean
}

/** Providers the app injects into `Ctx`. Core never imports SDKs or Better Auth directly. */
export interface Providers {
  storage: FileStorage
  sessions: SessionAdmin
  urls: Urls
  /** Dojah BVN/NIN + selfie (docs/07 §5). */
  kyc: KycProvider
  /** Paystack bank directory and transfer recipients. */
  payouts: PayoutProvider
  /** Paystack transactions: initialize, verify, webhook signatures (docs/08 §6). */
  payments: PaymentProvider
  /**
   * Referral click counter (Redis in the web app). Optional: without it clicks go straight to
   * the database.
   */
  clickCounter?: ClickCounter | undefined
  /** Bunny Stream. */
  video: VideoProvider
  /** Daily rooms, meeting tokens and recordings (live classes, docs/10 §11). */
  live: LiveProvider
  unsubscribe: UnsubscribeLinks
  /** Certificate PDFs (@react-pdf in the app, a fake in tests). */
  certificatePdf: CertificateRenderer
  /** Monthly earnings statement PDFs. */
  statementPdf: StatementRenderer
}
