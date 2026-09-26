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

type SeedRole =
  | 'learner'
  | 'instructor'
  | 'reviewer'
  | 'finance'
  | 'support'
  | 'admin'
  | 'super_admin'

/**
 * Demo accounts for local, preview and staging only (never production). Fixed ids so tests and
 * later seeds can reference them. Passwords are set by `@tokslearn/auth` seed (Better Auth hash).
 */
export const seedUsers: ReadonlyArray<{
  id: string
  name: string
  email: string
  username: string
  roles: SeedRole[]
}> = [
  {
    id: '01920000-0000-7000-8000-000000000001',
    name: 'Ada Admin',
    email: 'superadmin@tokslearn.test',
    username: 'ada',
    roles: ['learner', 'super_admin'],
  },
  {
    id: '01920000-0000-7000-8000-000000000002',
    name: 'Tunde Admin',
    email: 'admin@tokslearn.test',
    username: 'tunde',
    roles: ['learner', 'admin'],
  },
  {
    id: '01920000-0000-7000-8000-000000000003',
    name: 'Ngozi Finance',
    email: 'finance@tokslearn.test',
    username: 'ngozi',
    roles: ['learner', 'finance'],
  },
  {
    id: '01920000-0000-7000-8000-000000000004',
    name: 'Musa Support',
    email: 'support@tokslearn.test',
    username: 'musa',
    roles: ['learner', 'support'],
  },
  {
    id: '01920000-0000-7000-8000-000000000005',
    name: 'Kemi Reviewer',
    email: 'reviewer@tokslearn.test',
    username: 'kemi',
    roles: ['learner', 'reviewer'],
  },
  ...Array.from({ length: 10 }, (_, i) => ({
    id: `01920000-0000-7000-8000-0000000001${String(i).padStart(2, '0')}`,
    name:
      [
        'Chiamaka Okafor',
        'Bola Adeyemi',
        'Emeka Nwosu',
        'Halima Sani',
        'Ifeoma Eze',
        'Segun Ogun',
        'Zainab Bello',
        'Obinna Uche',
        'Funke Ajayi',
        'Yusuf Garba',
      ][i] ?? `Learner ${i}`,
    email: `learner${i + 1}@tokslearn.test`,
    username: `learner${i + 1}`,
    roles: ['learner'] as SeedRole[],
  })),
]
