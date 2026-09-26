'use client'
// Client component: application step 2, "Expertise and sample".

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

export function ExpertiseStep({
  state,
  onSaved,
}: {
  state: MyApplicationDto
  onSaved: (next: MyApplicationDto) => void
}) {
  const app = state.application
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
    setError(null)
    save.mutate({
      step: 2,
      expertise: {
        expertise: String(form.get('expertise') ?? ''),
        sampleUrl: String(form.get('sampleUrl') ?? '').trim(),
      },
    })
  }

  return (
    <form onSubmit={submit}>
      <SettingsPanel
        id="step-expertise"
        title="Expertise and sample"
        description="Show us how you teach. A reviewer watches or reads your sample before deciding."
        footer={
          <Button type="submit" loading={save.isPending}>
            Save and continue
          </Button>
        }
      >
        <div className="flex flex-col gap-5">
          {error ? <FormAlert tone="error">{error}</FormAlert> : null}
          <Field
            id="expertise"
            label="Your first course"
            helper="What it covers, who it's for and what they'll be able to do after it."
          >
            {(p) => (
              <Textarea
                name="expertise"
                required
                minLength={20}
                maxLength={1000}
                rows={5}
                defaultValue={app?.expertise ?? ''}
                {...p}
              />
            )}
          </Field>
          <Field
            id="sampleUrl"
            label="Link to a sample"
            helper="A 3–10 minute video, a class recording or an article you wrote. YouTube, Google Drive or your own site. Make sure the link opens without a password."
          >
            {(p) => (
              <Input
                name="sampleUrl"
                type="url"
                inputMode="url"
                required
                maxLength={500}
                placeholder="https://"
                defaultValue={app?.sampleUrl ?? ''}
                {...p}
              />
            )}
          </Field>
        </div>
      </SettingsPanel>
    </form>
  )
}
