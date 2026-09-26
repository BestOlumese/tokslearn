import { createHash } from 'node:crypto'

/** JSON with sorted object keys so `{a,b}` and `{b,a}` hash the same. */
function stable(value: unknown): string {
  if (value === undefined) return 'null'
  if (typeof value === 'bigint') return JSON.stringify(value.toString())
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}`
}

export const stableHash = (scope: string, input: unknown): string =>
  createHash('sha256').update(scope).update('\n').update(stable(input)).digest('hex')
