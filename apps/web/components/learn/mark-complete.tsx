'use client'
// Client component: "Mark complete" for article and file lessons (videos complete by watching).

import { Button } from '@tokslearn/ui/button'
import { Check } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { LearnError, markComplete } from '@/lib/learn-api'

export function MarkComplete({ lessonId, done }: { lessonId: string; done: boolean }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [complete, setComplete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (done || complete) {
    return (
      <p className="inline-flex h-10 items-center gap-2 text-body-sm font-medium text-success">
        <Check aria-hidden className="size-4" />
        Completed
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-1">
      <Button
        loading={pending}
        onClick={async () => {
          setPending(true)
          setError(null)
          try {
            const r = await markComplete(lessonId)
            if (!r.recorded) {
              setError('Progress is saved only for learners enrolled in this course.')
              return
            }
            setComplete(true)
            router.refresh()
          } catch (e) {
            setError(e instanceof LearnError ? e.message : 'That didn’t save. Try again.')
          } finally {
            setPending(false)
          }
        }}
      >
        Mark complete
      </Button>
      {error ? (
        <p role="alert" className="text-body-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}
