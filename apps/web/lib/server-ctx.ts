import 'server-only'
import { type Ctx, createCtx } from '@tokslearn/core/kernel'
import { getDb } from '@tokslearn/db'
import { requestOutboxDispatch } from '@tokslearn/jobs'
import { headers } from 'next/headers'
import { resolveActor } from './actor'
import { getProviders } from './auth'
import { nextCache } from './next-cache'
import { ipHashFrom, requestIdFrom } from './request'

/**
 * Core context for Server Components, which call core directly instead of going over HTTP
 * (docs/03 §1). Reads request headers, so call it inside a <Suspense> boundary.
 */
export async function getServerCtx(): Promise<Ctx> {
  const h = await headers()
  return createCtx({
    actor: await resolveActor(h),
    db: getDb(),
    requestId: requestIdFrom(h),
    ipHash: ipHashFrom(h),
    cache: nextCache,
    providers: getProviders(),
    onOutboxWritten: requestOutboxDispatch,
  })
}
