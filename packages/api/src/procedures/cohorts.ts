import type { MyCohortDto, PublicCohortDto, StudioCohortsDto } from '@tokslearn/contract'
import * as cohorts from '@tokslearn/core/cohorts'
import { authed, pub } from '../base'

// Cohorts (docs/06 §5, docs/10 §9). Thin: auth → core → DTO.

const iso = (d: Date) => d.toISOString()
const isoN = (d: Date | null) => (d ? d.toISOString() : null)
const date = (s: string) => new Date(s)
const dateN = (s: string | null) => (s ? new Date(s) : null)

const toStudio = (s: cohorts.StudioCohorts): StudioCohortsDto => ({
  ...s,
  cohorts: s.cohorts.map((c) => ({
    ...c,
    startsAt: iso(c.startsAt),
    endsAt: iso(c.endsAt),
    enrollOpensAt: isoN(c.enrollOpensAt),
    enrollClosesAt: isoN(c.enrollClosesAt),
  })),
})

const toPublic = (c: cohorts.PublicCohort): PublicCohortDto => ({
  ...c,
  startsAt: iso(c.startsAt),
  endsAt: iso(c.endsAt),
  closesAt: iso(c.closesAt),
  opensAt: isoN(c.opensAt),
})

const toMine = (m: cohorts.MyCohort): MyCohortDto => ({
  ...m,
  cohort: { ...m.cohort, startsAt: iso(m.cohort.startsAt), endsAt: iso(m.cohort.endsAt) },
  schedule: m.schedule.map((l) => ({ ...l, opensAt: iso(l.opensAt) })),
})

const fields = (i: {
  name: string
  startsAt: string
  endsAt: string
  enrollOpensAt: string | null
  enrollClosesAt: string | null
  capacity: number | null
}) => ({
  name: i.name,
  startsAt: date(i.startsAt),
  endsAt: date(i.endsAt),
  enrollOpensAt: dateN(i.enrollOpensAt),
  enrollClosesAt: dateN(i.enrollClosesAt),
  capacity: i.capacity,
})

export const studioCohortsRouter = {
  get: authed.studio.cohorts.get.handler(async ({ context, input }) =>
    toStudio(await cohorts.getStudioCohorts(context.ctx, input.courseId)),
  ),
  setSelling: authed.studio.cohorts.setSelling.handler(async ({ context, input }) =>
    toStudio(await cohorts.setCohortSelling(context.ctx, input)),
  ),
  create: authed.studio.cohorts.create.handler(async ({ context, input }) =>
    toStudio(
      await cohorts.createCohort(context.ctx, { courseId: input.courseId, ...fields(input) }),
    ),
  ),
  update: authed.studio.cohorts.update.handler(async ({ context, input }) =>
    toStudio(
      await cohorts.updateCohort(context.ctx, { cohortId: input.cohortId, ...fields(input) }),
    ),
  ),
  setStatus: authed.studio.cohorts.setStatus.handler(async ({ context, input }) =>
    toStudio(await cohorts.setCohortStatus(context.ctx, input)),
  ),
}

export const cohortsRouter = {
  list: pub.cohorts.list.handler(async ({ context, input }) => ({
    items: (await cohorts.listCourseCohorts(context.ctx, input.courseId)).map(toPublic),
  })),
  mine: authed.cohorts.mine.handler(async ({ context, input }) =>
    toMine(await cohorts.getMyCohort(context.ctx, input.courseSlug)),
  ),
}
