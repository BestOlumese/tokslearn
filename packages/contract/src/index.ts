import { adminContract } from './admin'
import {
  catalogPublicContract,
  coursesContract,
  instructorProfileContract,
  learnContract,
} from './catalog'
import { healthContract } from './health'
import { meContract, usersContract } from './identity'
import { instructorsContract, kycContract, payoutAccountsContract } from './instructors'
import { mediaContract } from './media'
import { catalogContract, studioContract } from './studio'

/** The whole API surface. Web, Expo and the OpenAPI spec all come from this object. */
export const contract = {
  health: healthContract,
  me: meContract,
  users: usersContract,
  media: mediaContract,
  catalog: { ...catalogContract, ...catalogPublicContract },
  courses: coursesContract,
  learn: learnContract,
  studio: studioContract,
  instructors: { ...instructorsContract, ...instructorProfileContract },
  kyc: kycContract,
  payoutAccounts: payoutAccountsContract,
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
  AdminCourseRow,
  CategoryDirectoryDto,
  CategoryRow,
  CourseCardDto,
  CourseFiltersInput,
  CourseSort,
  DurationBucket,
  HomeDto,
  PublicCourseDto,
  PublicInstructorDto,
  PublicSectionDto,
} from './catalog'
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
export {
  AdminApplicationDetail,
  AdminApplicationRow,
  ApplicationAbout,
  ApplicationDto,
  ApplicationGap,
  ApplicationStatus,
  BankDto,
  KycMethod,
  KycStatus,
  KycStatusDto,
  MyApplicationDto,
  PayoutAccountDto,
  PayoutAccountStatus,
} from './instructors'
export { UploadPurpose } from './media'
export { RichMark, RichNode, RichTextDoc, richMarkTypes, richNodeTypes } from './rich-text'
export { CLIENT_HEADER, Cursor, IDEMPOTENCY_HEADER, IsoDateTime, MoneyDto, Page } from './shared'
export {
  BundleDto,
  CategoryDto,
  ChecklistKey,
  CourseLevel,
  CourseStatus,
  Kobo,
  LessonPreviewDto,
  LessonType,
  NewLessonType,
  RefundPolicyDays,
  ReviewChecklistKey,
  ReviewDto,
  ReviewQueueRow,
  RevisionStatus,
  StaffDto,
  StudioCourseDto,
  StudioCourseRow,
  StudioLessonDto,
  StudioResourceDto,
  StudioSectionDto,
  UploadAuthorizationDto,
  VideoStatus,
} from './studio'
