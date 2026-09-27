'use client'
// Client component: create or edit a category (admin.categories.create / update).

import { Button } from '@tokslearn/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from '@tokslearn/ui/dialog'
import { Field } from '@tokslearn/ui/field'
import { Input } from '@tokslearn/ui/input'
import { Textarea } from '@tokslearn/ui/textarea'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { FormAlert } from '@/components/auth/form-alert'
import { apiErrorMessage } from '@/lib/api-error'
import { api } from '@/lib/orpc'

type Editing = { id: string; name: string; slug: string; description: string | null }

export function CategoryDialog({
  trigger,
  triggerLabel,
  parent,
  category,
}: {
  trigger: string
  triggerLabel?: string
  /** For a new subcategory: the top category it goes under. */
  parent?: { id: string; name: string }
  /** For editing: the current values. */
  category?: Editing
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const title = category
    ? `Edit ${category.name}`
    : parent
      ? `New subcategory in ${parent.name}`
      : 'New top category'

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setError(null)
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant={category ? 'tertiary' : 'secondary'}
          size="sm"
          {...(triggerLabel ? { 'aria-label': triggerLabel } : {})}
        >
          {trigger}
        </Button>
      </DialogTrigger>
      <DialogContent
        title={title}
        description={
          category
            ? 'A new URL keeps the old one working, so shared links still land here.'
            : 'It appears in the catalog once a course is filed under it.'
        }
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault()
            const form = new FormData(e.currentTarget)
            const name = String(form.get('name') ?? '').trim()
            const slug = String(form.get('slug') ?? '').trim()
            const description = String(form.get('description') ?? '').trim() || null
            setPending(true)
            try {
              if (category) {
                await api.admin.categories.update({ id: category.id, name, slug, description })
              } else {
                await api.admin.categories.create({
                  name,
                  ...(slug ? { slug } : {}),
                  parentId: parent?.id ?? null,
                  description,
                })
              }
              setOpen(false)
              router.refresh()
            } catch (err) {
              setError(apiErrorMessage(err))
            } finally {
              setPending(false)
            }
          }}
        >
          {error ? <FormAlert tone="error">{error}</FormAlert> : null}
          <Field id="category-name" label="Name">
            {(p) => (
              <Input
                name="name"
                required
                minLength={2}
                maxLength={60}
                defaultValue={category?.name ?? ''}
                {...p}
              />
            )}
          </Field>
          <Field
            id="category-slug"
            label="URL"
            helper={
              category
                ? 'Lowercase letters, numbers and dashes.'
                : 'Optional. Made from the name if you leave it empty.'
            }
          >
            {(p) => (
              <Input
                name="slug"
                required={Boolean(category)}
                minLength={2}
                maxLength={60}
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                spellCheck={false}
                autoComplete="off"
                defaultValue={category?.slug ?? ''}
                {...p}
              />
            )}
          </Field>
          <Field
            id="category-description"
            label="Description"
            helper="One or two sentences for the category page. Optional."
          >
            {(p) => (
              <Textarea
                name="description"
                rows={3}
                maxLength={300}
                defaultValue={category?.description ?? ''}
                {...p}
              />
            )}
          </Field>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              {category ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
