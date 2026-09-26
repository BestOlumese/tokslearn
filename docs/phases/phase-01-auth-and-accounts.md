# Phase 1 — Auth and Accounts

**Prompt:** Read CLAUDE.md, `docs/07-auth-and-permissions.md`, `docs/05-database.md` (identity),
`docs/06-api-design.md`, `docs/17-mobile-readiness.md §1`. Execute Phase 1.

**Screens, errors, emails, events:** build every row marked Ph 1 in `docs/20-screen-inventory.md`, and wire the matching error codes (`21`), emails (`23`) and analytics events (`24`).

## Tasks
- [ ] Better Auth in `packages/auth` with Drizzle adapter, plugins: `admin`, `twoFactor`, `emailOTP`, `bearer`, `haveIBeenPwned`; Google OAuth; Upstash secondary storage; cookie cache.
- [ ] Schema: Better Auth tables + extensions, `user_roles`, `user_links`. Every new user gets `learner`.
- [ ] Mount `/api/auth/[...all]`. `proxy.ts` redirects for `/learn`, `/teach`, `/admin`, `/account`.
- [ ] API auth middleware: builds `Actor` from cookie or bearer. Procedure builders `publicProc`, `authedProc`, `roleProc(role)`, `staffProc(role)`, `stepUpProc` (2FA within 12 h).
- [ ] Emails (React Email + Resend): all "Account and security" templates in `docs/23-email-catalog.md`; `/styleguide/emails` preview.
- [ ] Pages: sign up, sign in (password / email code / Google), verify email, forgot/reset, 2FA setup + challenge. Clean single-column forms per `11 §5`.
- [ ] Account area: profile (name, username, headline, bio, avatar upload via R2 presign — implement `media.createFileUpload` minimal version), security (password, 2FA, active sessions list/revoke), notification preferences placeholder, delete account request.
- [ ] Procedures: `me.get`, `me.update`, `me.sessions.list`, `me.sessions.revoke`, `me.requestDeletion`, `me.exportData` (stub job), `users.getPublicProfile`.
- [ ] Rate limits on auth endpoints; lockout policy.
- [ ] Seed: super admin, staff users, learners.
- [ ] Admin: minimal `/admin/users` list + detail (search by email/username, roles, ban, sessions) with audit log entries.

## Acceptance
- [ ] Sign up → verify → sign in works with password, email OTP, Google.
- [ ] Same user can call `me.get` via `/api/v1/me` with a bearer token (mobile path proven).
- [ ] 2FA enforced for staff routes; step-up works.
- [ ] IDOR tests: user cannot read/update another user's private profile/sessions.
- [ ] Auth pages Lighthouse ≥ 95, a11y 100; design audit clean.
