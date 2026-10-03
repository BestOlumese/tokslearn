// Review rules (docs/10 §12, ADR-040). Pure functions; the service does the I/O.

export const BODY_MAX = 2000
export const REPLY_MAX = 2000
export const REASON_MIN = 3
export const REASON_MAX = 500
/** Ratings show publicly once a course has this many visible reviews. */
export const MIN_REVIEWS_TO_SHOW = 3
export const PAGE_SIZE = 10

/** Platform settings (`/admin/settings/platform`), with these defaults. */
export const settingKeys = {
  minProgressPct: 'review_min_progress_pct',
  minLearningMin: 'review_min_learning_min',
} as const
export const DEFAULT_MIN_PROGRESS_PCT = 20
export const DEFAULT_MIN_LEARNING_MIN = 30

export interface Eligibility {
  eligible: boolean
  progressPct: number
  minutesLearned: number
  needPct: number
  needMinutes: number
}

/** Eligible after enough of the course or enough time learning, whichever comes first. */
export function eligibility(input: {
  progressPct: number
  watchedSec: number
  needPct: number
  needMinutes: number
}): Eligibility {
  const minutesLearned = Math.floor(input.watchedSec / 60)
  return {
    eligible: input.progressPct >= input.needPct || minutesLearned >= input.needMinutes,
    progressPct: input.progressPct,
    minutesLearned,
    needPct: input.needPct,
    needMinutes: input.needMinutes,
  }
}

export interface Stars {
  count: number
  avg: number | null
  /** Index 0 is one star. */
  stars: [number, number, number, number, number]
}

export function starsFrom(rows: ReadonlyArray<{ rating: number; n: number }>): Stars {
  const stars: Stars['stars'] = [0, 0, 0, 0, 0]
  for (const r of rows) {
    const i = r.rating - 1
    if (i >= 0 && i < 5) stars[i] = (stars[i] ?? 0) + r.n
  }
  const count = stars.reduce((a, b) => a + b, 0)
  const sum = stars.reduce((a, n, i) => a + n * (i + 1), 0)
  return { count, avg: count === 0 ? null : Math.round((sum / count) * 100) / 100, stars }
}

/** The average a visitor may see: none until enough reviews (docs/10 §12). */
export const publicAverage = (s: Pick<Stars, 'count' | 'avg'>) =>
  s.count >= MIN_REVIEWS_TO_SHOW ? s.avg : null
