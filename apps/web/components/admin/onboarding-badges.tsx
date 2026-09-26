import { Badge } from '@tokslearn/ui/badge'

type Kyc = 'pending' | 'verified' | 'failed' | 'manual_review' | null
type Payout = 'active' | 'pending_review' | 'disabled' | null

/** Identity check status in words, never colour alone (docs/11 §8). */
export function KycBadge({ status }: { status: Kyc }) {
  if (status === 'verified') return <Badge tone="brand">Verified</Badge>
  if (status === 'manual_review') return <Badge tone="warning">Check by hand</Badge>
  if (status === 'failed') return <Badge tone="danger">Not found</Badge>
  if (status === 'pending') return <Badge tone="neutral">Pending</Badge>
  return <Badge tone="neutral">Not started</Badge>
}

export function PayoutBadge({ status }: { status: Payout }) {
  if (status === 'active') return <Badge tone="brand">Name matches</Badge>
  if (status === 'pending_review') return <Badge tone="warning">Waiting for review</Badge>
  return <Badge tone="neutral">None</Badge>
}
