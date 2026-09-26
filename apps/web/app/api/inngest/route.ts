import { functions, inngest } from '@tokslearn/jobs'
import { serve } from 'inngest/next'

// Inngest calls this endpoint to run functions (docs/13 §1). Signed with INNGEST_SIGNING_KEY.
export const { GET, POST, PUT } = serve({ client: inngest, functions })
