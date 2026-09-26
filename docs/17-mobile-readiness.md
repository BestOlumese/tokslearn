# 17 — Mobile Readiness (do these now) and the Mobile Phase

The mobile app is a learner-only Expo app (ADR-016). The goal: when Phase 14 starts, building it is
mostly UI work, because the API, auth, data shapes and business rules already exist.

## 1. Rules while building the web app (Phases 0–11)

1. **Every learner action is an oRPC procedure** in the contract (browse, search, wishlist, cart, checkout start/confirm, enroll free, learn/playback, progress heartbeat + `progress.syncBatch`, notes, bookmarks, quizzes/exams, assignments with file upload, certificates list/download, community read/post, live join, reviews, notifications, profile, sessions). The mobile parity test (`15 §2`) enforces this.
2. **No web-only business flows.** Nothing essential may live in Server Actions, route handlers outside oRPC/auth/webhooks, or `proxy.ts`.
3. **Auth works with bearer tokens** (Better Auth `bearer` plugin enabled from Phase 1). Test the API with a token, not only cookies.
4. **Content is renderable natively:** rich text stored as Tiptap JSON (`*_doc`) alongside sanitized HTML; images have explicit dimensions; video playback returns an HLS URL option in addition to the embed URL (`learn.playback` returns `{ embedUrl, hlsUrl, expiresAt }`).
5. **Uploads use presigned URLs** (works from React Native) — never multipart through our API.
6. **Money/time/ids are strings** in DTOs; no JS-only types.
7. **Pagination is cursor-based** (infinite lists on mobile).
8. **Errors have stable codes** the app can map to messages.
9. **Deep-linkable URLs**: every learner screen has a canonical web URL; the app will register universal links/app links for `tokslearn.com/learn/*`, `/courses/*`, `/verify/*`.
10. **`@tokslearn/contract` builds standalone** (tsup/tsc to ESM + types) with zero server dependencies. CI checks this by building it in isolation.
11. **Minimum client version**: API reads `x-tokslearn-client: web|ios@1.2.0|android@1.2.0`; a `config.get` procedure returns `minSupportedVersion` so old apps can prompt to update.

## 2. Phase 14 plan (summary — full tasks in `phases/phase-12-plus-roadmap.md`)

- `apps/mobile`: Expo (latest stable SDK at the time — SDK 57 as of Sept 2026), Expo Router, TypeScript, New Architecture.
- Styling: NativeWind or Tamagui? Decide by ADR at phase start; share **tokens** (colors, spacing, type) from `packages/ui/tokens` (exported as JSON too), not components.
- Data: `@orpc/client` + `@orpc/tanstack-query` against `/api/rpc`, TanStack Query persistence (MMKV) for offline read cache.
- Auth: `@better-auth/expo` (SecureStore), Google sign-in via ID token.
- Video: `expo-video` with HLS; progress heartbeats queued offline and synced with `progress.syncBatch`.
- Payments: decide store-policy approach (link out to web checkout vs in-app purchase) — research current Apple/Google rules and Nigerian market practice at phase start; record ADR.
- Push: Expo Notifications; `push_tokens` table; notifications module adds the push channel.
- Live: `@daily-co/react-native-daily-js`.
- Releases: EAS Build, EAS Update for JS fixes, staged rollouts.
- Install the `vercel-react-native-skills` skill for the agent (see `18`).
