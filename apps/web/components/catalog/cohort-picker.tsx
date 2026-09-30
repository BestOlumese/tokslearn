import type { PublicCohortDto } from '@tokslearn/contract'

// Server component: a cohort-based course's start dates (docs/20 `/courses/[slug]` cohort
// picker). Plain radio inputs, no JavaScript: the buy buttons read the checked one when clicked,
// which keeps the course page inside its JS budget (docs/12 §1).

const day = new Intl.DateTimeFormat('en-NG', {
  timeZone: 'Africa/Lagos',
  day: 'numeric',
  month: 'short',
})
const dayYear = new Intl.DateTimeFormat('en-NG', {
  timeZone: 'Africa/Lagos',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

export function CohortPicker({
  cohorts,
  name,
}: {
  cohorts: ReadonlyArray<PublicCohortDto>
  /** Radio group name; the buy buttons next to it read the same one. */
  name: string
}) {
  if (cohorts.length === 0) {
    return (
      <p className="rounded-control bg-canvas p-3 text-body-sm text-ink-2">
        This course runs in cohorts. No start dates are open right now; check back soon.
      </p>
    )
  }
  const firstOpen = cohorts.find((c) => c.availability === 'open')?.id
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-body-sm font-semibold text-ink">Pick a start date</legend>
      {cohorts.map((c) => {
        const open = c.availability === 'open'
        const note = !open
          ? c.availability === 'full'
            ? 'Full'
            : `Enrolment opens ${day.format(new Date(c.opensAt ?? c.startsAt))}`
          : c.seatsLeft !== null && c.seatsLeft <= 10
            ? `${c.seatsLeft} ${c.seatsLeft === 1 ? 'seat' : 'seats'} left`
            : `Join by ${day.format(new Date(c.closesAt))}`
        return (
          <label
            key={c.id}
            className={`flex cursor-pointer items-start gap-3 rounded-control border border-border p-3 has-[:checked]:border-brand has-[:checked]:bg-brand-soft ${open ? 'hover:border-border-strong' : 'cursor-not-allowed opacity-60'}`}
          >
            <input
              type="radio"
              name={name}
              value={c.id}
              disabled={!open}
              defaultChecked={c.id === firstOpen}
              className="mt-1 size-4 accent-brand"
            />
            <span className="min-w-0">
              <span className="block text-body-sm font-medium text-ink">{c.name}</span>
              <span className="block text-body-sm text-ink-2">
                {day.format(new Date(c.startsAt))} – {dayYear.format(new Date(c.endsAt))} · {note}
              </span>
            </span>
          </label>
        )
      })}
    </fieldset>
  )
}
