import 'server-only'
import type { Ctx } from '@tokslearn/core/kernel'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getServerCtx } from './server-ctx'

/**
 * Core ctx for a signed-in page, or a redirect to sign-in that comes back here. The proxy only
 * checks that a cookie exists; this checks the session is real. Call inside <Suspense>.
 */
export async function requireSignedInCtx(path: string): Promise<Ctx> {
  const ctx = await getServerCtx()
  if (ctx.actor.kind !== 'user') {
    await headers()
    redirect(`/sign-in?next=${encodeURIComponent(path)}`)
  }
  return ctx
}
