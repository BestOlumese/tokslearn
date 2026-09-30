import { describe, expect, it } from 'vitest'
import { contentProblem, countLinkMarks, excerpt, mentionedUsernames } from './rules'

const now = new Date('2026-10-01T09:00:00Z')
const old = new Date('2026-01-01T09:00:00Z')
const fresh = new Date('2026-09-30T09:00:00Z')

describe('content filter', () => {
  it('blocks listed words as whole words only', () => {
    expect(contentProblem({ text: 'You be mumu', linkMarks: 0, accountCreatedAt: old, now })).toBe(
      'blocked_words',
    )
    // "Scunthorpe" and "code" contain listed letters but aren't the words.
    expect(
      contentProblem({ text: 'Scunthorpe code review', linkMarks: 0, accountCreatedAt: old, now }),
    ).toBeNull()
  })

  it('keeps links from new accounts and caps them for everyone', () => {
    const text = 'See https://example.com'
    expect(contentProblem({ text, linkMarks: 0, accountCreatedAt: fresh, now })).toBe(
      'links_not_allowed',
    )
    expect(contentProblem({ text, linkMarks: 0, accountCreatedAt: old, now })).toBeNull()
    expect(contentProblem({ text, linkMarks: 5, accountCreatedAt: old, now })).toBe(
      'too_many_links',
    )
    expect(
      contentProblem({ text: 'no links', linkMarks: 0, accountCreatedAt: fresh, now }),
    ).toBeNull()
  })
})

describe('mentions and helpers', () => {
  it('finds @handles, not emails, at most five', () => {
    expect(
      mentionedUsernames('Thanks @Tobi_A and @kemi, mail me at ada@example.com @Tobi_A'),
    ).toEqual(['tobi_a', 'kemi'])
    expect(mentionedUsernames('@aaa @bbb @ccc @ddd @eee @fff')).toHaveLength(5)
  })

  it('counts link marks and clips excerpts', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href: 'https://a.b' } }] },
          ],
        },
      ],
    }
    expect(countLinkMarks(doc)).toBe(1)
    expect(excerpt('a'.repeat(200)).length).toBe(160)
  })
})
