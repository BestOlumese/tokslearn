import { describe, expect, it } from 'vitest'
import { testUser } from '../kernel/testing'
import {
  applicationGaps,
  canReviewApplications,
  kycOutcome,
  nameMatchScore,
  namesMatch,
  nameTokens,
  reapplyDate,
  slugify,
} from './rules'

describe('instructor rules', () => {
  it('lets reviewers and admins review applications, not finance or support', () => {
    expect(canReviewApplications(testUser(['learner', 'reviewer']))).toBe(true)
    expect(canReviewApplications(testUser(['learner', 'admin']))).toBe(true)
    expect(canReviewApplications(testUser(['learner', 'finance']))).toBe(false)
    expect(canReviewApplications(testUser(['learner', 'support']))).toBe(false)
    expect(canReviewApplications(testUser(['learner', 'instructor']))).toBe(false)
  })

  it('normalizes names: case, punctuation, titles, accents', () => {
    expect(nameTokens('Dr. Adéleke, Tobi-Oluwa')).toEqual(['ADELEKE', 'TOBI', 'OLUWA'])
  })

  it('matches bank names in any order and with extra middle names', () => {
    expect(nameMatchScore('TOBI ADELEKE', 'ADELEKE TOBI OLUWASEUN')).toBe(1)
    expect(namesMatch('Mrs Ngozi Okafor', 'OKAFOR NGOZI ADAEZE')).toBe(true)
    // one-letter typo still matches
    expect(namesMatch('Chiamaka Okafor', 'CHIAMAKA OKAFFOR')).toBe(true)
  })

  it('rejects different people and single shared names', () => {
    expect(namesMatch('Tobi Adeleke', 'Bola Adeyemi')).toBe(false)
    expect(namesMatch('Tobi Adeleke', 'TOBI OKAFOR')).toBe(false)
    expect(nameMatchScore('Tobi', 'TOBI ADELEKE')).toBe(0.5)
    expect(nameMatchScore('', 'TOBI')).toBe(0)
  })

  it('decides KYC: failed, manual review or verified', () => {
    const base = { accountName: 'Tobi Adeleke', registeredName: 'ADELEKE TOBI' }
    expect(kycOutcome({ ...base, found: false, faceMatchScore: null })).toBe('failed')
    expect(kycOutcome({ ...base, found: true, faceMatchScore: 62 })).toBe('manual_review')
    expect(
      kycOutcome({ ...base, registeredName: 'BOLA ADEYEMI', found: true, faceMatchScore: 99 }),
    ).toBe('manual_review')
    expect(kycOutcome({ ...base, found: true, faceMatchScore: 97 })).toBe('verified')
  })

  it('lists what an applicant still has to do', () => {
    expect(
      applicationGaps({
        hasAbout: true,
        hasExpertise: false,
        kycStatus: 'failed',
        hasPayoutAccount: false,
      }),
    ).toEqual(['expertise', 'kyc', 'bank'])
    expect(
      applicationGaps({
        hasAbout: true,
        hasExpertise: true,
        kycStatus: 'manual_review',
        hasPayoutAccount: true,
      }),
    ).toEqual([])
  })

  it('computes the reapply date and slugs', () => {
    expect(reapplyDate(new Date('2026-09-01T00:00:00Z')).toISOString()).toBe(
      '2026-10-01T00:00:00.000Z',
    )
    expect(slugify('Tobi Adélékè')).toBe('tobi-adeleke')
    expect(slugify('***')).toBe('instructor')
  })
})
