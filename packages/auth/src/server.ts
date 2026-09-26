import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { track } from '@tokslearn/core/analytics'
import * as identity from '@tokslearn/core/identity'
import type { Ctx, SessionAdmin } from '@tokslearn/core/kernel'
import { log } from '@tokslearn/core/kernel'
import { type Db, schema } from '@tokslearn/db'
import type { EmailRequest } from '@tokslearn/emails/catalog'
import { betterAuth, type SecondaryStorage } from 'better-auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { admin, bearer, emailOTP, haveIBeenPwned, twoFactor } from 'better-auth/plugins'
import { eq } from 'drizzle-orm'
import { uuidv7 } from 'uuidv7'
import { createLockout } from './lockout'

// Better Auth configuration (docs/07 §1). One instance serves web (cookies) and mobile (bearer).

export interface AuthDeps {
  db: Db
  /** 32+ random bytes; rotating it signs everyone out. */
  secret: string
  /** Public origin, e.g. https://tokslearn.com. */
  baseURL: string
  /** Extra origins allowed to call auth (preview URLs; `tokslearn://` in Phase 14). */
  trustedOrigins: string[]
  production: boolean
  google?: { clientId: string; clientSecret: string } | undefined
  /** Upstash Redis for sessions, verification records and rate limits (docs/07 §1). */
  secondaryStorage?: SecondaryStorage | undefined
  /**
   * Sends a catalog email straight to the `email-send` job. Used for emails that carry sign-in
   * secrets, so the code or link is never written to our database (ADR-028).
   */
  sendEmail: (email: EmailRequest) => Promise<void>
  /** Core context for work done on behalf of the auth system (hooks). */
  systemCtx: (reason: string) => Ctx
}

const { user, session, account, verification, twoFactor: twoFactorTable } = schema

const PASSWORD_MESSAGE =
  'This password appeared in a data breach, so it isn’t safe to use. Choose a different one.'

