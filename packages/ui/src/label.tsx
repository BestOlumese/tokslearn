import type { ComponentProps } from 'react'
import { cn } from './cn'

const kinds = {
  /** Above a text field. */
  field: 'text-body-sm font-medium text-ink',
  /** Next to a checkbox, radio or switch; dims when the control (a `peer`) is disabled. */
  option: 'text-body text-ink peer-disabled:cursor-not-allowed peer-disabled:text-ink-3',
} as const

export function Label({
  kind = 'field',
  className,
  ...props
}: ComponentProps<'label'> & { kind?: keyof typeof kinds }) {
  // biome-ignore lint/a11y/noLabelWithoutControl: callers pass htmlFor or wrap the control.
  return <label className={cn(kinds[kind], className)} {...props} />
}
