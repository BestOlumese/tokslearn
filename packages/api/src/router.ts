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
  catalogPublicRouter,
  coursesRouter,
  instructorProfileHandlers,
  learnRouter,
} from './procedures/catalog'
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
import { meRouter } from './procedures/me'
import { mediaRouter } from './procedures/media'
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
})

export type Router = typeof router
