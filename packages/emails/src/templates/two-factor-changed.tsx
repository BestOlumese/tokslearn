import { Text } from '@react-email/components'
import type { EmailData } from '../catalog'
import { formatLagos } from '../catalog'
import { EmailLayout, Heading, muted, PrimaryButton, text } from '../layout'

const what = {
  enabled: 'turned on',
  disabled: 'turned off',
  backup_codes: 'given new backup codes',
} as const

export const subject = ({ change }: EmailData['two-factor-changed']) =>
  change === 'backup_codes'
    ? 'New two-factor backup codes were created'
    : `Two-factor authentication was ${what[change]}`

export function TwoFactorChanged({
  name,
  change,
  when,
  securityUrl,
}: EmailData['two-factor-changed']) {
  const line =
    change === 'backup_codes'
      ? 'new backup codes were created for your account. Your old codes no longer work.'
      : `two-factor authentication was ${what[change]} for your account.`
  return (
    <EmailLayout
      preview={subject({ name, change, when, securityUrl })}
      why="You're getting this security notice because your sign-in settings changed. You can't turn these off."
    >
      <Heading>{subject({ name, change, when, securityUrl })}</Heading>
      <Text style={text}>
        Hi {name}, on {formatLagos(when)} (Lagos time) {line}
      </Text>
      <Text style={text}>
        If this wasn't you, check your security settings now and email support@tokslearn.com.
      </Text>
      <PrimaryButton href={securityUrl}>Open security settings</PrimaryButton>
      {change === 'disabled' ? (
        <Text style={muted}>
          Staff and instructors need two-factor authentication for payouts and admin tools.
        </Text>
      ) : null}
    </EmailLayout>
  )
}
