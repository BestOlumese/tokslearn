import type { AnalyticsProperties, ServerAnalyticsEvent } from '@tokslearn/contract'
import { isUser } from '../kernel/actor'
import type { Ctx } from '../kernel/ctx'
import { log } from '../kernel/logger'

/** Implemented in packages/integrations (PostHog Node client). */
export interface AnalyticsSink {
  capture(input: {
    distinctId: string
    event: ServerAnalyticsEvent
    properties: AnalyticsProperties
  }): Promise<void>
}

let sink: AnalyticsSink | null = null

/** The web app and jobs call this once at startup. Without a sink, `track` is a no-op. */
export function configureAnalytics(next: AnalyticsSink | null): void {
  sink = next
}

/**
 * Server-side product analytics (docs/24 §4). Call from event handlers after commit, never inside
 * a DB transaction. Never throws: analytics must not break a user action.
 */
export async function track(
  ctx: Ctx,
  event: ServerAnalyticsEvent,
  properties: AnalyticsProperties = {},
  options: { distinctId?: string } = {},
): Promise<void> {
  if (!sink || process.env.NODE_ENV === 'test') return
  const distinctId = options.distinctId ?? (isUser(ctx.actor) ? ctx.actor.userId : 'system')
  try {
    await sink.capture({ distinctId, event, properties })
  } catch (error) {
    log('warn', 'analytics capture failed', {
      requestId: ctx.requestId,
      event,
      error: String(error),
    })
  }
}
