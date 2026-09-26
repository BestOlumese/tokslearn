import { Text } from '@react-email/components'
import type { EmailData } from '../catalog'
import { formatLagos } from '../catalog'
import { EmailLayout, Heading, muted, PrimaryButton, text } from '../layout'

export const subject = ({ scheduledFor }: EmailData['deletion-requested']) =>
  `Your account will be deleted on ${formatLagos(scheduledFor, false)}`

export function DeletionRequested({
  name,
  scheduledFor,
  cancelUrl,
}: EmailData['deletion-requested']) {
  return (
    <EmailLayout
      preview="You asked us to delete your Tokslearn account. You can still cancel."
      why="You're getting this security notice because a deletion request was made for your Tokslearn account."
    >
      <Heading>Your account will be deleted</Heading>
      <Text style={text}>
        Hi {name}, we'll delete your account on {formatLagos(scheduledFor, false)}. Until then you
        can cancel and keep everything.
      </Text>
      <Text style={text}>
        What we delete: your name, email, photo, profile, notes and sign-in details.
        <br />
        What we keep: receipts and payment records, without your name, because the law requires us
        to keep them.
      </Text>
      <PrimaryButton href={cancelUrl}>Keep my account</PrimaryButton>
      <Text style={muted}>
        If you didn't ask for this, press the button and change your password.
      </Text>
    </EmailLayout>
  )
}
