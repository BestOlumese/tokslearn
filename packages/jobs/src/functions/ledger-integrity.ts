import * as admin from '@tokslearn/core/admin'
import * as commerce from '@tokslearn/core/commerce'
import { createCtx, log, systemActor } from '@tokslearn/core/kernel'
import * as ledger from '@tokslearn/core/ledger'
import { inngest } from '../client'
import { jobRuntime } from '../runtime'

/**
 * Nightly checks (docs/05 §5): every entry balanced, cached balances equal their lines, every
 * paid order has a sale entry and enrollments. A failure is logged as an error, which reaches
 * Sentry; finance also sees it on /admin/ledger, and staff on the /admin dashboard.
 */
export const ledgerIntegrity = inngest.createFunction(
  {
    id: 'ledger-integrity',
    retries: 1,
    concurrency: { limit: 1 },
    triggers: [{ cron: 'TZ=Africa/Lagos 30 2 * * *' }],
  },
  async ({ step, runId }) => {
    const report = await step.run('check', async () => {
      const ctx = createCtx({
        actor: systemActor('ledger-integrity'),
        db: jobRuntime().db(),
        requestId: runId,
      })
      const [books, orders] = await Promise.all([
        ledger.checkLedgerIntegrity(ctx),
        commerce.checkOrderIntegrity(ctx),
      ])
      const ok = books.ok && orders.ok
      // The dashboard shows the last result (ADR-047).
      await admin.recordCheckResult(ctx, 'ledger_integrity', {
        ok,
        problems: {
          unbalancedEntries: books.unbalancedEntries.length,
          balanceMismatches: books.balanceMismatches.length,
          ordersWithoutSaleEntry: orders.ordersWithoutSaleEntry.length,
          ordersWithoutEnrollment: orders.ordersWithoutEnrollment.length,
        },
      })
      return { books, orders, ok }
    })
    if (!report.ok) {
      log('error', 'ledger integrity check failed', {
        requestId: runId,
        unbalanced: report.books.unbalancedEntries.length,
        mismatches: report.books.balanceMismatches.length,
        ordersWithoutSale: report.orders.ordersWithoutSaleEntry.length,
        ordersWithoutEnrollment: report.orders.ordersWithoutEnrollment.length,
      })
    }
    return report
  },
)
