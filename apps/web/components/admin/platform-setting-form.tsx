'use client'
// Client component: one platform setting on `/admin/settings/platform` (ADR-047). Amounts are
// typed in naira and sent as kobo; holidays one per line. The server validates and audits.

import type { PlatformSettingDto } from '@tokslearn/contract'
import { Button, buttonClasses } from '@tokslearn/ui/button'
import { Input } from '@tokslearn/ui/input'
import { Select } from '@tokslearn/ui/select'
import { Textarea } from '@tokslearn/ui/textarea'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { FormAlert } from '@/components/auth/form-alert'
import { apiErrorCode, apiErrorDetails } from '@/lib/api-error'
import { api } from '@/lib/orpc'

const toInput = (s: PlatformSettingDto): string => {
  if (s.kind === 'dates') return Array.isArray(s.value) ? s.value.join('\n') : ''
  if (s.kind === 'kobo') return String(BigInt(String(s.value)) / 100n)
  return String(s.value)
}

export function PlatformSettingForm({ setting }: { setting: PlatformSettingDto }) {
  const router = useRouter()
  const id = `setting-${setting.key}`
  const [value, setValue] = useState(toInput(setting))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<{ message: string; code: string | null } | null>(null)
  const [saved, setSaved] = useState(false)
  const dirty = value !== toInput(setting)

  const save = async () => {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const out =
        setting.kind === 'dates'
          ? value
              .split(/[\s,]+/)
              .map((d) => d.trim())
              .filter(Boolean)
          : setting.kind === 'kobo'
            ? /^\d+$/.test(value.trim())
              ? (BigInt(value.trim()) * 100n).toString()
              : value
            : setting.kind === 'int'
              ? Number(value)
              : value
      await api.admin.settings.update({ key: setting.key, value: out })
      setSaved(true)
      router.refresh()
    } catch (e) {
      setError({ message: apiErrorDetails(e), code: apiErrorCode(e) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        {setting.kind === 'choice' ? (
          <Select
            id={id}
            aria-label={setting.label}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="sm:max-w-md"
          >
            {setting.options?.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        ) : setting.kind === 'dates' ? (
          <Textarea
            id={id}
            aria-label={setting.label}
            rows={4}
            value={value}
            placeholder="2026-12-25"
            onChange={(e) => setValue(e.target.value)}
            className="font-mono sm:max-w-xs"
          />
        ) : (
          <div className="flex items-center gap-2">
            {setting.kind === 'kobo' ? <span className="text-body text-ink-2">₦</span> : null}
            <Input
              id={id}
              aria-label={setting.label}
              inputMode="numeric"
              value={value}
              onChange={(e) => setValue(e.target.value.replace(/[^\d]/g, ''))}
              className="w-40 tabular-nums"
            />
          </div>
        )}
        <Button variant="secondary" loading={saving} disabled={!dirty} onClick={save}>
          Save
        </Button>
      </div>
      {saved ? <FormAlert tone="success">Saved. It applies from now on.</FormAlert> : null}
      {error ? (
        <div className="flex flex-col gap-2">
          <FormAlert tone="error">{error.message}</FormAlert>
          {error.code === 'STEP_UP_REQUIRED' ? (
            <Link
              href={`/two-factor?next=${encodeURIComponent('/admin/settings/platform')}`}
              className={buttonClasses({
                variant: 'secondary',
                size: 'sm',
                className: 'self-start',
              })}
            >
              Enter my code
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
