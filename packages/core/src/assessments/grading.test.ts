import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { DomainError } from '../kernel/errors'
import {
  type GradableQuestion,
  gradeAnswer,
  gradeAttempt,
  normaliseText,
  optionOrder,
  readLearnerAnswer,
  shuffled,
  validateQuestion,
} from './grading'

const choices = (...ids: string[]) => ids.map((id) => ({ id, text: `Option ${id}` }))
const partial = { partialCredit: true }
const whole = { partialCredit: false }

const q = (type: GradableQuestion['type'], options: unknown, answer: unknown, points = 2) =>
  ({ id: `q-${type}`, type, options, answer, points }) satisfies GradableQuestion

const codeOf = (fn: () => unknown) => {
  try {
    fn()
  } catch (e) {
    if (e instanceof DomainError) return { code: e.code, details: e.details }
    throw e
  }
  return null
}

describe('validateQuestion', () => {
  it('accepts well-formed questions of every type', () => {
    expect(() =>
      validateQuestion('single', { choices: choices('a', 'b') }, { choice: 'b' }),
    ).not.toThrow()
    expect(() =>
      validateQuestion('multiple', { choices: choices('a', 'b', 'c') }, { choices: ['a', 'c'] }),
    ).not.toThrow()
    expect(() => validateQuestion('true_false', {}, { value: false })).not.toThrow()
    expect(() => validateQuestion('short_text', {}, { accepted: ['Lagos'] })).not.toThrow()
    expect(() =>
      validateQuestion('ordering', { items: choices('a', 'b', 'c') }, { order: ['c', 'a', 'b'] }),
    ).not.toThrow()
    expect(() =>
      validateQuestion(
        'matching',
        { left: choices('a', 'b'), right: choices('x', 'y', 'z') },
        {
          pairs: [
            { left: 'a', right: 'y' },
            { left: 'b', right: 'x' },
          ],
        },
      ),
    ).not.toThrow()
  })

  it('rejects keys that point at options that do not exist, or are incomplete', () => {
    const cases: Array<[() => unknown, string]> = [
      [
        () => validateQuestion('single', { choices: choices('a', 'b') }, { choice: 'z' }),
        'answer.choice',
      ],
      [
        () => validateQuestion('multiple', { choices: choices('a', 'b') }, { choices: ['a', 'a'] }),
        'answer.choices',
      ],
      [
        () => validateQuestion('multiple', { choices: choices('a', 'b') }, { choices: ['q'] }),
        'answer.choices',
      ],
      [
        () =>
          validateQuestion('ordering', { items: choices('a', 'b', 'c') }, { order: ['a', 'b'] }),
        'answer.order',
      ],
      [
        () => validateQuestion('ordering', { items: choices('a', 'b') }, { order: ['a', 'a'] }),
        'answer.order',
      ],
      [
        () =>
          validateQuestion(
            'matching',
            { left: choices('a', 'b'), right: choices('x', 'y') },
            {
              pairs: [
                { left: 'a', right: 'x' },
                { left: 'a', right: 'y' },
              ],
            },
          ),
        'answer.pairs',
      ],
      [
        () =>
          validateQuestion(
            'matching',
            { left: choices('a', 'b'), right: choices('x', 'y') },
            {
              pairs: [
                { left: 'a', right: 'x' },
                { left: 'b', right: 'w' },
              ],
            },
          ),
        'answer.pairs',
      ],
    ]
    for (const [fn, path] of cases) {
      const e = codeOf(fn)
      expect(e?.code).toBe('VALIDATION_FAILED')
      expect(JSON.stringify(e?.details)).toContain(path)
    }
  })

  it('rejects malformed options with field paths', () => {
    const e = codeOf(() => validateQuestion('single', { choices: choices('a') }, { choice: 'a' }))
    expect(e?.code).toBe('VALIDATION_FAILED')
    expect(JSON.stringify(e?.details)).toContain('options.choices')
    expect(
      codeOf(() =>
        validateQuestion(
          'single',
          { choices: [...choices('a'), ...choices('a')] },
          { choice: 'a' },
        ),
      )?.code,
    ).toBe('VALIDATION_FAILED')
    expect(codeOf(() => validateQuestion('short_text', {}, { accepted: [] }))?.code).toBe(
      'VALIDATION_FAILED',
    )
  })
})

