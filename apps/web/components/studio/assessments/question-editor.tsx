'use client'
// Client component: write or edit one question (docs/10 §5). The six types each get a natural
// form; the answer key is built from it. The server checks options and key against each other.

import type { QuestionDto, QuestionType, RichTextDoc } from '@tokslearn/contract'
import { Button } from '@tokslearn/ui/button'
import { Checkbox } from '@tokslearn/ui/checkbox'
import { Field } from '@tokslearn/ui/field'
import { Input } from '@tokslearn/ui/input'
import { Label } from '@tokslearn/ui/label'
import { Radio } from '@tokslearn/ui/radio'
import { Select } from '@tokslearn/ui/select'
import { Textarea } from '@tokslearn/ui/textarea'
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react'
import { useState } from 'react'
import { FormAlert } from '@/components/auth/form-alert'
import { apiErrorDetails } from '@/lib/api-error'
import { api } from '@/lib/orpc'
import { RichTextEditor } from '../rich-text-editor'

export const typeLabels: Record<QuestionType, string> = {
  single: 'One answer',
  multiple: 'Several answers',
  true_false: 'True or false',
  short_text: 'Short written answer',
  ordering: 'Put in order',
  matching: 'Match pairs',
}

type Item = { id: string; text: string }
type Pair = { left: Item; right: Item }

interface Draft {
  prompt: RichTextDoc | null
  explanation: RichTextDoc | null
  points: number
  difficulty: '' | 'easy' | 'medium' | 'hard'
  tags: string
  choices: Item[]
  correct: string[]
  truth: boolean
  accepted: string
  caseSensitive: boolean
  items: Item[]
  pairs: Pair[]
  extras: Item[]
}

let counter = 0
/** Short lowercase ids the contract accepts; unique within the question. */
const newId = (prefix: string) =>
  `${prefix}${Date.now().toString(36).slice(-4)}${(counter++).toString(36)}`

const blank = (prefix: string, n: number): Item[] =>
  Array.from({ length: n }, () => ({ id: newId(prefix), text: '' }))

function fromQuestion(type: QuestionType, q: QuestionDto | null): Draft {
  const base: Draft = {
    prompt: q?.promptDoc ?? null,
    explanation: q?.explanationDoc ?? null,
    points: q?.points ?? 1,
    difficulty: q?.difficulty ?? '',
    tags: q?.tags.join(', ') ?? '',
    choices: blank('c', 3),
    correct: [],
    truth: true,
    accepted: '',
    caseSensitive: false,
    items: blank('i', 3),
    pairs: [
      { left: { id: newId('l'), text: '' }, right: { id: newId('r'), text: '' } },
      { left: { id: newId('l'), text: '' }, right: { id: newId('r'), text: '' } },
    ],
    extras: [],
  }
  if (!q) return base
  const o = q.options as Record<string, Item[]>
  const a = q.answer as Record<string, unknown>
  switch (type) {
    case 'single':
      return { ...base, choices: o.choices ?? [], correct: [a.choice as string] }
    case 'multiple':
      return { ...base, choices: o.choices ?? [], correct: (a.choices as string[]) ?? [] }
    case 'true_false':
      return { ...base, truth: a.value === true }
    case 'short_text':
      return {
        ...base,
        accepted: ((a.accepted as string[]) ?? []).join('\n'),
        caseSensitive: a.caseSensitive === true,
      }
    case 'ordering': {
      const byId = new Map((o.items ?? []).map((i) => [i.id, i]))
      return { ...base, items: ((a.order as string[]) ?? []).flatMap((id) => byId.get(id) ?? []) }
    }
    case 'matching': {
      const left = new Map((o.left ?? []).map((i) => [i.id, i]))
      const right = new Map((o.right ?? []).map((i) => [i.id, i]))
      const pairs = ((a.pairs as Array<{ left: string; right: string }>) ?? []).flatMap((p) => {
        const l = left.get(p.left)
        const r = right.get(p.right)
        return l && r ? [{ left: l, right: r }] : []
      })
      const used = new Set(pairs.map((p) => p.right.id))
      return { ...base, pairs, extras: (o.right ?? []).filter((r) => !used.has(r.id)) }
    }
  }
}

