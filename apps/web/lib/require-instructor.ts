import 'server-only'
import type { Ctx } from '@tokslearn/core/kernel'
import { hasRole } from '@tokslearn/core/kernel'
import { requireSignedInCtx } from './require-user'

/** Signed-in ctx plus whether the user can use the studio. Call inside <Suspense>. */
export async function studioCtx(path: string): Promise<{ ctx: Ctx; isInstructor: boolean }> {
  const ctx = await requireSignedInCtx(path)
  return { ctx, isInstructor: hasRole(ctx.actor, 'instructor', 'admin', 'super_admin') }
}
