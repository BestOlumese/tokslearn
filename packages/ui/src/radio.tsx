import type { ComponentProps } from 'react'
import { choiceBase } from './checkbox'
import { cn } from './cn'

/** Native radio. Group several with the same `name` inside a <fieldset> with a <legend>. */
export function Radio({ className, ...props }: Omit<ComponentProps<'input'>, 'type'>) {
  return (
    <input
      type="radio"
      className={cn(
        choiceBase,
        'rounded-full checked:border-brand',
        'after:absolute after:inset-0 after:m-auto after:hidden after:size-2.5 after:rounded-full after:bg-brand checked:after:block',
        className,
      )}
      {...props}
    />
  )
}
