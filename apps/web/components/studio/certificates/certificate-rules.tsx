'use client'
// Client component: what earns the course's certificate (docs/20 `/teach/courses/[id]/certificate`):
// the mode, the exam that counts, the outside provider, and a sample PDF.

import type { CertificateMode, StudioCertificateSettingsDto } from '@tokslearn/contract'
import { Button } from '@tokslearn/ui/button'
import { Checkbox } from '@tokslearn/ui/checkbox'
import { Input } from '@tokslearn/ui/input'
import { Label } from '@tokslearn/ui/label'
import { Radio } from '@tokslearn/ui/radio'
import { Select } from '@tokslearn/ui/select'
import type { Route } from 'next'
import Link from 'next/link'
import { useState } from 'react'
import { SettingsPanel } from '@/components/account/settings-panel'
import { FormAlert } from '@/components/auth/form-alert'
import { apiErrorMessage } from '@/lib/api-error'
import { api } from '@/lib/orpc'
import { useCourseEditor } from '../course-editor-provider'

const modes: ReadonlyArray<[CertificateMode, string, string]> = [
  ['none', 'No certificate', 'The course page says there isn’t one.'],
  [
    'completion',
    'Finish every lesson',
    'Graded quizzes and assignments count once the learner passes them.',
  ],
  ['exam', 'Pass the final exam', 'A timed exam from this course. You pick which one.'],
  [
    'external',
    'Pass an exam run by another organisation',
    'You record each learner’s result here; a pass issues the certificate.',
  ],
]

export const modeLabel: Readonly<Record<CertificateMode, string>> = {
  none: 'No certificate',
  completion: 'Finish every lesson',
  exam: 'Pass the final exam',
  external: 'Pass an outside exam',
}

export function CertificateRules({
  initial,
  onSaved,
}: {
  initial: StudioCertificateSettingsDto
  onSaved: (next: StudioCertificateSettingsDto) => void
}) {
  const { course, run, locked } = useCourseEditor()
  const [mode, setMode] = useState(initial.mode)
  const [examQuizId, setExamQuizId] = useState(
    initial.settings.examQuizId ?? initial.exams[0]?.quizId ?? '',
  )
  const [requireCompletion, setRequireCompletion] = useState(initial.settings.requireCompletion)
  const [providerName, setProviderName] = useState(initial.settings.providerName ?? '')
  const [providerUrl, setProviderUrl] = useState(initial.settings.providerUrl ?? '')
  const [pending, setPending] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const readOnly = locked || !initial.canEdit
  const published = course.status === 'published' || course.status === 'unlisted'

  const preview = async () => {
    setPreviewing(true)
    setError(null)
    // Opened before the request so pop-up blockers see a click, then pointed at the PDF.
    const tab = window.open('', '_blank')
    try {
      const file = await api.studio.certificates.preview({ courseId: course.id })
      const url = URL.createObjectURL(file)
      if (tab) tab.location.href = url
      else window.location.assign(url)
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (e) {
      tab?.close()
      setError(apiErrorMessage(e))
    } finally {
      setPreviewing(false)
    }
  }

  return (
    <SettingsPanel
      id="certificate-rules"
      title="What earns the certificate"
      description={
        published
          ? `Live now: ${modeLabel[initial.liveMode].toLowerCase()}. A change goes live after review, like other course changes.`
          : 'Shown on the course page, so learners know before they buy.'
      }
    >
      <form
        className="flex flex-col gap-5"
        onSubmit={async (e) => {
          e.preventDefault()
          setPending(true)
          setError(null)
          setSaved(false)
          try {
            let next: StudioCertificateSettingsDto | null = null
            await run(async (version) => {
              next = await api.studio.certificates.update({
                courseId: course.id,
                version,
                mode,
                settings: {
                  examQuizId: mode === 'exam' ? examQuizId || null : null,
                  requireCompletion: mode === 'exam' && requireCompletion,
                  providerName: mode === 'external' ? providerName.trim() || null : null,
                  providerUrl: mode === 'external' ? providerUrl.trim() || null : null,
                },
              })
              return api.studio.courses.get({ courseId: course.id })
            })
            if (next) onSaved(next)
            setSaved(true)
          } catch (err) {
            setError(apiErrorMessage(err))
          } finally {
            setPending(false)
          }
        }}
      >
        <fieldset className="flex flex-col gap-2" disabled={readOnly}>
          <legend className="sr-only">Certificate</legend>
          {modes.map(([value, label, hint]) => (
            <div
              key={value}
              className="flex items-start gap-3 rounded-control border border-border p-3 has-[:checked]:border-brand has-[:checked]:bg-brand-soft"
            >
              <Radio
                id={`mode-${value}`}
                name="mode"
                checked={mode === value}
                onChange={() => setMode(value)}
                className="mt-0.5"
              />
              <Label htmlFor={`mode-${value}`} kind="option" className="flex-1">
                <span className="block font-medium text-ink">{label}</span>
                <span className="block text-body-sm text-ink-2">{hint}</span>
              </Label>
            </div>
          ))}
        </fieldset>

        {mode === 'exam' ? (
          initial.exams.length === 0 ? (
            <p className="rounded-control bg-warning-soft p-3 text-body-sm text-ink">
              This course has no exam yet. Add an Exam lesson in{' '}
              <Link
                href={`/teach/courses/${course.id}/curriculum` as Route}
                className="font-medium underline"
              >
                Curriculum
              </Link>
              , then come back to choose it.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cert-exam">The exam that counts</Label>
                <Select
                  id="cert-exam"
                  value={examQuizId}
                  disabled={readOnly}
                  onChange={(e) => setExamQuizId(e.target.value)}
                  className="max-w-md"
                >
                  {initial.exams.map((x) => (
                    <option key={x.quizId} value={x.quizId}>
                      {x.title}
                      {x.isLive ? '' : ' (not live yet)'}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex items-start gap-2">
                <Checkbox
                  id="cert-completion"
                  checked={requireCompletion}
                  disabled={readOnly}
                  onChange={(e) => setRequireCompletion(e.target.checked)}
                  className="mt-0.5"
                />
                <Label htmlFor="cert-completion" kind="option">
                  Learners must also finish every other lesson
                </Label>
              </div>
            </div>
          )
        ) : null}

        {mode === 'external' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cert-provider">Organisation that runs the exam</Label>
              <Input
                id="cert-provider"
                value={providerName}
                maxLength={80}
                disabled={readOnly}
                placeholder="e.g. ICAN"
                onChange={(e) => setProviderName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cert-provider-url">Their website (optional)</Label>
              <Input
                id="cert-provider-url"
                type="url"
                inputMode="url"
                value={providerUrl}
                maxLength={500}
                disabled={readOnly}
                placeholder="https://"
                onChange={(e) => setProviderUrl(e.target.value)}
              />
            </div>
            <p className="text-body-sm text-ink-2 sm:col-span-2">
              The certificate says “Externally assessed via{' '}
              {providerName.trim() || 'the organisation'}”.
            </p>
          </div>
        ) : null}

        {error ? <FormAlert tone="error">{error}</FormAlert> : null}
        {saved ? (
          <p role="status" className="text-body-sm text-ink-2">
            {published ? 'Saved. It goes live when the change is approved.' : 'Saved.'}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {readOnly ? null : (
            <Button type="submit" loading={pending}>
              Save
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            loading={previewing}
            onClick={() => void preview()}
          >
            Preview the certificate
          </Button>
        </div>
        <p className="text-body-sm text-ink-3">
          The preview uses a sample name and your saved settings, and says it isn’t a real
          certificate.
        </p>
      </form>
    </SettingsPanel>
  )
}
