import { Skeleton } from '@tokslearn/ui/skeleton'

/** Placeholder while a settings page streams in. */
export function SettingsSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <Skeleton className="h-8 w-48" />
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
    </div>
  )
}
