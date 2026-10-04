import { impl } from './base'
import { adminRouter } from './procedures/admin'
import {
  assignmentsRouter,
  examsRouter,
  gradingRouter,
  quizzesRouter,
  studioAssignmentsRouter,
  studioQuestionBanksRouter,
  studioQuestionsRouter,
  studioQuizzesRouter,
} from './procedures/assessments'
import {
  adminDashboardRouter,
  adminInstructorStaffRouter,
  adminJobsRouter,
  adminSettingsRouter,
} from './procedures/backoffice'
import {
  catalogPublicRouter,
  coursesRouter,
  instructorProfileHandlers,
  learnRouter,
} from './procedures/catalog'
import {
  adminCertificatesRouter,
  certificatesRouter,
  studioCertificatesRouter,
} from './procedures/certificates'
import { cohortsRouter, studioCohortsRouter } from './procedures/cohorts'
import {
  adminCommissionRouter,
  adminCouponsRouter,
  adminLedgerRouter,
  adminOrdersRouter,
  bundlesRouter,
  cartRouter,
  checkoutRouter,
  couponsRouter,
  enrollmentsRouter,
  ordersRouter,
  referralsRouter,
  studioCouponsRouter,
  wishlistRouter,
} from './procedures/commerce'
import { adminModerationRouter, communityRouter } from './procedures/community'
import { earningsRouter } from './procedures/earnings'
import { healthRouter } from './procedures/health'
import { instructorsRouter, kycRouter, payoutAccountsRouter } from './procedures/instructors'
import {
  bookmarksRouter,
  engagementRouter,
  learnPlayerRouter,
  notesRouter,
  progressRouter,
  studioDripRouter,
  studioLearnersRouter,
} from './procedures/learning'
import { liveRouter, studioLiveRouter } from './procedures/live'
import { meRouter } from './procedures/me'
import { mediaRouter } from './procedures/media'
import { notificationsRouter } from './procedures/notifications'
import { adminPayoutsRouter } from './procedures/payouts'
import { adminRefundsRouter, refundsRouter } from './procedures/refunds'
import { adminReviewsRouter, reviewsRouter, studioReviewsRouter } from './procedures/reviews'
import { catalogCategoriesHandler, studioRouter } from './procedures/studio'
import { usersRouter } from './procedures/users'

export const router = impl.router({
  health: healthRouter,
  me: meRouter,
  users: usersRouter,
  media: mediaRouter,
  catalog: { categories: catalogCategoriesHandler, ...catalogPublicRouter },
  courses: coursesRouter,
  learn: { ...learnRouter, ...learnPlayerRouter },
  studio: {
    ...studioRouter,
    coupons: studioCouponsRouter,
    drip: studioDripRouter,
    learners: studioLearnersRouter,
    questionBanks: studioQuestionBanksRouter,
    questions: studioQuestionsRouter,
    quizzes: studioQuizzesRouter,
    assignments: studioAssignmentsRouter,
    certificates: studioCertificatesRouter,
    cohorts: studioCohortsRouter,
    live: studioLiveRouter,
    reviews: studioReviewsRouter,
  },
  instructors: { ...instructorsRouter, ...instructorProfileHandlers },
  kyc: kycRouter,
  payoutAccounts: payoutAccountsRouter,
  admin: {
    ...adminRouter,
    commission: adminCommissionRouter,
    orders: adminOrdersRouter,
    coupons: adminCouponsRouter,
    ledger: adminLedgerRouter,
    certificates: adminCertificatesRouter,
    moderation: adminModerationRouter,
    reviews: adminReviewsRouter,
    refunds: adminRefundsRouter,
    payouts: adminPayoutsRouter,
    dashboard: adminDashboardRouter,
    jobs: adminJobsRouter,
    settings: adminSettingsRouter,
    instructors: { ...adminRouter.instructors, ...adminInstructorStaffRouter },
  },
  cart: cartRouter,
  wishlist: wishlistRouter,
  coupons: couponsRouter,
  checkout: checkoutRouter,
  orders: ordersRouter,
  enrollments: enrollmentsRouter,
  bundles: bundlesRouter,
  referrals: referralsRouter,
  progress: progressRouter,
  notes: notesRouter,
  bookmarks: bookmarksRouter,
  engagement: engagementRouter,
  quizzes: quizzesRouter,
  exams: examsRouter,
  assignments: assignmentsRouter,
  grading: gradingRouter,
  certificates: certificatesRouter,
  cohorts: cohortsRouter,
  community: communityRouter,
  live: liveRouter,
  reviews: reviewsRouter,
  notifications: notificationsRouter,
  refunds: refundsRouter,
  earnings: earningsRouter,
})

export type Router = typeof router
