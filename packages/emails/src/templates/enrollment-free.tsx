import { Text } from '@react-email/components'
import type { EmailData } from '../catalog'
import { EmailLayout, Heading, PrimaryButton, text } from '../layout'

export const subject = ({ courseTitle }: EmailData['enrollment-free']) => {
  const s = `You're enrolled in ${courseTitle}`
  return s.length <= 60 ? s : `${s.slice(0, 57).trimEnd()}…`
}

export function EnrollmentFree(props: EmailData['enrollment-free']) {
  const { name, courseTitle, lessonCount, duration, certificate, url } = props
  const inside = `${lessonCount} ${lessonCount === 1 ? 'lesson' : 'lessons'}${duration ? `, ${duration} in total` : ''}`
  return (
    <EmailLayout
      preview={`${courseTitle} is in your learning list now.`}
      why="You're getting this because you enrolled in a free course on Tokslearn."
    >
      <Heading>You're in, {name}</Heading>
      <Text style={text}>
        {courseTitle} is free, and it's now in your learning list: {inside}. Your progress is saved
        on your phone and your laptop.
      </Text>
      {certificate ? <Text style={text}>{certificate}</Text> : null}
      <PrimaryButton href={url}>Start the course</PrimaryButton>
    </EmailLayout>
  )
}
