import type { AnalyticsProperties, ClientAnalyticsEvent } from '@tokslearn/contract'

/** `data-track` value for a server-rendered link; components/catalog/track.tsx sends it on click. */
export const trackAttr = (event: ClientAnalyticsEvent, p: AnalyticsProperties): string =>
  JSON.stringify({ e: event, p })
