#!/usr/bin/env node
// Module boundary check (docs/03 §3, CLAUDE.md §1.1).
// 1. Nobody imports deep paths like `@tokslearn/core/admin/service` or `@tokslearn/<pkg>/src/...`.
// 2. Inside packages/core, a domain module reaches another only through its public entry
//    (`../<module>` = its index.ts), never `../<other-module>/<file>`. The shared `kernel` may be
//    imported file by file.
// 3. Client components ('use client') never import server-only packages.
import { readFileSync } from 'node:fs'
import { relative } from 'node:path'
import { walk } from './lib-walk.mjs'

const root = new URL('..', import.meta.url).pathname
const files = [
  ...walk(`${root}apps`, /\.(ts|tsx|mjs)$/),
  ...walk(`${root}packages`, /\.(ts|tsx|mjs)$/),
]

const importRe =
  /(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g
const serverOnly = [
  '@tokslearn/core',
  '@tokslearn/db',
  '@tokslearn/api',
  '@tokslearn/jobs',
  '@tokslearn/integrations',
  'server-only',
]
const problems = []

for (const file of files) {
  const rel = relative(root, file)
  const src = readFileSync(file, 'utf8')
  const isClient = /^\s*(?:\/\/[^\n]*\n\s*)*['"]use client['"]/.test(src)
  for (const m of src.matchAll(importRe)) {
    const spec = m[1] ?? m[2]
    if (!spec) continue
    if (/^@tokslearn\/core\/[^/]+\/.+/.test(spec))
      problems.push(`${rel}: deep import "${spec}" (use @tokslearn/core/<module>)`)
    if (/^@tokslearn\/[^/]+\/src(\/|$)/.test(spec))
      problems.push(`${rel}: import from package internals "${spec}"`)
    const coreMod = rel.match(/^packages\/core\/src\/([^/]+)\//)?.[1]
    if (coreMod && coreMod !== 'kernel') {
      const target = spec.match(/^\.\.\/([^/]+)\//)?.[1]
      if (target && target !== 'kernel' && target !== coreMod) {
        problems.push(
          `${rel}: module "${coreMod}" imports "../${target}/…" (use @tokslearn/core/${target})`,
        )
      }
    }
    if (isClient && serverOnly.some((s) => spec === s || spec.startsWith(`${s}/`))) {
      problems.push(`${rel}: client component imports server-only "${spec}"`)
    }
  }
}

if (problems.length > 0) {
  console.error(`Import boundary violations (${problems.length}):\n  ${problems.join('\n  ')}`)
  process.exit(1)
}
console.info(`✓ Import boundaries OK (${files.length} files)`)
