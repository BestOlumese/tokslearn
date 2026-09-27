'use client'
// Client component: reorder, edit or delete one category (admin.categories.*).

import { Button } from '@tokslearn/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from '@tokslearn/ui/dialog'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { FormAlert } from '@/components/auth/form-alert'
import { apiErrorMessage } from '@/lib/api-error'
import { api } from '@/lib/orpc'
import { CategoryDialog } from './category-dialog'

export function CategoryRowActions({
  category,
  index,
  siblings,
  inUse,
}: {
  category: { id: string; name: string; slug: string; description: string | null }
  index: number
  siblings: number
  /** Has courses or subcategories, so it can't be deleted. */
  inUse: boolean
}) {
  const router = useRouter()
  const [moving, setMoving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const move = async (toIndex: number) => {
    setMoving(true)
    setError(null)
    try {
      await api.admin.categories.move({ id: category.id, toIndex })
      router.refresh()
    } catch (e) {
      setError(apiErrorMessage(e))
    } finally {
      setMoving(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-1">
        <Button
          variant="tertiary"
          size="sm"
          aria-label={`Move ${category.name} up`}
          disabled={index === 0 || moving}
          onClick={() => move(index - 1)}
        >
          Up
        </Button>
        <Button
          variant="tertiary"
          size="sm"
          aria-label={`Move ${category.name} down`}
          disabled={index === siblings - 1 || moving}
          onClick={() => move(index + 1)}
        >
          Down
        </Button>
        <CategoryDialog trigger="Edit" triggerLabel={`Edit ${category.name}`} category={category} />
        {inUse ? null : (
          <Dialog open={confirm} onOpenChange={setConfirm}>
            <DialogTrigger asChild>
              <Button variant="tertiary" size="sm" aria-label={`Delete ${category.name}`}>
                Delete
              </Button>
            </DialogTrigger>
            <DialogContent
              title={`Delete ${category.name}?`}
              description="No courses use it. Its URL stops working."
            >
              <DialogFooter>
                <Button variant="secondary" onClick={() => setConfirm(false)}>
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  loading={deleting}
                  onClick={async () => {
                    setDeleting(true)
                    try {
                      await api.admin.categories.delete({ id: category.id })
                      setConfirm(false)
                      router.refresh()
                    } catch (e) {
                      setConfirm(false)
                      setError(apiErrorMessage(e))
                    } finally {
                      setDeleting(false)
                    }
                  }}
                >
                  Delete
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
      {error ? <FormAlert tone="error">{error}</FormAlert> : null}
    </div>
  )
}
