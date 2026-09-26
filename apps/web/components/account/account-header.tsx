import { getMe } from '@tokslearn/core/identity'
import { Avatar } from '@tokslearn/ui/avatar'
import { Skeleton } from '@tokslearn/ui/skeleton'
import { formatDate } from '@/lib/format'
import { requireSignedInCtx } from '@/lib/require-user'

/** Who you are, at the top of every settings page. Streams in; the skeleton keeps the height. */
export async function AccountHeader({ path }: { path: string }) {
  const me = await getMe(await requireSignedInCtx(path))
  return (
    <div className="flex items-center gap-4 sm:gap-5">
      <Avatar name={me.name} src={me.avatarUrl} size="lg" />
      <div className="min-w-0">
        <p className="truncate text-h3 text-ink">{me.name}</p>
        <p className="truncate text-body-sm text-ink-2">{me.email}</p>
        <p className="text-body-sm text-ink-3">Member since {formatDate(me.createdAt)}</p>
      </div>
    </div>
  )
}

export function AccountHeaderSkeleton() {
  return (
    <div className="flex items-center gap-4 sm:gap-5" aria-hidden>
      <Skeleton shape="pill" className="size-16" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-44" />
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-4 w-36" />
      </div>
    </div>
  )
}
