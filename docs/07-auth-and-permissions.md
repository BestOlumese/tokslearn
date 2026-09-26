# 07 — Auth, Roles and Permissions

## 1. Better Auth setup (`packages/auth`)

- Adapter: Drizzle (Postgres). Tables generated with the Better Auth CLI into `packages/db/src/schema/auth.ts`, then extended with our columns.
- Methods: email + password (min 10 chars, breached-password check via HIBP k-anonymity), email OTP for passwordless sign-in and verification, Google OAuth.
- Plugins (v1): `admin` (ban/impersonate for staff with audit), `twoFactor` (TOTP + backup codes), `emailOTP`, `bearer` (API/mobile tokens), `haveIBeenPwned`. Later: `organization` (Phase 13), `apiKey` (public API), `@better-auth/expo` (Phase 14).
- Session: cookie `__Secure-tokslearn.session`, `httpOnly`, `secure`, `sameSite=lax`, 30-day rolling, refreshed daily. Cookie cache enabled (short, e.g. 5 min) to avoid a DB hit per request.
- Secondary storage: Upstash Redis for sessions and rate limits (reduces DB load at scale).
- Emails (verification, OTP, reset) via Resend templates in `packages/emails`.
- Trusted origins: web domain(s) + `tokslearn://` scheme (Phase 14).

## 2. Mounting

```ts
// apps/web/app/api/auth/[...all]/route.ts
import { auth } from '@tokslearn/auth/server'
import { toNextJsHandler } from 'better-auth/next-js'
export const { GET, POST } = toNextJsHandler(auth)
```

`proxy.ts` only does cheap cookie-presence checks for redirects (e.g. `/learn`, `/teach`, `/admin` →
`/sign-in?next=`). Real checks happen in services. No DB calls in `proxy.ts`.

## 3. Roles and permissions

Roles live in `user_roles` (see `05`). Better Auth's `role` field mirrors the highest staff role for
its admin plugin; our `user_roles` table is the source of truth.

Permission matrix (implement as pure functions in `core/*/rules.ts`, tested):

| Action | Learner | Instructor (own) | TA (assigned course) | Reviewer | Finance | Support | Admin |
|--------|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Browse / buy / learn | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Create/edit course | | ✓ | | | | | ✓ |
| Publish course (approve) | | | | ✓ | | | ✓ |
| Grade assignments | | ✓ | ✓ | | | | ✓ |
| Moderate course community | | ✓ | ✓ | | | ✓ | ✓ |
| Record external exam result | | ✓ | | | | | ✓ |
| Revoke certificate | | ✓ (with reason) | | | | | ✓ |
| Approve instructor application | | | | ✓ | | | ✓ |
| Decide disputed refund | | | | | ✓ | | ✓ |
| Approve payout run | | | | | ✓ | | ✓ (super admin co-sign) |
| Change commission rules | | | | | | | super admin only |
| View user PII (email, orders) | | own learners' names only | | | ✓ | ✓ | ✓ |
| Impersonate user | | | | | | ✓ (logged, read-only mode) | ✓ |

Instructors see learner **display name and progress** for their courses, never email or phone,
unless the learner opts in (NDPA data minimization).

## 4. Two-factor requirements

- Required for: instructors (before first payout), all staff roles.
- Enforced in the service layer: payout account changes and payout-related actions require a session with `twoFactorVerified` in the last 12 hours, else `FORBIDDEN / STEP_UP_REQUIRED`.

## 5. Instructor application + KYC flow

1. Learner opens "Teach on Tokslearn" → application form (`instructors.submitApplication`).
2. KYC step (`kyc.start`): user picks BVN or NIN, enters number (sent straight to Dojah from the server; never persisted), takes selfie via Dojah widget (or our capture + Dojah API). Dojah returns name/DOB/photo match.
3. We store `kyc_checks` with status, provider reference, matched name, face-match score. If score < threshold or name mismatch → `manual_review`.
4. Bank account (`payoutAccounts.add`): list banks from Paystack, resolve account number, compare resolved name to KYC name (normalized, token-set similarity ≥ 0.85) → create Paystack transfer recipient → store recipient code + last 4 digits.
5. Reviewer reviews application in `/admin/instructors/applications` → approve (adds `instructor` role, creates `instructor_profiles`, sends email) or reject with reason.
6. Instructor can build courses immediately after approval; payouts require KYC `verified` + active payout account + 2FA.

NIMC guidance discourages storing raw NIN; use vNIN/tokenized flows where the provider supports them.

## 6. Account security

- Rate limit sign-in and OTP (per IP and per identifier). Lock after 10 failures in 15 min (exponential backoff).
- Email change requires re-verification of the new address and notice to the old.
- Password reset invalidates all sessions.
- "Active sessions" page (list/revoke) — also works for mobile tokens.
- Account deletion (NDPA): self-service request → 14-day grace → anonymize personal data; financial records kept (legal retention) but de-identified.
