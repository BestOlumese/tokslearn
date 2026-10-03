import { describe, expect, it } from 'vitest'
import { eligibility, publicAverage, starsFrom } from './rules'

describe('review rules', () => {
  it('is eligible after 20% or 30 minutes, whichever comes first', () => {
    const need = { needPct: 20, needMinutes: 30 }
    expect(eligibility({ progressPct: 19, watchedSec: 29 * 60 + 59, ...need }).eligible).toBe(false)
    expect(eligibility({ progressPct: 20, watchedSec: 0, ...need }).eligible).toBe(true)
    expect(eligibility({ progressPct: 0, watchedSec: 30 * 60, ...need })).toMatchObject({
      eligible: true,
      minutesLearned: 30,
    })
  })

  it('counts stars and hides the average below three reviews', () => {
    const s = starsFrom([
      { rating: 5, n: 1 },
      { rating: 4, n: 1 },
    ])
    expect(s).toEqual({ count: 2, avg: 4.5, stars: [0, 0, 0, 1, 1] })
    expect(publicAverage(s)).toBeNull()
    const t = starsFrom([
      { rating: 5, n: 2 },
      { rating: 2, n: 1 },
    ])
    expect(publicAverage(t)).toBe(4)
  })
})
