import { log } from '@tokslearn/core/kernel'
import { isPasswordCompromised } from 'better-auth/plugins/haveibeenpwned'

const TIMEOUT_MS = 3000

/**
 * Have I Been Pwned k-anonymity check (docs/07 §1), failing open: if the service is slow or down
 * the password is allowed and the gap is logged. A third-party outage must not block sign-up.
 */
export async function isBreached(password: string): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      isPasswordCompromised(password),
      new Promise<boolean>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS)
      }),
    ])
  } catch (error) {
    log('warn', 'breached-password check skipped', { module: 'auth', error: String(error) })
    return false
  } finally {
    clearTimeout(timer)
  }
}

/** Auth endpoints that set a password, and the body field that carries it. */
export const passwordFields: Readonly<Record<string, 'password' | 'newPassword'>> = {
  '/sign-up/email': 'password',
  '/change-password': 'newPassword',
  '/reset-password': 'newPassword',
}
