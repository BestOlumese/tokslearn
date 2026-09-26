import * as identity from '@tokslearn/core/identity'
import { pub } from '../base'

export const usersRouter = {
  getPublicProfile: pub.users.getPublicProfile.handler(async ({ context, input }) => {
    const p = await identity.getPublicProfile(context.ctx, input.username)
    return { ...p, memberSince: p.memberSince.toISOString() }
  }),
}
