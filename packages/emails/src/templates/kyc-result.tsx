import { Text } from '@react-email/components'
import type { EmailData } from '../catalog'
import { EmailLayout, Heading, muted, PrimaryButton, text } from '../layout'

export const subject = ({ outcome }: EmailData['kyc-result']) =>
  `Identity verification ${outcome === 'verified' ? 'complete' : 'needs attention'}`

export function KycResult({ name, outcome, applyUrl }: EmailData['kyc-result']) {
  return (
    <EmailLayout
      preview={
        outcome === 'verified'
          ? 'Your identity is verified.'
          : 'We need to check your identity by hand, or you can try again.'
      }
      why="You're getting this because you verified your identity to teach on Tokslearn."
    >
      {outcome === 'verified' ? (
        <>
          <Heading>Your identity is verified</Heading>
          <Text style={text}>
            Thanks, {name}. Your name and selfie matched your record. Next, add the bank account
            where you want to be paid.
          </Text>
        </>
      ) : outcome === 'manual_review' ? (
        <>
          <Heading>We'll check your identity by hand</Heading>
          <Text style={text}>
            Hi {name}, we found your record but your selfie or name didn't match closely enough for
            an automatic check. A reviewer will compare them when they look at your application. You
            don't need to do anything.
          </Text>
        </>
      ) : (
        <>
          <Heading>We couldn't verify your identity</Heading>
          <Text style={text}>
            Hi {name}, we couldn't find a record for the number you entered. Check the number and
            try again, or use the other ID type (BVN or NIN).
          </Text>
        </>
      )}
      <PrimaryButton href={applyUrl}>Continue your application</PrimaryButton>
      <Text style={muted}>
        We never store your BVN or NIN. We keep the result of the check only.
      </Text>
    </EmailLayout>
  )
}
