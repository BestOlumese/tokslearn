import {
  AnswerKey,
  type AnswerKeyOf,
  LearnerAnswer,
  QuestionOptions,
  type QuestionOptionsOf,
  type QuestionType,
} from '@tokslearn/contract'
import { ValidationError } from '../kernel/errors'

// The grading engine (docs/10 §5): pure, no I/O, heavily tested. The server grades; the client
// never sees an answer key. Short-text answers match a list of accepted answers after
// normalising; instructor-written regular expressions are not supported (ReDoS, ADR-035).

export interface GradableQuestion {
  id: string
  type: QuestionType
  options: unknown
  answer: unknown
  points: number
}

export interface GradedAnswer {
  correct: boolean
  /** Points earned, two decimals (partial credit). */
  points: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

interface Schema<T> {
  safeParse(raw: unknown):
    | { success: true; data: T }
    | {
        success: false
        error: { issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }> }
      }
}

function parseWith<T>(schema: Schema<T>, raw: unknown, path: string): T {
  const r = schema.safeParse(raw)
  if (!r.success) {
    throw new ValidationError(
      r.error.issues.map((i) => ({
        path: [path, ...i.path.map(String)].join('.'),
        message: i.message,
      })),
    )
  }
  return r.data
}

export const parseOptions = <T extends QuestionType>(type: T, raw: unknown): QuestionOptionsOf<T> =>
  parseWith(QuestionOptions[type] as Schema<unknown>, raw, 'options') as QuestionOptionsOf<T>

export const parseAnswerKey = <T extends QuestionType>(type: T, raw: unknown): AnswerKeyOf<T> =>
  parseWith(AnswerKey[type] as Schema<unknown>, raw, 'answer') as AnswerKeyOf<T>

/** A learner's answer in the shape its question expects, or null when it doesn't fit. */
export function readLearnerAnswer(type: QuestionType, raw: unknown) {
  const r = LearnerAnswer[type].safeParse(raw)
  return r.success ? r.data : null
}

/**
 * Checks an authored question as a whole: every id the answer key names exists in the options,
 * orderings are complete permutations, matchings pair every left item once. Returns the parsed
 * options and key; throws VALIDATION_FAILED with field paths.
 */
export function validateQuestion(type: QuestionType, rawOptions: unknown, rawKey: unknown) {
  const options = parseOptions(type, rawOptions) as Record<string, unknown>
  const key = parseAnswerKey(type, rawKey) as Record<string, unknown>
  const fail = (path: string, message: string): never => {
    throw new ValidationError([{ path, message }])
  }
  const ids = (list: unknown) => new Set((list as Array<{ id: string }>).map((i) => i.id))

  if (type === 'single') {
    if (!ids(options.choices).has(key.choice as string))
      fail('answer.choice', 'Pick one of the choices.')
  } else if (type === 'multiple') {
    const choices = ids(options.choices)
    const picked = key.choices as string[]
    if (new Set(picked).size !== picked.length) fail('answer.choices', 'Each choice once.')
    if (picked.some((c) => !choices.has(c))) fail('answer.choices', 'Pick from the choices.')
  } else if (type === 'ordering') {
    const items = ids(options.items)
    const order = key.order as string[]
    if (
      order.length !== items.size ||
      new Set(order).size !== order.length ||
      order.some((o) => !items.has(o))
    ) {
      fail('answer.order', 'The correct order must list every item once.')
    }
  } else if (type === 'matching') {
    const left = ids(options.left)
    const right = ids(options.right)
    const pairs = key.pairs as Array<{ left: string; right: string }>
    const lefts = pairs.map((p) => p.left)
    if (
      lefts.length !== left.size ||
      new Set(lefts).size !== lefts.length ||
      lefts.some((l) => !left.has(l))
    ) {
      fail('answer.pairs', 'Match every item on the left exactly once.')
    }
    if (pairs.some((p) => !right.has(p.right))) fail('answer.pairs', 'Match to items on the right.')
  }
  return { options, key }
}

/** Case (optional), spacing, Unicode forms and end punctuation don't decide a short answer. */
export function normaliseText(text: string, caseSensitive = false): string {
  const t = text
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.!?,;:]+$/u, '')
    .trim()
  return caseSensitive ? t : t.toLocaleLowerCase('en')
}

