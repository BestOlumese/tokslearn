import type { Db, DbOrTx } from '@tokslearn/db'
import { schema } from '@tokslearn/db'
import type { Actor } from './actor'
import { type CacheAdapter, noopCache } from './cache'
import { type Clock, systemClock } from './clock'
import type { EventEmitter } from './events'
import { log } from './logger'

type Hook = () => Promise<void> | void

/** Every core function takes this as its first argument (docs/03 §4). */
export interface Ctx {
  readonly actor: Actor
  readonly db: DbOrTx
  readonly now: Date
  readonly requestId: string
  /** Salted hash of the caller IP for evidence/audit rows, or null (jobs, tests). */
  readonly ipHash: string | null
  readonly cache: CacheAdapter
  readonly events: EventEmitter
  /** Runs `fn` after the outermost transaction commits (or right away outside a transaction). */
  afterCommit(fn: Hook): void
}

export interface CtxInit {
  actor: Actor
  db: Db
  requestId: string
  ipHash?: string | null
  clock?: Clock
  cache?: CacheAdapter
  /** Called after outbox rows commit, e.g. to trigger the Inngest outbox dispatcher now. */
  onOutboxWritten?: Hook
}

interface Scope {
  hooks: Hook[] | null // null = not in a transaction, run hooks immediately
}

async function runHooks(hooks: ReadonlyArray<Hook>, requestId: string): Promise<void> {
  for (const hook of hooks) {
    try {
      await hook()
    } catch (error) {
      // After-commit work must never fail the request; the outbox sweeper retries delivery.
      log('error', 'after-commit hook failed', { requestId, error: String(error) })
    }
  }
}

function build(init: CtxInit, db: DbOrTx, scope: Scope, now: Date): Ctx {
  const afterCommit = (fn: Hook) => {
    if (scope.hooks) scope.hooks.push(fn)
    else void runHooks([fn], init.requestId)
  }
  const ctx: Ctx = {
    actor: init.actor,
    db,
    now,
    requestId: init.requestId,
    ipHash: init.ipHash ?? null,
    cache: init.cache ?? noopCache,
    afterCommit,
    events: {
      emit: async (name, payload) => {
        await ctx.db.insert(schema.outbox).values({ eventName: name, payload, availableAt: now })
        if (init.onOutboxWritten) afterCommit(init.onOutboxWritten)
      },
    },
  }
  return ctx
}

const initOf = new WeakMap<Ctx, { init: CtxInit; scope: Scope }>()

export function createCtx(init: CtxInit): Ctx {
  const now = (init.clock ?? systemClock).now()
  const scope: Scope = { hooks: null }
  const ctx = build(init, init.db, scope, now)
  initOf.set(ctx, { init, scope })
  return ctx
}

/**
 * Runs `fn` in one DB transaction. Events emitted inside are written to the outbox in the same
 * transaction; after-commit hooks run only if it commits. Nested calls reuse the outer transaction.
 * Never call third-party APIs inside `fn` (docs/05 §3.6).
 */
export async function inTransaction<T>(ctx: Ctx, fn: (tx: Ctx) => Promise<T>): Promise<T> {
  const meta = initOf.get(ctx)
  if (meta?.scope.hooks) return fn(ctx)

  if (!meta) throw new Error('inTransaction needs a ctx made by createCtx')
  const { init } = meta
  const scope: Scope = { hooks: [] }
  const result = await (ctx.db as Db).transaction(async (tx) => {
    const txCtx = build(init, tx, scope, ctx.now)
    initOf.set(txCtx, { init, scope })
    return fn(txCtx)
  })
  await runHooks(scope.hooks ?? [], ctx.requestId)
  return result
}
