import { afterEach, describe, expect, it, vi } from 'vitest'
import { paystackFee } from './fake'
import { createPaystackPayments } from './payments'

const payments = createPaystackPayments({ secretKey: 'sk_test_x' })
afterEach(() => vi.unstubAllGlobals())

describe('paystack payments', () => {
  it('initializes with the amount in kobo and our reference', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      Response.json({
        status: true,
        data: { authorization_url: 'https://checkout.paystack.com/abc', access_code: 'abc' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const r = await payments.initializeTransaction({
      reference: 'TL-7K3M9Q2A',
      email: 'amaka@example.com',
      amountKobo: 1_500_000n,
      currency: 'NGN',
      callbackUrl: 'https://tokslearn.com/checkout/success?ref=TL-7K3M9Q2A',
      metadata: { orderId: 'o1' },
    })
    expect(r).toEqual({ authorizationUrl: 'https://checkout.paystack.com/abc', accessCode: 'abc' })
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe('https://api.paystack.co/transaction/initialize')
    expect(JSON.parse(String(init?.body))).toMatchObject({
      amount: '1500000',
      reference: 'TL-7K3M9Q2A',
      currency: 'NGN',
    })
    expect((init?.headers as Record<string, string> | undefined)?.authorization).toBe(
      'Bearer sk_test_x',
    )
  })

  it('verifies a successful charge with its fee', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          status: true,
          data: {
            status: 'success',
            reference: 'TL-1',
            amount: 1_000_000,
            currency: 'NGN',
            channel: 'card',
            paid_at: '2026-10-01T09:30:00.000Z',
            fees: 25_000,
            gateway_response: 'Approved',
          },
        }),
      ),
    )
    expect(await payments.verifyTransaction('TL-1')).toEqual({
      status: 'success',
      reference: 'TL-1',
      amountKobo: 1_000_000n,
      currency: 'NGN',
      channel: 'card',
      paidAt: new Date('2026-10-01T09:30:00.000Z'),
      feesKobo: 25_000n,
      gatewayResponse: 'Approved',
    })
  })

  it('maps in-flight, reversed and unknown transactions safely', async () => {
    const respond = (status: string) =>
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          Response.json({
            status: true,
            data: { status, reference: 'TL-2', amount: 100, currency: 'NGN' },
          }),
        ),
      )
    respond('ongoing')
    expect((await payments.verifyTransaction('TL-2')).status).toBe('pending')
    respond('reversed')
    expect((await payments.verifyTransaction('TL-2')).status).toBe('failed')
    respond('abandoned')
    expect((await payments.verifyTransaction('TL-2')).status).toBe('abandoned')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          { status: false, message: 'Transaction reference not found' },
          { status: 400 },
        ),
      ),
    )
    expect(await payments.verifyTransaction('TL-3')).toMatchObject({
      status: 'pending',
      feesKobo: null,
    })
  })

  it('throws a provider error on outages', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('down', { status: 503 })),
    )
    await expect(payments.verifyTransaction('TL-4')).rejects.toThrow('paystack')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ status: false }, { status: 401 })),
    )
    await expect(
      payments.initializeTransaction({
        reference: 'x',
        email: 'a@b.c',
        amountKobo: 100n,
        currency: 'NGN',
        callbackUrl: 'https://x',
        metadata: {},
      }),
    ).rejects.toThrow('not initialized')
  })

  it('checks webhook signatures with the secret key', () => {
    expect(payments.verifyWebhookSignature('{}', null)).toBe(false)
    expect(payments.verifyWebhookSignature('{}', 'bad')).toBe(false)
  })
})

describe('paystackFee (fake)', () => {
  it('follows local card pricing', () => {
    expect(paystackFee(200_000n)).toBe(3_000n)
    expect(paystackFee(1_000_000n)).toBe(25_000n)
    expect(paystackFee(50_000_000n)).toBe(200_000n)
  })

  it('refunds part of a transaction in kobo and maps refund states', async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
      url.endsWith('/refund')
        ? Response.json({ status: true, data: { id: 3018284, status: 'pending' } })
        : Response.json({ status: true, data: { status: 'processed', amount: 1_000_000 } }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const r = await payments.createRefund({
      reference: 'TL-7K3M9Q2A',
      amountKobo: 1_000_000n,
      merchantNote: 'Refund RF-1',
    })
    expect(r).toEqual({ refundId: '3018284', status: 'pending' })
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      transaction: 'TL-7K3M9Q2A',
      amount: 1_000_000,
      currency: 'NGN',
      merchant_note: 'Refund RF-1',
    })
    expect(await payments.fetchRefund('3018284')).toEqual({
      status: 'processed',
      amountKobo: 1_000_000n,
    })
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://api.paystack.co/refund/3018284')
  })
})
