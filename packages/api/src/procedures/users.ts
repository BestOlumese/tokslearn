import * as engagement from '@tokslearn/core/engagement'
import * as identity from '@tokslearn/core/identity'
import { pub } from '../base'

export const usersRouter = {
  getPublicProfile: pub.users.getPublicProfile.handler(async ({ context, input }) => {
    const [p, badges] = await Promise.all([
      identity.getPublicProfile(context.ctx, input.username),
      engagement.publicBadges(context.ctx, input.username),
    ])
    return {
      ...p,
      memberSince: p.memberSince.toISOString(),
      badges: badges.map((b) => ({ ...b, awardedAt: b.awardedAt.toISOString() })),
    }
  }),
}
