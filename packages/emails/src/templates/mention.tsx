import { Text } from '@react-email/components'
import type { EmailData } from '../catalog'
import { EmailLayout, Heading, PrimaryButton, text } from '../layout'

const clip = (s: string) => (s.length <= 60 ? s : `${s.slice(0, 57).trimEnd()}…`)

export const subject = ({ authorName, courseTitle }: EmailData['mention']) =>
  clip(`${authorName} mentioned you in ${courseTitle}`)

export function Mention(props: EmailData['mention']) {
  const { name, courseTitle, threadTitle, authorName, excerpt, url } = props
  return (
    <EmailLayout
      preview={`${authorName}: ${excerpt}`}
      why={`You're getting this because someone wrote @ with your username in ${courseTitle}.`}
    >
      <Heading>You were mentioned</Heading>
      <Text style={text}>
        {name}, {authorName} mentioned you in “{threadTitle}”:
      </Text>
      <Text style={text}>“{excerpt}”</Text>
      <PrimaryButton href={url}>See the post</PrimaryButton>
    </EmailLayout>
  )
}