function toPayload(type: QuestionType, d: Draft): { options: unknown; answer: unknown } {
  const trim = (list: Item[]) => list.map((i) => ({ id: i.id, text: i.text.trim() }))
  switch (type) {
    case 'single':
      return { options: { choices: trim(d.choices) }, answer: { choice: d.correct[0] ?? '' } }
    case 'multiple':
      return { options: { choices: trim(d.choices) }, answer: { choices: d.correct } }
    case 'true_false':
      return { options: {}, answer: { value: d.truth } }
    case 'short_text':
      return {
        options: {},
        answer: {
          accepted: d.accepted
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
          caseSensitive: d.caseSensitive,
        },
      }
    case 'ordering':
      return { options: { items: trim(d.items) }, answer: { order: d.items.map((i) => i.id) } }
    case 'matching':
      return {
        options: {
          left: trim(d.pairs.map((p) => p.left)),
          right: trim([...d.pairs.map((p) => p.right), ...d.extras]),
        },
        answer: { pairs: d.pairs.map((p) => ({ left: p.left.id, right: p.right.id })) },
      }
  }
}

const move = <T,>(list: T[], from: number, to: number): T[] => {
  if (to < 0 || to >= list.length) return list
  const next = [...list]
  const [x] = next.splice(from, 1)
  if (x !== undefined) next.splice(to, 0, x)
  return next
}

