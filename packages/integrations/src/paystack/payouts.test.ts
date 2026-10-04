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

  it('sends a bulk transfer from the balance in kobo and reads back transfer codes', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      Response.json({
        status: true,
        data: [{ reference: 'tlpo0123456789abcdef', transfer_code: 'TRF_1', status: 'received' }],
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const out = await payouts.bulkTransfer([
      {
        amountKobo: 880_500n,
        recipientCode: 'RCP_abc',
        reference: 'tlpo0123456789abcdef',
        reason: 'Tokslearn payout',
      },
    ])
    expect(out).toEqual([
      { reference: 'tlpo0123456789abcdef', transferCode: 'TRF_1', status: 'pending' },
    ])
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe('https://api.paystack.co/transfer/bulk')
    expect(JSON.parse(String(init?.body))).toEqual({
      currency: 'NGN',
      source: 'balance',
      transfers: [
        {
          amount: 880500,
          recipient: 'RCP_abc',
          reference: 'tlpo0123456789abcdef',
          reason: 'Tokslearn payout',
        },
      ],
    })
  })

  it('raises when Paystack refuses the batch (e.g. low balance)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          { status: false, message: 'Your balance is not enough to fulfil this request' },
          { status: 400 },
        ),
      ),
    )
    await expect(
      payouts.bulkTransfer([
        { amountKobo: 1n, recipientCode: 'R', reference: 'tlpo0123456789abcdef', reason: 'x' },
      ]),
    ).rejects.toThrow('balance is not enough')
  })

  it('verifies a transfer by reference, with the fee and a failure reason', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          status: true,
          data: {
            status: 'failed',
            transfer_code: 'TRF_1',
            amount: 880500,
            gateway_response: 'Account closed',
          },
        }),
      ),
    )
    expect(await payouts.fetchTransfer('tlpo0123456789abcdef')).toEqual({
      status: 'failed',
      transferCode: 'TRF_1',
      amountKobo: 880_500n,
      feeKobo: null,
      failureReason: 'Account closed',
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ status: false, message: 'not found' }, { status: 404 })),
    )
    expect(await payouts.fetchTransfer('tlpo0123456789abcdef')).toBeNull()
  })
})
