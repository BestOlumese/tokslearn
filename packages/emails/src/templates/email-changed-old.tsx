import { Text } from '@react-email/components'
import type { EmailData } from '../catalog'
import { EmailLayout, Heading, muted, PrimaryButton, text } from '../layout'

export const subject = () => 'Your email address is being changed'

export function EmailChangedOld({ name, newEmail, cancelUrl }: EmailData['email-changed-old']) {
  return (
    <EmailLayout
      preview={`Your account email is changing to ${newEmail}.`}
      why="You're getting this security notice at your old address because the email on your Tokslearn account is changing."
    >
      <Heading>Your email is being changed</Heading>
      <Text style={text}>
        Hi {name}, someone asked to change the email on your account to {newEmail}. The change
        finishes when that address is confirmed.
      </Text>
      <Text style={text}>If this wasn't you, cancel it now.</Text>
      <PrimaryButton href={cancelUrl}>Cancel the change</PrimaryButton>
      <Text style={muted}>After cancelling, change your password as well.</Text>
    </EmailLayout>
  )
}
