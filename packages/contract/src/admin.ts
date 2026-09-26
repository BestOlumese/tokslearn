import { z } from 'zod'
import { base } from './base'
import { IsoDateTime } from './shared'

export const FeatureFlagKey = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z][a-z0-9_]*$/)

export const FeatureFlagDto = z.object({
  key: FeatureFlagKey,
  enabled: z.boolean(),
  description: z.string(),
  updatedAt: IsoDateTime,
})
export type FeatureFlagDto = z.infer<typeof FeatureFlagDto>

export const adminContract = {
  listFeatureFlags: base
    .route({
      method: 'GET',
      path: '/admin/feature-flags',
      tags: ['Admin'],
      summary: 'List feature flags',
      description: 'All feature flags with their state. Admins only.',
    })
    .output(z.object({ items: z.array(FeatureFlagDto) })),

  setFeatureFlag: base
    .route({
      method: 'PATCH',
      path: '/admin/feature-flags/{key}',
      tags: ['Admin'],
      summary: 'Turn a feature flag on or off',
      description:
        'Changes take effect within 60 seconds. Every change is written to the audit log.',
    })
    .input(z.strictObject({ key: FeatureFlagKey, enabled: z.boolean() }))
    .output(FeatureFlagDto),
}
