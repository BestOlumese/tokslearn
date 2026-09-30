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

/** The stable `data.code` of an API error, or null for network failures. */
export function apiErrorCode(error: unknown): string | null {
  if (!(error instanceof ORPCError)) return null
  const code = ErrorCodeSchema.safeParse((error.data as Record<string, unknown> | undefined)?.code)
  return code.success ? code.data : null
}

/**
 * VALIDATION_FAILED carries field-level issues; show them (up to a few) instead of the generic
 * sentence, so authors of complex forms (questions, rubrics) see what to fix.
 */
export function apiErrorDetails(error: unknown): string {
  if (error instanceof ORPCError) {
    const issues = (error.data as { issues?: Array<{ message?: string }> } | undefined)?.issues
    if (Array.isArray(issues) && issues.length > 0) {
      return [...new Set(issues.map((i) => i.message).filter(Boolean))].slice(0, 3).join(' ')
    }
  }
  return apiErrorMessage(error)
}
