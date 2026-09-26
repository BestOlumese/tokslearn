'use client'
// Client component: create or edit a bundle of the instructor's courses (docs/20 bundles).

import type { BundleDto } from '@tokslearn/contract'
import { Button } from '@tokslearn/ui/button'
import { Checkbox } from '@tokslearn/ui/checkbox'
import { Field } from '@tokslearn/ui/field'
import { Input } from '@tokslearn/ui/input'
import { Label } from '@tokslearn/ui/label'
import { Radio } from '@tokslearn/ui/radio'
import { Textarea } from '@tokslearn/ui/textarea'
import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { SettingsPanel } from '@/components/account/settings-panel'
import { FormAlert } from '@/components/auth/form-alert'
import { apiErrorMessage } from '@/lib/api-error'
import { api } from '@/lib/orpc'

export interface BundleCourseOption {
  id: string
  title: string
  isPublished: boolean
  priceKobo: string
}

const fmt = (kobo: bigint) => `₦${(kobo / 100n).toLocaleString('en-NG')}`

export function BundleForm({
  bundle,
  courses,
}: {
  bundle: BundleDto | null
  courses: ReadonlyArray<BundleCourseOption>
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<string[]>(bundle?.courseIds ?? [])
  const [price, setPrice] = useState(bundle ? String(Number(BigInt(bundle.priceKobo) / 100n)) : '')
  const [status, setStatus] = useState<'draft' | 'active'>(
    bundle?.status === 'active' ? 'active' : 'draft',
  )
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const total = courses
    .filter((c) => selected.includes(c.id))
    .reduce((sum, c) => sum + BigInt(c.priceKobo), 0n)

  return (
    <form
      className="flex max-w-[780px] flex-col gap-6"
      onSubmit={async (e) => {
        e.preventDefault()
        const form = new FormData(e.currentTarget)
        const input = {
          title: String(form.get('title') ?? ''),
          description: String(form.get('description') ?? '').trim() || null,
          priceKobo: (BigInt(price || '0') * 100n).toString(),
          courseIds: selected,
          status,
        }
        setError(null)
        setPending(true)
        try {
          const saved = bundle
            ? await api.studio.bundles.update({ bundleId: bundle.id, ...input })
            : await api.studio.bundles.create(input)
          router.push(`/teach/bundles/${saved.id}` as Route)
          router.refresh()
        } catch (err) {
          setError(apiErrorMessage(err))
        } finally {
          setPending(false)
        }
      }}
    >
      {error ? <FormAlert tone="error">{error}</FormAlert> : null}
      <SettingsPanel
        id="bundle"
        title="Bundle"
        description="Sell two or more of your courses together for one price."
      >
        <div className="flex flex-col gap-5">
          <Field id="title" label="Title">
            {(p) => (
              <Input
                name="title"
                required
                minLength={3}
                maxLength={120}
                defaultValue={bundle?.title ?? ''}
                {...p}
              />
            )}
          </Field>
          <Field
            id="description"
            label="Description (optional)"
            helper="Who it's for and why these courses go together."
          >
            {(p) => (
              <Textarea
                name="description"
                rows={3}
                maxLength={1000}
                defaultValue={bundle?.description ?? ''}
                {...p}
              />
            )}
          </Field>
        </div>
      </SettingsPanel>

      <SettingsPanel
        id="courses"
        title="Courses"
        description="Only published courses can be sold in an active bundle."
      >
        {courses.length === 0 ? (
          <p className="text-body text-ink-2">You don't have any courses yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {courses.map((c) => (
              <li key={c.id} className="flex items-start gap-3">
                <Checkbox
                  id={`course-${c.id}`}
                  checked={selected.includes(c.id)}
                  onChange={(e) =>
                    setSelected((s) =>
                      e.target.checked ? [...s, c.id] : s.filter((x) => x !== c.id),
                    )
                  }
                  className="mt-0.5"
                />
                <Label htmlFor={`course-${c.id}`} kind="option">
                  <span className="font-medium text-ink">{c.title}</span>
                  <span className="block text-body-sm text-ink-2">
                    {c.isPublished
                      ? `Live · ${BigInt(c.priceKobo) === 0n ? 'Free' : fmt(BigInt(c.priceKobo))}`
                      : 'Not published yet'}
                  </span>
                </Label>
              </li>
            ))}
          </ul>
        )}
      </SettingsPanel>

      <SettingsPanel
        id="bundle-price"
        title="Price and status"
        footer={
          <Button type="submit" loading={pending} disabled={selected.length === 0}>
            {bundle ? 'Save bundle' : 'Create bundle'}
          </Button>
        }
      >
        <div className="flex flex-col gap-5">
          <Field
            id="price"
            label="Bundle price (₦)"
            helper={
              total > 0n
                ? `Bought separately, these cost ${fmt(total)}.`
                : 'Between ₦1,000 and ₦5,000,000.'
            }
          >
            {(p) => (
              <Input
                inputMode="numeric"
                required
                value={price}
                className="max-w-xs tabular-nums"
                onChange={(e) => setPrice(e.target.value.replace(/\D/g, '').slice(0, 7))}
                {...p}
              />
            )}
          </Field>
          <div className="flex flex-col gap-2">
            {(
              [
                ['draft', 'Draft', 'Not for sale yet.'],
                [
                  'active',
                  'Active',
                  'Ready to sell once checkout opens. Needs two published courses.',
                ],
              ] as const
            ).map(([value, label, hint]) => (
              <div key={value} className="flex items-start gap-3">
                <Radio
                  id={`status-${value}`}
                  name="status"
                  checked={status === value}
                  onChange={() => setStatus(value)}
                  className="mt-0.5"
                />
                <Label htmlFor={`status-${value}`} kind="option">
                  <span className="font-medium text-ink">{label}</span>
                  <span className="block text-body-sm text-ink-2">{hint}</span>
                </Label>
              </div>
            ))}
          </div>
        </div>
      </SettingsPanel>
    </form>
  )
}
