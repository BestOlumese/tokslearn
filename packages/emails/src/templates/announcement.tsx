import { Text } from '@react-email/components'
import type { EmailData } from '../catalog'
import { EmailLayout, Heading, PrimaryButton, text } from '../layout'

const clip = (s: string) => (s.length <= 60 ? s : `${s.slice(0, 57).trimEnd()}…`)

export const subject = ({ courseTitle, title }: EmailData['announcement']) =>
  clip(`${courseTitle}: ${title}`)

export function Announcement(props: EmailData['announcement']) {
  const { courseTitle, instructorName, title, body, url, cohortName } = props
  return (
    <EmailLayout
      preview={body.slice(0, 120)}
      why={`You're getting this because you're learning ${courseTitle}${cohortName ? ` in the ${cohortName} cohort` : ''}.`}
    >
      <Heading>{title}</Heading>
      {body.split('\n\n').map((para, i) => (
        // Paragraphs of plain text; their order never changes.
        // biome-ignore lint/suspicious/noArrayIndexKey: static paragraphs of one message
        <Text key={i} style={text}>
          {para}
        </Text>
      ))}
      <Text style={text}>{instructorName}</Text>
      <PrimaryButton href={url}>Open in the course</PrimaryButton>
    </EmailLayout>
  )
}
