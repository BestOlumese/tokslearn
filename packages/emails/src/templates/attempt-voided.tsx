import { Text } from '@react-email/components'
import type { EmailData } from '../catalog'
import { EmailLayout, Heading, PrimaryButton, text } from '../layout'

export const subject = ({ courseTitle }: EmailData['attempt-voided']) => {
  const s = `Your exam attempt in ${courseTitle} was cancelled`
  return s.length <= 60 ? s : `${s.slice(0, 57).trimEnd()}…`
}

export function AttemptVoided(props: EmailData['attempt-voided']) {
  const { name, courseTitle, examTitle, reason, url } = props
  return (
    <EmailLayout
      preview={`Your attempt at ${examTitle} no longer counts. You can take it again.`}
      why={`You're getting this because you took ${examTitle} in ${courseTitle}.`}
    >
      <Heading>Your exam attempt was cancelled</Heading>
      <Text style={text}>
        {name}, your instructor reviewed your attempt at {examTitle} and cancelled it. Their reason:
      </Text>
      <Text style={text}>“{reason}”</Text>
      <Text style={text}>
        The attempt no longer counts against your limit, so you can take the exam again. If you
        think this is a mistake, contact Tokslearn from the Help page and we'll look into it.
      </Text>
      <PrimaryButton href={url}>Go to the exam</PrimaryButton>
    </EmailLayout>
  )
}
