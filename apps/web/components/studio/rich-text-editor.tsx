'use client'

// Client component: Tiptap editor for course descriptions and article lessons. Only the formats
// the server renders are offered (contract `richNodeTypes`); the server builds the HTML.

import { type Content, EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import type { RichTextDoc } from '@tokslearn/contract'
import { cn } from '@tokslearn/ui/cn'
import { Input } from '@tokslearn/ui/input'
import {
  Bold,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  SquareCode,
  Underline,
} from 'lucide-react'
import { type ReactNode, useState } from 'react'

export function RichTextEditor({
  id,
  value,
  onChange,
  disabled = false,
  placeholder,
  describedBy,
  minHeight = 'min-h-40',
  basic = false,
}: {
  id: string
  value: RichTextDoc | null
  onChange: (doc: RichTextDoc) => void
  disabled?: boolean
  placeholder?: string
  describedBy?: string | undefined
  minHeight?: string
  /** Community posts (docs/10 §10): no headings; bold, italic, code, links and lists. */
  basic?: boolean
}) {
  const [linkOpen, setLinkOpen] = useState(false)
  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        heading: basic ? false : { levels: [2, 3] },
        link: { openOnClick: false, autolink: true, protocols: ['https', 'http', 'mailto'] },
        dropcursor: false,
        trailingNode: false,
      }),
    ],
    // Our doc type is a strict subset of Tiptap's JSON (it only differs in optional-field typing).
    content: (value ?? '') as Content,
    editorProps: {
      attributes: {
        id,
        role: 'textbox',
        'aria-multiline': 'true',
        ...(describedBy ? { 'aria-describedby': describedBy } : {}),
        ...(placeholder ? { 'aria-placeholder': placeholder } : {}),
        class: cn(
          'prose-content prose-editor px-3 py-2.5 text-body text-ink focus:outline-none',
          minHeight,
        ),
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.getJSON() as RichTextDoc),
  })

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            bold: e.isActive('bold'),
            italic: e.isActive('italic'),
            underline: e.isActive('underline'),
            h2: e.isActive('heading', { level: 2 }),
            h3: e.isActive('heading', { level: 3 }),
            bullet: e.isActive('bulletList'),
            ordered: e.isActive('orderedList'),
            quote: e.isActive('blockquote'),
            code: e.isActive('codeBlock'),
            link: e.isActive('link'),
          }
        : null,
  })

  const tool = (label: string, icon: ReactNode, active: boolean | undefined, run: () => void) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={Boolean(active)}
      disabled={disabled || !editor}
      onMouseDown={(e) => e.preventDefault()}
      onClick={run}
      className={cn(
        'inline-flex size-9 items-center justify-center rounded-control text-ink-2 hover:bg-surface-sunken hover:text-ink disabled:opacity-50',
        active && 'bg-brand-soft text-brand-ink',
      )}
    >
      {icon}
    </button>
  )
  const i = (Icon: typeof Bold) => <Icon aria-hidden className="size-4" strokeWidth={2} />
  const chain = () => editor?.chain().focus()
  const applyLink = (raw: string) => {
    const href = raw.trim()
    if (/^(https?:\/\/|mailto:)/i.test(href))
      chain()?.extendMarkRange('link').setLink({ href }).run()
    setLinkOpen(false)
  }

  return (
    <div
      className={cn(
        'rounded-control border border-border-strong bg-surface focus-within:border-brand focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus',
        disabled && 'bg-surface-sunken',
      )}
    >
      <div
        role="toolbar"
        aria-label="Formatting"
        aria-controls={id}
        className="flex flex-wrap gap-0.5 border-b border-border p-1"
      >
        {basic
          ? null
          : tool('Heading', i(Heading2), state?.h2, () =>
              chain()?.toggleHeading({ level: 2 }).run(),
            )}
        {basic
          ? null
          : tool('Subheading', i(Heading3), state?.h3, () =>
              chain()?.toggleHeading({ level: 3 }).run(),
            )}
        {tool('Bold', i(Bold), state?.bold, () => chain()?.toggleBold().run())}
        {tool('Italic', i(Italic), state?.italic, () => chain()?.toggleItalic().run())}
        {tool('Underline', i(Underline), state?.underline, () => chain()?.toggleUnderline().run())}
        {tool('Bulleted list', i(List), state?.bullet, () => chain()?.toggleBulletList().run())}
        {tool('Numbered list', i(ListOrdered), state?.ordered, () =>
          chain()?.toggleOrderedList().run(),
        )}
        {tool('Quote', i(Quote), state?.quote, () => chain()?.toggleBlockquote().run())}
        {tool('Code', i(SquareCode), state?.code, () => chain()?.toggleCodeBlock().run())}
        {tool('Link', i(Link2), state?.link || linkOpen, () => {
          if (state?.link) chain()?.unsetLink().run()
          else setLinkOpen((o) => !o)
        })}
      </div>
      {linkOpen ? (
        // Not a <form>: this editor sits inside the details form, and forms can't nest.
        <div className="flex gap-2 border-b border-border p-2">
          <label htmlFor={`${id}-href`} className="sr-only">
            Link address
          </label>
          <Input
            id={`${id}-href`}
            type="url"
            placeholder="https://"
            className="h-9"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                applyLink(e.currentTarget.value)
              }
              if (e.key === 'Escape') setLinkOpen(false)
            }}
          />
          <button
            type="button"
            onClick={(e) => {
              const input = e.currentTarget.parentElement?.querySelector('input')
              applyLink(input?.value ?? '')
            }}
            className="shrink-0 rounded-control px-3 text-body-sm font-medium text-brand-ink hover:bg-surface-sunken"
          >
            Add link
          </button>
        </div>
      ) : null}
      <EditorContent editor={editor} />
    </div>
  )
}
