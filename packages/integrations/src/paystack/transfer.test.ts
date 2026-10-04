import { describe, expect, it } from 'vitest'
import { createFakePayouts } from './fake'
import { mapTransferStatus, transferFeeKobo } from './transfer'

describe('paystack transfers', () => {
  it('charges the NGN transfer fee tiers', () => {
    expect(transferFeeKobo(500_000n)).toBe(1_000n)
    expect(transferFeeKobo(500_100n)).toBe(2_500n)
    expect(transferFeeKobo(5_000_000n)).toBe(2_500n)
    expect(transferFeeKobo(5_000_100n)).toBe(5_000n)
  })

  it('folds Paystack states into four', () => {
    expect(mapTransferStatus('otp')).toBe('pending')
    expect(mapTransferStatus('received')).toBe('pending')
    expect(mapTransferStatus('abandoned')).toBe('failed')
    expect(mapTransferStatus('reversed')).toBe('reversed')
    expect(mapTransferStatus('success')).toBe('success')
  })

  it('fake refuses a reused reference and reports what was settled', async () => {
    const fake = createFakePayouts()
    const t = {
      amountKobo: 880_500n,
      recipientCode: 'RCP_1',
      reference: 'tlpo0000000000000001',
      reason: 'x',
    }
    expect(await fake.provider.bulkTransfer([t])).toEqual([
      { reference: t.reference, transferCode: 'TRF_fake1', status: 'pending' },
    ])
    await expect(fake.provider.bulkTransfer([t])).rejects.toThrow('duplicate reference')
    fake.settleTransfer(t.reference, 'success')
    expect(await fake.provider.fetchTransfer(t.reference)).toMatchObject({
      status: 'success',
      feeKobo: 2_500n,
    })
    expect(await fake.provider.fetchTransfer('nope-nope-nope-nope')).toBeNull()
  })
})
