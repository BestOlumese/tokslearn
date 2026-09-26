import { describe, expect, it } from 'vitest'
import { ErrorCodeSchema, errorCatalog, errorMessage } from './errors'

describe('error catalog', () => {
  it('fills placeholders from data', () => {
    expect(errorMessage('RATE_LIMITED', { retryAfterSec: 20 })).toBe(
      "You're doing that too often. Try again in 20 seconds.",
    )
  })

  it('leaves unknown placeholders visible instead of printing undefined', () => {
    expect(errorMessage('LESSON_LOCKED')).toBe('This lesson opens on {date}.')
  })

  it('every code is in the Zod enum', () => {
    for (const code of Object.keys(errorCatalog)) {
      expect(ErrorCodeSchema.safeParse(code).success).toBe(true)
    }
  })

  it('messages avoid exclamation marks', () => {
    for (const { message } of Object.values(errorCatalog)) expect(message).not.toContain('!')
  })
})
