import { Link, Text } from '@react-email/components'
import type { EmailData } from '../catalog'
import { EmailLayout, FallbackLink, Heading, muted, PrimaryButton, text } from '../layout'

type Data = EmailData['live-reminder-15m']

const clip = (s: string) => (s.length <= 60 ? s : `${s.slice(0, 57).trimEnd()}…`)

export const subject24h = ({ sessionTitle, time }: Data) =>
  clip(`${sessionTitle} starts tomorrow at ${time}`)
export const subject15m = ({ sessionTitle }: Data) => clip(`${sessionTitle} starts in 15 minutes`)

export function LiveReminder(props: Data & { calendarUrl?: string; soon: boolean }) {
  const { name, courseTitle, sessionTitle, when, hostName, url, calendarUrl, cohortName, soon } =
    props
  return (
    <EmailLayout
      preview={soon ? `Join ${sessionTitle} now.` : `${when}, Lagos time.`}
      why={`You're getting this because you're learning ${courseTitle}${cohortName ? ` in the ${cohortName} cohort` : ''}.`}
    >
      <Heading>
        {soon ? `${sessionTitle} starts in 15 minutes` : `${sessionTitle} is tomorrow`}
      </Heading>
      <Text style={text}>
        Hi {name}, {hostName} is teaching a live class for {courseTitle} on {when} (Lagos time).
      </Text>
      <Text style={text}>
        {soon
          ? 'The room is open. Join from a laptop or your phone; your camera and microphone start off.'
          : 'The room opens 15 minutes before the start. Your camera and microphone start off.'}
      </Text>
      <PrimaryButton href={url}>{soon ? 'Join the class' : 'See the class'}</PrimaryButton>
      <FallbackLink href={url} />
      {calendarUrl ? (
        <Text style={muted}>
          <Link href={calendarUrl}>Add it to Google Calendar</Link>
        </Text>
      ) : null}
    </EmailLayout>
  )
}
