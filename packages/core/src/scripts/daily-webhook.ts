// Registers Tokslearn's Daily webhook (ADR-039): meeting start/end, participants leaving and
// finished recordings go to /api/webhooks/daily, signed with DAILY_WEBHOOK_SECRET.
//   pnpm daily:webhook https://tokslearn.vercel.app   (reads DAILY_* from the root .env)
// Deploy with DAILY_WEBHOOK_SECRET set first: Daily sends a test request and only saves the
// webhook if the site answers. Running it again re-points the existing webhook.

import { randomBytes } from 'node:crypto'
import { registerDailyWebhook } from '@tokslearn/integrations/daily'

const site = process.argv[2]
const apiKey = process.env.DAILY_API_KEY
const hmac = process.env.DAILY_WEBHOOK_SECRET
if (!apiKey) throw new Error('Set DAILY_API_KEY.')
if (!hmac) {
  console.info(
    `Set DAILY_WEBHOOK_SECRET first (in Vercel and locally), then deploy. A new one:\n  ${randomBytes(32).toString('base64')}`,
  )
  process.exit(1)
}
if (!site?.startsWith('https://'))
  throw new Error('Pass the site, e.g. https://tokslearn.vercel.app')
const url = `${site.replace(/\/$/, '')}/api/webhooks/daily`
const saved = await registerDailyWebhook({ apiKey, url, hmac })
console.info(`Daily webhook ${saved.uuid} → ${url} (${saved.state})`)
