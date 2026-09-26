import { Text } from '@react-email/components'
import type { EmailData } from '../catalog'
import { formatLagos } from '../catalog'
import { EmailLayout, Heading, muted, PrimaryButton, text } from '../layout'

export const subject = (_: EmailData['payout-account-changed']) =>
  'Your payout bank account was changed'

export function PayoutAccountChanged(props: EmailData['payout-account-changed']) {
  const { name, bankName, last4, payoutsFrom, securityUrl } = props
  return (
    <EmailLayout
      preview={`Payouts now go to ${bankName} ending ${last4}.`}
      why="You're getting this security notice because the payout account on your Tokslearn instructor account changed."
    >
      <Heading>Your payout account changed</Heading>
      <Text style={text}>
        Hi {name}, your payouts will now go to {bankName}, account ending {last4}.
      </Text>
      <Text style={text}>
        For your safety, payouts to this account start on {formatLagos(payoutsFrom)}. Anything due
        before then waits for the next payout day.
      </Text>
      <PrimaryButton href={securityUrl}>This wasn't me</PrimaryButton>
      <Text style={muted}>
        If you didn't make this change, press the button, change your password and contact support.
        We won't pay out to the new account until you reply.
      </Text>
    </EmailLayout>
  )
}