describe('gradeAnswer', () => {
  it('single, true/false and multiple are all or nothing', () => {
    const single = q('single', { choices: choices('a', 'b') }, { choice: 'b' })
    expect(gradeAnswer(single, { choice: 'b' }, partial)).toEqual({ correct: true, points: 2 })
    expect(gradeAnswer(single, { choice: 'a' }, partial)).toEqual({ correct: false, points: 0 })
    const tf = q('true_false', {}, { value: false })
    expect(gradeAnswer(tf, { value: false }, partial).correct).toBe(true)
    expect(gradeAnswer(tf, { value: true }, partial).correct).toBe(false)
    const multi = q('multiple', { choices: choices('a', 'b', 'c') }, { choices: ['a', 'c'] })
    expect(gradeAnswer(multi, { choices: ['c', 'a'] }, partial)).toEqual({
      correct: true,
      points: 2,
    })
    expect(gradeAnswer(multi, { choices: ['a'] }, partial).points).toBe(0)
    expect(gradeAnswer(multi, { choices: ['a', 'b', 'c'] }, partial).points).toBe(0)
  })

  it('short text forgives case, spacing and end punctuation, unless case-sensitive', () => {
    const city = q('short_text', {}, { accepted: ['Lagos', 'Eko'] })
    for (const text of ['lagos', '  LAGOS. ', 'Eko!', 'eko']) {
      expect(gradeAnswer(city, { text }, partial).correct).toBe(true)
    }
    expect(gradeAnswer(city, { text: 'Abuja' }, partial).correct).toBe(false)
    expect(gradeAnswer(city, { text: '   ' }, partial).correct).toBe(false)
    const formula = q('short_text', {}, { accepted: ['XLOOKUP'], caseSensitive: true })
    expect(gradeAnswer(formula, { text: 'XLOOKUP' }, partial).correct).toBe(true)
    expect(gradeAnswer(formula, { text: 'xlookup' }, partial).correct).toBe(false)
  })

  it('ordering and matching earn a share when partial credit is on', () => {
    const order = q(
      'ordering',
      { items: choices('a', 'b', 'c', 'd') },
      { order: ['a', 'b', 'c', 'd'] },
      4,
    )
    expect(gradeAnswer(order, { order: ['a', 'b', 'd', 'c'] }, partial)).toEqual({
      correct: false,
      points: 2,
    })
    expect(gradeAnswer(order, { order: ['a', 'b', 'd', 'c'] }, whole)).toEqual({
      correct: false,
      points: 0,
    })
    expect(gradeAnswer(order, { order: ['a', 'b', 'c', 'd'] }, whole)).toEqual({
      correct: true,
      points: 4,
    })
    const match = q(
      'matching',
      { left: choices('a', 'b', 'c'), right: choices('x', 'y', 'z') },
      {
        pairs: [
          { left: 'a', right: 'x' },
          { left: 'b', right: 'y' },
          { left: 'c', right: 'z' },
        ],
      },
      3,
    )
    expect(
      gradeAnswer(
        match,
        {
          pairs: [
            { left: 'a', right: 'x' },
            { left: 'b', right: 'z' },
          ],
        },
        partial,
      ),
    ).toEqual({
      correct: false,
      points: 1,
    })
    // Only the first pairing for a left item counts: no gaming by sending every option.
    expect(
      gradeAnswer(
        match,
        {
          pairs: [
            { left: 'a', right: 'y' },
            { left: 'a', right: 'x' },
            { left: 'b', right: 'y' },
            { left: 'c', right: 'z' },
          ],
        },
        partial,
      ).points,
    ).toBe(2)
  })

  it('scores zero for missing or wrongly shaped answers', () => {
    const single = q('single', { choices: choices('a', 'b') }, { choice: 'b' })
    expect(gradeAnswer(single, null, partial).points).toBe(0)
    expect(gradeAnswer(single, undefined, partial).points).toBe(0)
    expect(gradeAnswer(single, { text: 'b' }, partial).points).toBe(0)
    expect(gradeAnswer(single, { choice: 'B!' }, partial).points).toBe(0)
    expect(readLearnerAnswer('short_text', { text: 'x'.repeat(501) })).toBeNull()
  })

  it('rounds partial credit to two decimals', () => {
    const order = q('ordering', { items: choices('a', 'b', 'c') }, { order: ['a', 'b', 'c'] }, 1)
    expect(gradeAnswer(order, { order: ['a', 'c', 'b'] }, partial).points).toBe(0.33)
  })
})

describe('gradeAttempt', () => {
  const questions = [
    q('single', { choices: choices('a', 'b') }, { choice: 'a' }, 2),
    q('true_false', {}, { value: true }, 1),
    q('short_text', {}, { accepted: ['Naira'] }, 1),
  ].map((x, i) => ({ ...x, id: `q${i}` }))

  it('adds up, counts unanswered as zero, and passes at the mark exactly', () => {
    const answers = new Map<string, unknown>([
      ['q0', { choice: 'a' }],
      ['q1', { value: true }],
    ])
    const r = gradeAttempt(questions, answers, { partialCredit: true, passPct: 75 })
    expect(r).toMatchObject({ score: 3, maxScore: 4, pct: 75, passed: true })
    expect(r.perQuestion.get('q2')).toEqual({ correct: false, points: 0 })
    expect(gradeAttempt(questions, answers, { partialCredit: true, passPct: 76 }).passed).toBe(
      false,
    )
    expect(gradeAttempt([], new Map(), { partialCredit: true, passPct: 0 })).toMatchObject({
      pct: 0,
      maxScore: 0,
    })
  })
})

