import type {
  AttendanceDto,
  LiveOptionsDto,
  LiveSessionDetailDto,
  LiveSessionDto,
  StudioLiveSessionDto,
} from '@tokslearn/contract'
import * as live from '@tokslearn/core/live'
import { authed } from '../base'

// Live classes (docs/06 §5, docs/10 §11). Thin: auth → core → DTO.

const iso = (d: Date) => d.toISOString()

const toDto = (s: live.LiveSessionView): LiveSessionDto => ({
  ...s,
  startsAt: iso(s.startsAt),
  endsAt: iso(s.endsAt),
  opensAt: iso(s.opensAt),
})

const toDetail = (s: live.LiveSessionDetail): LiveSessionDetailDto => ({
  ...toDto(s),
  recordingEmbedUrl: s.recordingEmbedUrl,
})

const toStudio = (s: live.StudioLiveSession): StudioLiveSessionDto => ({
  ...toDto(s),
  canManage: s.canManage,
  attended: s.attended,
})

const toOptions = (o: live.LiveOptions): LiveOptionsDto => ({
  enabled: o.enabled,
  courses: o.courses.map((c) => ({
    ...c,
    runs: c.runs.map((r) => ({ ...r, startsAt: iso(r.startsAt) })),
  })),
})

const toAttendance = (a: live.Attendance): AttendanceDto => ({
  expected: a.expected,
  attendees: a.attendees.map((x) => ({ ...x, joinedAt: iso(x.joinedAt) })),
})

const fields = (i: {
  cohortId: string | null
  lessonId: string | null
  title: string
  startsAt: string
  durationMin: number
  recordingEnabled: boolean
}): live.ScheduleFields => ({ ...i, startsAt: new Date(i.startsAt) })

export const liveRouter = {
  list: authed.live.list.handler(async ({ context, input }) => ({
    items: (await live.listCourseSessions(context.ctx, input)).map(toDto),
  })),
  get: authed.live.get.handler(async ({ context, input }) =>
    toDetail(await live.getSession(context.ctx, input.sessionId)),
  ),
  join: authed.live.join.handler(async ({ context, input }) => {
    const r = await live.joinSession(context.ctx, input.sessionId)
    return { ...r, expiresAt: iso(r.expiresAt) }
  }),
}

export const studioLiveRouter = {
  list: authed.studio.live.list.handler(async ({ context, input }) => ({
    items: (await live.listStudioSessions(context.ctx, input)).map(toStudio),
  })),
  options: authed.studio.live.options.handler(async ({ context }) =>
    toOptions(await live.studioLiveOptions(context.ctx)),
  ),
  create: authed.studio.live.create.handler(({ context, input }) => {
    const { courseId, ...rest } = input
    return live.scheduleSession(context.ctx, { courseId, ...fields(rest) })
  }),
  update: authed.studio.live.update.handler(({ context, input }) => {
    const { sessionId, ...rest } = input
    return live.updateSession(context.ctx, { sessionId, ...fields(rest) })
  }),
  cancel: authed.studio.live.cancel.handler(({ context, input }) =>
    live.cancelSession(context.ctx, input.sessionId),
  ),
  attendance: authed.studio.live.attendance.handler(async ({ context, input }) =>
    toAttendance(await live.sessionAttendance(context.ctx, input.sessionId)),
  ),
}
