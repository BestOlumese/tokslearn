// Pure community rules (docs/10 §10): what a post may contain, and who a post mentions.

/** Accounts younger than this can't post links (the commonest spam). */
export const NEW_ACCOUNT_MS = 3 * 86_400_000
export const MAX_LINKS = 5
export const MAX_MENTIONS = 5
export const TITLE_MIN = 5
export const TITLE_MAX = 150
export const BODY_MAX = 10_000

// A short, deliberately plain wordlist: slurs and the crudest words, in English and Pidgin.
// Matched as whole words after lowercasing; the filter blocks, a person can still report.
const BLOCKED = [
  'fuck',
  'fucking',
  'motherfucker',
  'cunt',
  'nigger',
  'faggot',
  'ashawo',
  'olodo',
  'mumu',
  'werey',
]
const blockedRe = new RegExp(`(^|[^a-z])(${BLOCKED.join('|')})([^a-z]|$)`, 'i')
const urlRe = /\b(?:https?:\/\/|www\.)\S+/gi

export type ContentProblem = 'blocked_words' | 'links_not_allowed' | 'too_many_links' | null

/**
 * Checks a post's text and link count. `linkMarks`: links set with the editor's link button,
 * counted as well as URLs typed in the text.
 */
export function contentProblem(input: {
  text: string
  linkMarks: number
  accountCreatedAt: Date
  now: Date
}): ContentProblem {
  if (blockedRe.test(input.text)) return 'blocked_words'
  const links = (input.text.match(urlRe)?.length ?? 0) + input.linkMarks
  if (links === 0) return null
  if (input.now.getTime() - input.accountCreatedAt.getTime() < NEW_ACCOUNT_MS) {
    return 'links_not_allowed'
  }
  return links > MAX_LINKS ? 'too_many_links' : null
}

/** `@username` handles in the text, lowercased and unique, at most MAX_MENTIONS. */
export function mentionedUsernames(text: string): string[] {
  const found = new Set<string>()
  for (const m of text.matchAll(/(?:^|[^a-z0-9_@])@([a-z0-9_]{3,30})\b/gi)) {
    if (m[1]) found.add(m[1].toLowerCase())
    if (found.size >= MAX_MENTIONS) break
  }
  return [...found]
}

/** Link marks in an editor document. */
export function countLinkMarks(doc: unknown): number {
  let n = 0
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return
    const o = node as { marks?: Array<{ type?: string }>; content?: unknown[] }
    n += (o.marks ?? []).filter((m) => m.type === 'link').length
    for (const c of o.content ?? []) walk(c)
  }
  walk(doc)
  return n
}

/** A short plain excerpt for thread lists. */
export const excerpt = (text: string, max = 160) =>
  text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`
