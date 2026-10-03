import { Text } from '@react-email/components'
import { type EmailData, formatNairaKobo } from '../catalog'
import { EmailLayout, FallbackLink, Heading, PrimaryButton, text } from '../layout'

type Data = EmailData['refund-update']

const clip = (s: string) => (s.length <= 60 ? s : `${s.slice(0, 57).trimEnd()}…`)
const word = {
  approved: 'approved',
  denied: 'declined',
  under_review: 'being reviewed',
  processed: 'on its way',
} as const

export const subject = ({ courseTitle, outcome }: Data) =>
  clip(`Your refund for ${courseTitle}: ${word[outcome]}`)

export function RefundUpdate(props: Data) {
  const { name, courseTitle, outcome, amountKobo, reason, url, canAppeal } = props
  const amount = formatNairaKobo(amountKobo)
  return (
    <EmailLayout
      preview={
        outcome === 'processed'
          ? `${amount} is on its way back to you.`
          : `Your refund request for ${courseTitle} is ${word[outcome]}.`
      }
      why={`You're getting this because you asked for a refund for ${courseTitle}.`}
    >
      <Heading>
        {outcome === 'processed'
          ? `${amount} is on its way back`
          : outcome === 'approved'
            ? 'Your refund is approved'
            : outcome === 'denied'
              ? 'We couldn’t refund this course'
              : 'Your refund request is with our team'}
      </Heading>
      <Text style={text}>
        Hi {name},{' '}
        {outcome === 'processed'
          ? `Paystack has sent ${amount} back for ${courseTitle}. Banks usually take 5 to 10 working days to show it on your statement.`
          : outcome === 'approved'
            ? `we’re refunding ${amount} for ${courseTitle}. Your access to the course has ended. We’ll email you again when the money is on its way.`
            : outcome === 'denied'
              ? `your refund request for ${courseTitle} wasn’t approved.`
              : `a member of our finance team will look at your refund request for ${courseTitle}, usually within 2 working days.`}
      </Text>
      {reason ? <Text style={text}>{reason}</Text> : null}
      {outcome === 'denied' && canAppeal ? (
        <Text style={text}>
          If you think we got this wrong, you can appeal once and someone on our team will look at
          it.
        </Text>
      ) : null}
      <PrimaryButton href={url}>
        {outcome === 'denied' && canAppeal ? 'See the decision and appeal' : 'See your refunds'}
      </PrimaryButton>
      <FallbackLink href={url} />
    </EmailLayout>
  )
}
