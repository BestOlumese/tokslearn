import { Section, Text } from '@react-email/components'
import { type EmailData, formatNairaKobo } from '../catalog'
import { EmailLayout, FallbackLink, Heading, muted, PrimaryButton, text } from '../layout'

type Data = EmailData['monthly-statement']

export const subject = ({ monthLabel }: Data) => `Your ${monthLabel} statement`

export function MonthlyStatement(props: Data) {
  const { name, monthLabel, sales, shareKobo, refundedKobo, paidOutKobo, availableKobo, url } =
    props
  const rows: Array<[string, string]> = [
    ['Courses sold', String(sales)],
    ['Your share of those sales', formatNairaKobo(shareKobo)],
    ['Taken back for refunds', formatNairaKobo(refundedKobo)],
    ['Paid out to your bank', formatNairaKobo(paidOutKobo)],
    ['Available at month end', formatNairaKobo(availableKobo)],
  ]
  return (
    <EmailLayout
      preview={`${sales} ${sales === 1 ? 'sale' : 'sales'}, ${formatNairaKobo(shareKobo)} your share.`}
      why="You're getting this because you teach on Tokslearn. It comes on the 1st of every month you had sales or payouts."
    >
      <Heading>{`Your ${monthLabel} statement`}</Heading>
      <Text style={text}>
        Hi {name}, here’s how {monthLabel} went.
      </Text>
      <Section>
        {rows.map(([label, value]) => (
          <Text key={label} style={{ ...text, margin: '0 0 6px' }}>
            {label}: <strong>{value}</strong>
          </Text>
        ))}
      </Section>
      <Text style={muted}>
        Available money is paid out on the 5th if it’s at least ₦5,000 and your bank account and
        identity check are in order.
      </Text>
      <PrimaryButton href={url}>Download the PDF</PrimaryButton>
      <FallbackLink href={url} />
    </EmailLayout>
  )
}
