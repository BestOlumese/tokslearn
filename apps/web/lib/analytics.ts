import type { AnalyticsProperties, ClientAnalyticsEvent } from '@tokslearn/contract'
import type { PostHog } from 'posthog-js'
import { readConsent } from './consent'

// Client analytics wrapper (docs/24 §4). No-ops until the visitor accepts analytics, and
// PostHog's script loads only then, on idle, so public pages carry no analytics JS by default.

let client: PostHog | null = null
let loading: Promise<PostHog | null> | null = null

function load(): Promise<PostHog | null> {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
  if (!key || readConsent() !== 'granted') return Promise.resolve(null)
  loading ??= import('posthog-js').then(({ default: posthog }) => {
    posthog.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com',
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      disable_session_recording: true,
      persistence: 'localStorage+cookie',
    })
    client = posthog
    return posthog
  })
  return loading
}

export function capture(event: ClientAnalyticsEvent, properties: AnalyticsProperties = {}): void {
  if (readConsent() !== 'granted') return
  const props = { platform: 'web', ...properties }
  if (client) client.capture(event, props)
  else void load().then((ph) => ph?.capture(event, props))
}

/** Stop capturing and forget the anonymous id after consent is withdrawn. */
export function optOut(): void {
  client?.opt_out_capturing()
  client?.reset()
}
