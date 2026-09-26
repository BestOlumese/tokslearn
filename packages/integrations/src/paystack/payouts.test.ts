import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPaystackPayouts } from './payouts'

const payouts = createPaystackPayouts({ secretKey: 'sk_test_x' })
afterEach(() => vi.unstubAllGlobals())

describe('paystack payouts', () => {
  it('lists active banks once each, sorted', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          status: true,
          data: [
            { name: 'Zenith Bank', code: '057', active: true },
            { name: 'Access Bank', code: '044', active: true },
            { name: 'Access Bank (Diamond)', code: '063', active: false },
            { name: 'Access Bank', code: '044', active: true },
          ],
        }),
      ),
    )
    expect(await payouts.listBanks()).toEqual([
      { code: '044', name: 'Access Bank' },
      { code: '057', name: 'Zenith Bank' },
    ])
  })

  it('returns null for an account that does not resolve', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ status: false, message: 'Could not resolve' }, { status: 422 }),
      ),
    )
    expect(
      await payouts.resolveAccount({ accountNumber: '0123456789', bankCode: '058' }),
    ).toBeNull()
  })

  it('creates a nuban recipient in naira', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      Response.json({ status: true, data: { recipient_code: 'RCP_abc' } }, { status: 201 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const r = await payouts.createTransferRecipient({
      name: 'ADA LOVELACE',
      accountNumber: '0123456789',
      bankCode: '058',
    })
    expect(r.recipientCode).toBe('RCP_abc')
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(body).toMatchObject({ type: 'nuban', currency: 'NGN', bank_code: '058' })
  })
})
