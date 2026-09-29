'use client'
// Client component: one question's answer control, for all six types (docs/10 §5). Ordering uses
// move buttons rather than drag-and-drop: they work on phones, keyboards and screen readers.

import type { AttemptDto } from '@tokslearn/contract'
import { Checkbox } from '@tokslearn/ui/checkbox'
import { Input } from '@tokslearn/ui/input'
import { Label } from '@tokslearn/ui/label'
import { Radio } from '@tokslearn/ui/radio'
import { Select } from '@tokslearn/ui/select'
import { ArrowDown, ArrowUp } from 'lucide-react'

export type AttemptQuestion = AttemptDto['questions'][number]
type Choice = { id: string; text: string }

export function QuestionInput({
  q,
  value,
  onChange,
  disabled,
  onPaste,
}: {
  q: AttemptQuestion
  value: unknown
  onChange: (answer: unknown) => void
  disabled: boolean
  /** Exams: paste is blocked in answer fields and recorded. */
  onPaste?: (() => void) | undefined
}) {
  const v = (value ?? {}) as Record<string, unknown>
  const name = `q-${q.id}`
  const choices = q.options.choices ?? []

  switch (q.type) {
    case 'single':
      return (
        <fieldset className="flex flex-col gap-2" disabled={disabled}>
          <legend className="sr-only">Pick one</legend>
          {choices.map((c) => (
            <div
              key={c.id}
              className="flex items-start gap-3 rounded-control border border-border p-3 has-[:checked]:border-brand has-[:checked]:bg-brand-soft"
            >
              <Radio
                id={`${name}-${c.id}`}
                name={name}
                checked={v.choice === c.id}
                onChange={() => onChange({ choice: c.id })}
                className="mt-0.5"
              />
              <Label htmlFor={`${name}-${c.id}`} kind="option" className="flex-1">
                {c.text}
              </Label>
            </div>
          ))}
        </fieldset>
      )
    case 'multiple': {
      const picked = (v.choices as string[] | undefined) ?? []
      return (
        <fieldset className="flex flex-col gap-2" disabled={disabled}>
          <legend className="mb-1 text-body-sm text-ink-2">Pick every one that applies.</legend>
          {choices.map((c) => (
            <div
              key={c.id}
              className="flex items-start gap-3 rounded-control border border-border p-3 has-[:checked]:border-brand has-[:checked]:bg-brand-soft"
            >
              <Checkbox
                id={`${name}-${c.id}`}
                checked={picked.includes(c.id)}
                onChange={(e) =>
                  onChange({
                    choices: e.target.checked
                      ? [...picked, c.id]
                      : picked.filter((x) => x !== c.id),
                  })
                }
                className="mt-0.5"
              />
              <Label htmlFor={`${name}-${c.id}`} kind="option" className="flex-1">
                {c.text}
              </Label>
            </div>
          ))}
        </fieldset>
      )
    }
    case 'true_false':
      return (
        <fieldset className="flex gap-3" disabled={disabled}>
          <legend className="sr-only">True or false</legend>
          {([true, false] as const).map((b) => (
            <div
              key={String(b)}
              className="flex items-center gap-2 rounded-control border border-border px-4 py-3 has-[:checked]:border-brand has-[:checked]:bg-brand-soft"
            >
              <Radio
                id={`${name}-${b}`}
                name={name}
                checked={v.value === b}
                onChange={() => onChange({ value: b })}
              />
              <Label htmlFor={`${name}-${b}`} kind="option">
                {b ? 'True' : 'False'}
              </Label>
            </div>
          ))}
        </fieldset>
      )
    case 'short_text':
      return (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={name} className="sr-only">
            Your answer
          </Label>
          <Input
            id={name}
            value={(v.text as string | undefined) ?? ''}
            maxLength={500}
            disabled={disabled}
            autoComplete="off"
            placeholder="Your answer"
            onChange={(e) => onChange({ text: e.target.value })}
            onPaste={
              onPaste
                ? (e) => {
                    e.preventDefault()
                    onPaste()
                  }
                : undefined
            }
          />
        </div>
      )
    case 'ordering': {
      const items = q.options.items ?? []
      const byId = new Map(items.map((i) => [i.id, i]))
      const order = ((v.order as string[] | undefined) ?? items.map((i) => i.id)).filter((id) =>
        byId.has(id),
      )
      const move = (from: number, to: number) => {
        if (to < 0 || to >= order.length) return
        const next = [...order]
        const [x] = next.splice(from, 1)
        if (x) next.splice(to, 0, x)
        onChange({ order: next })
      }
      return (
        <ol className="flex flex-col gap-2" aria-label="Put these in order">
          {order.map((id, i) => (
            <li
              key={id}
              className="flex items-center gap-2 rounded-control border border-border bg-surface p-2 pl-3"
            >
              <span className="w-5 text-body-sm text-ink-3">{i + 1}.</span>
              <span className="min-w-0 flex-1 text-body text-ink">{byId.get(id)?.text}</span>
              <button
                type="button"
                disabled={disabled || i === 0}
                onClick={() => move(i, i - 1)}
                aria-label={`Move “${byId.get(id)?.text}” up`}
                className="flex size-10 items-center justify-center rounded-control text-ink-2 hover:bg-canvas disabled:opacity-30"
              >
                <ArrowUp aria-hidden className="size-4" />
              </button>
              <button
                type="button"
                disabled={disabled || i === order.length - 1}
                onClick={() => move(i, i + 1)}
                aria-label={`Move “${byId.get(id)?.text}” down`}
                className="flex size-10 items-center justify-center rounded-control text-ink-2 hover:bg-canvas disabled:opacity-30"
              >
                <ArrowDown aria-hidden className="size-4" />
              </button>
            </li>
          ))}
        </ol>
      )
    }
    case 'matching': {
      const left: Choice[] = q.options.left ?? []
      const right: Choice[] = q.options.right ?? []
      const pairs = (v.pairs as Array<{ left: string; right: string }> | undefined) ?? []
      const pick = (l: string, r: string) =>
        onChange({
          pairs: [...pairs.filter((p) => p.left !== l), ...(r ? [{ left: l, right: r }] : [])],
        })
      return (
        <div className="flex flex-col gap-2">
          {left.map((l) => (
            <div key={l.id} className="grid gap-2 sm:grid-cols-2 sm:items-center">
              <Label htmlFor={`${name}-${l.id}`}>{l.text}</Label>
              <Select
                id={`${name}-${l.id}`}
                value={pairs.find((p) => p.left === l.id)?.right ?? ''}
                disabled={disabled}
                onChange={(e) => pick(l.id, e.target.value)}
              >
                <option value="">Choose…</option>
                {right.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.text}
                  </option>
                ))}
              </Select>
            </div>
          ))}
        </div>
      )
    }
  }
}

