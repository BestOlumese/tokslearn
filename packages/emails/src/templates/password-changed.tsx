import { Text } from '@react-email/components'
import type { EmailData } from '../catalog'
import { formatLagos } from '../catalog'
import { EmailLayout, Heading, muted, PrimaryButton, text } from '../layout'

export const subject = () => 'Your password was changed'

export function PasswordChanged({ name, when, device, resetUrl }: EmailData['password-changed']) {
  return (
    <EmailLayout
      preview="Your Tokslearn password was just changed."
      why="You're getting this security notice because the password on your Tokslearn account changed. You can't turn these off."
    >
      <Heading>Your password was changed</Heading>
      <Text style={text}>
        Hi {name}, the password for your account was changed on {formatLagos(when)} (Lagos time)
        {device ? ` from ${device}` : ''}.
      </Text>
      <Text style={text}>If this was you, there's nothing to do.</Text>
      <Text style={text}>
        If it wasn't, reset your password now and email support@tokslearn.com.
      </Text>
      <PrimaryButton href={resetUrl}>Reset my password</PrimaryButton>
      <Text style={muted}>
        Resetting signs out every device, including anyone who used your old password.
      </Text>
    </EmailLayout>
  )
}
