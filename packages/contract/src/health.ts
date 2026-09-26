import { z } from 'zod'
import { base } from './base'
import { IsoDateTime } from './shared'

const DependencyStatus = z.enum(['ok', 'down', 'not_configured'])

export const HealthDto = z.object({
  status: z.enum(['ok', 'degraded']),
  version: z.string(),
  environment: z.string(),
  time: IsoDateTime,
  checks: z.object({ database: DependencyStatus, redis: DependencyStatus }),
})
export type HealthDto = z.infer<typeof HealthDto>

export const healthContract = {
  ping: base
    .route({
      method: 'GET',
      path: '/health',
      tags: ['Platform'],
      summary: 'Service health',
      description:
        'Returns the deployed version and whether the database and Redis respond. Used by uptime checks.',
    })
    .output(HealthDto),
}
