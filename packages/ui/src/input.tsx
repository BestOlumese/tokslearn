import type { ComponentProps } from 'react'
import { cn } from './cn'

/** Shared control look: 40 px, 1 px border, 6 px radius, brand border + ring on focus. */
export const controlClasses = cn(
  'w-full rounded-control border border-border-strong bg-surface px-3 text-body text-ink',
  'placeholder:text-ink-3 transition-colors duration-150',
  'hover:border-ink-3',
  'focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
  'disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-3',
  'aria-invalid:border-danger aria-invalid:hover:border-danger',
)

export function Input({ className, type = 'text', ...props }: ComponentProps<'input'>) {
  return <input type={type} className={cn(controlClasses, 'h-10', className)} {...props} />
}
