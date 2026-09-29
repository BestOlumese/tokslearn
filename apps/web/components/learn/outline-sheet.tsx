'use client'
// Client component: the outline as a bottom sheet on phones (docs/10 §3). The outline itself is
// rendered on the server and passed in.

import { Sheet, SheetContent, SheetTrigger } from '@tokslearn/ui/sheet'
import { ListOrdered } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { type ReactNode, useEffect, useState } from 'react'

export function OutlineSheet({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  // Close after choosing a lesson.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the lesson changes.
  useEffect(() => setOpen(false), [pathname])
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger className="inline-flex h-10 items-center gap-2 rounded-control border border-border-strong bg-surface px-3 text-body-sm font-medium text-ink hover:bg-canvas lg:hidden">
        <ListOrdered aria-hidden className="size-4" />
        {label}
      </SheetTrigger>
      <SheetContent side="bottom" title="Course outline">
        <div className="overflow-y-auto pb-6">{children}</div>
      </SheetContent>
    </Sheet>
  )
}