export function QuestionEditor({
  bankId,
  type,
  question,
  disabled,
  onSaved,
  onCancel,
}: {
  bankId: string
  type: QuestionType
  question: QuestionDto | null
  disabled: boolean
  onSaved: (q: QuestionDto) => void
  onCancel: () => void
}) {
  const [d, setD] = useState<Draft>(() => fromQuestion(type, question))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }))

  const save = async () => {
    if (!d.prompt) {
      setError('Write the question first.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const { options, answer } = toPayload(type, d)
      const common = {
        prompt: d.prompt,
        options,
        answer,
        explanation: d.explanation,
        points: d.points,
        difficulty: d.difficulty || null,
        tags: d.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      }
      const saved = question
        ? await api.studio.questions.update({ questionId: question.id, ...common })
        : await api.studio.questions.create({ bankId, type, ...common })
      onSaved(saved)
    } catch (e) {
      setError(apiErrorDetails(e))
    } finally {
      setSaving(false)
    }
  }

  const choiceRows = (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-body-sm font-medium text-ink">
        Choices{' '}
        <span className="font-normal text-ink-2">
          (tick {type === 'single' ? 'the right one' : 'every right one'})
        </span>
      </legend>
      {d.choices.map((c, i) => (
        <div key={c.id} className="flex items-center gap-2">
          {type === 'single' ? (
            <Radio
              name="correct"
              aria-label={`Choice ${i + 1} is the answer`}
              checked={d.correct[0] === c.id}
              onChange={() => set({ correct: [c.id] })}
            />
          ) : (
            <Checkbox
              aria-label={`Choice ${i + 1} is right`}
              checked={d.correct.includes(c.id)}
              onChange={(e) =>
                set({
                  correct: e.target.checked
                    ? [...d.correct, c.id]
                    : d.correct.filter((x) => x !== c.id),
                })
              }
            />
          )}
          <Input
            aria-label={`Choice ${i + 1}`}
            value={c.text}
            maxLength={500}
            onChange={(e) =>
              set({
                choices: d.choices.map((x) => (x.id === c.id ? { ...x, text: e.target.value } : x)),
              })
            }
          />
          <Button
            size="sm"
            variant="tertiary"
            aria-label={`Remove choice ${i + 1}`}
            disabled={d.choices.length <= 2}
            onClick={() =>
              set({
                choices: d.choices.filter((x) => x.id !== c.id),
                correct: d.correct.filter((x) => x !== c.id),
              })
            }
          >
            <X aria-hidden />
          </Button>
        </div>
      ))}
      {d.choices.length < 10 ? (
        <Button
          size="sm"
          variant="tertiary"
          className="w-fit"
          onClick={() => set({ choices: [...d.choices, { id: newId('c'), text: '' }] })}
        >
          <Plus aria-hidden />
          Add a choice
        </Button>
      ) : null}
    </fieldset>
  )

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      {error ? <FormAlert tone="error">{error}</FormAlert> : null}
      <fieldset disabled={disabled || saving} className="contents">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="q-prompt">Question</Label>
          <RichTextEditor
            id="q-prompt"
            value={d.prompt}
            onChange={(doc) => set({ prompt: doc })}
            minHeight="min-h-24"
          />
        </div>

        {type === 'single' || type === 'multiple' ? choiceRows : null}

        {type === 'true_false' ? (
          <fieldset className="flex gap-6">
            <legend className="mb-1 text-body-sm font-medium text-ink">The statement is</legend>
            {([true, false] as const).map((v) => (
              <div key={String(v)} className="flex items-center gap-2">
                <Radio
                  id={`tf-${v}`}
                  name="truth"
                  checked={d.truth === v}
                  onChange={() => set({ truth: v })}
                />
                <Label htmlFor={`tf-${v}`} kind="option">
                  {v ? 'True' : 'False'}
                </Label>
              </div>
            ))}
          </fieldset>
        ) : null}

        {type === 'short_text' ? (
          <div className="flex flex-col gap-3">
            <Field
              id="q-accepted"
              label="Accepted answers"
              helper="One per line. Spaces, end punctuation and (unless you tick below) capital letters don’t matter."
            >
              {(p) => (
                <Textarea
                  rows={3}
                  value={d.accepted}
                  onChange={(e) => set({ accepted: e.target.value })}
                  {...p}
                />
              )}
            </Field>
            <div className="flex items-center gap-2">
              <Checkbox
                id="q-case"
                checked={d.caseSensitive}
                onChange={(e) => set({ caseSensitive: e.target.checked })}
              />
              <Label htmlFor="q-case" kind="option">
                Capital letters matter
              </Label>
            </div>
          </div>
        ) : null}

        {type === 'ordering' ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-body-sm font-medium text-ink">
              Items{' '}
              <span className="font-normal text-ink-2">
                (in the right order; learners see them shuffled)
              </span>
            </legend>
            {d.items.map((item, i) => (
              <div key={item.id} className="flex items-center gap-2">
                <span className="w-6 text-right text-body-sm text-ink-3">{i + 1}.</span>
                <Input
                  aria-label={`Item ${i + 1}`}
                  value={item.text}
                  maxLength={500}
                  onChange={(e) =>
                    set({
                      items: d.items.map((x) =>
                        x.id === item.id ? { ...x, text: e.target.value } : x,
                      ),
                    })
                  }
                />
                <Button
                  size="sm"
                  variant="tertiary"
                  aria-label={`Move item ${i + 1} up`}
                  disabled={i === 0}
                  onClick={() => set({ items: move(d.items, i, i - 1) })}
                >
                  <ArrowUp aria-hidden />
                </Button>
                <Button
                  size="sm"
                  variant="tertiary"
                  aria-label={`Move item ${i + 1} down`}
                  disabled={i === d.items.length - 1}
                  onClick={() => set({ items: move(d.items, i, i + 1) })}
                >
                  <ArrowDown aria-hidden />
                </Button>
                <Button
                  size="sm"
                  variant="tertiary"
                  aria-label={`Remove item ${i + 1}`}
                  disabled={d.items.length <= 2}
                  onClick={() => set({ items: d.items.filter((x) => x.id !== item.id) })}
                >
                  <X aria-hidden />
                </Button>
              </div>
            ))}
            {d.items.length < 10 ? (
              <Button
                size="sm"
                variant="tertiary"
                className="w-fit"
                onClick={() => set({ items: [...d.items, { id: newId('i'), text: '' }] })}
              >
                <Plus aria-hidden />
                Add an item
              </Button>
            ) : null}
          </fieldset>
        ) : null}

        {type === 'matching' ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-body-sm font-medium text-ink">
              Pairs{' '}
              <span className="font-normal text-ink-2">
                (learners see the right column shuffled)
              </span>
            </legend>
            {d.pairs.map((p, i) => (
              <div key={p.left.id} className="flex items-center gap-2">
                <Input
                  aria-label={`Left ${i + 1}`}
                  value={p.left.text}
                  maxLength={500}
                  onChange={(e) =>
                    set({
                      pairs: d.pairs.map((x, k) =>
                        k === i ? { ...x, left: { ...x.left, text: e.target.value } } : x,
                      ),
                    })
                  }
                />
                <span aria-hidden className="text-ink-3">
                  ↔
                </span>
                <Input
                  aria-label={`Right ${i + 1}`}
                  value={p.right.text}
                  maxLength={500}
                  onChange={(e) =>
                    set({
                      pairs: d.pairs.map((x, k) =>
                        k === i ? { ...x, right: { ...x.right, text: e.target.value } } : x,
                      ),
                    })
                  }
                />
                <Button
                  size="sm"
                  variant="tertiary"
                  aria-label={`Remove pair ${i + 1}`}
                  disabled={d.pairs.length <= 2}
                  onClick={() => set({ pairs: d.pairs.filter((_, k) => k !== i) })}
                >
                  <X aria-hidden />
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              {d.pairs.length < 10 ? (
                <Button
                  size="sm"
                  variant="tertiary"
                  onClick={() =>
                    set({
                      pairs: [
                        ...d.pairs,
                        { left: { id: newId('l'), text: '' }, right: { id: newId('r'), text: '' } },
                      ],
                    })
                  }
                >
                  <Plus aria-hidden />
                  Add a pair
                </Button>
              ) : null}
              {d.pairs.length + d.extras.length < 12 ? (
                <Button
                  size="sm"
                  variant="tertiary"
                  onClick={() => set({ extras: [...d.extras, { id: newId('r'), text: '' }] })}
                >
                  <Plus aria-hidden />
                  Add a wrong option on the right
                </Button>
              ) : null}
            </div>
            {d.extras.map((x, i) => (
              <div key={x.id} className="flex items-center gap-2 sm:pl-[calc(50%+0.75rem)]">
                <Input
                  aria-label={`Wrong option ${i + 1}`}
                  value={x.text}
                  maxLength={500}
                  onChange={(e) =>
                    set({
                      extras: d.extras.map((y) =>
                        y.id === x.id ? { ...y, text: e.target.value } : y,
                      ),
                    })
                  }
                />
                <Button
                  size="sm"
                  variant="tertiary"
                  aria-label={`Remove wrong option ${i + 1}`}
                  onClick={() => set({ extras: d.extras.filter((y) => y.id !== x.id) })}
                >
                  <X aria-hidden />
                </Button>
              </div>
            ))}
          </fieldset>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="q-explanation">
            Explanation{' '}
            <span className="font-normal text-ink-2">(optional, shown with the answers)</span>
          </Label>
          <RichTextEditor
            id="q-explanation"
            value={d.explanation}
            onChange={(doc) => set({ explanation: doc })}
            minHeight="min-h-20"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field id="q-points" label="Points">
            {(p) => (
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={100}
                value={d.points}
                onChange={(e) => set({ points: Number(e.target.value) || 1 })}
                {...p}
              />
            )}
          </Field>
          <Field id="q-difficulty" label="Difficulty">
            {(p) => (
              <Select
                value={d.difficulty}
                onChange={(e) => set({ difficulty: e.target.value as Draft['difficulty'] })}
                {...p}
              >
                <option value="">Not set</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </Select>
            )}
          </Field>
          <Field id="q-tags" label="Tags" helper="Comma-separated. Quizzes can draw by tag.">
            {(p) => <Input value={d.tags} onChange={(e) => set({ tags: e.target.value })} {...p} />}
          </Field>
        </div>

        <div className="flex gap-2">
          <Button type="submit" loading={saving}>
            {question ? 'Save question' : 'Add question'}
          </Button>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </fieldset>
    </form>
  )
}
