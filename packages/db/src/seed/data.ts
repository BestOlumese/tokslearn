// Deterministic seed values (docs/05 §4). Keys and values here are the platform defaults
// from ADR-018/019. Later phases append users, courses and orders with fixed UUIDs.

export const seedSettings: ReadonlyArray<{ key: string; value: unknown }> = [
  { key: 'refund_consumption_threshold_pct', value: 30 },
  { key: 'min_payout_kobo', value: '500000' },
  { key: 'payout_day', value: 5 },
  // docs/08 §4: Paystack's fee is shared by line and commission rate unless set to 'platform'.
  { key: 'gateway_fee_bearer', value: 'proportional' },
  // docs/08 §10, ADR Q6: off until the accountant confirms VAT on commission.
  { key: 'tax_rules', value: { vatOnCommission: false, vatRateBps: 750 } },
]

/**
 * Default commission per attribution source (docs/08 §3, ADR-017). Fixed ids so every
 * environment agrees; admins change rates by ending a row and adding a new one.
 */
export const seedCommissionDefaults = [
  {
    id: '01920000-0000-7000-8003-000000000001',
    source: 'instructor_referral',
    platformRateBps: 300,
  },
  { id: '01920000-0000-7000-8003-000000000002', source: 'instructor_coupon', platformRateBps: 300 },
  { id: '01920000-0000-7000-8003-000000000003', source: 'platform_organic', platformRateBps: 4000 },
  { id: '01920000-0000-7000-8003-000000000004', source: 'platform_paid', platformRateBps: 5000 },
] as const

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

/**
 * Starter category tree, seeded in every environment (instructors pick one when creating a
 * course). Admins edit it at /admin/categories from Phase 3. Fixed ids; never reuse one.
 */
type CategoryTree = ReadonlyArray<
  readonly [slug: string, name: string, children: ReadonlyArray<readonly [string, string]>]
>

const categoryTree: CategoryTree = [
  [
    'business',
    'Business',
    [
      ['entrepreneurship', 'Entrepreneurship'],
      ['sales', 'Sales'],
      ['management', 'Management'],
      ['project-management', 'Project management'],
    ],
  ],
  [
    'finance-and-accounting',
    'Finance and accounting',
    [
      ['accounting-and-bookkeeping', 'Accounting and bookkeeping'],
      ['tax', 'Tax'],
      ['investing', 'Investing'],
      ['professional-exam-prep', 'Professional exam prep'],
    ],
  ],
  [
    'office-and-data',
    'Office and data',
    [
      ['microsoft-excel', 'Microsoft Excel'],
      ['data-analysis', 'Data analysis'],
      ['power-bi', 'Power BI'],
      ['sql', 'SQL'],
    ],
  ],
  [
    'development',
    'Development',
    [
      ['web-development', 'Web development'],
      ['mobile-development', 'Mobile development'],
      ['programming-languages', 'Programming languages'],
      ['data-science', 'Data science'],
    ],
  ],
  [
    'design',
    'Design',
    [
      ['graphic-design', 'Graphic design'],
      ['ui-ux-design', 'UI/UX design'],
      ['design-tools', 'Design tools'],
    ],
  ],
  [
    'marketing',
    'Marketing',
    [
      ['digital-marketing', 'Digital marketing'],
      ['social-media-marketing', 'Social media marketing'],
      ['content-and-copywriting', 'Content and copywriting'],
      ['seo', 'SEO'],
    ],
  ],
  [
    'it-and-security',
    'IT and security',
    [
      ['cloud-computing', 'Cloud computing'],
      ['cybersecurity', 'Cybersecurity'],
      ['networking', 'Networking'],
      ['it-support', 'IT support'],
    ],
  ],
  [
    'photo-and-video',
    'Photo and video',
    [
      ['photography', 'Photography'],
      ['video-production', 'Video production'],
      ['video-editing', 'Video editing'],
    ],
  ],
  [
    'personal-development',
    'Personal development',
    [
      ['career-development', 'Career development'],
      ['communication', 'Communication'],
      ['languages', 'Languages'],
    ],
  ],
]

/** Shown on each top category's page. */
const categoryDescriptions: Readonly<Record<string, string>> = {
  business:
    'Start, run and grow a business: sales, management and planning for Nigerian conditions.',
  'finance-and-accounting':
    'Bookkeeping, tax, investing and preparation for professional accounting exams.',
  'office-and-data': 'Excel, data analysis, Power BI and SQL for everyday work.',
  development:
    'Build websites, mobile apps and data projects, from first lines of code to production.',
  design: 'Graphic design, UI/UX and the tools designers use every day.',
  marketing: 'Digital, social media and content marketing, and getting found on Google.',
  'it-and-security': 'Cloud, cybersecurity, networking and IT support skills employers ask for.',
  'photo-and-video': 'Take better photos, shoot video and edit it for clients and social media.',
  'personal-development': 'Career skills, communication and languages.',
}

export const seedCategories = categoryTree.map(([slug, name, children], i) => {
  const top = String(i + 1).padStart(10, '0')
  return {
    id: `01920000-0000-7000-8001-${top}00`,
    slug,
    name,
    description: categoryDescriptions[slug] ?? null,
    children: children.map(([childSlug, childName], j) => ({
      id: `01920000-0000-7000-8001-${top}${String(j + 1).padStart(2, '0')}`,
      slug: childSlug,
      name: childName,
    })),
  }
})

/**
 * Demo instructors (non-production): one approved with verified KYC and a payout account, one
 * whose application is submitted with KYC still pending (docs/05 §4). Only last-4 digits and
 * provider references, never ID numbers.
 */
export const seedInstructors = {
  approved: {
    id: '01920000-0000-7000-8000-000000000201',
    name: 'Tobi Adeleke',
    email: 'instructor@tokslearn.test',
    username: 'tobi',
    slug: 'tobi-adeleke',
  },
  pending: {
    id: '01920000-0000-7000-8000-000000000202',
    name: 'Grace Okon',
    email: 'instructor2@tokslearn.test',
    username: 'grace',
  },
} as const
