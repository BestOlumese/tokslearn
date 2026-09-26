'use client'
// Client component: creates a draft course (studio.courses.create) and opens the editor.

import { useMutation } from '@tanstack/react-query'
import type { CategoryDto } from '@tokslearn/contract'
import { Button } from '@tokslearn/ui/button'
import { Field } from '@tokslearn/ui/field'
import { Input } from '@tokslearn/ui/input'
import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { SettingsPanel } from '@/components/account/settings-panel'
import { FormAlert } from '@/components/auth/form-alert'
import { apiErrorMessage } from '@/lib/api-error'
import { orpc } from '@/lib/orpc'
import { CategorySelect } from './category-select'

export function NewCourseForm({ categories }: { categories: ReadonlyArray<CategoryDto> }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const create = useMutation(
    orpc.studio.courses.create.mutationOptions({
      onSuccess: (course) => router.push(`/teach/courses/${course.id}/details` as Route),
      onError: (e) => setError(apiErrorMessage(e)),
    }),
  )
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const form = new FormData(e.currentTarget)
        setError(null)
        create.mutate({
          title: String(form.get('title') ?? ''),
          categoryId: String(form.get('categoryId') ?? ''),
        })
      }}
    >
      <SettingsPanel
        id="new-course"
        title="Start a course"
        footer={
          <Button type="submit" loading={create.isPending}>
            Create draft
          </Button>
        }
      >
        <div className="flex flex-col gap-5">
          {error ? <FormAlert tone="error">{error}</FormAlert> : null}
          <Field id="title" label="Working title" helper="e.g. “Excel for Accountants”.">
            {(p) => <Input name="title" required minLength={3} maxLength={120} {...p} />}
          </Field>
          <Field
            id="categoryId"
            label="Category"
            helper="Where learners will find it. Pick the closest subcategory."
          >
            {(p) => <CategorySelect name="categoryId" required categories={categories} {...p} />}
          </Field>
        </div>
      </SettingsPanel>
    </form>
  )
}
