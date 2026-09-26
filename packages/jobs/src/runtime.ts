import type { Providers } from '@tokslearn/core/kernel'
import type { Db } from '@tokslearn/db'
import type { EmailSender } from '@tokslearn/integrations/resend'

/**
 * Dependencies the host app provides once at startup (apps/web/app/api/inngest/route.ts).
 * Functions read them lazily so importing this package never needs env or network.
 */
export interface JobRuntime {
  db: () => Db
  emailSender: () => EmailSender
  providers: () => Partial<Providers>
}

let runtime: JobRuntime | undefined

export function configureJobs(next: JobRuntime): void {
  runtime = next
}

export function jobRuntime(): JobRuntime {
  if (!runtime) throw new Error('configureJobs() was not called before running a job')
  return runtime
}
