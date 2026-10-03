#!/usr/bin/env node
// First-load JS budget per public route (docs/12 §1: < 145 KB gzipped, ADR-026).
// Reads the prerendered HTML in apps/web/.next, sums gzip sizes of every script it loads.
// Usage: node scripts/check-bundle-size.mjs [--budget-kb 145]
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const webDir = new URL('../apps/web/', import.meta.url).pathname
const budgetKb = Number(process.argv[process.argv.indexOf('--budget-kb') + 1]) || 145

// Public routes from docs/12 §1 plus every auth page (all public, all static).
const routes = {
  '/': 'index',
  '/courses': 'courses',
  '/search': 'search',
  '/categories': 'categories',
  '/categories/[slug]': 'categories/business',
  // Fallback shells: the same scripts as every prerendered course or profile, even on an empty DB.
  '/courses/[slug]': 'courses/[slug]',
  '/courses/[slug]/preview/[lessonId]': 'courses/[slug]/preview/[lessonId]',
  '/courses/[slug]/reviews': 'courses/[slug]/reviews',
  '/instructors/[slug]': 'instructors/[slug]',
  '/verify': 'verify',
  '/verify/[code]': 'verify/[code]',
  '/teach': 'teach',
  '/content-policy': 'content-policy',
  '/sign-in': 'sign-in',
  '/sign-in/code': 'sign-in/code',
  '/sign-up': 'sign-up',
  '/verify-email': 'verify-email',
  '/forgot-password': 'forgot-password',
  '/reset-password': 'reset-password',
  '/two-factor': 'two-factor',
}

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
