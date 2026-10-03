import { render, toPlainText } from '@react-email/components'
import type { ReactElement } from 'react'
import type { EmailData, EmailId } from './catalog'
import * as activityDigest from './templates/activity-digest'
import * as announcement from './templates/announcement'
import * as applicationDecision from './templates/application-decision'
import * as applicationReceived from './templates/application-received'
import * as assignmentGraded from './templates/assignment-graded'
import * as attemptVoided from './templates/attempt-voided'
import * as certificateIssued from './templates/certificate-issued'
import * as courseReviewDecision from './templates/course-review-decision'
import * as dataExportReady from './templates/data-export-ready'
import * as deletionRequested from './templates/deletion-requested'
import * as emailChangedOld from './templates/email-changed-old'
import * as enrollmentFree from './templates/enrollment-free'
import * as kycResult from './templates/kyc-result'
import * as lessonUnlocked from './templates/lesson-unlocked'
import * as liveReminder from './templates/live-reminder'
import * as mention from './templates/mention'
import * as newReview from './templates/new-review'
import * as newSignIn from './templates/new-sign-in'
import * as orderReceipt from './templates/order-receipt'
import * as passwordChanged from './templates/password-changed'
import * as payoutAccountChanged from './templates/payout-account-changed'
import * as resetPassword from './templates/reset-password'
import * as signInCode from './templates/sign-in-code'
import * as threadReply from './templates/thread-reply'
import * as twoFactorChanged from './templates/two-factor-changed'
import * as verifyEmail from './templates/verify-email'
import * as wishlistPriceDrop from './templates/wishlist-price-drop'

type Template<Id extends EmailId> = {
  subject: (data: EmailData[Id]) => string
  element: (data: EmailData[Id]) => ReactElement
}

const templates: { [Id in EmailId]: Template<Id> } = {
  'verify-email': {
    subject: verifyEmail.subject,
    element: (d) => <verifyEmail.VerifyEmail {...d} />,
  },
  'sign-in-code': { subject: signInCode.subject, element: (d) => <signInCode.SignInCode {...d} /> },
  'reset-password': {
    subject: resetPassword.subject,
    element: (d) => <resetPassword.ResetPassword {...d} />,
  },
  'password-changed': {
    subject: passwordChanged.subject,
    element: (d) => <passwordChanged.PasswordChanged {...d} />,
  },
  'new-sign-in': { subject: newSignIn.subject, element: (d) => <newSignIn.NewSignIn {...d} /> },
  'two-factor-changed': {
    subject: twoFactorChanged.subject,
    element: (d) => <twoFactorChanged.TwoFactorChanged {...d} />,
  },
  'email-changed-old': {
    subject: emailChangedOld.subject,
    element: (d) => <emailChangedOld.EmailChangedOld {...d} />,
  },
  'deletion-requested': {
    subject: deletionRequested.subject,
    element: (d) => <deletionRequested.DeletionRequested {...d} />,
  },
  'data-export-ready': {
    subject: dataExportReady.subject,
    element: (d) => <dataExportReady.DataExportReady {...d} />,
  },
  'application-received': {
    subject: applicationReceived.subject,
    element: (d) => <applicationReceived.ApplicationReceived {...d} />,
  },
  'application-decision': {
    subject: applicationDecision.subject,
    element: (d) => <applicationDecision.ApplicationDecision {...d} />,
  },
  'kyc-result': { subject: kycResult.subject, element: (d) => <kycResult.KycResult {...d} /> },
  'payout-account-changed': {
    subject: payoutAccountChanged.subject,
    element: (d) => <payoutAccountChanged.PayoutAccountChanged {...d} />,
  },
  'course-review-decision': {
    subject: courseReviewDecision.subject,
    element: (d) => <courseReviewDecision.CourseReviewDecision {...d} />,
  },
  'order-receipt': {
    subject: orderReceipt.subject,
    element: (d) => <orderReceipt.OrderReceipt {...d} />,
  },
  'enrollment-free': {
    subject: enrollmentFree.subject,
    element: (d) => <enrollmentFree.EnrollmentFree {...d} />,
  },
  'assignment-graded': {
    subject: assignmentGraded.subject,
    element: (d) => <assignmentGraded.AssignmentGraded {...d} />,
  },
  'certificate-issued': {
    subject: certificateIssued.subject,
    element: (d) => <certificateIssued.CertificateIssued {...d} />,
  },
  'thread-reply': {
    subject: threadReply.subject,
    element: (d) => <threadReply.ThreadReply {...d} />,
  },
  mention: {
    subject: mention.subject,
    element: (d) => <mention.Mention {...d} />,
  },
  announcement: {
    subject: announcement.subject,
    element: (d) => <announcement.Announcement {...d} />,
  },
  'attempt-voided': {
    subject: attemptVoided.subject,
    element: (d) => <attemptVoided.AttemptVoided {...d} />,
  },
  'wishlist-price-drop': {
    subject: wishlistPriceDrop.subject,
    element: (d) => <wishlistPriceDrop.WishlistPriceDrop {...d} />,
  },
  'activity-digest': {
    subject: activityDigest.subject,
    element: (d) => <activityDigest.ActivityDigest {...d} />,
  },
  'new-review': {
    subject: newReview.subject,
    element: (d) => <newReview.NewReview {...d} />,
  },
  'live-reminder-24h': {
    subject: liveReminder.subject24h,
    element: (d) => <liveReminder.LiveReminder {...d} soon={false} />,
  },
  'live-reminder-15m': {
    subject: liveReminder.subject15m,
    element: (d) => <liveReminder.LiveReminder {...d} soon />,
  },
  'lesson-unlocked': {
    subject: lessonUnlocked.subject,
    element: (d) => <lessonUnlocked.LessonUnlocked {...d} />,
  },
}

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

/** HTML + plain-text versions and the subject line for one catalog email. */
export async function renderEmail<Id extends EmailId>(
  id: Id,
  data: EmailData[Id],
): Promise<RenderedEmail> {
  const template = templates[id] as Template<Id>
  const html = await render(template.element(data))
  return { subject: template.subject(data), html, text: toPlainText(html) }
}
