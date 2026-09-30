import { Text } from '@react-email/components'
import type { EmailData } from '../catalog'
import { EmailLayout, Heading, PrimaryButton, text } from '../layout'

const clip = (s: string) => (s.length <= 60 ? s : `${s.slice(0, 57).trimEnd()}…`)

export const subject = ({ courseTitle, decision }: EmailData['assignment-graded']) =>
  clip(
    decision === 'returned'
      ? `Your assignment in ${courseTitle} needs changes`
      : `Your assignment in ${courseTitle} has been graded`,
  )

export function AssignmentGraded(props: EmailData['assignment-graded']) {
  const { name, courseTitle, assignmentTitle, decision, score, passed, feedbackExcerpt, url } =
    props
  const returned = decision === 'returned'
  return (
    <EmailLayout
      preview={
        returned
          ? `${assignmentTitle} was sent back with notes.`
          : `${assignmentTitle}: ${score ?? 'graded'}${passed === null ? '' : passed ? ', passed' : ', not passed yet'}.`
      }
      why={`You're getting this because you submitted ${assignmentTitle} in ${courseTitle}.`}
    >
      <Heading>{returned ? 'Sent back for changes' : 'Your assignment is graded'}</Heading>
      <Text style={text}>
        {returned
          ? `${name}, your instructor read ${assignmentTitle} and sent it back with notes. Make the changes and submit it again.`
          : `${name}, your instructor graded ${assignmentTitle}${score ? `: ${score}` : ''}.${passed === null ? '' : passed ? ' That’s a pass.' : ' That’s below the pass mark this time.'}`}
      </Text>
      {feedbackExcerpt ? <Text style={text}>“{feedbackExcerpt}”</Text> : null}
      <PrimaryButton href={url}>{returned ? 'See the notes' : 'See your grade'}</PrimaryButton>
    </EmailLayout>
  )
}
