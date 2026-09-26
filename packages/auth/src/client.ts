import { adminClient, emailOTPClient, twoFactorClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

/**
 * Browser auth client. Pages call its sign-in/sign-up methods directly (Better Auth owns those
 * endpoints); everything else goes through oRPC.
 */
export function createTokslearnAuthClient(options: { onTwoFactorRedirect: () => void }) {
  return createAuthClient({
    plugins: [
      twoFactorClient({ onTwoFactorRedirect: options.onTwoFactorRedirect }),
      emailOTPClient(),
      adminClient(),
    ],
  })
}

export type AuthClient = ReturnType<typeof createTokslearnAuthClient>
