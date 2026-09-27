import { Skeleton } from '@tokslearn/ui/skeleton'

/** Same shape as CourseGrid, so results stream in without layout shift (docs/11 §4). */
export function GridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid gap-x-6 gap-y-9 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
        <div key={i} className="flex flex-col gap-2.5">
          <Skeleton className="aspect-video w-full rounded-card" />
          <Skeleton className="h-5 w-4/5" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      ))}
    </div>
  )
}
