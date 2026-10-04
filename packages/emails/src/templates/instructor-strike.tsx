import { Text } from '@react-email/components'
import type { EmailData } from '../catalog'
import { EmailLayout, FallbackLink, Heading, muted, PrimaryButton, text } from '../layout'

type Data = EmailData['instructor-strike']

export const subject = ({ active, limit }: Data) =>
  `A content-policy strike was added to your account (${active} of ${limit})`

export function InstructorStrike({ name, rule, reason, active, limit, url }: Data) {
  return (
    <EmailLayout
      preview={`${rule}. You have ${active} of ${limit} strikes in the last 12 months.`}
      why="You're getting this because you teach on Tokslearn and our team reviewed your content."
    >
      <Heading>A strike was added to your account</Heading>
      <Text style={text}>
        Hi {name}, our team recorded a content-policy strike against your instructor account.
      </Text>
      <Text style={text}>
        Rule: <strong>{rule}</strong>
        <br />
        Why: {reason}
      </Text>
      <Text style={text}>
        You now have {active} of {limit} strikes in the last 12 months. At {limit}, instructor
        privileges are removed.
      </Text>
      <PrimaryButton href={url}>Read the content policy</PrimaryButton>
      <FallbackLink href={url} />
      <Text style={muted}>
        If you think this is a mistake, reply to this email and tell us why. A person will look at
        it.
      </Text>
    </EmailLayout>
  )
}
