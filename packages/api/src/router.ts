import { impl } from './base'
import { adminRouter } from './procedures/admin'
import { healthRouter } from './procedures/health'
import { meRouter } from './procedures/me'
import { mediaRouter } from './procedures/media'
import { usersRouter } from './procedures/users'

export const router = impl.router({
  health: healthRouter,
  me: meRouter,
  users: usersRouter,
  media: mediaRouter,
  admin: adminRouter,
})

export type Router = typeof router
