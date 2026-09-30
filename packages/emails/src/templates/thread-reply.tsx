import { Text } from '@react-email/components'
import type { EmailData } from '../catalog'
import { EmailLayout, Heading, PrimaryButton, text } from '../layout'

const clip = (s: string) => (s.length <= 60 ? s : `${s.slice(0, 57).trimEnd()}…`)

export const subject = ({ courseTitle, isAnswer }: EmailData['thread-reply']) =>
  clip(isAnswer ? `Your question in ${courseTitle} has an answer` : `New reply in ${courseTitle}`)

export function ThreadReply(props: EmailData['thread-reply']) {
  const { name, courseTitle, threadTitle, replierName, excerpt, isAnswer, url } = props
  return (
    <EmailLayout
      preview={`${replierName}: ${excerpt}`}
      why={`You're getting this because you started or follow "${threadTitle}" in ${courseTitle}. At most one email per discussion per hour.`}
    >
      <Heading>{isAnswer ? 'Your question has an answer' : 'New reply'}</Heading>
      <Text style={text}>
        {name}, {replierName} {isAnswer ? 'answered' : 'replied to'} “{threadTitle}”:
      </Text>
      <Text style={text}>“{excerpt}”</Text>
      <PrimaryButton href={url}>{isAnswer ? 'Read the answer' : 'Read the reply'}</PrimaryButton>
    </EmailLayout>
  )
}
