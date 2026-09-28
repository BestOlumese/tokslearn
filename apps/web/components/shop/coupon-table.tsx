import type * as commerce from '@tokslearn/core/commerce'
import { Badge } from '@tokslearn/ui/badge'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tokslearn/ui/table'
import { formatDate, formatNaira } from '@/lib/format'
import { CouponActiveToggle } from './coupon-active-toggle'

const scope = (c: commerce.CouponView, mode: 'studio' | 'admin') =>
  c.appliesTo === 'all'
    ? 'Every course'
    : c.appliesTo === 'instructor_all'
      ? mode === 'studio'
        ? 'All my courses'
        : 'All the instructor’s courses'
      : (c.targetTitle ?? (c.appliesTo === 'course' ? 'A course' : 'A bundle'))

/** Coupons with their use (docs/20 `/teach/coupons`, `/admin/coupons`). */
export function CouponTable({
  coupons,
  mode,
  now,
}: {
  coupons: ReadonlyArray<commerce.CouponView>
  mode: 'studio' | 'admin'
  now: Date
}) {
  return (
    <Table>
      <TableCaption>Coupons, newest first</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Code</TableHead>
          <TableHead>Discount</TableHead>
          <TableHead>Applies to</TableHead>
          <TableHead className="text-right">Used</TableHead>
          <TableHead className="text-right">Discount given</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {coupons.map((c) => {
          const expired = c.endsAt !== null && c.endsAt <= now
          const full = c.maxRedemptions !== null && c.redemptionCount >= c.maxRedemptions
          return (
            <TableRow key={c.id}>
              <TableCell className="font-mono font-medium">{c.code}</TableCell>
              <TableCell className="whitespace-nowrap">
                {c.kind === 'percent'
                  ? `${c.percentOff}% off`
                  : `${formatNaira(c.amountOffKobo ?? 0n)} off`}
              </TableCell>
              <TableCell>{scope(c, mode)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {c.redemptionCount}
                {c.maxRedemptions !== null ? ` of ${c.maxRedemptions}` : ''}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatNaira(c.discountGivenKobo)}
              </TableCell>
              <TableCell>
                {!c.active ? (
                  <Badge>Off</Badge>
                ) : expired ? (
                  <Badge>Ended {formatDate(c.endsAt ?? now)}</Badge>
                ) : full ? (
                  <Badge>Used up</Badge>
                ) : (
                  <Badge tone="brand">Active</Badge>
                )}
              </TableCell>
              <TableCell className="text-right">
                <CouponActiveToggle couponId={c.id} code={c.code} active={c.active} mode={mode} />
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
