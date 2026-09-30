import { describe, expect, it } from 'vitest'
import { lagosDay } from '../engagement'
import { dripUnlocksAt } from '../enrollments'
import { resumeTail } from './media'
import { downloadName } from './outline'
import { clampWatched, isComplete } from './progress'

const t = (iso: string) => new Date(iso)

describe('clampWatched', () => {
  it('credits real time at up to 2× speed, plus a little slack', () => {
    const last = t('2026-10-01T10:00:00Z')
    expect(clampWatched({ claimedSec: 20, lastBeatAt: last, at: t('2026-10-01T10:00:20Z') })).toBe(
      20,
    )
    // Claiming 10 minutes in 20 s: 20 s × 2 + 5 s slack = 45 s.
    expect(clampWatched({ claimedSec: 600, lastBeatAt: last, at: t('2026-10-01T10:00:20Z') })).toBe(
      45,
    )
    // A long gap still credits at most 60 s in one beat.
    expect(clampWatched({ claimedSec: 600, lastBeatAt: last, at: t('2026-10-01T11:00:00Z') })).toBe(
      60,
    )
    // First beat of a session: as if 20 s had passed.
    expect(clampWatched({ claimedSec: 600, lastBeatAt: null, at: last })).toBe(45)
  })

  it('never credits negative, broken or backwards time', () => {
    const last = t('2026-10-01T10:00:00Z')
    expect(clampWatched({ claimedSec: -30, lastBeatAt: last, at: t('2026-10-01T10:00:20Z') })).toBe(
      0,
    )
    expect(
      clampWatched({ claimedSec: Number.NaN, lastBeatAt: last, at: t('2026-10-01T10:00:20Z') }),
    ).toBe(0)
    expect(clampWatched({ claimedSec: 20, lastBeatAt: last, at: t('2026-10-01T09:59:00Z') })).toBe(
      5,
    )
  })
})

describe('isComplete', () => {
  it('uses the furthest of watched time and position against the threshold', () => {
    expect(isComplete(900, 0, 1000, 90)).toBe(true)
    expect(isComplete(100, 900, 1000, 90)).toBe(true)
    expect(isComplete(899, 899, 1000, 90)).toBe(false)
    expect(isComplete(10, 10, 0, 90)).toBe(false)
  })
})

describe('dripUnlocksAt', () => {
  const enrolled = t('2026-10-01T09:00:00Z')
  it('opens after enrollment, on fixed dates, or at once', () => {
    expect(
      dripUnlocksAt('after_enrollment', { dripOffsetDays: 3, dripDate: null }, enrolled),
    ).toEqual(t('2026-10-04T09:00:00Z'))
    expect(
      dripUnlocksAt(
        'fixed_dates',
        { dripOffsetDays: null, dripDate: t('2026-10-10T07:00:00Z') },
        enrolled,
      ),
    ).toEqual(t('2026-10-10T07:00:00Z'))
    expect(dripUnlocksAt('none', { dripOffsetDays: 3, dripDate: null }, enrolled)).toBeNull()
    expect(
      dripUnlocksAt('after_enrollment', { dripOffsetDays: 0, dripDate: null }, enrolled),
    ).toBeNull()
    // Cohort runs count from the run's start; without a run, from enrolment.
    expect(
      dripUnlocksAt(
        'cohort_relative',
        { dripOffsetDays: 3, dripDate: null },
        enrolled,
        t('2026-11-03T08:00:00Z'),
      ),
    ).toEqual(t('2026-11-06T08:00:00Z'))
    expect(
      dripUnlocksAt('cohort_relative', { dripOffsetDays: 3, dripDate: null }, enrolled),
    ).toEqual(t('2026-10-04T09:00:00Z'))
  })
})

describe('lagosDay and downloadName', () => {
  it('uses Lagos days (UTC+1)', () => {
    expect(lagosDay(t('2026-10-01T22:59:00Z'))).toBe('2026-10-01')
    expect(lagosDay(t('2026-10-01T23:00:00Z'))).toBe('2026-10-02')
  })
  it('names downloads after the resource with the file’s extension', () => {
    expect(downloadName('Month-end template', 'resource/u/abc.XLSX')).toBe(
      'Month-end template.xlsx',
    )
    expect(downloadName('a/b: c', 'resource/u/abc')).toBe('a b c')
    expect(downloadName('  ', 'x.pdf')).toBe('download.pdf')
  })
})

describe('resumeTail', () => {
  it('starts from the top only in the last 15 s, or the last 10% of a short video', () => {
    expect(resumeTail(1900)).toBe(15)
    expect(resumeTail(60)).toBe(6)
    expect(resumeTail(10)).toBe(1)
    expect(resumeTail(3)).toBe(1)
  })
})