export function createAuth(deps: AuthDeps) {
  const lockout = createLockout(deps.secondaryStorage)
  const url = (path: string) => `${deps.baseURL}${path}`

  // Email sending must never block or break an auth response; failures are logged and the user
  // can press "resend".
  const send = (email: EmailRequest) =>
    deps
      .sendEmail(email)
      .catch((error: unknown) =>
        log('error', 'auth email failed', {
          module: 'auth',
          action: email.id,
          error: String(error),
        }),
      )

  const auth = betterAuth({
    appName: 'Tokslearn',
    baseURL: deps.baseURL,
    secret: deps.secret,
    trustedOrigins: deps.trustedOrigins,
    database: drizzleAdapter(deps.db, {
      provider: 'pg',
      schema: { user, session, account, verification, twoFactor: twoFactorTable },
    }),
    ...(deps.secondaryStorage ? { secondaryStorage: deps.secondaryStorage } : {}),

    advanced: {
      database: { generateId: () => uuidv7() },
      cookiePrefix: 'tokslearn',
      useSecureCookies: deps.production,
      ipAddress: { ipAddressHeaders: ['x-forwarded-for'] },
    },

    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 days, rolling (docs/07 §1)
      updateAge: 60 * 60 * 24, // refreshed daily
      // Sessions stay in Postgres too: the sessions page, admin tools and IDOR checks read them.
      storeSessionInDatabase: true,
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },

    user: {
      deleteUser: { enabled: false }, // deletion is a 14-day request (me.requestDeletion)
    },

    account: {
      accountLinking: { enabled: true, trustedProviders: ['google'] },
    },

    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      // Email must be verified before buying, not before signing in (docs/01 §3.1).
      requireEmailVerification: false,
      autoSignIn: true,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 60 * 60,
      sendResetPassword: async ({ user: u, url: link }) => {
        void send({
          id: 'reset-password',
          to: u.email,
          data: { name: u.name, url: link },
          idempotencyKey: `reset-password:${u.id}:${Date.now()}`,
        })
      },
      onPasswordReset: async ({ user: u }) => {
        void send({
          id: 'password-changed',
          to: u.email,
          data: {
            name: u.name,
            when: new Date().toISOString(),
            device: null,
            resetUrl: url('/forgot-password'),
          },
          idempotencyKey: `password-changed:${u.id}:${Date.now()}`,
        })
      },
    },

    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60 * 24,
      sendVerificationEmail: async ({ user: u, url: link }) => {
        void send({
          id: 'verify-email',
          to: u.email,
          data: { name: u.name, url: link },
          idempotencyKey: `verify-email:${u.id}:${Date.now()}`,
        })
      },
      afterEmailVerification: async (u) => {
        await track(deps.systemCtx('email-verified'), 'email_verified', {}, { distinctId: u.id })
      },
    },

    ...(deps.google
      ? {
          socialProviders: {
            google: {
              clientId: deps.google.clientId,
              clientSecret: deps.google.clientSecret,
              prompt: 'select_account' as const,
            },
          },
        }
      : {}),

    rateLimit: {
      enabled: true,
      storage: deps.secondaryStorage ? 'secondary-storage' : 'memory',
      window: 60,
      max: 100,
      // docs/06 §3.4: auth 10/min/IP; stricter on endpoints that send email.
      customRules: {
        '/sign-in/email': { window: 60, max: 10 },
        '/sign-in/email-otp': { window: 60, max: 10 },
        '/sign-up/email': { window: 60, max: 5 },
        '/email-otp/send-verification-otp': { window: 60, max: 3 },
        '/request-password-reset': { window: 60, max: 3 },
        '/send-verification-email': { window: 60, max: 3 },
        '/two-factor/*': { window: 60, max: 10 },
      },
    },

    plugins: [
      admin({ adminRoles: ['admin', 'super_admin'], defaultRole: 'learner' }),
      twoFactor({ issuer: 'Tokslearn' }),
      emailOTP({
        otpLength: 6,
        expiresIn: 10 * 60,
        disableSignUp: true, // sign-up needs a name; codes are for existing accounts
        sendVerificationOTP: async ({ email, otp, type }, ctx) => {
          if (type !== 'sign-in') return
          const ua = ctx?.headers?.get('user-agent') ?? null
          void send({
            id: 'sign-in-code',
            to: email,
            data: {
              code: otp,
              expiresInMinutes: 10,
              device: ua ? identity.describeDevice(ua) : null,
            },
            idempotencyKey: `sign-in-code:${email}:${otp}`,
          })
        },
      }),
      bearer(),
      haveIBeenPwned({ customPasswordCompromisedMessage: PASSWORD_MESSAGE }),
    ],

    databaseHooks: {
      user: {
        create: {
          after: async (u, ctx) => {
            const method = ctx?.path?.startsWith('/callback') ? 'google' : 'password'
            await identity.onUserCreated(deps.systemCtx('user-created'), { userId: u.id, method })
            await track(deps.systemCtx('signed-up'), 'signed_up', { method }, { distinctId: u.id })
          },
        },
      },
      session: {
        create: {
          after: async (s) => {
            await identity
              .onSessionCreated(deps.systemCtx('session-created'), {
                userId: s.userId,
                sessionId: s.id,
                userAgent: s.userAgent ?? null,
                ip: s.ipAddress ?? null,
              })
              .catch((error: unknown) =>
                log('error', 'new sign-in check failed', { module: 'auth', error: String(error) }),
              )
          },
        },
      },
    },

    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        // Lock an email after 10 failed password attempts in 15 minutes (docs/07 §6).
        if (ctx.path === '/sign-in/email') {
          const email = String((ctx.body as { email?: unknown } | undefined)?.email ?? '')
          const retryAfterSec = await lockout.retryAfter(email)
          if (retryAfterSec > 0) {
            throw new APIError('TOO_MANY_REQUESTS', {
              code: 'ACCOUNT_LOCKED',
              message: `Too many attempts. Try again in ${Math.ceil(retryAfterSec / 60)} minutes.`,
            })
          }
        }
      }),

      after: createAuthMiddleware(async (ctx) => {
        const failed = ctx.context.returned instanceof APIError
        const sessionId = ctx.context.newSession?.session.id ?? ctx.context.session?.session.id

        if (ctx.path === '/sign-in/email') {
          const email = String((ctx.body as { email?: unknown } | undefined)?.email ?? '')
          if (failed) await lockout.recordFailure(email)
          else await lockout.reset(email)
        }
        if (failed) return

        if (
          ctx.path === '/two-factor/verify-totp' ||
          ctx.path === '/two-factor/verify-backup-code' ||
          ctx.path === '/two-factor/verify-otp'
        ) {
          if (sessionId) await identity.markTwoFactorVerified(deps.db, sessionId, new Date())
          // Verifying a code while 2FA was still off is the last step of turning it on.
          const u = ctx.context.session?.user
          if (u && !u.twoFactorEnabled && ctx.path === '/two-factor/verify-totp') {
            void send(twoFactorEmail(u, 'enabled', url))
          }
        }

        const u = ctx.context.session?.user
        if (u && ctx.path === '/two-factor/disable') void send(twoFactorEmail(u, 'disabled', url))
        if (u && ctx.path === '/two-factor/generate-backup-codes') {
          void send(twoFactorEmail(u, 'backup_codes', url))
        }
        if (u && ctx.path === '/change-password') {
          void send({
            id: 'password-changed',
            to: u.email,
            data: {
              name: u.name,
              when: new Date().toISOString(),
              device: identity.describeDevice(ctx.headers?.get('user-agent')),
              resetUrl: url('/forgot-password'),
            },
            idempotencyKey: `password-changed:${u.id}:${Date.now()}`,
          })
        }

        const signedIn = ctx.context.newSession
        if (signedIn && (ctx.path.startsWith('/sign-in') || ctx.path.startsWith('/callback'))) {
          const method = ctx.path.startsWith('/callback')
            ? 'google'
            : ctx.path === '/sign-in/email-otp'
              ? 'otp'
              : 'password'
          ctx.context.runInBackground(
            track(
              deps.systemCtx('signed-in'),
              'signed_in',
              { method },
              {
                distinctId: signedIn.user.id,
              },
            ),
          )
        }
      }),
    },
  })

  return auth
}