/** Grades one answer. A missing or wrongly shaped answer scores zero. */
export function gradeAnswer(
  q: GradableQuestion,
  raw: unknown,
  opts: { partialCredit: boolean },
): GradedAnswer {
  const zero = { correct: false, points: 0 }
  if (raw === null || raw === undefined) return zero
  const answer = readLearnerAnswer(q.type, raw) as Record<string, unknown> | null
  if (!answer) return zero
  const key = parseAnswerKey(q.type, q.answer) as Record<string, unknown>
  const whole = (ok: boolean): GradedAnswer => (ok ? { correct: true, points: q.points } : zero)
  const share = (right: number, total: number): GradedAnswer => {
    if (total === 0) return zero
    if (right === total) return { correct: true, points: q.points }
    return { correct: false, points: opts.partialCredit ? round2((q.points * right) / total) : 0 }
  }

  switch (q.type) {
    case 'single':
      return whole(answer.choice === key.choice)
    case 'true_false':
      return whole(answer.value === key.value)
    case 'multiple': {
      const want = new Set(key.choices as string[])
      const got = new Set(answer.choices as string[])
      return whole(want.size === got.size && [...want].every((c) => got.has(c)))
    }
    case 'short_text': {
      const cs = key.caseSensitive === true
      const text = normaliseText(answer.text as string, cs)
      if (text === '') return zero
      return whole((key.accepted as string[]).some((a) => normaliseText(a, cs) === text))
    }
    case 'ordering': {
      const want = key.order as string[]
      const got = answer.order as string[]
      return share(want.filter((id, i) => got[i] === id).length, want.length)
    }
    case 'matching': {
      const want = new Map(
        (key.pairs as Array<{ left: string; right: string }>).map((p) => [p.left, p.right]),
      )
      // Only the first pairing a learner sends for a left item counts.
      const got = new Map<string, string>()
      for (const p of answer.pairs as Array<{ left: string; right: string }>) {
        if (!got.has(p.left)) got.set(p.left, p.right)
      }
      return share([...want].filter(([l, r]) => got.get(l) === r).length, want.size)
    }
  }
}

export interface AttemptResult {
  score: number
  maxScore: number
  /** 0–100, two decimals. */
  pct: number
  passed: boolean
  perQuestion: Map<string, GradedAnswer>
}

/** Grades a whole attempt: every frozen question, answered or not. */
export function gradeAttempt(
  questions: ReadonlyArray<GradableQuestion>,
  answers: ReadonlyMap<string, unknown>,
  opts: { partialCredit: boolean; passPct: number },
): AttemptResult {
  const perQuestion = new Map<string, GradedAnswer>()
  let score = 0
  let maxScore = 0
  for (const q of questions) {
    const g = gradeAnswer(q, answers.get(q.id), opts)
    perQuestion.set(q.id, g)
    score = round2(score + g.points)
    maxScore += q.points
  }
  const pct = maxScore === 0 ? 0 : round2((score * 100) / maxScore)
  return { score, maxScore, pct, passed: pct >= opts.passPct, perQuestion }
}

// ── Shuffling ────────────────────────────────────────────────────────────────────────────────

/** Fisher–Yates with an injectable source (tests pass a seeded one). */
export function shuffled<T>(list: ReadonlyArray<T>, random: () => number = Math.random): T[] {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j] as T, out[i] as T]
  }
  return out
}

/**
 * The option order an attempt shows for one question: choices and ordering items shuffled when
 * `shuffleOptions` (ordering items always, or the answer would be the display order); for
 * matching, the right column. True/false and short text have none.
 */
export function optionOrder(
  type: QuestionType,
  options: unknown,
  shuffle: boolean,
  random: () => number = Math.random,
  /** Ordering questions: the correct order, which the shown order should not give away. */
  correctOrder?: ReadonlyArray<string>,
): string[] {
  const o = options as Record<string, Array<{ id: string }>>
  const list =
    type === 'single' || type === 'multiple'
      ? o.choices
      : type === 'ordering'
        ? o.items
        : type === 'matching'
          ? o.right
          : undefined
  if (!list) return []
  const ids = list.map((i) => i.id)
  if (type === 'ordering') {
    // Don't show the items already in the right order when it can be avoided.
    const right = correctOrder ?? ids
    const givesAway = (order: string[]) => order.every((id, k) => id === right[k])
    let order = shuffled(ids, random)
    for (let i = 0; i < 8 && givesAway(order); i++) order = shuffled(ids, random)
    return order
  }
  return shuffle ? shuffled(ids, random) : ids
}
