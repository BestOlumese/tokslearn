import { Badge } from '@tokslearn/ui/badge'

type Status = 'draft' | 'in_review' | 'changes_requested' | 'published' | 'unlisted' | 'archived'

const labels: Readonly<
  Record<Status, [string, 'neutral' | 'info' | 'warning' | 'brand' | 'danger']>
> = {
  draft: ['Draft', 'neutral'],
  in_review: ['In review', 'info'],
  changes_requested: ['Changes requested', 'warning'],
  published: ['Live', 'brand'],
  unlisted: ['Unlisted', 'neutral'],
  archived: ['Archived', 'neutral'],
}

/** Course status in words (docs/11 §8: colour is never the only signal). */
export function CourseStatusBadge({
  status,
  updateInReview = false,
}: {
  status: Status
  updateInReview?: boolean
}) {
  const [label, tone] = labels[status]
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      <Badge tone={tone}>{label}</Badge>
      {updateInReview ? <Badge tone="info">Update in review</Badge> : null}
    </span>
  )
}
