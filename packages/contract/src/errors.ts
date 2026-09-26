import { z } from 'zod'
import { type ErrorCode, errorCatalog } from './messages'

export {
  type ErrorCode,
  type ErrorStatus,
  errorCatalog,
  errorMessage,
  errorStatusOf,
} from './messages'

const codes = Object.keys(errorCatalog) as [ErrorCode, ...ErrorCode[]]
/**
 * Named type on purpose: every procedure's error map references this schema, and an inferred
 * enum of all codes would be repeated in the contract's declaration file for each one.
 */
export const ErrorCodeSchema: z.ZodType<ErrorCode, ErrorCode> = z.enum(codes)

/**
 * `error.data` for every API error. `code` is stable; the other keys fill placeholders
 * (`retryAfterSec`, `unlocksAt`, `attemptId`…) or carry Zod issues for BAD_REQUEST.
 */
export interface ErrorData {
  code: ErrorCode
  requestId?: string | undefined
  [key: string]: unknown
}
export const ErrorDataSchema: z.ZodType<ErrorData, ErrorData> = z.looseObject({
  code: ErrorCodeSchema,
  requestId: z.string().optional(),
})
