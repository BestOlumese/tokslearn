import { Text } from '@react-email/components'
import type { EmailData } from '../catalog'
import { EmailLayout, Heading, PrimaryButton, text } from '../layout'

export const subject = ({ courseTitle }: EmailData['lesson-unlocked']) => {
  const s = `New lesson available in ${courseTitle}`
  return s.length <= 60 ? s : `${s.slice(0, 57).trimEnd()}…`
}

export function LessonUnlocked(props: EmailData['lesson-unlocked']) {
  const { name, courseTitle, lessons, url } = props
  const [first = courseTitle] = lessons
  const more = lessons.length - 1
  return (
    <EmailLayout
      preview={`"${first}" is open now.`}
      why={`You're getting this because you're enrolled in ${courseTitle} and its instructor releases lessons on a schedule.`}
    >
      <Heading>{more > 0 ? 'New lessons are open' : 'A new lesson is open'}</Heading>
      <Text style={text}>
        {name}, "{first}" is ready for you in {courseTitle}
        {more > 0 ? `, along with ${more} more: ${lessons.slice(1).join(', ')}.` : '.'}
      </Text>
      <PrimaryButton href={url}>Open the lesson</PrimaryButton>
    </EmailLayout>
  )
}
