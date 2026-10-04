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

export {
  EarningLineDto,
  EarningLineStatus,
  EarningsSummaryDto,
  StatementDto,
} from './earnings'
export {
  NotificationDto,
  NotificationPreferenceDto,
  NotificationType,
} from './notifications'
export {
  RefundCheckDto,
  RefundDto,
  RefundReason,
  RefundReviewDto,
  RefundStatus,
} from './refunds'

import { earningsContract } from './earnings'
import { notificationsContract } from './notifications'
import { adminRefundsContract, refundsContract } from './refunds'

export {
  MyReviewDto,
  MyReviewPageDto,
  ReviewPageDto,
  ReviewReportDto,
  ReviewSort,
  StudioReviewDto,
} from './reviews'

import { mediaContract } from './media'
import { adminReviewsContract, reviewsContract, studioReviewsContract } from './reviews'
import { catalogContract, studioContract } from './studio'

/** The whole API surface. Web, Expo and the OpenAPI spec all come from this object. */
/**
 * Spelled out (not `typeof contract`) so the declaration build names each part instead of
 * inlining the whole API, which outgrew TypeScript's serialization limit.
 */
export type Contract = {
  health: typeof healthContract
  me: typeof meContract
  users: typeof usersContract
  media: typeof mediaContract
  catalog: typeof catalogContract & typeof catalogPublicContract
  courses: typeof coursesContract
  learn: typeof learnContract & typeof learnPlayerContract
  studio: typeof studioContract & {
    coupons: typeof studioCouponsContract
    drip: typeof studioDripContract
    learners: typeof studioLearnersContract
    questionBanks: typeof studioQuestionBanksContract
    questions: typeof studioQuestionsContract
    quizzes: typeof studioQuizzesContract
    assignments: typeof studioAssignmentsContract
    certificates: typeof studioCertificatesContract
    cohorts: typeof studioCohortsContract
    live: typeof studioLiveContract
    reviews: typeof studioReviewsContract
  }
  instructors: typeof instructorsContract & typeof instructorProfileContract
  kyc: typeof kycContract
  payoutAccounts: typeof payoutAccountsContract
  admin: typeof adminContract & {
    commission: typeof adminCommissionContract
    orders: typeof adminOrdersContract
    coupons: typeof adminCouponsContract
    ledger: typeof adminLedgerContract
    certificates: typeof adminCertificatesContract
    moderation: typeof adminModerationContract
    reviews: typeof adminReviewsContract
    refunds: typeof adminRefundsContract
  }
  cart: typeof cartContract
  wishlist: typeof wishlistContract
  coupons: typeof couponsContract
  checkout: typeof checkoutContract
  orders: typeof ordersContract
  enrollments: typeof enrollmentsContract
  bundles: typeof bundlesContract
  referrals: typeof referralsContract
  progress: typeof progressContract
  notes: typeof notesContract
  bookmarks: typeof bookmarksContract
  engagement: typeof engagementContract
  quizzes: typeof quizzesContract
  exams: typeof examsContract
  assignments: typeof assignmentsContract
  grading: typeof gradingContract
  certificates: typeof certificatesContract
  cohorts: typeof cohortsContract
  community: typeof communityContract
  live: typeof liveContract
  reviews: typeof reviewsContract
  notifications: typeof notificationsContract
  refunds: typeof refundsContract
  earnings: typeof earningsContract
}

export const contract: Contract = {
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
    reviews: studioReviewsContract,
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
    reviews: adminReviewsContract,
    refunds: adminRefundsContract,
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
  reviews: reviewsContract,
  notifications: notificationsContract,
  refunds: refundsContract,
  earnings: earningsContract,
}

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
