'use client'
// Client component: toasts are triggered from click handlers.

import { Button } from '@tokslearn/ui/button'
import { toast } from '@tokslearn/ui/toast'

export function ToastDemo() {
  return (
    <div className="flex flex-wrap gap-3">
      <Button variant="secondary" onClick={() => toast.success('Lesson marked as complete')}>
        Show success
      </Button>
      <Button
        variant="secondary"
        onClick={() =>
          toast.error('Your card was declined', {
            description: 'Try another card or pay by bank transfer.',
          })
        }
      >
        Show error
      </Button>
      <Button
        variant="secondary"
        onClick={() =>
          toast('Note deleted', {
            action: { label: 'Undo', onClick: () => toast.info('Note restored') },
          })
        }
      >
        Show with action
      </Button>
    </div>
  )
}