describe('grading properties', { timeout: 30_000 }, () => {
  const ids = fc.uniqueArray(fc.stringMatching(/^[a-z0-9]{1,6}$/), { minLength: 2, maxLength: 10 })

  it('the correct order scores full points; any order scores between 0 and full', () => {
    fc.assert(
      fc.property(ids, fc.integer({ min: 1, max: 100 }), fc.boolean(), (list, points, credit) => {
        const items = choices(...list)
        const key = { order: shuffled(list) }
        const question = q('ordering', { items }, key, points)
        expect(gradeAnswer(question, key, { partialCredit: credit })).toEqual({
          correct: true,
          points,
        })
        const g = gradeAnswer(question, { order: shuffled(list) }, { partialCredit: credit })
        expect(g.points).toBeGreaterThanOrEqual(0)
        expect(g.points).toBeLessThanOrEqual(points)
        if (!credit) expect([0, points]).toContain(g.points)
      }),
      { numRuns: 1000 },
    )
  })

  it('matching: perfect pairs score full; any pairs score within bounds', () => {
    fc.assert(
      fc.property(ids, fc.integer({ min: 1, max: 100 }), (list, points) => {
        const right = list.map((l) => `r${l}`)
        const key = { pairs: list.map((l, i) => ({ left: l, right: right[i] ?? '' })) }
        const question = q(
          'matching',
          { left: choices(...list), right: choices(...right) },
          key,
          points,
        )
        expect(gradeAnswer(question, key, partial).points).toBe(points)
        const guess = { pairs: list.map((l) => ({ left: l, right: shuffled(right)[0] ?? '' })) }
        const g = gradeAnswer(question, guess, partial)
        expect(g.points).toBeGreaterThanOrEqual(0)
        expect(g.points).toBeLessThanOrEqual(points)
      }),
      { numRuns: 1000 },
    )
  })

  it('an attempt never scores above its maximum, and pct stays within 0–100', () => {
    const question = fc
      .tuple(ids, fc.integer({ min: 1, max: 20 }))
      .map(([list, points]: [string[], number]) => ({
        ...q('ordering', { items: choices(...list) }, { order: list }, points),
        id: `q-${list.join('-')}`,
        list,
      }))
    fc.assert(
      fc.property(
        fc.array(question, { minLength: 1, maxLength: 20 }),
        fc.integer({ min: 0, max: 100 }),
        (qs, passPct) => {
          const unique = [...new Map(qs.map((x) => [x.id, x])).values()]
          const answers = new Map(unique.map((x) => [x.id, { order: shuffled(x.list) }]))
          const r = gradeAttempt(unique, answers, { partialCredit: true, passPct })
          expect(r.score).toBeLessThanOrEqual(r.maxScore)
          expect(r.pct).toBeGreaterThanOrEqual(0)
          expect(r.pct).toBeLessThanOrEqual(100)
          expect(r.passed).toBe(r.pct >= passPct)
        },
      ),
      { numRuns: 500 },
    )
  })
})

describe('shuffling', () => {
  it('shuffled keeps every element once', () => {
    fc.assert(
      fc.property(fc.array(fc.integer()), (list) => {
        expect([...shuffled(list)].sort()).toEqual([...list].sort())
      }),
    )
  })

  it('ordering questions avoid showing the correct order', () => {
    const items = choices('a', 'b', 'c', 'd')
    for (let i = 0; i < 500; i++) {
      expect(
        optionOrder('ordering', { items }, false, Math.random, ['b', 'a', 'd', 'c']),
      ).not.toEqual(['b', 'a', 'd', 'c'])
    }
  })

  it('keeps authored order when not shuffling, and has no order for text questions', () => {
    expect(optionOrder('single', { choices: choices('a', 'b', 'c') }, false)).toEqual([
      'a',
      'b',
      'c',
    ])
    expect(
      optionOrder('matching', { left: choices('a', 'b'), right: choices('x', 'y') }, false),
    ).toEqual(['x', 'y'])
    expect(optionOrder('short_text', {}, true)).toEqual([])
    expect(optionOrder('true_false', {}, true)).toEqual([])
  })
})

describe('normaliseText', () => {
  it('normalises Unicode forms, spacing and end punctuation', () => {
    expect(normaliseText('  Ikeja   GRA?! ')).toBe('ikeja gra')
    expect(normaliseText('ｆｕｌｌ')).toBe('full')
    expect(normaliseText('Yes.', true)).toBe('Yes')
  })
})
