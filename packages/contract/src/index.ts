import { adminContract } from './admin'
import {
  assignmentsContract,
  examsContract,
  gradingContract,
  quizzesContract,
  studioAssignmentsContract,
  studioQuestionBanksContract,
  studioQuestionsContract,
  studioQuizzesContract,
} from './assessment-procedures'
import {
  catalogPublicContract,
  coursesContract,
  instructorProfileContract,
  learnContract,
} from './catalog'
import {
  adminCertificatesContract,
  certificatesContract,
  studioCertificatesContract,
} from './certificates'
import { cohortsContract, studioCohortsContract } from './cohorts'
import {
  adminCommissionContract,
  adminCouponsContract,
  adminLedgerContract,
  adminOrdersContract,
  bundlesContract,
  cartContract,
  checkoutContract,
  couponsContract,
  enrollmentsContract,
  ordersContract,
  referralsContract,
  studioCouponsContract,
  wishlistContract,
} from './commerce'
import { adminModerationContract, communityContract } from './community'
import { healthContract } from './health'
import { meContract, usersContract } from './identity'
import { instructorsContract, kycContract, payoutAccountsContract } from './instructors'
import {
  bookmarksContract,
  engagementContract,
  learnPlayerContract,
  notesContract,
  progressContract,
  studioDripContract,
  studioLearnersContract,
} from './learning'
import { liveContract, studioLiveContract } from './live'
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
  learn: { ...learnContract, ...learnPlayerContract },
  studio: {
    ...studioContract,
    coupons: studioCouponsContract,
    drip: studioDripContract,
    learners: studioLearnersContract,
    questionBanks: studioQuestionBanksContract,
    questions: studioQuestionsContract,
    quizzes: studioQuizzesContract,
    assignments: studioAssignmentsContract,
    certificates: studioCertificatesContract,
    cohorts: studioCohortsContract,
    live: studioLiveContract,
  },
  instructors: { ...instructorsContract, ...instructorProfileContract },
  kyc: kycContract,
  payoutAccounts: payoutAccountsContract,
  admin: {
    ...adminContract,
    commission: adminCommissionContract,
    orders: adminOrdersContract,
    coupons: adminCouponsContract,
    ledger: adminLedgerContract,
    certificates: adminCertificatesContract,
    moderation: adminModerationContract,
  },
  cart: cartContract,
  wishlist: wishlistContract,
  coupons: couponsContract,
  checkout: checkoutContract,
  orders: ordersContract,
  enrollments: enrollmentsContract,
  bundles: bundlesContract,
  referrals: referralsContract,
  progress: progressContract,
  notes: notesContract,
  bookmarks: bookmarksContract,
  engagement: engagementContract,
  quizzes: quizzesContract,
  exams: examsContract,
  assignments: assignmentsContract,
  grading: gradingContract,
  certificates: certificatesContract,
  cohorts: cohortsContract,
  community: communityContract,
  live: liveContract,
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
  AttemptDto,
  AttemptReviewDto,
  FlaggedAttemptDto,
  GradingViewDto,
  MyAssignmentDto,
  QuestionBankDto,
  QuestionDto,
  QueueItemDto,
  QuizIntroDto,
  StudioAssignmentDto,
  StudioQuizDto,
  SubmissionDto,
} from './assessment-procedures'
export {
  AcceptedText,
  AnswerKey,
  type AnswerKeyOf,
  AnyLearnerAnswer,
  defaultQuizSettings,
  LearnerAnswer,
  type LearnerAnswerOf,
  QuestionOptions,
  type QuestionOptionsOf,
  QuestionType,
  QuizKind,
  QuizSettings,
  ShowAnswers,
} from './assessments'
export {
  AssignmentSettings,
  LatePolicy,
  Rubric,
  RubricCriterion,
  RubricLevel,
  rubricMax,
  SubmissionType,
} from './assignments'
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
  AdminCertificateDto,
  CertificateBasis,
  CertificateMode,
  CertificateSettings,
  CourseCertificateDto,
  ExternalResultDto,
  IssuedCertificateDto,
  MyCertificateDto,
  PublicCertificateDto,
  StudioCertificateSettingsDto,
} from './certificates'
export {
  CohortStatus,
  MyCohortDto,
  PublicCohortDto,
  StudioCohortsDto,
} from './cohorts'
export {
  type AdminOrderDto,
  type AdminOrderRowDto,
  AttributionSource,
  CartDto,
  CartItemDto,
  type CheckoutResultDto,
  type CommissionRuleDto,
  type CompletedOrderDto,
  CouponCreateInput,
  CouponDto,
  ItemRefInput,
  ItemType,
  type JournalEntryDto,
  type MyCourseDto,
  OrderDetailDto,
  type OrderSummaryDto,
  PublicBundleDto,
  type ReferralLinkDto,
} from './commerce'
export {
  ReportDto,
  ScopeType,
  ThreadDto,
  ThreadFilter,
  ThreadKind,
  ThreadSummaryDto,
  UnansweredQuestionDto,
} from './community'
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
export {
  ContinueDto,
  CourseLearnerDto,
  DripMode,
  DripSettingsDto,
  HeartbeatInput,
  LearnLessonDto,
  LearnOutlineDto,
  NoteDto,
  ProgressStatus,
} from './learning'
export {
  AttendanceDto,
  LiveOptionsDto,
  LivePhase,
  LiveSessionDetailDto,
  LiveSessionDto,
  LiveStatus,
  StudioLiveSessionDto,
} from './live'
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
