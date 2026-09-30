import * as certificates from '@tokslearn/core/certificates'
import { createCtx, systemActor } from '@tokslearn/core/kernel'
import { inngest } from '../client'
import {
  certificateIssued,
  certificateNameCorrected,
  courseCompleted,
  coursePublished,
  courseUpdated,
  examPassed,
  externalResultRecorded,
} from '../events'
import { jobRuntime } from '../runtime'

// Certificate jobs (docs/10 §8, docs/13): issue when criteria may have been met, render the PDF
// and email the learner, and catch up earlier finishers when a course's rules go live.

const ctxFor = (name: string, runId: string) =>
  createCtx({
    actor: systemActor(name),
    db: jobRuntime().db(),
    requestId: runId,
    providers: jobRuntime().providers(),
  })

/**
 * `certificate-issue`: checks the course's live criteria for the learner. Insert-if-absent on
 * (user, course), so any number of triggers issue one certificate.
 */
export const certificateIssue = inngest.createFunction(
  {
    id: 'certificate-issue',
    retries: 5,
    concurrency: { limit: 1, key: 'event.data.userId' },
    triggers: [courseCompleted, examPassed, externalResultRecorded],
  },
  async ({ event, step, runId }) => {
    if (event.name === 'external_result.recorded' && event.data.result !== 'pass') {
      return { issued: false }
    }
    const result = await step.run('issue', () =>
      certificates.issueCertificate(ctxFor('certificate-issue', runId), {
        userId: event.data.userId,
        courseId: event.data.courseId,
      }),
    )
    return { issued: result?.created ?? false, certificateId: result?.certificateId ?? null }
  },
)

/**
 * `certificate-render`: makes the PDF (and a new one after a name correction). The first issue
 * also sends the `certificate-issued` email; its idempotency key stops a retry sending twice.
 */
export const certificateRender = inngest.createFunction(
  {
    id: 'certificate-render',
    retries: 5,
    concurrency: { limit: 1, key: 'event.data.certificateId' },
    triggers: [certificateIssued, certificateNameCorrected],
  },
  async ({ event, step, runId }) =>
    step.run('render', () =>
      certificates.renderCertificateFile(
        ctxFor('certificate-render', runId),
        event.data.certificateId,
        { notify: event.name === 'certificate.issued' },
      ),
    ),
)

/**
 * `certificate-backfill`: when a course is published or its changes approved, issues
 * certificates to learners who already meet the live rules, a page at a time.
 */
export const certificateBackfill = inngest.createFunction(
  {
    id: 'certificate-backfill',
    retries: 3,
    concurrency: { limit: 1, key: 'event.data.courseId' },
    triggers: [coursePublished, courseUpdated],
  },
  async ({ event, step, runId }) => {
    let after: string | null = null
    let issued = 0
    for (let page = 0; page < 100; page++) {
      const batch: { userIds: string[]; issued: number } = await step.run(
        `page-${page}`,
        async () => {
          const ctx = ctxFor('certificate-backfill', runId)
          const userIds = await certificates.certificateCandidates(ctx, event.data.courseId, after)
          let n = 0
          for (const userId of userIds) {
            const r = await certificates.issueCertificate(ctx, {
              userId,
              courseId: event.data.courseId,
            })
            if (r?.created) n++
          }
          return { userIds, issued: n }
        },
      )
      issued += batch.issued
      if (batch.userIds.length < certificates.BACKFILL_PAGE) break
      after = batch.userIds[batch.userIds.length - 1] ?? null
    }
    return { issued }
  },
)
