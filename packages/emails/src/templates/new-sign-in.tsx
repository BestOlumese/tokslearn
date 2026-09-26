import { Text } from '@react-email/components'
import type { EmailData } from '../catalog'
import { formatLagos } from '../catalog'
import { EmailLayout, Heading, muted, PrimaryButton, text } from '../layout'

export const subject = () => 'New sign-in to your account'

export function NewSignIn({ name, when, device, ipHint, securityUrl }: EmailData['new-sign-in']) {
  return (
    <EmailLayout
      preview="A device we haven't seen before signed in to your account."
      why="You're getting this security notice because your account was used on a new device. You can't turn these off."
    >
      <Heading>New sign-in</Heading>
      <Text style={text}>
        Hi {name}, your account was signed in on a device we haven't seen before.
      </Text>
      <Text style={text}>
        When: {formatLagos(when)} (Lagos time)
        <br />
        Device: {device ?? 'Unknown'}
        <br />
        Network: {ipHint ?? 'Unknown'}
      </Text>
      <Text style={text}>
        If this was you, there's nothing to do. If not, sign that device out and change your
        password.
      </Text>
      <PrimaryButton href={securityUrl}>Review my sessions</PrimaryButton>
      <Text style={muted}>The network address is shortened to protect your privacy.</Text>
    </EmailLayout>
  )
}
