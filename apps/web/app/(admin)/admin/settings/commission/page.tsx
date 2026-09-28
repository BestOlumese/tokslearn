import * as commerce from '@tokslearn/core/commerce'
import { Badge } from '@tokslearn/ui/badge'
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
import type { Metadata } from 'next'
import { Suspense } from 'react'
import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { CommissionDefaultDialog } from '@/components/admin/commission-default-dialog'
import { CommissionEndRule } from '@/components/admin/commission-end-rule'
import { CommissionRuleForm } from '@/components/admin/commission-rule-form'
import { staffErrorState } from '@/components/admin/staff-error'
import { formatDate } from '@/lib/format'
import { requireSignedInCtx } from '@/lib/require-user'

export const metadata: Metadata = { title: 'Commission' }

const sourceLabel = {
  instructor_referral: 'Instructor links',
  instructor_coupon: 'Instructor coupons',
  platform_organic: 'Tokslearn sales',
  platform_paid: 'Tokslearn ads',
} as const

// docs/20 §6 `/admin/settings/commission` (super admin, 2FA, audited): defaults per source,
// instructor overrides and dated promos. Changes apply to orders from now on (docs/08 §3).
export default function CommissionPage() {
  return (
    <div>
      <AdminPageHeader
        title="Commission"
        description="Tokslearn's share of each sale, by where the buyer came from. Every change applies to new orders only and is saved in the audit log."
      />
      <Suspense fallback={<Skeleton className="mt-6 h-96 w-full rounded-card" />}>
        <Rules />
      </Suspense>
    </div>
  )
}

async function Rules() {
  const path = '/admin/settings/commission'
  const ctx = await requireSignedInCtx(path)
  let rules: commerce.CommissionRuleView[]
  let instructors: Array<{ id: string; name: string }>
  try {
    ;[rules, instructors] = await Promise.all([
      commerce.listCommissionRules(ctx),
      commerce.commissionInstructors(ctx),
    ])
  } catch (error) {
    return <div className="mt-6">{staffErrorState(error, path)}</div>
  }
  const defaults = (Object.keys(sourceLabel) as Array<keyof typeof sourceLabel>).map((source) => ({
    source,
    rule: rules.find((r) => r.scope === 'default' && r.source === source && r.active),
  }))
  const specific = rules.filter((r) => r.scope !== 'default')
  const history = rules.filter((r) => r.scope === 'default' && !r.active)

  return (
    <div className="mt-6 flex flex-col gap-10">
      <section aria-labelledby="defaults-title">
        <h2 id="defaults-title" className="text-h3 text-ink">
          Defaults
        </h2>
        <div className="mt-3">
          <Table>
            <TableCaption>Default share for each sales source</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Tokslearn</TableHead>
                <TableHead className="text-right">Instructor</TableHead>
                <TableHead>Since</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {defaults.map(({ source, rule }) => (
                <TableRow key={source}>
                  <TableCell>{sourceLabel[source]}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {rule ? `${rule.platformRateBps / 100}%` : 'Not set'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {rule ? `${100 - rule.platformRateBps / 100}%` : '—'}
                  </TableCell>
                  <TableCell>{rule ? formatDate(rule.startsAt) : '—'}</TableCell>
                  <TableCell className="text-right">
                    <CommissionDefaultDialog
                      source={source}
                      label={sourceLabel[source]}
                      currentBps={rule?.platformRateBps ?? 0}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section aria-labelledby="specific-title">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="specific-title" className="text-h3 text-ink">
            Instructor overrides and promos
          </h2>
          <CommissionRuleForm instructors={instructors} />
        </div>
        {specific.length === 0 ? (
          <p className="mt-3 text-body-sm text-ink-2">None. Every instructor is on the defaults.</p>
        ) : (
          <div className="mt-3">
            <Table>
              <TableCaption>Rates for single instructors</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Instructor</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Tokslearn</TableHead>
                  <TableHead>Runs</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {specific.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.instructorName ?? '—'}</TableCell>
                    <TableCell>
                      <Badge tone={r.active ? 'brand' : 'neutral'}>
                        {r.scope === 'promo' ? 'Promo' : 'Override'}
                        {r.active ? '' : r.endsAt && r.endsAt <= ctx.now ? ', ended' : ', upcoming'}
                      </Badge>
                    </TableCell>
                    <TableCell>{sourceLabel[r.source]}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.platformRateBps / 100}%
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(r.startsAt)} – {r.endsAt ? formatDate(r.endsAt) : 'until ended'}
                    </TableCell>
                    <TableCell className="max-w-64 text-ink-2">{r.note}</TableCell>
                    <TableCell className="text-right">
                      {r.endsAt === null || r.endsAt > ctx.now ? (
                        <CommissionEndRule
                          ruleId={r.id}
                          label={`${r.scope} for ${r.instructorName ?? 'instructor'}`}
                        />
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {history.length > 0 ? (
        <section aria-labelledby="history-title">
          <h2 id="history-title" className="text-h3 text-ink">
            Earlier defaults
          </h2>
          <ul className="mt-3 flex flex-col gap-1 text-body-sm text-ink-2">
            {history.map((r) => (
              <li key={r.id}>
                {sourceLabel[r.source]}: {r.platformRateBps / 100}% from {formatDate(r.startsAt)} to{' '}
                {r.endsAt ? formatDate(r.endsAt) : '—'}
                {r.note ? ` (${r.note})` : ''}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
