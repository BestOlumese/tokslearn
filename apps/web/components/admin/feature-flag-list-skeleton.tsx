import { Skeleton } from '@tokslearn/ui/skeleton'

/** Same row height and count as the seeded flag list, so streaming causes no shift. */
export function FeatureFlagListSkeleton() {
  return (
    <div className="divide-y divide-border rounded-card border border-border bg-surface">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex min-h-[76px] items-center justify-between gap-6 px-5 py-4">
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </div>
          <Skeleton shape="pill" className="h-6 w-10" />
        </div>
      ))}
    </div>
  )
}
