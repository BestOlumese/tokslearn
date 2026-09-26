import { impl } from './base'
import { adminRouter } from './procedures/admin'
import { healthRouter } from './procedures/health'
import { instructorsRouter, kycRouter, payoutAccountsRouter } from './procedures/instructors'
import { meRouter } from './procedures/me'
import { mediaRouter } from './procedures/media'
import { catalogRouter, studioRouter } from './procedures/studio'
import { usersRouter } from './procedures/users'

export const router = impl.router({
  health: healthRouter,
  me: meRouter,
  users: usersRouter,
  media: mediaRouter,
  catalog: catalogRouter,
  studio: studioRouter,
  instructors: instructorsRouter,
  kyc: kycRouter,
  payoutAccounts: payoutAccountsRouter,
  admin: adminRouter,
})

export type Router = typeof router
