import { ORPCError } from '@orpc/client'
import { ErrorCodeSchema, errorMessage } from '@tokslearn/contract'

/** User-facing message for any error thrown by the API client (docs/21). */
export function apiErrorMessage(error: unknown): string {
  if (error instanceof ORPCError) {
    const data = error.data as Record<string, unknown> | undefined
    const code = ErrorCodeSchema.safeParse(data?.code)
    if (code.success) return errorMessage(code.data, data)
  }
  // No error code means the request never got a server answer: offline or timed out.
  return "We couldn't reach Tokslearn. Check your connection and try again."
}
