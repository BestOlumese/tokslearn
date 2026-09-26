import { Text } from '@react-email/components'
import type { EmailData } from '../catalog'
import { EmailLayout, Heading, muted, PrimaryButton, text } from '../layout'

export const subject = (_: EmailData['application-received']) =>
  'We received your application to teach'

export function ApplicationReceived({ name, statusUrl }: EmailData['application-received']) {
  return (
    <EmailLayout
      preview="A reviewer will look at your application within 3 working days."
      why="You're getting this because you applied to teach on Tokslearn."
    >
      <Heading>We received your application</Heading>
      <Text style={text}>
        Thanks, {name}. A reviewer will read your answers, look at your sample and check your
        identity result. This usually takes up to 3 working days.
      </Text>
      <Text style={text}>
        We'll email you when there's a decision. If we approve you, you can start building your
        first course straight away.
      </Text>
      <PrimaryButton href={statusUrl}>See your application</PrimaryButton>
      <Text style={muted}>You can't edit your answers while the application is in review.</Text>
    </EmailLayout>
  )
}
