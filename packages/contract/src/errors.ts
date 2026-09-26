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
export const ErrorCodeSchema = z.enum(codes)

/**
 * `error.data` for every API error. `code` is stable; the other keys fill placeholders
 * (`retryAfterSec`, `unlocksAt`, `attemptId`…) or carry Zod issues for BAD_REQUEST.
 */
export const ErrorDataSchema = z.looseObject({
  code: ErrorCodeSchema,
  requestId: z.string().optional(),
})
export type ErrorData = z.infer<typeof ErrorDataSchema>
