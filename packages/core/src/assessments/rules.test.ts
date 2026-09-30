import { QuizSettings } from '@tokslearn/contract'
import { describe, expect, it } from 'vitest'
import { learnerOptions, mayShowAnswers } from './attempts'
import { flagReasons } from './integrity'

describe('flagReasons', () => {
  const calm = { durationSec: 600, questionCount: 10, passed: true }
  it('flags only past the thresholds', () => {
    expect(flagReasons({}, calm)).toEqual([])
    expect(flagReasons({ focusLosses: 4, fullscreenExits: 2, pastes: 2 }, calm)).toEqual([])
    expect(flagReasons({ focusLosses: 5 }, calm)).toEqual(['focus_loss'])
    expect(flagReasons({ focusLosses: 1, focusLossMs: 60_000 }, calm)).toEqual(['focus_loss'])
    expect(flagReasons({ fullscreenExits: 3, pastes: 3, otherIpHashes: ['x'] }, calm)).toEqual([
      'fullscreen_exit',
      'paste',
      'network_change',
    ])
  })
  it('flags a passing attempt answered faster than 5 s a question, never a failing one', () => {
    expect(flagReasons({}, { durationSec: 40, questionCount: 10, passed: true })).toEqual([
      'too_fast',
    ])
    expect(flagReasons({}, { durationSec: 40, questionCount: 10, passed: false })).toEqual([])
  })
})

describe('mayShowAnswers', () => {
  const now = new Date('2026-10-01T12:00:00Z')
  const s = (over: Partial<QuizSettings>) => QuizSettings.parse(over)
  it('follows the show_answers setting', () => {
    expect(mayShowAnswers(s({ showAnswers: 'never' }), true, now)).toBe(false)
    expect(mayShowAnswers(s({ showAnswers: 'after_submit' }), false, now)).toBe(true)
    expect(mayShowAnswers(s({ showAnswers: 'after_pass' }), false, now)).toBe(false)
    expect(mayShowAnswers(s({ showAnswers: 'after_pass' }), true, now)).toBe(true)
    expect(
      mayShowAnswers(
        s({ showAnswers: 'after_close', closesAt: '2026-10-01T13:00:00+01:00' }),
        true,
        now,
      ),
    ).toBe(true)
    expect(
      mayShowAnswers(
        s({ showAnswers: 'after_close', closesAt: '2026-10-02T00:00:00+01:00' }),
        true,
        now,
      ),
    ).toBe(false)
  })
})

describe('learnerOptions', () => {
  const c = (...ids: string[]) => ids.map((id) => ({ id, text: id.toUpperCase() }))
  it('shows the frozen order, appends options added later, and never carries a key', () => {
    expect(learnerOptions('single', { choices: c('a', 'b', 'c') }, ['c', 'a'])).toEqual({
      choices: c('c', 'a', 'b'),
    })
    expect(
      learnerOptions('matching', { left: c('a', 'b'), right: c('x', 'y') }, ['y', 'x']),
    ).toEqual({
      left: c('a', 'b'),
      right: c('y', 'x'),
    })
    expect(learnerOptions('short_text', {}, [])).toEqual({})
    // Stray fields in stored options are not passed through.
    expect(
      learnerOptions('ordering', { items: [{ id: 'a', text: 'A', secret: 1 }] }, ['a']),
    ).toEqual({ items: c('a') })
  })
})
