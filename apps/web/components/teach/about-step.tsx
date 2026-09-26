'use client'
// Client component: application step 1, "About you".

import { useMutation } from '@tanstack/react-query'
import type { MyApplicationDto } from '@tokslearn/contract'
import { Button } from '@tokslearn/ui/button'
import { Field } from '@tokslearn/ui/field'
import { Input } from '@tokslearn/ui/input'
import { Textarea } from '@tokslearn/ui/textarea'
import { useState } from 'react'
import { SettingsPanel } from '@/components/account/settings-panel'
import { FormAlert } from '@/components/auth/form-alert'
import { apiErrorMessage } from '@/lib/api-error'
import { orpc } from '@/lib/orpc'

export function AboutStep({
  state,
  onSaved,
}: {
  state: MyApplicationDto
  onSaved: (next: MyApplicationDto) => void
}) {
  const about = state.application?.about ?? {}
  const [error, setError] = useState<string | null>(null)
  const save = useMutation(
    orpc.instructors.saveApplication.mutationOptions({
      onSuccess: onSaved,
      onError: (e) => setError(apiErrorMessage(e)),
    }),
  )

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const topics = String(form.get('topics') ?? '')
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length >= 2)
    if (topics.length === 0 || topics.length > 5) {
      setError('List between one and five topics, separated by commas.')
      return
    }
    setError(null)
    save.mutate({
      step: 1,
      about: {
        headline: String(form.get('headline') ?? ''),
        topics,
        experience: String(form.get('experience') ?? ''),
      },
    })
  }

  return (
    <form onSubmit={submit}>
      <SettingsPanel
        id="step-about"
        title="About you"
        description="Learners see your headline on your courses. The rest is for our reviewer."
        footer={
          <Button type="submit" loading={save.isPending}>
            Save and continue
          </Button>
        }
      >
        <div className="flex flex-col gap-5">
          {error ? <FormAlert tone="error">{error}</FormAlert> : null}
          <Field
            id="headline"
            label="Headline"
            helper="One line about what you do, e.g. “Chartered accountant, 9 years in audit”."
          >
            {(p) => (
              <Input
                name="headline"
                required
                minLength={3}
                maxLength={120}
                defaultValue={about.headline ?? ''}
                {...p}
              />
            )}
          </Field>
          <Field
            id="topics"
            label="What you'll teach"
            helper="Up to five topics, separated by commas, e.g. Excel, financial modelling."
          >
            {(p) => (
              <Input
                name="topics"
                required
                maxLength={220}
                defaultValue={about.topics?.join(', ') ?? ''}
                {...p}
              />
            )}
          </Field>
          <Field
            id="experience"
            label="Your experience"
            helper="Where you've used these skills, and any teaching or training you've done. At least 20 characters."
          >
            {(p) => (
              <Textarea
                name="experience"
                required
                minLength={20}
                maxLength={1500}
                rows={5}
                defaultValue={about.experience ?? ''}
                {...p}
              />
            )}
          </Field>
        </div>
      </SettingsPanel>
    </form>
  )
}
