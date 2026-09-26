import { Text } from '@react-email/components'
import type { EmailData } from '../catalog'
import { EmailLayout, FallbackLink, Heading, muted, PrimaryButton, text } from '../layout'

export const subject = () => 'Confirm your email for Tokslearn'

export function VerifyEmail({ name, url }: EmailData['verify-email']) {
  return (
    <EmailLayout
      preview="Confirm your email address to finish setting up your account."
      why="You're getting this because this address was used to create a Tokslearn account."
    >
      <Heading>Confirm your email</Heading>
      <Text style={text}>
        Hi {name}, press the button to confirm this is your email address. You need a confirmed
        email to buy courses.
      </Text>
      <PrimaryButton href={url}>Confirm email</PrimaryButton>
      <Text style={muted}>
        The link works for 24 hours. If you didn't create an account, ignore this email and nothing
        will happen.
      </Text>
      <FallbackLink href={url} />
    </EmailLayout>
  )
}
