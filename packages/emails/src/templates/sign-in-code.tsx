import { Text } from '@react-email/components'
import { colors } from '@tokslearn/ui/tokens'
import type { EmailData } from '../catalog'
import { EmailLayout, Heading, muted, text } from '../layout'

export const subject = ({ code }: EmailData['sign-in-code']) =>
  `Your Tokslearn sign-in code: ${code}`

export function SignInCode({ code, expiresInMinutes, device }: EmailData['sign-in-code']) {
  return (
    <EmailLayout
      preview={`Your code is ${code}. It expires in ${expiresInMinutes} minutes.`}
      why="You're getting this because someone asked to sign in to Tokslearn with this email address."
    >
      <Heading>Your sign-in code</Heading>
      <Text style={text}>Enter this code on the sign-in page:</Text>
      <Text
        style={{
          ...text,
          fontSize: '32px',
          lineHeight: '40px',
          fontWeight: 700,
          letterSpacing: '0.2em',
          fontFamily: "'SFMono-Regular', Menlo, Consolas, monospace",
          backgroundColor: colors.surfaceSunken,
          borderRadius: '6px',
          padding: '12px 16px',
          display: 'inline-block',
        }}
      >
        {code}
      </Text>
      <Text style={muted}>
        It expires in {expiresInMinutes} minutes.{device ? ` Requested from ${device}.` : ''} If you
        didn't ask for it, ignore this email. Nobody can sign in without the code.
      </Text>
    </EmailLayout>
  )
}
