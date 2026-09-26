import { canManageFeatureFlags, listFeatureFlags } from '@tokslearn/core/admin'
import { EmptyState } from '@tokslearn/ui/empty-state'
import { Forbidden } from '@/components/forbidden'
import { getServerCtx } from '@/lib/server-ctx'
import { FeatureFlagRow } from './feature-flag-row'

export async function FeatureFlagList() {
  const ctx = await getServerCtx()
  // Cosmetic check for a friendly state; the service enforces the same rule.
  if (!canManageFeatureFlags(ctx.actor)) return <Forbidden />

  const flags = await listFeatureFlags(ctx)
  if (flags.length === 0) {
    return (
      <EmptyState
        title="No feature flags yet"
        description="Flags appear here once they exist in the database. Run pnpm db:seed to add the defaults."
      />
    )
  }

  return (
    <ul className="divide-y divide-border rounded-card border border-border bg-surface">
      {flags.map((flag) => (
        <li key={flag.key}>
          <FeatureFlagRow
            flagKey={flag.key}
            description={flag.description}
            enabled={flag.enabled}
            updatedAt={flag.updatedAt.toISOString()}
          />
        </li>
      ))}
    </ul>
  )
}
