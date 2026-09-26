import { Text } from '@react-email/components'
import type { EmailData } from '../catalog'
import { formatLagos } from '../catalog'
import { EmailLayout, Heading, muted, PrimaryButton, text } from '../layout'

export const subject = ({ approved }: EmailData['application-decision']) =>
  `Your Tokslearn instructor application: ${approved ? 'approved' : 'not approved'}`

export function ApplicationDecision(props: EmailData['application-decision']) {
  const { name, approved, reason, reapplyOn, url } = props
  return (
    <EmailLayout
      preview={
        approved
          ? 'You can start building your first course now.'
          : 'Your application to teach was not approved this time.'
      }
      why="You're getting this because you applied to teach on Tokslearn."
    >
      {approved ? (
        <>
          <Heading>You're approved to teach</Heading>
          <Text style={text}>
            Congratulations, {name}. You can create your first course in the studio now. When it's
            ready, submit it for review; we check every course before it goes on sale.
          </Text>
          <Text style={text}>
            Before your first payout you'll need two-factor authentication turned on. Your bank
            account is already saved.
          </Text>
          <PrimaryButton href={url}>Open the studio</PrimaryButton>
        </>
      ) : (
        <>
          <Heading>Your application wasn't approved</Heading>
          <Text style={text}>Hi {name}, a reviewer looked at your application. Their reason:</Text>
          <Text style={{ ...text, fontStyle: 'italic' }}>{reason}</Text>
          {reapplyOn ? (
            <Text style={text}>You can apply again from {formatLagos(reapplyOn, false)}.</Text>
          ) : null}
          <PrimaryButton href={url}>Read what we look for</PrimaryButton>
          <Text style={muted}>Reply to this email if you think we made a mistake.</Text>
        </>
      )}
    </EmailLayout>
  )
}
