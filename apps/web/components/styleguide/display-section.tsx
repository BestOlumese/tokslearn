import { Avatar } from '@tokslearn/ui/avatar'
import { Badge } from '@tokslearn/ui/badge'
import { Button } from '@tokslearn/ui/button'
import { EmptyState } from '@tokslearn/ui/empty-state'
import { Progress } from '@tokslearn/ui/progress'
import { Skeleton } from '@tokslearn/ui/skeleton'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tokslearn/ui/table'
import { Award, CircleAlert, Clock } from 'lucide-react'
import { Demo } from './demo'
import { Section } from './section'

const orders = [
  { ref: 'TL-7K3M9Q2A', course: 'Excel for accountants', amount: '₦15,000', status: 'Paid' },
  { ref: 'TL-2HX8PV4N', course: 'Product design basics', amount: '₦42,500', status: 'Refunded' },
  { ref: 'TL-Q9CMT61R', course: 'Intro to Python', amount: '₦0', status: 'Free' },
] as const

const statusTone = { Paid: 'brand', Refunded: 'neutral', Free: 'info' } as const

export function DisplaySection() {
  return (
    <>
      <Section
        id="badges"
        title="Badge and avatar"
        note="Status never relies on color alone: every badge has words, most have an icon."
      >
        <div className="flex flex-col gap-6">
          <Demo label="Tones">
            <Badge tone="brand">
              <Award aria-hidden strokeWidth={1.75} /> Certificate
            </Badge>
            <Badge tone="accent">Cohort starts 3 Nov</Badge>
            <Badge tone="info">Free</Badge>
            <Badge tone="warning">
              <Clock aria-hidden strokeWidth={1.75} /> In review
            </Badge>
            <Badge tone="danger">
              <CircleAlert aria-hidden strokeWidth={1.75} /> Payment failed
            </Badge>
            <Badge>Draft</Badge>
          </Demo>
          <Demo label="Avatar: initials fallback · sm 32 · md 40 · lg 64">
            <Avatar name="Chiamaka Okafor" size="sm" />
            <Avatar name="Tunde Bakare" />
            <Avatar name="Aisha Bello" size="lg" />
          </Demo>
        </div>
      </Section>

      <Section
        id="progress"
        title="Progress and skeleton"
        note="Skeletons match the final layout so streamed content does not shift the page."
      >
        <div className="grid max-w-[640px] gap-6">
          <Progress value={0} label="Course progress" />
          <Progress value={38} label="Course progress" />
          <Progress value={100} label="Course progress" />
          <div className="flex items-center gap-4 rounded-card border border-border bg-surface p-4">
            <Skeleton shape="pill" className="size-10" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </div>
        </div>
      </Section>

      <Section
        id="table"
        title="Table"
        note="Dense but calm. On phones the table scrolls inside its frame; the page never scrolls sideways."
      >
        <Table>
          <TableCaption>Recent orders</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Course</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((o) => (
              <TableRow key={o.ref}>
                <TableCell className="font-mono text-body-sm">{o.ref}</TableCell>
                <TableCell>{o.course}</TableCell>
                <TableCell className="text-right tabular-nums">{o.amount}</TableCell>
                <TableCell>
                  <Badge tone={statusTone[o.status]}>{o.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section
        id="empty"
        title="Empty state"
        note="One sentence about what goes here, one action. No illustrations."
      >
        <EmptyState
          className="max-w-[640px]"
          headingLevel={3}
          title="No certificates yet"
          description="Certificates appear here after you finish a course that offers one."
          action={<Button variant="secondary">Browse courses with certificates</Button>}
        />
      </Section>
    </>
  )
}
