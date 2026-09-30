import { describe, expect, it } from 'vitest'
import {
  basisText,
  cleanRecipientName,
  decide,
  linkedInAddUrl,
  newCertificateCode,
  normaliseCode,
  readCertificateSettings,
  settingsForMode,
} from './rules'

const none = { examQuizId: null, requireCompletion: false, providerName: null, providerUrl: null }

describe('certificate codes', () => {
  it('look like TL-C-XXXX-XXXX and read back however they are typed', () => {
    const code = newCertificateCode()
    expect(code).toMatch(/^TL-C-[0-9A-Z]{4}-[0-9A-Z]{4}$/)
    expect(normaliseCode(code)).toBe(code)
    expect(normaliseCode(code.toLowerCase().replace(/-/g, ' '))).toBe(code)
    expect(normaliseCode('tl-c-8q2m-4k7p')).toBe('TL-C-8Q2M-4K7P')
    // O, I and L are read as 0 and 1.
    expect(normaliseCode('TL-C-8Q2M-4KOI')).toBe('TL-C-8Q2M-4K01')
    expect(normaliseCode('TL-7K3M9Q2A')).toBeNull()
    expect(normaliseCode('TL-C-8Q2M-4K7')).toBeNull()
    expect(normaliseCode('<script>')).toBeNull()
  })
})

describe('what earns a certificate', () => {
  const facts = { completed: false, examAttemptId: null, externalPassId: null }

  it('completion needs every lesson', () => {
    expect(decide('completion', none, facts)).toBeNull()
    expect(decide('completion', none, { ...facts, completed: true })).toEqual({
      basis: 'completion',
    })
  })

  it('exam needs a pass, and completion too when set', () => {
    const exam = { ...none, examQuizId: 'q1' }
    expect(decide('exam', exam, facts)).toBeNull()
    expect(decide('exam', exam, { ...facts, examAttemptId: 'a1' })).toEqual({
      basis: 'exam',
      quizAttemptId: 'a1',
    })
    const both = { ...exam, requireCompletion: true }
    expect(decide('exam', both, { ...facts, examAttemptId: 'a1' })).toBeNull()
    expect(decide('exam', both, { ...facts, examAttemptId: 'a1', completed: true })).not.toBeNull()
    // No exam chosen: nothing counts.
    expect(decide('exam', none, { ...facts, examAttemptId: 'a1' })).toBeNull()
  })

  it('external needs a recorded pass; none never issues', () => {
    expect(decide('external', none, { ...facts, externalPassId: 'r1' })).toEqual({
      basis: 'external',
      externalResultId: 'r1',
    })
    expect(
      decide('none', none, { completed: true, examAttemptId: 'a', externalPassId: 'r' }),
    ).toBeNull()
  })
})

describe('settings', () => {
  it('read defaults from anything and drop rules the mode does not use', () => {
    expect(readCertificateSettings(null)).toEqual(none)
    expect(readCertificateSettings({ examQuizId: '', requireCompletion: 'yes' })).toEqual(none)
    const all = {
      examQuizId: 'q1',
      requireCompletion: true,
      providerName: 'ICAN',
      providerUrl: 'https://ican.ng',
    }
    expect(settingsForMode('exam', all)).toEqual({
      ...none,
      examQuizId: 'q1',
      requireCompletion: true,
    })
    expect(settingsForMode('external', all)).toEqual({
      ...none,
      providerName: 'ICAN',
      providerUrl: 'https://ican.ng',
    })
    expect(settingsForMode('completion', all)).toEqual(none)
  })
})

describe('words and links', () => {
  it('say how it was earned', () => {
    expect(basisText('exam', null)).toBe('Passed a timed exam')
    expect(basisText('completion', null)).toBe('Completed all lessons')
    expect(basisText('external', 'ICAN')).toBe('Externally assessed via ICAN')
  })

  it('prefill LinkedIn with the Lagos month and the verify link', () => {
    const url = new URL(
      linkedInAddUrl({
        courseTitle: 'Excel for Accountants',
        // 23:30 UTC on 30 Sep is already 1 Oct in Lagos.
        issuedAt: new Date('2026-09-30T23:30:00Z'),
        verifyUrl: 'https://tokslearn.com/verify/TL-C-8Q2M-4K7P',
        code: 'TL-C-8Q2M-4K7P',
      }),
    )
    expect(url.origin + url.pathname).toBe('https://www.linkedin.com/profile/add')
    expect(url.searchParams.get('name')).toBe('Excel for Accountants')
    expect(url.searchParams.get('issueMonth')).toBe('10')
    expect(url.searchParams.get('issueYear')).toBe('2026')
    expect(url.searchParams.get('certUrl')).toBe('https://tokslearn.com/verify/TL-C-8Q2M-4K7P')
    expect(url.toString()).not.toContain('+')
  })

  it('clean names to something printable', () => {
    expect(cleanRecipientName('  Chiamaka   Okafor ')).toBe('Chiamaka Okafor')
    expect(cleanRecipientName('A')).toBeNull()
    expect(cleanRecipientName(`Ada\u0000 Eze`)).toBe('Ada Eze')
    expect(cleanRecipientName('x'.repeat(81))).toBeNull()
  })
})
