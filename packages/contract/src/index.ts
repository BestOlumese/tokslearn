import { adminContract } from './admin'
import { healthContract } from './health'

/** The whole API surface. Web, Expo and the OpenAPI spec all come from this object. */
export const contract = {
  health: healthContract,
  admin: adminContract,
}
export type Contract = typeof contract

export { FeatureFlagDto, FeatureFlagKey } from './admin'
export {
  type AnalyticsEvent,
  type AnalyticsPlatform,
  type AnalyticsProperties,
  type ClientAnalyticsEvent,
  clientEvents,
  type ServerAnalyticsEvent,
  serverEvents,
} from './analytics'
export {
  type ErrorCode,
  ErrorCodeSchema,
  type ErrorData,
  ErrorDataSchema,
  type ErrorStatus,
  errorCatalog,
  errorMessage,
  errorStatusOf,
} from './errors'
export { HealthDto } from './health'
export { CLIENT_HEADER, Cursor, IDEMPOTENCY_HEADER, IsoDateTime, MoneyDto, Page } from './shared'
