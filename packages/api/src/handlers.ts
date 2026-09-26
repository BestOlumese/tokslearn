import { OpenAPIHandler } from '@orpc/openapi/fetch'
import { ORPCError, onError } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'
import { CLIENT_HEADER } from '@tokslearn/contract'
import type { ApiContext } from './context'
import { generateOpenApiSpec } from './openapi'
import { router } from './router'

export interface HandlerOptions {
  /** e.g. https://tokslearn.com — requests carrying cookies must come from here. */
  appOrigin: string
  /** Called for 5xx errors with the original cause (Sentry). */
  reportError?: (error: unknown, requestId: string | undefined) => void
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/**
 * CSRF (docs/14 §2): cookie-authenticated calls must come from our origin, and the RPC endpoint
 * also requires the first-party client header. Bearer-token clients (mobile) have no cookies.
 */
function csrfRejection(request: Request, appOrigin: string, requireClientHeader: boolean) {
  const origin = request.headers.get('origin')
  const hasCookies = (request.headers.get('cookie') ?? '').length > 0
  if (hasCookies && origin !== null && origin !== appOrigin) {
    return json(403, { code: 'FORBIDDEN', message: "You don't have access to this." })
  }
  if (requireClientHeader && !request.headers.get(CLIENT_HEADER)) {
    return json(400, { code: 'CLIENT_OUTDATED', message: 'Update the Tokslearn app to continue.' })
  }
  return null
}

export function createApiHandlers(options: HandlerOptions) {
  const report = (error: unknown) => {
    if (error instanceof ORPCError && error.status < 500) return
    const requestId =
      error instanceof ORPCError && typeof error.data === 'object' && error.data !== null
        ? String((error.data as { requestId?: unknown }).requestId ?? '')
        : undefined
    options.reportError?.(error instanceof ORPCError ? (error.cause ?? error) : error, requestId)
  }
  const rpc = new RPCHandler(router, { interceptors: [onError(report)] })
  const openapi = new OpenAPIHandler(router, { interceptors: [onError(report)] })
  let spec: Promise<unknown> | undefined

  return {
    async handleRpc(request: Request, context: ApiContext): Promise<Response> {
      const rejected = csrfRejection(request, options.appOrigin, true)
      if (rejected) return rejected
      const { response } = await rpc.handle(request, { prefix: '/api/rpc', context })
      return response ?? json(404, { code: 'NOT_FOUND' })
    },

    async handleOpenApi(request: Request, context: ApiContext): Promise<Response> {
      const url = new URL(request.url)
      if (request.method === 'GET' && url.pathname === '/api/v1/openapi.json') {
        spec ??= generateOpenApiSpec({
          serverUrl: `${url.origin}/api/v1`,
          version: context.version,
        })
        return json(200, await spec)
      }
      const rejected = csrfRejection(request, options.appOrigin, false)
      if (rejected) return rejected
      const { response } = await openapi.handle(request, { prefix: '/api/v1', context })
      return response ?? json(404, { code: 'NOT_FOUND' })
    },
  }
}
