import { oc } from '@orpc/contract'
import { ErrorDataSchema } from './errors'

const withData = { data: ErrorDataSchema }

/**
 * Base contract builder. Every procedure declares the same error shape so web and mobile
 * clients can switch on `error.data.code` with full types (docs/06 §4).
 */
export const base = oc.errors({
  UNAUTHORIZED: withData,
  FORBIDDEN: withData,
  NOT_FOUND: withData,
  CONFLICT: withData,
  BAD_REQUEST: withData,
  UNPROCESSABLE_CONTENT: withData,
  TOO_MANY_REQUESTS: withData,
  PRECONDITION_FAILED: withData,
  SERVICE_UNAVAILABLE: withData,
  INTERNAL_SERVER_ERROR: withData,
})
