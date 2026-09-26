#!/usr/bin/env node
// First-load JS budget per public route (docs/12 §1: < 145 KB gzipped, ADR-026).
// Reads the prerendered HTML in apps/web/.next, sums gzip sizes of every script it loads.
// Usage: node scripts/check-bundle-size.mjs [--budget-kb 145]
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const webDir = new URL('../apps/web/', import.meta.url).pathname
const budgetKb = Number(process.argv[process.argv.indexOf('--budget-kb') + 1]) || 145

// Public routes from docs/12 §1 that exist in this phase.
const routes = { '/': 'index', '/courses': 'courses', '/sign-in': 'sign-in', '/verify': 'verify' }

let failed = false
for (const [route, file] of Object.entries(routes)) {
  const htmlPath = join(webDir, '.next/server/app', `${file}.html`)
  if (!existsSync(htmlPath)) {
    console.error(`✗ ${route}: no prerendered HTML at ${htmlPath}. Run the build first.`)
    failed = true
    continue
  }
  const html = readFileSync(htmlPath, 'utf8')
  // Modern browsers skip `noModule` polyfills, so they don't count toward first load.
  const noModule = new Set(
    [...html.matchAll(/<script[^>]*src="\/_next\/(static\/[^"]+?\.js)"[^>]*noModule[^>]*>/gi)].map(
      (m) => m[1],
    ),
  )
  const scripts = new Set(
    [...html.matchAll(/\/_next\/(static\/[^"'\s)]+?\.js)/g)]
      .map((m) => m[1])
      .filter((s) => !noModule.has(s)),
  )
  let total = 0
  for (const src of scripts) {
    const p = join(webDir, '.next', src)
    if (existsSync(p)) total += gzipSync(readFileSync(p)).length
  }
  const kb = total / 1024
  const ok = kb <= budgetKb
  if (!ok) failed = true
  console.info(
    `${ok ? '✓' : '✗'} ${route.padEnd(10)} ${kb.toFixed(1).padStart(6)} KB gzipped (${scripts.size} scripts, budget ${budgetKb} KB)`,
  )
}
process.exit(failed ? 1 : 0)
