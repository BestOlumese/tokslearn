import { render, toPlainText } from '@react-email/components'
import type { ReactElement } from 'react'
import type { EmailData, EmailId } from './catalog'
import * as dataExportReady from './templates/data-export-ready'
import * as deletionRequested from './templates/deletion-requested'
import * as emailChangedOld from './templates/email-changed-old'
import * as newSignIn from './templates/new-sign-in'
import * as passwordChanged from './templates/password-changed'
import * as resetPassword from './templates/reset-password'
import * as signInCode from './templates/sign-in-code'
import * as twoFactorChanged from './templates/two-factor-changed'
import * as verifyEmail from './templates/verify-email'

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
