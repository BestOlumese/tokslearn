import { ChevronDown } from 'lucide-react'
import type { ComponentProps } from 'react'
import { cn } from './cn'
import { controlClasses } from './input'

/**
 * Native <select>: zero JS, the phone's own picker on mobile, fully accessible.
 * A custom listbox is only worth its bundle cost where options need rich content.
 */
export function Select({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <div className={cn('relative', className)}>
      <select className={cn(controlClasses, 'h-10 appearance-none pr-9')} {...props}>
        {children}
      </select>
      <ChevronDown
        aria-hidden
        strokeWidth={1.75}
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-2"
      />
    </div>
  )
}