function twoFactorEmail(
  u: { id: string; email: string; name: string },
  change: 'enabled' | 'disabled' | 'backup_codes',
  url: (path: string) => string,
): EmailRequest {
  return {
    id: 'two-factor-changed',
    to: u.email,
    data: {
      name: u.name,
      change,
      when: new Date().toISOString(),
      securityUrl: url('/account/settings/security'),
    },
    idempotencyKey: `two-factor-changed:${u.id}:${change}:${Date.now()}`,
  }
}

export type Auth = ReturnType<typeof createAuth>

/** Core's SessionAdmin port: revokes through Better Auth so Postgres and Redis both forget. */
export function createSessionAdmin(auth: Auth, db: Db): SessionAdmin {
  return {
    async revokeSession(sessionId) {
      const [row] = await db
        .select({ token: session.token })
        .from(session)
        .where(eq(session.id, sessionId))
      if (!row) return
      const ctx = await auth.$context
      await ctx.internalAdapter.deleteSession(row.token)
    },
    async revokeAllSessions(userId, options) {
      const rows = await db
        .select({ id: session.id, token: session.token })
        .from(session)
        .where(eq(session.userId, userId))
      const ctx = await auth.$context
      for (const row of rows) {
        if (row.id !== options?.exceptSessionId) await ctx.internalAdapter.deleteSession(row.token)
      }
    },
  }
}
