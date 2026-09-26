import { createApiHandlers } from '@tokslearn/api'
import { env } from '@/env'
import { createApiContext } from '@/lib/api-context'
import { reportServerError } from '@/lib/report-error'

// REST surface + /api/v1/openapi.json + /api/v1/health (docs/06 §1).
const handlers = createApiHandlers({
  appOrigin: env.NEXT_PUBLIC_APP_URL,
  reportError: reportServerError,
})

async function handle(request: Request) {
  return handlers.handleOpenApi(request, createApiContext(request))
}

export const GET = handle
export const POST = handle
export const PUT = handle
export const PATCH = handle
export const DELETE = handle
