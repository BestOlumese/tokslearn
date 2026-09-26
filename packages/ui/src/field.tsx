import type { ReactNode } from 'react'
import { cn } from './cn'
import { Label } from './label'

export interface FieldProps {
  id: string
  label: string
  /** Shown below the control. Linked via aria-describedby. */
  helper?: ReactNode
  error?: ReactNode
  required?: boolean
  className?: string
  /**
   * Receives the ids to wire onto the control. Set `required` on the control itself; `required`
   * here only adds the "(required)" marker to the label.
   */
  children: (control: {
    id: string
    'aria-describedby': string | undefined
    'aria-invalid': true | undefined
  }) => ReactNode
}

/** Label above, helper below, error in danger with an icon (docs/11 §4). Never placeholder-as-label. */
export function Field({ id, label, helper, error, required, className, children }: FieldProps) {
  const helperId = helper ? `${id}-helper` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [errorId, helperId].filter(Boolean).join(' ') || undefined
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id}>
        {label}
        {required ? <span className="text-ink-3"> (required)</span> : null}
      </Label>
      {children({
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
      })}
      {error ? (
        <p id={errorId} className="flex items-start gap-1.5 text-body-sm text-danger">
          {/* Lucide `circle-alert`, inlined so form pages don't load the icon runtime (docs/12 §1). */}
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mt-0.5 size-4 shrink-0"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" x2="12" y1="8" y2="12" />
            <line x1="12" x2="12.01" y1="16" y2="16" />
          </svg>
          <span>{error}</span>
        </p>
      ) : null}
      {helper ? (
        <p id={helperId} className="text-body-sm text-ink-3">
          {helper}
        </p>
      ) : null}
    </div>
  )
}
