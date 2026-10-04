import { Text } from '@react-email/components'
import { type EmailData, formatNairaKobo } from '../catalog'
import { EmailLayout, FallbackLink, Heading, muted, PrimaryButton, text } from '../layout'

type Data = EmailData['payout-failed']

export const subject = (_: Data) => 'We couldn’t send your payout'

export function PayoutFailed({ name, amountKobo, bankName, last4, monthLabel, reason, url }: Data) {
  const amount = formatNairaKobo(amountKobo)
  return (
    <EmailLayout
      preview={`Your ${monthLabel} payout of ${amount} didn’t go through. The money is safe.`}
      why="You're getting this because you teach on Tokslearn and a payout to you failed."
    >
      <Heading>We couldn’t send your payout</Heading>
      <Text style={text}>
        Hi {name}, your {monthLabel} payout of <strong>{amount}</strong> to {bankName} •••• {last4}{' '}
        didn’t go through.
        {reason ? ` The bank said: “${reason}”.` : ''}
      </Text>
      <Text style={text}>
        The money is back in your available balance. We’ll try again in next month’s payout, or
        sooner if our finance team retries it. Please check that your bank account is open and in
        your name.
      </Text>
      <PrimaryButton href={url}>Check your bank account</PrimaryButton>
      <FallbackLink href={url} />
      <Text style={muted}>
        If you change the account, payouts to the new one start 72 hours later.
      </Text>
    </EmailLayout>
  )
}
