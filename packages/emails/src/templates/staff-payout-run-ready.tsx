import { Section, Text } from '@react-email/components'
import { type EmailData, formatNairaKobo } from '../catalog'
import { EmailLayout, FallbackLink, Heading, muted, PrimaryButton, text } from '../layout'

type Data = EmailData['staff-payout-run-ready']

export const subject = ({ monthLabel }: Data) => `Payout run for ${monthLabel} ready for review`

export function StaffPayoutRunReady(props: Data) {
  const {
    name,
    monthLabel,
    totalKobo,
    instructors,
    held,
    flagged,
    payOnLabel,
    cosignRequired,
    url,
  } = props
  const rows: Array<[string, string]> = [
    [
      'To pay',
      `${formatNairaKobo(totalKobo)} to ${instructors} ${instructors === 1 ? 'instructor' : 'instructors'}`,
    ],
    ['Held (can’t be paid yet)', String(held)],
    ['Flagged to check', String(flagged)],
    ['Transfers start', payOnLabel],
  ]
  return (
    <EmailLayout
      preview={`${formatNairaKobo(totalKobo)} to ${instructors} instructors, from ${payOnLabel}.`}
      why="You're getting this because you're on Tokslearn's finance team."
    >
      <Heading>{`${monthLabel} payout run`}</Heading>
      <Text style={text}>Hi {name}, the draft is ready for you to check and approve.</Text>
      <Section>
        {rows.map(([label, value]) => (
          <Text key={label} style={{ ...text, margin: '0 0 6px' }}>
            {label}: <strong>{value}</strong>
          </Text>
        ))}
      </Section>
      {cosignRequired ? (
        <Text style={text}>
          This run is over the co-sign limit, so a super admin has to approve it too.
        </Text>
      ) : null}
      <PrimaryButton href={url}>Review the run</PrimaryButton>
      <FallbackLink href={url} />
      <Text style={muted}>Nothing is sent until the run is approved.</Text>
    </EmailLayout>
  )
}
