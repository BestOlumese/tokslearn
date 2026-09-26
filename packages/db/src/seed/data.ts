// Deterministic seed values (docs/05 §4). Keys and values here are the platform defaults
// from ADR-018/019. Later phases append users, courses and orders with fixed UUIDs.

export const seedSettings: ReadonlyArray<{ key: string; value: unknown }> = [
  { key: 'refund_consumption_threshold_pct', value: 30 },
  { key: 'min_payout_kobo', value: '500000' },
  { key: 'payout_day', value: 5 },
]

export const seedFeatureFlags: ReadonlyArray<{
  key: string
  enabled: boolean
  description: string
}> = [
  {
    key: 'maintenance_mode',
    enabled: false,
    description: 'Shows the maintenance page to everyone except staff.',
  },
  { key: 'cohorts', enabled: false, description: 'Cohort-based courses and schedules.' },
  { key: 'live_classes', enabled: false, description: 'Live classes on Daily.' },
  {
    key: 'subscriptions',
    enabled: false,
    description: 'Monthly subscription with the watch-time pool (Phase 12).',
  },
]
