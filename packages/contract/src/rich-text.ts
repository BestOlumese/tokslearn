import { z } from 'zod'

// Rich text as editor JSON (Tiptap/ProseMirror shape), for course descriptions and article
// lessons. Only these node and mark types are accepted; the server renders the HTML itself, so
// no client HTML is ever stored (docs/06 §3.8, docs/14).

export const richNodeTypes = [
  'doc',
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'listItem',
  'blockquote',
  'codeBlock',
  'horizontalRule',
  'hardBreak',
  'text',
] as const
export const richMarkTypes = ['bold', 'italic', 'underline', 'strike', 'code', 'link'] as const

export const RichMark = z.object({
  type: z.enum(richMarkTypes),
  attrs: z.record(z.string(), z.unknown()).optional(),
})

export interface RichNode {
  type: (typeof richNodeTypes)[number]
  attrs?: Record<string, unknown> | undefined
  content?: RichNode[] | undefined
  text?: string | undefined
  marks?: Array<z.infer<typeof RichMark>> | undefined
}

export const RichNode: z.ZodType<RichNode> = z.lazy(() =>
  z.object({
    type: z.enum(richNodeTypes),
    attrs: z.record(z.string(), z.unknown()).optional(),
    content: z.array(RichNode).max(5000).optional(),
    text: z.string().max(50_000).optional(),
    marks: z.array(RichMark).max(10).optional(),
  }),
)

/** A whole document: `{ type: 'doc', content: [...] }`. */
export const RichTextDoc = z
  .object({ type: z.literal('doc'), content: z.array(RichNode).max(5000) })
  .refine((doc) => JSON.stringify(doc).length <= 400_000, 'That text is too long.')
export type RichTextDoc = z.infer<typeof RichTextDoc>
