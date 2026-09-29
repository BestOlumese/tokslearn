import { exportNotesMarkdown } from '@tokslearn/core/engagement'
import { getServerCtx } from '@/lib/server-ctx'

// "Export Markdown" on /account/notes: the same text as `notes.export`, as a file download.
export async function GET(request: Request): Promise<Response> {
  const ctx = await getServerCtx()
  if (ctx.actor.kind !== 'user') {
    return Response.redirect(new URL('/sign-in?next=%2Faccount%2Fnotes', request.url), 303)
  }
  const courseId = new URL(request.url).searchParams.get('courseId')
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const markdown = await exportNotesMarkdown(
    ctx,
    courseId && uuid.test(courseId) ? courseId : undefined,
  )
  return new Response(markdown, {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'content-disposition': 'attachment; filename="tokslearn-notes.md"',
      'cache-control': 'private, no-store',
    },
  })
}
