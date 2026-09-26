import type { RichNode, RichTextDoc } from '@tokslearn/contract'

// Renders editor JSON to HTML with a fixed allowlist. Text is always escaped; links must be
// http(s) or mailto. Unknown attributes are ignored. Output is safe to store in *_html fields.

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

function safeHref(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const href = value.trim()
  try {
    const url = new URL(href)
    return url.protocol === 'https:' || url.protocol === 'http:' || url.protocol === 'mailto:'
      ? url.toString()
      : null
  } catch {
    return null
  }
}

function renderText(node: RichNode): string {
  let html = escapeHtml(node.text ?? '')
  for (const mark of node.marks ?? []) {
    switch (mark.type) {
      case 'bold':
        html = `<strong>${html}</strong>`
        break
      case 'italic':
        html = `<em>${html}</em>`
        break
      case 'underline':
        html = `<u>${html}</u>`
        break
      case 'strike':
        html = `<s>${html}</s>`
        break
      case 'code':
        html = `<code>${html}</code>`
        break
      case 'link': {
        const href = safeHref(mark.attrs?.href)
        if (href) {
          html = `<a href="${escapeHtml(href)}" rel="noopener noreferrer nofollow" target="_blank">${html}</a>`
        }
        break
      }
    }
  }
  return html
}

function renderNodes(nodes: ReadonlyArray<RichNode> | undefined): string {
  return (nodes ?? []).map(renderNode).join('')
}

function renderNode(node: RichNode): string {
  switch (node.type) {
    case 'text':
      return renderText(node)
    case 'hardBreak':
      return '<br>'
    case 'paragraph':
      return `<p>${renderNodes(node.content)}</p>`
    case 'heading': {
      // Course pages own h1/h2; content headings start at h3 and stop at h4.
      const level = node.attrs?.level === 3 ? 4 : 3
      return `<h${level}>${renderNodes(node.content)}</h${level}>`
    }
    case 'bulletList':
      return `<ul>${renderNodes(node.content)}</ul>`
    case 'orderedList': {
      const start = Number(node.attrs?.start)
      const attr = Number.isInteger(start) && start > 1 && start < 10_000 ? ` start="${start}"` : ''
      return `<ol${attr}>${renderNodes(node.content)}</ol>`
    }
    case 'listItem':
      return `<li>${renderNodes(node.content)}</li>`
    case 'blockquote':
      return `<blockquote>${renderNodes(node.content)}</blockquote>`
    case 'codeBlock':
      return `<pre><code>${escapeHtml((node.content ?? []).map((c) => c.text ?? '').join(''))}</code></pre>`
    case 'horizontalRule':
      return '<hr>'
    case 'doc':
      return renderNodes(node.content)
  }
}

export function renderRichText(doc: RichTextDoc): string {
  return renderNodes(doc.content)
}

/** Visible text only, for length checks and search. */
export function richTextToPlain(doc: RichTextDoc | null | undefined): string {
  if (!doc) return ''
  const walk = (nodes: ReadonlyArray<RichNode> | undefined): string =>
    (nodes ?? []).map((n) => (n.type === 'text' ? (n.text ?? '') : `${walk(n.content)} `)).join('')
  return walk(doc.content).replace(/\s+/g, ' ').trim()
}
