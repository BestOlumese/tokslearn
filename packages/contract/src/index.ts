import { adminContract } from './admin'
import { healthContract } from './health'
import { meContract, usersContract } from './identity'
import { mediaContract } from './media'

/** The whole API surface. Web, Expo and the OpenAPI spec all come from this object. */
export const contract = {
  health: healthContract,
  me: meContract,
  users: usersContract,
  media: mediaContract,
  admin: adminContract,
}
export type Contract = typeof contract

export {
  AdminUserDetail,
  AdminUserRow,
  AuditEntryDto,
  FeatureFlagDto,
  FeatureFlagKey,
} from './admin'
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
export {
  LinkKind,
  MeDto,
  ProfileLink,
  PublicProfileDto,
  RoleSchema,
  SessionDto,
  UpdateMeInput,
  Username,
} from './identity'
export { UploadPurpose } from './media'
export { CLIENT_HEADER, Cursor, IDEMPOTENCY_HEADER, IsoDateTime, MoneyDto, Page } from './shared'
