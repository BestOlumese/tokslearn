import { Inngest } from 'inngest'

/**
 * One Inngest app for all environments (docs/13 §1). Signing and event keys come from
 * INNGEST_SIGNING_KEY / INNGEST_EVENT_KEY; locally INNGEST_DEV=1 points at the Dev Server.
 */
export const inngest = new Inngest({
  id: 'tokslearn',
  isDev: process.env.INNGEST_DEV === '1',
  // Vercel functions: keep each checkpointed segment well under the function timeout.
  checkpointing: { maxRuntime: '50s' },
})
