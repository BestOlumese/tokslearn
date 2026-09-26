'use client'
// Client component: an editable list of short lines (outcomes, requirements).

import { Button } from '@tokslearn/ui/button'
import { Input } from '@tokslearn/ui/input'
import { Plus, X } from 'lucide-react'

export function ListInput({
  id,
  label,
  values,
  onChange,
  max = 10,
  placeholder,
  disabled,
}: {
  id: string
  label: string
  values: string[]
  onChange: (next: string[]) => void
  max?: number
  placeholder?: string
  disabled?: boolean
}) {
  const rows = values.length === 0 ? [''] : values
  return (
    <div className="flex flex-col gap-2">
      {rows.map((value, i) => (
        // Rows are positional: editing text in place must not remount the input.
        // biome-ignore lint/suspicious/noArrayIndexKey: see above
        <div key={i} className="flex gap-2">
          <label htmlFor={`${id}-${i}`} className="sr-only">
            {label} {i + 1}
          </label>
          <Input
            id={`${id}-${i}`}
            value={value}
            maxLength={160}
            disabled={disabled}
            placeholder={i === 0 ? placeholder : undefined}
            onChange={(e) => {
              const next = [...rows]
              next[i] = e.target.value
              onChange(next)
            }}
          />
          <Button
            type="button"
            variant="tertiary"
            aria-label={`Remove ${label.toLowerCase()} ${i + 1}`}
            disabled={disabled || rows.length === 1}
            onClick={() => onChange(rows.filter((_, j) => j !== i))}
            className="shrink-0"
          >
            <X aria-hidden className="size-4" />
          </Button>
        </div>
      ))}
      {rows.length < max ? (
        <Button
          type="button"
          variant="tertiary"
          size="sm"
          disabled={disabled}
          onClick={() => onChange([...rows, ''])}
          className="w-fit"
        >
          <Plus aria-hidden className="size-4" />
          Add another
        </Button>
      ) : null}
    </div>
  )
}
