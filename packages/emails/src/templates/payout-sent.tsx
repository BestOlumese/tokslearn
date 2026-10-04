import { Text } from '@react-email/components'
import { type EmailData, formatNairaKobo } from '../catalog'
import { EmailLayout, FallbackLink, Heading, muted, PrimaryButton, text } from '../layout'

type Data = EmailData['payout-sent']

export const subject = ({ amountKobo }: Data) =>
  `Your payout of ${formatNairaKobo(amountKobo)} is on its way`

export function PayoutSent({ name, amountKobo, bankName, last4, monthLabel, url }: Data) {
  const amount = formatNairaKobo(amountKobo)
  return (
    <EmailLayout
      preview={`${amount} to ${bankName} •••• ${last4}.`}
      why="You're getting this because you teach on Tokslearn and we sent you money."
    >
      <Heading>{`${amount} is on its way`}</Heading>
      <Text style={text}>
        Hi {name}, Paystack has sent your {monthLabel} payout of <strong>{amount}</strong> to{' '}
        {bankName} •••• {last4}.
      </Text>
      <Text style={muted}>
        Most banks show it within minutes; some take until the next working day. If it hasn’t
        arrived in two working days, reply to this email.
      </Text>
      <PrimaryButton href={url}>See your earnings</PrimaryButton>
      <FallbackLink href={url} />
    </EmailLayout>
  )
}
