// Display formatting in Africa/Lagos (CLAUDE.md §5). Intl only: no date library on any route.

const dateTime = new Intl.DateTimeFormat('en-NG', {
  timeZone: 'Africa/Lagos',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})
const date = new Intl.DateTimeFormat('en-NG', {
  timeZone: 'Africa/Lagos',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

export const formatDateTime = (value: Date | string): string => dateTime.format(new Date(value))
export const formatDate = (value: Date | string): string => date.format(new Date(value))

export const roleLabel: Readonly<Record<string, string>> = {
  learner: 'Learner',
  instructor: 'Instructor',
  reviewer: 'Reviewer',
  finance: 'Finance',
  support: 'Support',
  admin: 'Admin',
  super_admin: 'Super admin',
}

const naira = new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 })

/**
 * Kobo (string or bigint) → "₦15,000", or "₦1,234.50" when there are kobo (discounts, receipts).
 * Money stays integer kobo until display (CLAUDE.md §1.4).
 */
export function formatNaira(kobo: string | bigint): string {
  const value = BigInt(kobo)
  const whole = `₦${naira.format(Number(value / 100n))}`
  const k = value % 100n
  return k === 0n ? whole : `${whole}.${k.toString().padStart(2, '0')}`
}

/** 5460 → "1 h 31 min"; 540 → "9 min". */
export function formatDuration(sec: number): string {
  const minutes = Math.round(sec / 60)
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${Math.max(m, 1)} min`
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

export const levelLabel: Readonly<Record<string, string>> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  all: 'All levels',
}

export const languageLabel: Readonly<Record<string, string>> = {
  en: 'English',
  pcm: 'Nigerian Pidgin',
  yo: 'Yorùbá',
  ig: 'Igbo',
  ha: 'Hausa',
  fr: 'French',
}

export const certificateLabel: Readonly<Record<string, string>> = {
  none: 'No certificate',
  completion: 'Certificate when you finish',
  exam: 'Certificate after an exam',
  external: 'Prepares you for an outside exam',
}

/** 2_457_600 → "2.3 MB"; 18_000 → "18 KB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  const mb = bytes / (1024 * 1024)
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`
}

const dayMonth = new Intl.DateTimeFormat('en-NG', {
  timeZone: 'Africa/Lagos',
  day: 'numeric',
  month: 'long',
})
/** "2 October", in Lagos. */
export const formatDayMonth = (value: Date | string): string => dayMonth.format(new Date(value))
