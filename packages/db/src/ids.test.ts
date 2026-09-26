import { describe, expect, it } from 'vitest'
import { newId, publicId } from './ids'

describe('ids', () => {
  it('generates time-ordered UUIDv7 values', () => {
    const a = newId()
    const b = newId()
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(a < b).toBe(true)
  })

  it('generates readable public ids without ambiguous letters', () => {
    const id = publicId('TL')
    expect(id).toMatch(/^TL-[0-9A-HJKMNP-TV-Z]{8}$/)
  })
})
