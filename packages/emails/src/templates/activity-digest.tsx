import { Link, Text } from '@react-email/components'
import type { EmailData } from '../catalog'
import { EmailLayout, Heading, muted, PrimaryButton, text } from '../layout'

type Data = EmailData['activity-digest']

export const subject = ({ count }: Data) => `${count} new replies and mentions on Tokslearn`

export function ActivityDigest({ name, count, items, url }: Data) {
  return (
    <EmailLayout
      preview={items[0]?.title ?? `${count} updates from your courses.`}
      why="You're getting one email for these instead of one each, because a lot happened in an hour. Choose what we email you in Settings → Notifications."
    >
      <Heading>{`${count} updates while you were away`}</Heading>
      <Text style={text}>Hi {name}, here’s what happened in your courses in the last hour.</Text>
      {items.map((item, i) => (
        // Fixed list of one email; the order never changes.
        // biome-ignore lint/suspicious/noArrayIndexKey: static rows of one message
        <Text key={i} style={{ ...text, margin: '0 0 8px' }}>
          {item.url ? <Link href={item.url}>{item.title}</Link> : item.title}
        </Text>
      ))}
      {count > items.length ? <Text style={muted}>And {count - items.length} more.</Text> : null}
      <PrimaryButton href={url}>See all notifications</PrimaryButton>
    </EmailLayout>
  )
}
