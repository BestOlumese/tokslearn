'use client'
// Client component: price, old price and refund window (docs/20 pricing, docs/08 refunds).

import { Button } from '@tokslearn/ui/button'
import { Field } from '@tokslearn/ui/field'
import { Input } from '@tokslearn/ui/input'
import { Label } from '@tokslearn/ui/label'
import { Radio } from '@tokslearn/ui/radio'
import { useState } from 'react'
import { SettingsPanel } from '@/components/account/settings-panel'
import { FormAlert } from '@/components/auth/form-alert'
import { apiErrorMessage } from '@/lib/api-error'
import { api } from '@/lib/orpc'
import { useCourseEditor } from './course-editor-provider'

const naira = (kobo: string | null) => (kobo ? String(Number(BigInt(kobo) / 100n)) : '')
const toKobo = (value: string) => (BigInt(value.replace(/\D/g, '') || '0') * 100n).toString()
const fmt = (kobo: bigint) => `₦${(kobo / 100n).toLocaleString('en-NG')}`

const refundOptions = [
  [0, 'No refunds', 'Say so clearly on the course page. Learners see it before paying.'],
  [3, '3 days', 'For short courses learners finish quickly.'],
  [7, '7 days', 'Most common. Learners can try the course for a week.'],
  [14, '14 days', 'For long courses. Builds trust with new learners.'],
] as const

export function PricingForm() {
  const { course, run, locked } = useCourseEditor()
  const r = course.revision
  const [free, setFree] = useState(r.priceKobo === '0')
  const [price, setPrice] = useState(naira(r.priceKobo === '0' ? null : r.priceKobo))
  const [compareAt, setCompareAt] = useState(naira(r.compareAtKobo))
  const [refund, setRefund] = useState<0 | 3 | 7 | 14>(r.refundPolicyDays)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, setPending] = useState(false)

  const priceKobo = free ? 0n : BigInt(toKobo(price))
  const live = course.livePriceKobo ? BigInt(course.livePriceKobo) : null
  const bigRise = live !== null && (live === 0n ? priceKobo > 0n : priceKobo * 2n > live * 3n)

  return (
    <form
      className="flex max-w-[780px] flex-col gap-6"
      onSubmit={async (e) => {
        e.preventDefault()
        setError(null)
        setSaved(false)
        setPending(true)
        try {
          await run((version) =>
            api.studio.courses.updatePricing({
              courseId: course.id,
              version,
              priceKobo: priceKobo.toString(),
              compareAtKobo: free || !compareAt ? null : toKobo(compareAt),
              refundPolicyDays: refund,
            }),
          )
          setSaved(true)
        } catch (err) {
          setError(apiErrorMessage(err))
        } finally {
          setPending(false)
        }
      }}
    >
      {error ? <FormAlert tone="error">{error}</FormAlert> : null}
      {saved ? <FormAlert tone="success">Pricing saved.</FormAlert> : null}
      <fieldset disabled={locked} className="contents">
        <SettingsPanel
          id="price"
          title="Price"
          description="Learners pay in naira by card, bank transfer or USSD. You can change the price later."
        >
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              {[
                [true, 'Free', 'Anyone can enrol. Good for building an audience.'],
                [false, 'Paid', 'Between ₦1,000 and ₦5,000,000.'],
              ].map(([value, label, hint]) => (
                <div key={String(value)} className="flex items-start gap-3">
                  <Radio
                    id={`free-${value}`}
                    name="free"
                    checked={free === value}
                    onChange={() => setFree(Boolean(value))}
                    className="mt-0.5"
                  />
                  <Label htmlFor={`free-${value}`} kind="option">
                    <span className="font-medium text-ink">{label}</span>
                    <span className="block text-body-sm text-ink-2">{hint}</span>
                  </Label>
                </div>
              ))}
            </div>
            {!free ? (
              <div className="grid gap-5 sm:grid-cols-2">
                <Field id="price" label="Price (₦)">
                  {(p) => (
                    <Input
                      inputMode="numeric"
                      required
                      value={price}
                      onChange={(e) => setPrice(e.target.value.replace(/\D/g, '').slice(0, 7))}
                      className="tabular-nums"
                      {...p}
                    />
                  )}
                </Field>
                <Field
                  id="compareAt"
                  label="Old price (₦, optional)"
                  helper="Shown crossed out next to the price. Must be higher."
                >
                  {(p) => (
                    <Input
                      inputMode="numeric"
                      value={compareAt}
                      onChange={(e) => setCompareAt(e.target.value.replace(/\D/g, '').slice(0, 7))}
                      className="tabular-nums"
                      {...p}
                    />
                  )}
                </Field>
              </div>
            ) : null}
            {bigRise && live !== null ? (
              <FormAlert tone="info">
                The live price is {fmt(live)}. A rise of more than half needs a reviewer: learners
                keep seeing {fmt(live)} until your update is approved.
              </FormAlert>
            ) : null}
          </div>
        </SettingsPanel>

        <SettingsPanel
          id="refunds"
          title="Refund window"
          description="Learners who ask within the window get their money back if they've watched less than 30% of the course and haven't downloaded an important file."
          footer={
            <Button type="submit" loading={pending} disabled={locked}>
              Save pricing
            </Button>
          }
        >
          <div className="flex flex-col gap-3">
            {refundOptions.map(([days, label, hint]) => (
              <div key={days} className="flex items-start gap-3">
                <Radio
                  id={`refund-${days}`}
                  name="refund"
                  checked={refund === days}
                  onChange={() => setRefund(days)}
                  className="mt-0.5"
                />
                <Label htmlFor={`refund-${days}`} kind="option">
                  <span className="font-medium text-ink">{label}</span>
                  <span className="block text-body-sm text-ink-2">{hint}</span>
                </Label>
              </div>
            ))}
          </div>
        </SettingsPanel>
      </fieldset>
    </form>
  )
}
