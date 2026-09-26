import { createRouterClient, ORPCError } from '@orpc/server'
import { testUser } from '@tokslearn/core/testing'
import { createMemoryRateLimiter } from '@tokslearn/integrations/upstash'
import { describe, expect, it } from 'vitest'
import { generateOpenApiSpec } from './openapi'
import { router } from './router'
import { testContext } from './test-context'

const ADMIN_ID = '0190a000-0000-7000-8000-000000000001'
const admin = testUser(['admin'], { userId: ADMIN_ID })

async function errorOf(p: Promise<unknown>) {
  try {
    await p
  } catch (e) {
    if (e instanceof ORPCError) return { status: e.code, data: e.data, message: e.message }
    throw e
  }
  throw new Error('expected an error')
}

describe('health.ping', () => {
  it('reports degraded with the database down and redis not configured', async () => {
    const client = createRouterClient(router, { context: testContext() })
    const result = await client.health.ping()
    expect(result.status).toBe('degraded')
    expect(result.checks).toEqual({ database: 'down', redis: 'not_configured' })
    expect(result.version).toBe('test')
  })
})

describe('errors', () => {
  it('rejects signed-out calls to admin procedures with SESSION_EXPIRED', async () => {
    const client = createRouterClient(router, { context: testContext() })
    const err = await errorOf(client.admin.listFeatureFlags())
    expect(err.status).toBe('UNAUTHORIZED')
    expect(err.data).toMatchObject({ code: 'SESSION_EXPIRED', requestId: 'req-1' })
    expect(err.message).toBe('Your session ended. Sign in again.')
  })

  it('maps schema failures to VALIDATION_FAILED with issue paths', async () => {
    const client = createRouterClient(router, { context: testContext({ actor: admin }) })
    const err = await errorOf(
      client.admin.setFeatureFlag({ key: 'Not A Key', enabled: true } as never),
    )
    expect(err.status).toBe('BAD_REQUEST')
    expect(err.data).toMatchObject({ code: 'VALIDATION_FAILED' })
    expect((err.data as { issues: Array<{ path: string }> }).issues[0]?.path).toBe('key')
  })

  it('hides unexpected errors behind INTERNAL with the request id', async () => {
    const client = createRouterClient(router, { context: testContext({ actor: admin }) })
    const err = await errorOf(client.admin.listFeatureFlags())
    expect(err.status).toBe('INTERNAL_SERVER_ERROR')
    expect(err.data).toMatchObject({ code: 'INTERNAL', requestId: 'req-1' })
    expect(err.message).not.toContain('database not available')
  })
})

describe('rate limits', () => {
  it('returns RATE_LIMITED with retryAfterSec once the policy is exceeded', async () => {
    const rateLimiter = createMemoryRateLimiter()
    const client = createRouterClient(router, { context: testContext({ rateLimiter }) })
    for (let i = 0; i < 60; i++) await client.health.ping()
    const err = await errorOf(client.health.ping())
    expect(err.status).toBe('TOO_MANY_REQUESTS')
    expect(err.data).toMatchObject({ code: 'RATE_LIMITED' })
    expect((err.data as { retryAfterSec: number }).retryAfterSec).toBeGreaterThan(0)
  })
})

describe('openapi', () => {
  it('documents every procedure with a summary', async () => {
    const spec = (await generateOpenApiSpec({ serverUrl: 'http://x/api/v1', version: 't' })) as {
      paths: Record<string, Record<string, { summary?: string }>>
    }
    expect(Object.keys(spec.paths)).toEqual(
      expect.arrayContaining(['/health', '/admin/feature-flags', '/admin/feature-flags/{key}']),
    )
    for (const methods of Object.values(spec.paths)) {
      for (const op of Object.values(methods)) expect(op.summary).toBeTruthy()
    }
  })
})
