// Live class calls for the learner side. Plain fetch against /api/v1 like the rest of the player.

import { shopApi } from './shop'

export const joinLive = (sessionId: string) =>
  shopApi<{ roomUrl: string; token: string; expiresAt: string }>(`/live/${sessionId}/join`, {
    method: 'POST',
    body: { sessionId },
  })
