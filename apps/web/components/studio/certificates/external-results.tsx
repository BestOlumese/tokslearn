'use client'
// Client component: record pass/fail for an exam taken elsewhere, with evidence (docs/10 §8
// external). The instructor and TAs can record; a pass issues the certificate through a job.

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge } from '@tokslearn/ui/badge'
import { Button } from '@tokslearn/ui/button'
import { Input } from '@tokslearn/ui/input'
import { Label } from '@tokslearn/ui/label'
import { Radio } from '@tokslearn/ui/radio'
import { Select } from '@tokslearn/ui/select'
import { Paperclip } from 'lucide-react'
import { useState } from 'react'
import { SettingsPanel } from '@/components/account/settings-panel'
import { FormAlert } from '@/components/auth/form-alert'
import { apiErrorMessage } from '@/lib/api-error'
import { formatDateTime } from '@/lib/format'
import { api, orpc } from '@/lib/orpc'
import { uploadFile } from '@/lib/upload-file'

export function ExternalResults({
  courseId,
  defaultProvider,
}: {
  courseId: string
  defaultProvider: string
}) {
  const client = useQueryClient()
  const results = useQuery(orpc.studio.certificates.results.queryOptions({ input: { courseId } }))
  const [q, setQ] = useState('')
  const learners = useQuery(
    orpc.studio.learners.list.queryOptions({
      input: { courseId, ...(q.trim().length >= 2 ? { q: q.trim() } : {}) },
    }),
  )
  const [enrollmentId, setEnrollmentId] = useState('')
  const [result, setResult] = useState<'pass' | 'fail'>('pass')
  const [score, setScore] = useState('')
  const [provider, setProvider] = useState(defaultProvider)
  const [examUrl, setExamUrl] = useState('')
  const [evidence, setEvidence] = useState<{ id: string; name: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const options =
    learners.data?.items.filter((l) => l.status === 'active' || l.status === 'completed') ?? []

  return (
    <SettingsPanel
      id="external-results"
      title="External exam results"
      description="Record each learner’s result from the outside exam. A pass issues their certificate within a minute; a fail is kept on record."
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!enrollmentId) {
            setError('Choose the learner first.')
            return
          }
          setPending(true)
          setError(null)
          setDone(null)
          try {
            const saved = await api.studio.certificates.recordExternalResult({
              courseId,
              enrollmentId,
              result,
              score: score.trim() === '' ? null : Number(score),
              providerName: provider.trim(),
              examUrl: examUrl.trim() || null,
              evidenceFileId: evidence?.id ?? null,
            })
            setDone(
              `${saved.learnerName}: ${saved.result === 'pass' ? 'pass recorded. Their certificate is on its way.' : 'fail recorded.'}`,
            )
            setEnrollmentId('')
            setScore('')
            setEvidence(null)
            await client.invalidateQueries({
              queryKey: orpc.studio.certificates.results.key({ input: { courseId } }),
            })
          } catch (err) {
            setError(apiErrorMessage(err))
          } finally {
            setPending(false)
          }
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ext-search">Find the learner</Label>
            <Input
              id="ext-search"
              type="search"
              value={q}
              placeholder="First or last name"
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ext-learner">Learner</Label>
            <Select
              id="ext-learner"
              value={enrollmentId}
              onChange={(e) => setEnrollmentId(e.target.value)}
            >
              <option value="">
                {learners.isPending ? 'Loading…' : options.length ? 'Choose…' : 'No learners found'}
              </option>
              {options.map((l) => (
                <option key={l.enrollmentId} value={l.enrollmentId}>
                  {l.displayName} · {l.progressPct}% done
                </option>
              ))}
            </Select>
          </div>
        </div>

        <fieldset className="flex gap-3">
          <legend className="mb-1.5 text-body-sm font-medium text-ink">Result</legend>
          {(['pass', 'fail'] as const).map((r) => (
            <div
              key={r}
              className="flex items-center gap-2 rounded-control border border-border px-4 py-2.5 has-[:checked]:border-brand has-[:checked]:bg-brand-soft"
            >
              <Radio
                id={`ext-${r}`}
                name="ext-result"
                checked={result === r}
                onChange={() => setResult(r)}
              />
              <Label htmlFor={`ext-${r}`} kind="option">
                {r === 'pass' ? 'Passed' : 'Did not pass'}
              </Label>
            </div>
          ))}
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ext-score">Score (optional)</Label>
            <Input
              id="ext-score"
              type="number"
              inputMode="decimal"
              min={0}
              max={1000}
              step="any"
              value={score}
              onChange={(e) => setScore(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ext-provider">Organisation</Label>
            <Input
              id="ext-provider"
              value={provider}
              maxLength={80}
              required
              minLength={2}
              onChange={(e) => setProvider(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ext-url">Results link (optional)</Label>
            <Input
              id="ext-url"
              type="url"
              inputMode="url"
              value={examUrl}
              placeholder="https://"
              onChange={(e) => setExamUrl(e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="text-body-sm font-medium text-ink">
            Evidence{' '}
            <span className="font-normal text-ink-2">(optional: PDF, JPG or PNG, up to 20 MB)</span>
          </p>
          {evidence ? (
            <p className="flex items-center gap-3 text-body-sm text-ink">
              {evidence.name}
              <Button type="button" size="sm" variant="tertiary" onClick={() => setEvidence(null)}>
                Remove
              </Button>
            </p>
          ) : (
            <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-control border border-border-strong px-3 py-2 text-body-sm text-ink hover:bg-canvas has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus">
              <Paperclip aria-hidden className="size-4" />
              {uploading ? 'Uploading…' : 'Add the results sheet'}
              <input
                type="file"
                className="sr-only"
                accept=".pdf,.jpg,.jpeg,.png"
                disabled={uploading}
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (!file) return
                  setUploading(true)
                  setError(null)
                  try {
                    const up = await uploadFile(file, 'exam_evidence')
                    setEvidence({ id: up.fileId, name: file.name })
                  } catch (err) {
                    setError(
                      err instanceof Error && err.message === 'upload_failed'
                        ? 'The upload didn’t finish. Check your connection and try again.'
                        : apiErrorMessage(err),
                    )
                  } finally {
                    setUploading(false)
                  }
                }}
              />
            </label>
          )}
        </div>

        {error ? <FormAlert tone="error">{error}</FormAlert> : null}
        {done ? (
          <p role="status" className="text-body-sm text-ink-2">
            {done}
          </p>
        ) : null}
        <Button type="submit" className="w-fit" loading={pending} disabled={uploading}>
          Record the result
        </Button>
      </form>

      {results.data && results.data.items.length > 0 ? (
        <div className="mt-6 border-t border-border pt-5">
          <h3 className="mb-3 text-h4 text-ink">Recorded</h3>
          <ul className="flex flex-col divide-y divide-border">
            {results.data.items.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-body text-ink">
                    {r.learnerName}{' '}
                    <Badge tone={r.result === 'pass' ? 'brand' : 'neutral'}>
                      {r.result === 'pass' ? 'Passed' : 'Did not pass'}
                    </Badge>
                  </p>
                  <p className="text-body-sm text-ink-2">
                    {r.providerName}
                    {r.score !== null ? ` · score ${r.score}` : ''} · recorded by {r.recordedByName}
                    , {formatDateTime(r.recordedAt)}
                  </p>
                </div>
                {r.hasEvidence ? <EvidenceButton resultId={r.id} /> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </SettingsPanel>
  )
}

function EvidenceButton({ resultId }: { resultId: string }) {
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="secondary"
        onClick={async () => {
          try {
            window.location.assign((await api.studio.certificates.evidenceFile({ resultId })).url)
          } catch (e) {
            setError(apiErrorMessage(e))
          }
        }}
      >
        Evidence
      </Button>
      {error ? <span className="text-caption text-danger">{error}</span> : null}
    </div>
  )
}
