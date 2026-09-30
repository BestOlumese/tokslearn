import { z } from 'zod'
import { base } from './base'
import { IsoDateTime } from './shared'

// Phase 8 cohort procedures (docs/06 §5, docs/10 §9, docs/20 Phase 8 rows): runs in the studio,
// start dates on the course page, and the learner's cohort home. Behind the `cohorts` flag.

const named = <S extends z.ZodType>(schema: S) =>
  schema as unknown as z.ZodType<z.output<S>, z.input<S>>

const get = (path: `/${string}`, tag: string, summary: string, description: string) =>
  base.route({ method: 'GET', path, tags: [tag], summary, description })
const post = (path: `/${string}`, tag: string, summary: string, description: string) =>
  base.route({ method: 'POST', path, tags: [tag], summary, description })

export const CohortStatus = z.enum(['draft', 'open', 'cancelled'])
const Availability = z.enum(['draft', 'cancelled', 'not_open_yet', 'open', 'full', 'closed'])

const CohortInputFields = {
  name: z.string().trim().min(2).max(80),
  startsAt: IsoDateTime,
  endsAt: IsoDateTime,
  /** Null: open as soon as it's published. */
  enrollOpensAt: IsoDateTime.nullable(),
  /** Null: closes when the run starts. */
  enrollClosesAt: IsoDateTime.nullable(),
  /** Null: no limit. */
  capacity: z.number().int().min(1).max(10_000).nullable(),
}

const StudioCohortShape = z.object({
  id: z.uuid(),
  name: z.string(),
  startsAt: IsoDateTime,
  endsAt: IsoDateTime,
  enrollOpensAt: IsoDateTime.nullable(),
  enrollClosesAt: IsoDateTime.nullable(),
  capacity: z.number().int().nullable(),
  status: CohortStatus,
  timezone: z.string(),
  members: z.number().int(),
  seatsLeft: z.number().int().nullable(),
  availability: Availability,
})

const StudioCohortsShape = z.object({
  courseId: z.uuid(),
  /** The `cohorts` feature flag. */
  enabled: z.boolean(),
  cohortBased: z.boolean(),
  canEdit: z.boolean(),
  cohorts: z.array(StudioCohortShape),
})
export type StudioCohortsDto = z.infer<typeof StudioCohortsShape>
export const StudioCohortsDto = named(StudioCohortsShape)

const PublicCohortShape = z.object({
  id: z.uuid(),
  name: z.string(),
  startsAt: IsoDateTime,
  endsAt: IsoDateTime,
  closesAt: IsoDateTime,
  opensAt: IsoDateTime.nullable(),
  seatsLeft: z.number().int().nullable(),
  availability: z.enum(['open', 'full', 'not_open_yet']),
})
export type PublicCohortDto = z.infer<typeof PublicCohortShape>
export const PublicCohortDto = named(PublicCohortShape)

const MyCohortShape = z.object({
  course: z.object({ id: z.uuid(), slug: z.string(), title: z.string() }),
  cohort: z.object({
    id: z.uuid(),
    name: z.string(),
    startsAt: IsoDateTime,
    endsAt: IsoDateTime,
    timezone: z.string(),
  }),
  members: z.array(z.object({ id: z.uuid(), name: z.string(), isMe: z.boolean() })),
  memberCount: z.number().int(),
  schedule: z.array(
    z.object({
      lessonId: z.uuid(),
      title: z.string(),
      section: z.string(),
      opensAt: IsoDateTime,
    }),
  ),
})
export type MyCohortDto = z.infer<typeof MyCohortShape>
export const MyCohortDto = named(MyCohortShape)

export const studioCohortsContract = {
  get: get(
    '/studio/courses/{courseId}/cohorts',
    'Studio',
    'Cohort runs',
    'Whether the course sells by start date, and its runs with members and seats left.',
  )
    .input(z.object({ courseId: z.uuid() }))
    .output(StudioCohortsDto),
  setSelling: post(
    '/studio/courses/{courseId}/cohorts/selling',
    'Studio',
    'Sell by start date',
    'On: buyers pick a run. Applies at once. Not for courses in a bundle (COURSE_IN_BUNDLE).',
  )
    .input(z.strictObject({ courseId: z.uuid(), cohortBased: z.boolean() }))
    .output(StudioCohortsDto),
  create: post(
    '/studio/courses/{courseId}/cohorts',
    'Studio',
    'Add a run',
    'Starts as a draft; publish it to put it on sale.',
  )
    .input(z.strictObject({ courseId: z.uuid(), ...CohortInputFields }))
    .output(StudioCohortsDto),
  update: post(
    '/studio/cohorts/{cohortId}',
    'Studio',
    'Change a run',
    'Capacity can’t go below the seats taken (COHORT_CAPACITY_TOO_LOW).',
  )
    .input(z.strictObject({ cohortId: z.uuid(), ...CohortInputFields }))
    .output(StudioCohortsDto),
  setStatus: post(
    '/studio/cohorts/{cohortId}/status',
    'Studio',
    'Publish, unpublish or cancel a run',
    'Unpublish and cancel only while nobody has joined (COHORT_HAS_LEARNERS).',
  )
    .input(z.strictObject({ cohortId: z.uuid(), status: CohortStatus }))
    .output(StudioCohortsDto),
}

export const cohortsContract = {
  list: get(
    '/courses/{courseId}/cohorts',
    'Catalog',
    'Start dates',
    'Public. Published runs still taking people (or about to), soonest first, with seats left.',
  )
    .input(z.object({ courseId: z.uuid() }))
    .output(z.object({ items: z.array(PublicCohortDto) })),
  mine: get(
    '/learn/{courseSlug}/cohort',
    'Learning',
    'My cohort',
    'The learner’s run: dates, members (display names) and the lesson schedule.',
  )
    .input(z.object({ courseSlug: z.string().min(1).max(200) }))
    .output(MyCohortDto),
}
