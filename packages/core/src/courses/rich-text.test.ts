import type { RichTextDoc } from '@tokslearn/contract'
import { describe, expect, it } from 'vitest'
import { renderRichText, richTextToPlain } from './rich-text'

const doc = (content: RichTextDoc['content']): RichTextDoc => ({ type: 'doc', content })

describe('rich text rendering', () => {
  it('renders the allowed structure', () => {
    const html = renderRichText(
      doc([
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Lookups' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Use ' },
            { type: 'text', text: 'XLOOKUP', marks: [{ type: 'code' }, { type: 'bold' }] },
          ],
        },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'One' }] }],
            },
          ],
        },
      ]),
    )
    expect(html).toBe(
      '<h3>Lookups</h3><p>Use <strong><code>XLOOKUP</code></strong></p><ul><li><p>One</p></li></ul>',
    )
  })

  it('escapes text and drops dangerous links', () => {
    const html = renderRichText(
      doc([
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: '<script>alert(1)</script>' },
            {
              type: 'text',
              text: 'click',
              marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
            },
            {
              type: 'text',
              text: 'site',
              marks: [{ type: 'link', attrs: { href: 'https://x.test/"onmouseover="a' } }],
            },
          ],
        },
      ]),
    )
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('javascript:')
    expect(html).not.toMatch(/"onmouseover=/)
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('rel="noopener noreferrer nofollow"')
  })

  it('extracts plain text', () => {
    expect(
      richTextToPlain(
        doc([
          { type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'world' }] },
        ]),
      ),
    ).toBe('Hello world')
    expect(richTextToPlain(null)).toBe('')
  })
})
