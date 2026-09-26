import 'server-only'
import { PostHog } from 'posthog-node'

/** Matches core's `AnalyticsSink` structurally so integrations need not import core. */
export interface PostHogSink {
  capture(input: {
    distinctId: string
    event: string
    properties: Readonly<Record<string, string | number | boolean | null>>
  }): Promise<void>
  shutdown(): Promise<void>
}

/** Server-side capture for events that must be accurate (docs/24 §1). */
export function createPostHogSink(config: { key: string; host: string }): PostHogSink {
  const client = new PostHog(config.key, { host: config.host, flushAt: 20, flushInterval: 5_000 })
  return {
    async capture({ distinctId, event, properties }) {
      client.capture({ distinctId, event, properties: { ...properties } })
    },
    shutdown: () => client.shutdown(),
  }
}
