import type { FeatureFlagDto } from '@tokslearn/contract'
import * as admin from '@tokslearn/core/admin'
import { authed } from '../base'

const toFlagDto = (flag: admin.FeatureFlag): FeatureFlagDto => ({
  key: flag.key,
  enabled: flag.enabled,
  description: flag.description,
  updatedAt: flag.updatedAt.toISOString(),
})

export const adminRouter = {
  listFeatureFlags: authed.admin.listFeatureFlags.handler(async ({ context }) => ({
    items: (await admin.listFeatureFlags(context.ctx)).map(toFlagDto),
  })),

  setFeatureFlag: authed.admin.setFeatureFlag.handler(async ({ context, input }) =>
    toFlagDto(await admin.setFeatureFlag(context.ctx, input)),
  ),
}
