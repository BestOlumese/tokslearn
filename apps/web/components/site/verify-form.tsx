import { buttonClasses } from '@tokslearn/ui/button'

/** Certificate code lookup; a plain GET form that works without JavaScript. */
export function VerifyForm({ id = 'code', compact = false }: { id?: string; compact?: boolean }) {
  return (
    <form
      action="/verify"
      className={`flex w-full flex-col gap-2 sm:flex-row ${compact ? 'max-w-[480px]' : 'max-w-[560px]'}`}
    >
      <label htmlFor={id} className="sr-only">
        Certificate code
      </label>
      <input
        id={id}
        name="code"
        required
        maxLength={20}
        spellCheck={false}
        autoCapitalize="characters"
        autoComplete="off"
        placeholder="e.g. TL-C-8Q2M-4K7P"
        className="h-12 flex-1 rounded-control border border-border-strong bg-surface px-4 text-body uppercase tracking-wide text-ink placeholder:normal-case placeholder:tracking-normal placeholder:text-ink-3 focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      />
      <button
        type="submit"
        className={buttonClasses({ variant: 'secondary', size: 'lg', className: 'shrink-0' })}
      >
        Check certificate
      </button>
    </form>
  )
}
