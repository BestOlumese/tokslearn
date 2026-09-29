// k6: exam spike (Phase 6 acceptance, docs/15 §5). LOAD_USERS learners start the demo final exam
// within a few seconds of each other, answer every question with autosaves a few seconds apart
// (as people do), and submit. Pass: p95 < 500 ms on start, save and submit; under 0.1% errors.
//
//   1. DATABASE_URL=<the target's database> pnpm --filter @tokslearn/core seed:load-exam
//   2. BASE_URL=https://<preview>.vercel.app VERCEL_AUTOMATION_BYPASS_SECRET=… k6 run load/exam-spike.js
//      (no k6 installed: docker run --rm -i --network host -v "$PWD/load:/load" -e BASE_URL \
//       -e VERCEL_AUTOMATION_BYPASS_SECRET grafana/k6 run /load/exam-spike.js)
//
// Never against production: it writes 500 exam attempts. Re-run step 1 before each run; it clears
// the load learners' attempts and issues fresh sessions.

import { check, fail, sleep } from 'k6'
import http from 'k6/http'

const users = JSON.parse(open('./.exam-users.json'))
const BASE = (__ENV.BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
const VUS = Math.min(Number(__ENV.LOAD_USERS || users.tokens.length), users.tokens.length)

export const options = {
  scenarios: {
    exam_spike: {
      executor: 'per-vu-iterations',
      vus: VUS,
      iterations: 1,
      maxDuration: '6m',
    },
  },
  thresholds: {
    'http_req_duration{name:exams.start}': ['p(95)<500'],
    'http_req_duration{name:exams.saveAnswer}': ['p(95)<500'],
    'http_req_duration{name:exams.submit}': ['p(95)<500'],
    http_req_failed: ['rate<0.001'],
  },
}

const bypass = __ENV.VERCEL_AUTOMATION_BYPASS_SECRET
function params(name, extra) {
  const headers = {
    'content-type': 'application/json',
    authorization: `Bearer ${users.tokens[__VU - 1]}`,
    ...(bypass ? { 'x-vercel-protection-bypass': bypass } : {}),
    ...extra,
  }
  return { headers, tags: { name } }
}

/** Any valid answer for the question: the load, not the score, is what's measured. */
function answerFor(q) {
  const o = q.options
  switch (q.type) {
    case 'single':
      return { choice: o.choices[0].id }
    case 'multiple':
      return { choices: [o.choices[0].id] }
    case 'true_false':
      return { value: true }
    case 'short_text':
      return { text: 'SUMIFS' }
    case 'ordering':
      return { order: o.items.map((i) => i.id) }
    case 'matching':
      return { pairs: o.left.map((l, i) => ({ left: l.id, right: o.right[i % o.right.length].id })) }
    default:
      fail(`unknown question type ${q.type}`)
  }
}

export default function () {
  // Everyone arrives within 5 s: a class told "start now".
  sleep(Math.random() * 5)
  const started = http.post(
    `${BASE}/api/v1/exams/start`,
    JSON.stringify({ lessonId: users.lessonId, confirmed: true }),
    params('exams.start'),
  )
  if (!check(started, { 'exam started': (r) => r.status === 200 })) {
    console.error(`start ${started.status}: ${started.body && started.body.slice(0, 200)}`)
    return
  }
  const attempt = started.json()

  for (const q of attempt.questions) {
    sleep(2 + Math.random() * 4)
    const saved = http.post(
      `${BASE}/api/v1/exams/attempts/${attempt.id}/answers`,
      JSON.stringify({ attemptId: attempt.id, questionId: q.id, answer: answerFor(q) }),
      params('exams.saveAnswer'),
    )
    check(saved, { 'answer saved': (r) => r.status === 200 })
  }

  sleep(1 + Math.random() * 3)
  const submitted = http.post(
    `${BASE}/api/v1/exams/attempts/${attempt.id}/submit`,
    JSON.stringify({ attemptId: attempt.id }),
    params('exams.submit', { 'idempotency-key': `k6-${attempt.id}` }),
  )
  check(submitted, {
    'exam submitted': (r) => r.status === 200 && ['graded', 'submitted'].includes(r.json('status')),
  })
}
