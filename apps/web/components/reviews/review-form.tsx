'use client'
// Client component: `/learn/[courseSlug]/review` (docs/20): pick stars, write a few lines, save;
// edit or delete later.

import type { MyReviewDto } from '@tokslearn/contract'
import { Button } from '@tokslearn/ui/button'
import { cn } from '@tokslearn/ui/cn'
import { Label } from '@tokslearn/ui/label'
import { Textarea } from '@tokslearn/ui/textarea'
import { useState } from 'react'
import { deleteReview, saveReview } from '@/lib/reviews-api'

const labels = ['', 'Poor', 'Below what I expected', 'Okay', 'Good', 'Excellent']

export function ReviewForm({
  courseId,
  initial,
}: {
  courseId: string
  initial: MyReviewDto | null
}) {
  const [saved, setSaved] = useState<MyReviewDto | null>(initial)
  const [rating, setRating] = useState(initial?.rating ?? 0)
  const [body, setBody] = useState(initial?.body ?? '')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  return (
    <form
      className="flex flex-col gap-5 rounded-card border border-border bg-surface p-5 sm:p-6"
      onSubmit={async (e) => {
        e.preventDefault()
        if (rating === 0) {
          setError('Pick a number of stars first.')
          return
        }
        setPending(true)
        setError(null)
        setNote(null)
        try {
          const r = await saveReview(courseId, rating, body.trim() || null)
          setSaved(r)
          setNote(
            saved ? 'Your review is updated.' : 'Thanks. Your review is up on the course page.',
          )
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err))
        } finally {
          setPending(false)
        }
      }}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="text-body font-medium text-ink">Your rating</legend>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="cursor-pointer">
              <input
                type="radio"
                name="rating"
                value={n}
                checked={rating === n}
                onChange={() => setRating(n)}
                className="peer sr-only"
              />
              <span
                aria-hidden
                className={cn(
                  'block px-0.5 text-[32px] leading-none peer-focus-visible:outline-2 peer-focus-visible:outline-focus',
                  n <= rating ? 'text-ink' : 'text-border-strong hover:text-ink-3',
                )}
              >
                ★
              </span>
              <span className="sr-only">
                {n} {n === 1 ? 'star' : 'stars'}: {labels[n]}
              </span>
            </label>
          ))}
          <span className="ml-2 text-body-sm text-ink-2">{labels[rating] ?? ''}</span>
        </div>
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="review-body">
          What would you tell someone thinking of buying it? (optional)
        </Label>
        <Textarea
          id="review-body"
          rows={5}
          maxLength={2000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <p className="text-body-sm text-ink-3">
          Your first name and last initial show with it. {2000 - body.length} characters left.
        </p>
      </div>
      {error ? (
        <p role="alert" className="text-body-sm text-danger">
          {error}
        </p>
      ) : null}
      {note ? (
        <p role="status" className="text-body-sm text-brand-ink">
          {note}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending}>
          {saved ? 'Update review' : 'Post review'}
        </Button>
        {saved ? (
          <Button
            type="button"
            variant="tertiary"
            onClick={async () => {
              setError(null)
              try {
                await deleteReview(courseId)
                setSaved(null)
                setRating(0)
                setBody('')
                setNote('Your review is deleted. You can write a new one any time.')
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err))
              }
            }}
          >
            Delete review
          </Button>
        ) : null}
      </div>
    </form>
  )
}
