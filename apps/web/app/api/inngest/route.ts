import { getDb } from '@tokslearn/db'
import { createConsoleSender, createResendSender } from '@tokslearn/integrations/resend'
import { configureJobs, functions, inngest } from '@tokslearn/jobs'
import { serve } from 'inngest/next'
import { env } from '@/env'
import { getProviders } from '@/lib/auth'
import { nextCache } from '@/lib/next-cache'

// Inngest calls this endpoint to run functions (docs/13 §1). Signed with INNGEST_SIGNING_KEY.
configureJobs({
  db: getDb,
  providers: getProviders,
  cache: () => nextCache,
  emailSender: () =>
    env.RESEND_API_KEY
      ? createResendSender({
          apiKey: env.RESEND_API_KEY,
          from: env.EMAIL_FROM ?? 'Tokslearn <hello@mail.tokslearn.com>',
          replyTo: env.EMAIL_REPLY_TO,
        })
      : createConsoleSender(),
})

export const { GET, POST, PUT } = serve({ client: inngest, functions })
