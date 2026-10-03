import { Text } from '@react-email/components'
import type { EmailData } from '../catalog'
import { EmailLayout, FallbackLink, Heading, PrimaryButton, text } from '../layout'

type Data = EmailData['new-review']

const clip = (s: string) => (s.length <= 60 ? s : `${s.slice(0, 57).trimEnd()}…`)
const stars = (n: number) => `${n}-star`

export const subject = ({ rating, courseTitle }: Data) =>
  clip(`New ${stars(rating)} review on ${courseTitle}`)

export function NewReview({ name, courseTitle, rating, excerpt, url }: Data) {
  return (
    <EmailLayout
      preview={excerpt ?? `A learner rated ${courseTitle} ${rating} out of 5.`}
      why={`You're getting this because you teach ${courseTitle}.`}
    >
      <Heading>{`${'★'.repeat(rating)}${'☆'.repeat(5 - rating)} on ${courseTitle}`}</Heading>
      <Text style={text}>
        Hi {name}, a learner rated your course {rating} out of 5
        {excerpt ? ' and wrote:' : ' without writing a review.'}
      </Text>
      {excerpt ? <Text style={{ ...text, fontStyle: 'italic' }}>“{excerpt}”</Text> : null}
      <Text style={text}>
        A short, specific reply shows future buyers you read what learners say. You can reply once
        and edit it later.
      </Text>
      <PrimaryButton href={url}>Reply in the studio</PrimaryButton>
      <FallbackLink href={url} />
    </EmailLayout>
  )
}
