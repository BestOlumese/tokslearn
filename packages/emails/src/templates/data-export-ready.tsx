import { Text } from '@react-email/components'
import type { EmailData } from '../catalog'
import { formatLagos } from '../catalog'
import { EmailLayout, FallbackLink, Heading, muted, PrimaryButton, text } from '../layout'

export const subject = () => 'Your Tokslearn data export is ready'

export function DataExportReady({ name, url, expiresAt }: EmailData['data-export-ready']) {
  return (
    <EmailLayout
      preview="Download a copy of your Tokslearn data."
      why="You're getting this because you asked for a copy of your data from your privacy settings."
    >
      <Heading>Your data export is ready</Heading>
      <Text style={text}>Hi {name}, the copy of your data you asked for is ready to download.</Text>
      <PrimaryButton href={url}>Download my data</PrimaryButton>
      <Text style={muted}>
        The link works until {formatLagos(expiresAt)} (Lagos time). After that, request a new export
        from your privacy settings.
      </Text>
      <FallbackLink href={url} />
    </EmailLayout>
  )
}
