import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { isValidPaystackSignature } from './signature'

const secret = 'sk_test_123'
const body = JSON.stringify({ event: 'charge.success', data: { reference: 'TL-ABC' } })
const sign = (b: string) => createHmac('sha512', secret).update(b).digest('hex')

describe('paystack webhook signature', () => {
  it('accepts a correct signature', () => {
    expect(isValidPaystackSignature(secret, body, sign(body))).toBe(true)
  })

  it('rejects a tampered body, a missing header and a wrong key', () => {
    expect(isValidPaystackSignature(secret, `${body} `, sign(body))).toBe(false)
    expect(isValidPaystackSignature(secret, body, null)).toBe(false)
    expect(isValidPaystackSignature('sk_other', body, sign(body))).toBe(false)
  })
})
