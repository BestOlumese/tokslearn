import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SKIP = new Set([
  'node_modules',
  '.next',
  'dist',
  '.turbo',
  'coverage',
  'migrations',
  '.git',
  'test-results',
  'playwright-report',
])

/** Recursively lists files under `dir` whose name matches `pattern`. */
export function walk(dir, pattern, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, pattern, out)
    else if (pattern.test(name)) out.push(p)
  }
  return out
}
