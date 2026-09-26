import { Text } from '@react-email/components'
import type { EmailData } from '../catalog'
import { EmailLayout, Heading, PrimaryButton, text } from '../layout'

export const subject = ({ courseTitle, approved }: EmailData['course-review-decision']) =>
  `${courseTitle} is ${approved ? 'live' : 'ready for changes'}`

export function CourseReviewDecision(props: EmailData['course-review-decision']) {
  const { name, courseTitle, approved, notes, url } = props
  return (
    <EmailLayout
      preview={
        approved
          ? `${courseTitle} is on sale now.`
          : `The reviewer asked for changes to ${courseTitle}.`
      }
      why="You're getting this because you submitted a course for review on Tokslearn."
    >
      {approved ? (
        <>
          <Heading>Your course is live</Heading>
          <Text style={text}>
            Good news, {name}: {courseTitle} passed review and learners can find it now. Share its
            link with your audience. You keep 97% of sales that come from your own links and
            coupons.
          </Text>
          <PrimaryButton href={url}>See your course page</PrimaryButton>
        </>
      ) : (
        <>
          <Heading>Your course needs changes</Heading>
          <Text style={text}>
            Hi {name}, the reviewer asked for these changes to {courseTitle}:
          </Text>
          <Text style={{ ...text, whiteSpace: 'pre-line' }}>{notes}</Text>
          <Text style={text}>Make the changes, then submit the course again.</Text>
          <PrimaryButton href={url}>Edit your course</PrimaryButton>
        </>
      )}
    </EmailLayout>
  )
}
