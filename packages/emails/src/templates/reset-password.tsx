import { Text } from '@react-email/components'
import type { EmailData } from '../catalog'
import { EmailLayout, FallbackLink, Heading, muted, PrimaryButton, text } from '../layout'

export const subject = () => 'Reset your Tokslearn password'

export function ResetPassword({ name, url }: EmailData['reset-password']) {
  return (
    <EmailLayout
      preview="Choose a new password. The link works for 1 hour."
      why="You're getting this because someone asked to reset the password for this Tokslearn account."
    >
      <Heading>Reset your password</Heading>
      <Text style={text}>
        Hi {name}, press the button to choose a new password. The link works for 1 hour.
      </Text>
      <PrimaryButton href={url}>Choose a new password</PrimaryButton>
      <Text style={muted}>
        After you reset it, every device signed in to your account is signed out. If you didn't ask
        for this, ignore this email; your password stays the same.
      </Text>
      <FallbackLink href={url} />
    </EmailLayout>
  )
}
