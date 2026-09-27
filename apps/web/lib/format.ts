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

/** Kobo (string or bigint) → "₦15,000". Money stays integer kobo until display (CLAUDE.md §1.4). */
export const formatNaira = (kobo: string | bigint): string =>
  `₦${naira.format(Number(BigInt(kobo) / 100n))}`

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
