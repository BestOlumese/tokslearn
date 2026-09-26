# Phases 12+ — Roadmap after launch

Each of these starts with: read the relevant guide sections, research the current state of the
providers involved (prices and APIs change), write an ADR, then break it into tasks in a new phase
file using the same format as earlier phases.

## Phase 12 — Subscriptions (all-access) with watch-time pool
- Paystack Plans + Subscriptions (monthly/annual), subscription status webhooks, dunning emails.
- `subscription_opt_in` toggle in studio; subscription catalog filter; subscriber access checks in `enrollments` (source `subscription`).
- Pool calculation job per `08 §11` with anti-farming caps; instructor pool statements.
- Procedures: `subscriptions.*`, `studio.courses.setSubscriptionOptIn`, `earnings.poolAllocations`.

## Phase 13 — B2B seats and organizations
- Better Auth `organization` plugin; org admin role; seat licences bought via invoice or Paystack; assign courses to members; team progress dashboard; CSV export; SSO later.
- Commission for B2B sales: separate `platform_b2b` source rule.

## Phase 14 — Mobile app (Expo, learner-only)
Follow `17 §2`. Tasks: scaffold `apps/mobile` in the monorepo; auth with `@better-auth/expo`; catalog,
course page, my learning, player (`expo-video`), offline progress queue, quizzes/exams, assignments
with file upload, certificates, community, live (Daily RN), notifications (Expo push + `push_tokens`),
deep links, EAS builds, store listings. Decide purchase approach per store rules (ADR).

## Phase 15 — DRM and offline downloads
- Enable Bunny MediaCage Enterprise DRM (Apple FairPlay package, Widevine), web player keeps working via Bunny player.
- Mobile offline downloads with persistent licences, expiry, revocation on refund, storage management UI, download-quality choice (data costs).
- Budget check against revenue before enabling (ADR-009).

## Phase 16 — Multi-currency and international payments
- Price per currency (instructor sets or auto-converted with rounding rules), currency-aware ledger accounts, second provider (Stripe/Flutterwave) behind `PaymentProvider`, FX handling for payouts.

## Later
- AI: tutor over course content (RAG over lesson transcripts/articles), quiz generation for instructors, auto-captions (Bunny transcription or Whisper-class models).
- Nigerian language UI (i18n with `next-intl`).
- Public partner API with API keys.
