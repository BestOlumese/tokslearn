// Live class times (docs/10 §11). Lagos has no daylight saving, so `+01:00` is always right.

const day = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Lagos',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})
const time = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Lagos',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})
const isoDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' })
const hhmm = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Lagos',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** "Fri 2 Oct, 7:00 pm – 8:00 pm" (Lagos). */
export const sessionTime = (startsAt: Date | string, endsAt: Date | string) =>
  `${day.format(new Date(startsAt))}, ${time.format(new Date(startsAt))} – ${time.format(new Date(endsAt))}`

export const clockTime = (iso: Date | string) => time.format(new Date(iso))

/** "in 2 days", "in 3 h 20 min", "in 12 min". */
export function untilText(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000))
  if (minutes < 60) return `in ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `in ${hours} h${minutes % 60 ? ` ${minutes % 60} min` : ''}`
  const days = Math.round(hours / 24)
  return `in ${days} ${days === 1 ? 'day' : 'days'}`
}

/** Values for `<input type="date">` and `<input type="time">` in Lagos time. */
export const lagosInputs = (iso: string) => ({
  date: isoDay.format(new Date(iso)),
  time: hhmm.format(new Date(iso)),
})

export const fromLagosInputs = (date: string, clock: string) =>
  new Date(`${date}T${clock}:00+01:00`).toISOString()
