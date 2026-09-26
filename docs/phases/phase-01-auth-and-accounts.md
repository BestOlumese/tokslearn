# Phase 1 — Auth and Accounts

**Prompt:** Read CLAUDE.md, `docs/07-auth-and-permissions.md`, `docs/05-database.md` (identity),
`docs/06-api-design.md`, `docs/17-mobile-readiness.md §1`. Execute Phase 1.

**Screens, errors, emails, events:** build every row marked Ph 1 in `docs/20-screen-inventory.md`, and wire the matching error codes (`21`), emails (`23`) and analytics events (`24`).

## Tasks
- [x] Better Auth in `packages/auth` with Drizzle adapter, plugins: `admin`, `twoFactor`, `emailOTP`, `bearer`, `haveIBeenPwned`; Google OAuth; Upstash secondary storage; cookie cache.
  - _Better Auth 1.7.6: Drizzle, Upstash secondary storage, sessions also in Postgres, email/password, email OTP, Google, 2FA, bearer. HIBP is our own fail-open hook, not the plugin; the admin plugin's HTTP endpoints are disabled (ADR-029)._
- [x] Schema: Better Auth tables + extensions, `user_roles`, `user_links`. Every new user gets `learner`.
  - _Migration `0001_phase1_identity`; `onUserCreated` grants `learner` (integration-tested)._
- [x] Mount `/api/auth/[...all]`. `proxy.ts` redirects for `/learn`, `/teach`, `/admin`, `/account`.
  - _`proxy.ts` redirects `/learn`, `/account`, `/admin` and studio pages under `/teach/…`; `/teach` itself stays public._
- [x] API auth middleware: builds `Actor` from cookie or bearer. Procedure builders `publicProc`, `authedProc`, `roleProc(role)`, `staffProc(role)`, `stepUpProc` (2FA within 12 h).
  - _`pub`, `authed`, `role(…)`, `staff(…)`, `stepUp` in packages/api/src/base.ts; the actor comes from cookie or bearer._
- [x] Emails (React Email + Resend): all "Account and security" templates in `docs/23-email-catalog.md`; `/styleguide/emails` preview.
  - _All 9 account/security templates with text versions and render tests; previews at `/styleguide/emails`._
- [x] Pages: sign up, sign in (password / email code / Google), verify email, forgot/reset, 2FA setup + challenge. Clean single-column forms per `11 §5`.
  - _Sign-up, sign-in, email code, verify email, forgot/reset password, 2FA challenge; 2FA setup is on the security page._
- [x] Account area: profile (name, username, headline, bio, avatar upload via R2 presign — implement `media.createFileUpload` minimal version), security (password, 2FA, active sessions list/revoke), notification preferences placeholder, delete account request.
  - _Profile (name, username, headline, bio, links, photo via presigned R2 upload), security (password, 2FA with QR + backup codes, sessions), notifications placeholder, privacy (export stub, 14-day deletion + cancel)._
- [x] Procedures: `me.get`, `me.update`, `me.sessions.list`, `me.sessions.revoke`, `me.requestDeletion`, `me.exportData` (stub job), `users.getPublicProfile`.
  - _All listed procedures, plus `me.sessions.revokeOthers`, `me.cancelDeletion`, `media.createFileUpload`, `media.completeFileUpload`, `admin.users.*`, `admin.audit.list`. `me.exportData` queues a stub job._
- [x] Rate limits on auth endpoints; lockout policy.
  - _Better Auth per-endpoint limits (sign-in 10/min, sign-up 5/min, code sends 3/min) plus a per-email lockout: 10 failures in 15 min, doubling._
- [x] Seed: super admin, staff users, learners.
  - _15 demo users with fixed ids (non-production only); `seed:passwords` and a `grant-role` bootstrap script._
- [x] Admin: minimal `/admin/users` list + detail (search by email/username, roles, ban, sessions) with audit log entries.
  - _Search, role filter, cursor pages; detail with roles, suspend/restore, sign out everywhere, sessions and audit trail. `/admin/audit` too. Every action needs a reason and is audited._

## Acceptance
- [x] Sign up → verify → sign in works with password, email OTP, Google.
  - _Password and email code verified end to end (scripts/e2e-auth-local.mjs, 45 checks). 2026-09-26 on production: sign-up, verification and reset emails (Resend via Inngest `email-send`), email code, Google (callback `https://tokslearn.vercel.app/api/auth/callback/google`), 2FA and photo upload confirmed by the owner._
- [x] Same user can call `me.get` via `/api/v1/me` with a bearer token (mobile path proven).
  - _GET and PATCH `/api/v1/me` with the `set-auth-token` bearer, verified end to end._
- [x] 2FA enforced for staff routes; step-up works.
  - _Staff without 2FA get TWO_FACTOR_REQUIRED; email-code sign-ins get STEP_UP_REQUIRED until a TOTP code; verified end to end and in integration tests._
- [x] IDOR tests: user cannot read/update another user's private profile/sessions.
  - _Session revoke/list across users (e2e + integration), other users' files for avatars (integration), public profile never shows email._
- [x] Auth pages Lighthouse ≥ 95, a11y 100; design audit clean.
  - _Local production build: /sign-in 99, /sign-up 99, /sign-in/code 99, /forgot-password 99; accessibility 100 on all. First-load JS 143.5–144.8 KB (budget 145). avoid-ai-design: 0 P0, 0 P1; copy check clean._

**Status (2026-09-26): Phase 1 accepted.** Live on https://tokslearn.vercel.app. Setup lessons: Inngest must be resynced (or auto-synced by the Vercel integration) when a phase adds functions; `BETTER_AUTH_URL` is Production-only; provider env vars are part of the Turborepo build hash.
