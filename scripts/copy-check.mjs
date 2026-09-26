#!/usr/bin/env node
// Copy check (docs/11 §7). Scans user-facing strings in UI files, email templates and the
// error catalog for banned words and patterns. Code comments are ignored.
// Opt out for one line with `copy-check-ignore` in a comment on that line.
import { readFileSync } from 'node:fs'
import { relative } from 'node:path'
import { walk } from './lib-walk.mjs'

const root = new URL('..', import.meta.url).pathname
const files = [
  ...walk(`${root}apps/web/app`, /\.(tsx|mdx)$/),
  ...walk(`${root}apps/web/components`, /\.(tsx|mdx)$/),
  ...walk(`${root}apps/web/lib`, /\.ts$/),
  ...walk(`${root}packages/ui/src`, /\.tsx$/),
  ...walk(`${root}packages/emails/src`, /\.(tsx|ts)$/),
  `${root}packages/contract/src/errors.ts`,
].filter((f) => !/\.test\.tsx?$/.test(f))

const banned = [
  [/\bunlock(s|ed|ing)?\b/i, 'unlock'],
  [/\bunleash/i, 'unleash'],
  [/\belevat(e|es|ed|ing)\b/i, 'elevate'],
  [/\bempower/i, 'empower'],
  [/\bsupercharg/i, 'supercharge'],
  [/\bseamless(ly)?\b/i, 'seamless'],
  [/\beffortless(ly)?\b/i, 'effortless'],
  [/\bcutting[- ]edge\b/i, 'cutting-edge'],
  [/\bgame[- ]changer/i, 'game-changer'],
  [/\brevolutioni[sz]e/i, 'revolutionize'],
  [/\btransform your\b/i, 'transform your'],
  [/\bjourney\b/i, 'journey (as metaphor)'],
  [/\bdive in\b|\bdeep dive\b/i, 'dive in / deep dive'],
  [/\bdelv(e|es|ing)\b/i, 'delve'],
  [/\bembark/i, 'embark'],
  [/\bnavigate the (landscape|world)\b/i, 'navigate the landscape/world'],
  [/\bin today'?s fast[- ]paced world\b/i, "in today's fast-paced world"],
  [/\bwhether you'?re\b[^.]{1,60}\bor\b/i, "whether you're X or Y"],
  [/\blook no further\b/i, 'look no further'],
  [/\bto the next level\b/i, 'take your X to the next level'],
  [/\bworld[- ]class\b/i, 'world-class'],
  [/\bbest[- ]in[- ]class\b/i, 'best-in-class'],
  [/\bleverag(e|es|ed|ing)\b/i, 'leverage'],
  [/\bsynerg/i, 'synergy'],
  [/\brobust\b/i, 'robust'],
  [/\bholistic/i, 'holistic'],
  [/\btailored\b/i, 'tailored'],
  [/\bcurated\b/i, 'curated'],
  [/^\s*ready to\b.*\?\s*$/i, '"Ready to…?" CTA'],
  [/\b(get started|learn more)\b/i, 'generic button label (docs/11 §7)'],
]

/** Removes comments while keeping line numbers. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, p) => p + ' '.repeat(m.length - p.length))
}

/** String literals and JSX text with their line numbers. */
function* texts(src) {
  const re = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`|>([^<>{}]+)</g
  for (const m of src.matchAll(re)) {
    const text = m[1] ?? m[2] ?? m[3] ?? m[4] ?? ''
    if (!/[a-z]{3}/i.test(text)) continue
    // Skip class lists, paths, identifiers and URLs.
    if (
      /^[\w:/[\]().%#&=,@!-]+(\s+[\w:/[\]().%#&=,@!-]+)*$/.test(text.trim()) &&
      !/\s[a-z]+\s[a-z]+\s/i.test(` ${text} `)
    )
      continue
    const line = src.slice(0, m.index).split('\n').length
    yield { text, line }
  }
}

const problems = []
for (const file of files) {
  const rel = relative(root, file)
  const raw = readFileSync(file, 'utf8')
  const rawLines = raw.split('\n')
  const src = stripComments(raw)
  let exclamations = 0
  for (const { text, line } of texts(src)) {
    if (rawLines[line - 1]?.includes('copy-check-ignore')) continue
    for (const [re, label] of banned) {
      if (re.test(text)) problems.push(`${rel}:${line}  "${label}" in: ${text.trim().slice(0, 80)}`)
    }
    if ((text.match(/—/g) ?? []).length > 1)
      problems.push(`${rel}:${line}  more than one em dash in one paragraph`)
    if (/[a-z]!(\s|$)/i.test(text)) exclamations++
  }
  if (exclamations > 1)
    problems.push(`${rel}: ${exclamations} exclamation marks (max one per page)`)
}

if (problems.length > 0) {
  console.error(`Copy check failed (${problems.length}):\n  ${problems.join('\n  ')}`)
  process.exit(1)
}
console.info(`✓ Copy check OK (${files.length} files)`)
