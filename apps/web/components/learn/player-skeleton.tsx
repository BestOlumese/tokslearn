import { Skeleton } from '@tokslearn/ui/skeleton'

/** Same frame as the player: top bar, video area, outline column (no layout shift). */
export function PlayerSkeleton() {
  return (
    <>
      <div className="h-14 border-b border-border bg-surface" />
      <div className="mx-auto grid w-full max-w-page gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:py-8">
        <div className="flex flex-col gap-4">
          <Skeleton className="aspect-video w-full rounded-card" />
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-11 w-full" />
        </div>
        <Skeleton className="hidden h-[480px] rounded-card lg:block" />
      </div>
    </>
  )
}
