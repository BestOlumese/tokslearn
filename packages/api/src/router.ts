import { impl } from './base'
import { adminRouter } from './procedures/admin'
import { healthRouter } from './procedures/health'

export const router = impl.router({
  health: healthRouter,
  admin: adminRouter,
})

export type Router = typeof router
