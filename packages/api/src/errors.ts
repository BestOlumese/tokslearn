import { ORPCError, ValidationError as SchemaValidationError } from '@orpc/server'
import {
  type ErrorCode,
  ErrorCodeSchema,
  type ErrorStatus,
  errorMessage,
  errorStatusOf,
} from '@tokslearn/contract'
import { ExternalServiceError, isDomainError, log } from '@tokslearn/core/kernel'

const fallbackCode: Partial<Record<string, ErrorCode>> = {
  UNAUTHORIZED: 'SESSION_EXPIRED',
  FORBIDDEN: 'FORBIDDEN',
  TOO_MANY_REQUESTS: 'RATE_LIMITED',
  BAD_REQUEST: 'VALIDATION_FAILED',
  SERVICE_UNAVAILABLE: 'MAINTENANCE',
}

const build = (
  code: ErrorCode,
  requestId: string,
  details: Readonly<Record<string, unknown>>,
  cause: unknown,
): ORPCError<ErrorStatus, Record<string, unknown>> =>
  new ORPCError(errorStatusOf(code), {
    message: errorMessage(code, { ...details, requestId }),
    data: { ...details, code, requestId },
    cause,
  })

/**
 * Maps anything thrown below the API layer to an ORPCError whose `data.code` is a stable
 * contract code (docs/06 §4). Unknown errors become INTERNAL with the request id; the original
 * error stays in `cause` for Sentry and is never sent to the client.
 */
export function toApiError(error: unknown, requestId: string): ORPCError<string, unknown> {
  if (error instanceof ExternalServiceError) {
    // The learner sees "try again shortly"; the logs say what the provider answered (status and
    // message, never keys), so a rejected key or a suspended account is visible in Vercel.
    log('warn', 'provider call failed', {
      requestId,
      code: error.code,
      cause: error.cause instanceof Error ? error.cause.message : String(error.cause ?? ''),
      status: (error.cause as { status?: unknown } | undefined)?.status ?? null,
    })
  }
  if (isDomainError(error)) return build(error.code, requestId, error.details, error)

  if (error instanceof ORPCError) {
    if (error.code === 'BAD_REQUEST' && error.cause instanceof SchemaValidationError) {
      const issues = error.cause.issues.map((issue) => ({
        path: (issue.path ?? [])
          .map((p) => (typeof p === 'object' && p !== null ? String(p.key) : String(p)))
          .join('.'),
        message: issue.message,
      }))
      return build('VALIDATION_FAILED', requestId, { issues }, error)
    }
    const existing = ErrorCodeSchema.safeParse(
      typeof error.data === 'object' && error.data !== null
        ? (error.data as { code?: unknown }).code
        : undefined,
    )
    if (existing.success) return error
    const code = fallbackCode[error.code]
    if (code) return build(code, requestId, {}, error)
  }

  log('error', 'unhandled API error', {
    requestId,
    error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
  })
  return build('INTERNAL', requestId, {}, error)
}
