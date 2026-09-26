import { createApiHandlers } from '@tokslearn/api'
import { env } from '@/env'
import { createApiContext } from '@/lib/api-context'
import { reportServerError } from '@/lib/report-error'

// First-party typed RPC endpoint for web and mobile (docs/06 §1).
const handlers = createApiHandlers({
  appOrigin: env.NEXT_PUBLIC_APP_URL,
  reportError: reportServerError,
})

async function handle(request: Request) {
  return handlers.handleRpc(request, createApiContext(request))
}

export const GET = handle
export const POST = handle
