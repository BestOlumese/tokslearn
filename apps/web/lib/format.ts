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
