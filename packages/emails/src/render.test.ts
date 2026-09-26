import { describe, expect, it } from 'vitest'
import { emailIds } from './catalog'
import { emailFixtures } from './fixtures'
import { renderEmail } from './render'

// docs/23: subject ≤ 60 chars, sentence case, no "!", text version present, links work.
describe.each(emailIds)('%s', (id) => {
  it('renders HTML and a plain-text version with a sensible subject', async () => {
    const email = await renderEmail(id, emailFixtures[id] as never)
    expect(email.subject.length).toBeLessThanOrEqual(60)
    expect(email.subject).not.toContain('!')
    expect(email.subject.charAt(0)).toBe(email.subject.charAt(0).toUpperCase())
    expect(email.html).toContain('Tokslearn')
    expect(email.text.length).toBeGreaterThan(80)
    expect(email.text).not.toContain('<')
  })

  it('includes every link from its data in both versions', async () => {
    const data = emailFixtures[id] as Record<string, unknown>
    const email = await renderEmail(id, data as never)
    for (const value of Object.values(data)) {
      if (typeof value === 'string' && value.startsWith('https://')) {
        expect(email.html).toContain(value)
        expect(email.text).toContain(value)
      }
    }
  })
})
