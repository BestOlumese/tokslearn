import { cn } from '@tokslearn/ui/cn'

/**
 * Course text (descriptions, articles) rendered on the server from editor JSON with a fixed
 * allowlist and escaped text (packages/core/src/courses/rich-text.ts). The only place the app
 * sets raw HTML; never pass anything else here.
 */
export function RichHtml({ html, className }: { html: string; className?: string }) {
  return (
    <div
      className={cn('prose-content', className)}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: server-rendered allowlist HTML, see above
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
