import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDojahKyc } from './client'

const kyc = createDojahKyc({
  appId: 'app',
  secretKey: 'secret',
  baseUrl: 'https://sandbox.dojah.io',
})
afterEach(() => vi.unstubAllGlobals())

const entity = {
  bvn: '22222222222',
  first_name: 'JOHN',
  middle_name: 'DOE',
  last_name: 'MUSA',
  date_of_birth: '15-Apr-1985',
  phone_number1: '08134720263',
  email: 'john@example.com',
  residential_address: '1 Allen Avenue, Ikeja',
  image: '/9j/4AAQSkZJRgABAQ...',
  gender: 'Male',
  selfie_verification: { confidence_value: 99.99, match: true },
}

describe('dojah kyc', () => {
  it('returns names and score, and drops the ID number, phone, DOB, photo and address', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => Response.json({ entity }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await kyc.verifyWithSelfie({
      method: 'bvn',
      number: '22222222222',
      selfieImageBase64: 'abc',
    })
    expect(result).toMatchObject({
      outcome: 'verified',
      firstName: 'JOHN',
      middleName: 'DOE',
      lastName: 'MUSA',
      faceMatchScore: 99.99,
    })
    const stored = JSON.stringify(result)
    for (const secret of [
      '22222222222',
      '08134720263',
      '15-Apr-1985',
      'john@example.com',
      'Allen',
      '/9j/',
    ]) {
      expect(stored).not.toContain(secret)
    }
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe('https://sandbox.dojah.io/api/v1/kyc/bvn/verify')
    expect((init?.headers as Record<string, string> | undefined)?.authorization).toBe('secret')
  })

  it('reads NIN name fields and reports a selfie mismatch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          entity: {
            nin: '70123456789',
            firstname: 'AMAKA',
            surname: 'OBI',
            selfie_verification: { confidence_value: 32, match: false },
          },
        }),
      ),
    )
    const result = await kyc.verifyWithSelfie({
      method: 'nin',
      number: '70123456789',
      selfieImageBase64: 'abc',
    })
    expect(result).toMatchObject({
      outcome: 'selfie_mismatch',
      firstName: 'AMAKA',
      lastName: 'OBI',
      faceMatchScore: 32,
    })
    expect(JSON.stringify(result)).not.toContain('70123456789')
  })

  it('treats 404 as not found and 5xx/401 as provider errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ error: 'not found' }, { status: 404 })),
    )
    expect(
      (await kyc.verifyWithSelfie({ method: 'bvn', number: '1', selfieImageBase64: 'x' })).outcome,
    ).toBe('not_found')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('down', { status: 503 })),
    )
    await expect(
      kyc.verifyWithSelfie({ method: 'bvn', number: '1', selfieImageBase64: 'x' }),
    ).rejects.toThrow('dojah')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({}, { status: 401 })),
    )
    await expect(
      kyc.verifyWithSelfie({ method: 'bvn', number: '1', selfieImageBase64: 'x' }),
    ).rejects.toThrow('unauthorized')
  })
})
