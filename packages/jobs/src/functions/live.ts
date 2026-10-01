import { createCtx, systemActor } from '@tokslearn/core/kernel'
import * as live from '@tokslearn/core/live'
import { inngest } from '../client'
import { liveRecordingReady, liveScheduled } from '../events'
import { jobRuntime } from '../runtime'

const ctx = (reason: string, requestId: string) =>
  createCtx({
    actor: systemActor(reason),
    db: jobRuntime().db(),
    requestId,
    providers: jobRuntime().providers(),
  })

/**
 * `live-reminders` (docs/13, docs/23): sleeps until 24 h and then 15 min before the class and
 * emails its learners, 500 per step. A move schedules a new run and this one sends nothing
 * (the session's start no longer matches); so does a cancel.
 */
export const liveReminders = inngest.createFunction(
  {
    id: 'live-reminders',
    retries: 3,
    idempotency: 'event.data.sessionId + "-" + event.data.startsAt',
    triggers: [liveScheduled],
  },
  async ({ event, step, runId }) => {
    const startsAt = new Date(event.data.startsAt).getTime()
    const before = { '24h': 24 * 60 * 60_000, '15m': 15 * 60_000 } as const
    // Decided once (replays must take the same path): a class scheduled for tonight gets only
    // the 15-minute email.
    const due = await step.run('plan', () =>
      (['24h', '15m'] as const).filter((k) => startsAt - before[k] >= Date.now() - 5 * 60_000),
    )
    const sent = { '24h': 0, '15m': 0 }
    for (const kind of due) {
      await step.sleepUntil(`wait-${kind}`, new Date(startsAt - before[kind]))
      let after: string | null = null
      for (let page = 0; page < 1000; page++) {
        const batch: { sent: number; lastUserId: string | null; done: boolean } = await step.run(
          `${kind}-page-${page}`,
          () =>
            live.sendLiveReminders(ctx('live-reminders', runId), {
              sessionId: event.data.sessionId,
              startsAt: event.data.startsAt,
              kind,
              afterUserId: after,
            }),
        )
        sent[kind] += batch.sent
        if (batch.done) break
        after = batch.lastUserId
      }
    }
    return sent
  },
)

/**
 * `recording-import` (docs/09 §6): hands Daily's recording to Bunny, attaches the new video to
 * the session, then checks every 10 minutes (for 2 hours) in case Bunny's webhook never comes.
 * Daily's copy is deleted once Bunny has it.
 */
export const recordingImport = inngest.createFunction(
  {
    id: 'recording-import',
    retries: 5,
    idempotency: 'event.data.recordingId',
    concurrency: { limit: 1, key: 'event.data.sessionId' },
    triggers: [liveRecordingReady],
  },
  async ({ event, step, runId }) => {
    const input = event.data
    const started = await step.run('fetch', () =>
      live.startRecordingImport(ctx('recording-import', runId), input),
    )
    if (started === 'skipped') return { result: 'skipped' }
    if (started === 'waiting') {
      const found = await step.run('find', () =>
        live.attachRecordingVideo(ctx('recording-import', runId), input),
      )
      if (found === 'skipped') return { result: 'superseded' }
    }
    for (let i = 0; i < 12; i++) {
      await step.sleep(`wait-${i}`, '10m')
      const settled = await step.run(`check-${i}`, () =>
        live.refreshRecording(ctx('recording-import', runId), input.sessionId),
      )
      if (settled) return { result: 'settled' }
    }
    return { result: 'still processing' }
  },
)