/** Whether a question counts as answered (for "answered 7 of 10"). */
export function isAnswered(q: AttemptQuestion, value: unknown): boolean {
  const v = value as Record<string, unknown> | undefined
  if (!v) return false
  switch (q.type) {
    case 'single':
      return typeof v.choice === 'string'
    case 'multiple':
      return Array.isArray(v.choices) && v.choices.length > 0
    case 'true_false':
      return typeof v.value === 'boolean'
    case 'short_text':
      return typeof v.text === 'string' && v.text.trim() !== ''
    case 'ordering':
      return Array.isArray(v.order)
    case 'matching':
      return Array.isArray(v.pairs) && v.pairs.length === (q.options.left ?? []).length
  }
}

/** The correct answer in words, for results (only when the quiz shows answers). */
export function correctAnswerText(q: AttemptQuestion, key: unknown): string {
  const k = (key ?? {}) as Record<string, unknown>
  const text = (list: Choice[] | undefined, id: unknown) =>
    list?.find((c) => c.id === id)?.text ?? ''
  switch (q.type) {
    case 'single':
      return text(q.options.choices, k.choice)
    case 'multiple':
      return ((k.choices as string[] | undefined) ?? [])
        .map((id) => text(q.options.choices, id))
        .join(', ')
    case 'true_false':
      return k.value ? 'True' : 'False'
    case 'short_text':
      return ((k.accepted as string[] | undefined) ?? []).join(' or ')
    case 'ordering':
      return ((k.order as string[] | undefined) ?? [])
        .map((id) => text(q.options.items, id))
        .join(' → ')
    case 'matching':
      return ((k.pairs as Array<{ left: string; right: string }> | undefined) ?? [])
        .map((p) => `${text(q.options.left, p.left)} → ${text(q.options.right, p.right)}`)
        .join('; ')
  }
}
