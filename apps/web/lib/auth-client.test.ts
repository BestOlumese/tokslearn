import { describe, expect, it } from 'vitest'
import { safeNext } from './auth-client'

describe('safeNext (open-redirect guard)', () => {
  it('keeps same-site paths', () => {
    expect(safeNext('/account/settings/security?tab=2')).toBe('/account/settings/security?tab=2')
  })
  it('rejects other sites and protocol tricks', () => {
    expect(safeNext('https://evil.example')).toBe('/account')
    expect(safeNext('//evil.example')).toBe('/account')
    expect(safeNext('/\\evil.example')).toBe('/account')
    expect(safeNext(null)).toBe('/account')
  })
})
