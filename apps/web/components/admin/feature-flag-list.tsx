import { listFeatureFlags } from '@tokslearn/core/admin'
import { EmptyState } from '@tokslearn/ui/empty-state'
import { requireSignedInCtx } from '@/lib/require-user'
import { FeatureFlagRow } from './feature-flag-row'
import { staffErrorState } from './staff-error'

export async function FeatureFlagList() {
  const path = '/admin/settings/flags'
  const ctx = await requireSignedInCtx(path)
  let flags: Awaited<ReturnType<typeof listFeatureFlags>>
  try {
    flags = await listFeatureFlags(ctx)
  } catch (error) {
    return staffErrorState(error, path)
  }
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
