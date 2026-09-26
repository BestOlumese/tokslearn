import * as admin from '@tokslearn/core/admin'
import { pub } from '../base'

export const healthRouter = {
  ping: pub.health.ping.handler(async ({ context }) => {
    const health = await admin.getHealth(
      context.ctx,
      context.pingRedis ? { pingRedis: context.pingRedis } : {},
    )
    return {
      ...health,
      version: context.version,
      environment: context.environment,
      time: context.ctx.now.toISOString(),
    }
  }),
}
