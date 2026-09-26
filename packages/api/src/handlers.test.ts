import { describe, expect, it } from 'vitest'
import { createApiHandlers } from './handlers'
import { testContext } from './test-context'

const handlers = createApiHandlers({ appOrigin: 'https://tokslearn.com' })

describe('RPC handler CSRF checks', () => {
  it('rejects cookie requests from another origin', async () => {
    const res = await handlers.handleRpc(
      new Request('https://tokslearn.com/api/rpc/health/ping', {
        method: 'POST',
        headers: { cookie: 'a=b', origin: 'https://evil.example', 'x-tokslearn-client': 'web' },
      }),
      testContext(),
    )
    expect(res.status).toBe(403)
  })

  it('accepts cookie requests from the origin that served them (preview URLs)', async () => {
    const res = await handlers.handleRpc(
      new Request('https://tokslearn-git-feature.vercel.app/api/rpc/health/ping', {
        method: 'POST',
        headers: {
          cookie: 'a=b',
          origin: 'https://tokslearn-git-feature.vercel.app',
          'x-tokslearn-client': 'web',
          'content-type': 'application/json',
        },
        body: '{}',
      }),
      testContext(),
    )
    expect(res.status).toBe(200)
  })

  it('requires the first-party client header', async () => {
    const res = await handlers.handleRpc(
      new Request('https://tokslearn.com/api/rpc/health/ping', { method: 'POST' }),
      testContext(),
    )
    expect(res.status).toBe(400)
  })
})

describe('OpenAPI handler', () => {
  it('serves GET /api/v1/health', async () => {
    const res = await handlers.handleOpenApi(
      new Request('https://tokslearn.com/api/v1/health'),
      testContext(),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { checks: { database: string } }
    expect(body.checks.database).toBe('down')
  })

  it('serves the OpenAPI document', async () => {
    const res = await handlers.handleOpenApi(
      new Request('https://tokslearn.com/api/v1/openapi.json'),
      testContext(),
    )
    const body = (await res.json()) as { openapi: string; servers: Array<{ url: string }> }
    expect(body.openapi).toMatch(/^3\./)
    expect(body.servers[0]?.url).toBe('https://tokslearn.com/api/v1')
  })
})
