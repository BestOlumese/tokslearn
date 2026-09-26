# 06 — API Design (web + mobile + public)

The API is the product's spine. The web app and the future Expo app are just two clients of it.

## 1. Layers

```
packages/contract   ← oRPC contract (routes, input/output Zod schemas, error codes). No server imports.
packages/api        ← implements the contract; each procedure: middleware → core service → output mapping
apps/web/app/api/rpc/[[...rest]]/route.ts   ← RPCHandler (typed client protocol)
apps/web/app/api/v1/[[...rest]]/route.ts    ← OpenAPIHandler (REST + /api/v1/openapi.json)
```

The Expo app will depend only on `@tokslearn/contract` + `@orpc/client` + `@orpc/tanstack-query`.
If the mobile app would need to import anything from `core`, `db` or `api`, the design is wrong.

## 2. Contract example

```ts
// packages/contract/src/courses.ts
import { oc } from '@orpc/contract'
import { z } from 'zod'
import { CourseCard, CourseDetail, Cursor, Page } from './shared'

export const coursesContract = {
  list: oc
    .route({ method: 'GET', path: '/courses', tags: ['Courses'] })
    .input(z.object({
      category: z.string().optional(),
      q: z.string().max(100).optional(),
      price: z.enum(['free', 'paid', 'any']).default('any'),
      cursor: Cursor.optional(),
      limit: z.number().int().min(1).max(50).default(24),
    }))
    .output(Page(CourseCard)),

  getBySlug: oc
    .route({ method: 'GET', path: '/courses/{slug}', tags: ['Courses'] })
    .input(z.object({ slug: z.string() }))
    .output(CourseDetail)
    .errors({ NOT_FOUND: {} }),
}
```

```ts
// packages/api/src/procedures/courses.ts
import { implement } from '@orpc/server'
import { contract } from '@tokslearn/contract'
import * as catalog from '@tokslearn/core/catalog'
import { base } from '../base' // implement(contract) + context + middleware

export const coursesRouter = {
  list: base.courses.list.handler(({ input, context }) => catalog.listCourses(context.ctx, input)),
  getBySlug: base.courses.getBySlug.handler(({ input, context }) =>
    catalog.getCourseBySlug(context.ctx, input.slug)),
}
```

## 3. Rules for every procedure

1. **Input and output schemas are mandatory.** Outputs are explicit DTOs (never return Drizzle rows).
   Never include secrets, answer keys, internal notes, or other users' personal data.
2. **Auth middleware** resolves the actor from the Better Auth session (cookie on web, `Authorization: Bearer` on mobile). Procedures declare `public`, `authed`, `role('instructor')`, or `staff('finance')`.
3. **Authorization** happens in core rules, not in the procedure.
4. **Rate limits** via `@upstash/ratelimit` middleware; per-procedure policy in `packages/api/src/ratelimits.ts`
   (e.g. `auth.*` 10/min/IP, `progress.heartbeat` 6/min/user/lesson, `checkout.*` 10/min/user, `search` 60/min/IP).
5. **Idempotency:** mutating procedures that create money or irreversible state (`checkout.start`, `refunds.request`, `assignments.submit`, `exams.submit`) accept an `Idempotency-Key` header (RPC: `context.idempotencyKey`). Store response in `idempotency_keys` for 24 h.
6. **Pagination:** cursor-based. Output shape `{ items: T[], nextCursor: string | null }`.
7. **Time and money** as ISO strings and `{ amount: string, currency }`.
8. **No web-only assumptions:** no redirects, no cookies set by business procedures, no HTML in responses except sanitized `*_html` content fields; include `*_doc` JSON where a native renderer may need it.
9. **Versioning:** `/api/v1` is the stable public surface. Breaking change = new procedure name or `/api/v2`. The RPC surface follows the same contract; mobile apps pin a minimum app version (see `17`).
10. **Documentation:** every procedure has `summary` and `description` in `.route()`, so the OpenAPI spec is readable.

## 4. Errors

Stable error codes are part of the contract. Clients switch on `error.data.code`.

| oRPC code | When | Example `data.code` |
|-----------|------|---------------------|
| `UNAUTHORIZED` | no/invalid session | `SESSION_EXPIRED` |
| `FORBIDDEN` | rule violated | `NOT_ENROLLED`, `NOT_COURSE_OWNER`, `KYC_REQUIRED` |
| `NOT_FOUND` | missing resource | `COURSE_NOT_FOUND` |
| `CONFLICT` | state conflict | `ALREADY_ENROLLED`, `ATTEMPT_IN_PROGRESS` |
| `BAD_REQUEST` | schema invalid | (Zod issues in `data.issues`) |
| `UNPROCESSABLE_CONTENT` | business rule | `REFUND_WINDOW_CLOSED`, `COUPON_EXPIRED`, `LESSON_LOCKED` |
| `TOO_MANY_REQUESTS` | rate limit | `RATE_LIMITED` (+ `retryAfterSec`) |
| `SERVICE_UNAVAILABLE` | provider down | `PAYMENT_PROVIDER_UNAVAILABLE` |

Keep the full list of `data.code` values in `packages/contract/src/errors.ts` as a Zod enum.

## 5. Procedure map (v1)

Namespaces (implement per phase): `auth` (Better Auth handles most; wrapper procedures for profile), `me`,
`users`, `instructors`, `kyc`, `payoutAccounts`, `catalog`, `courses`, `studio` (instructor authoring),
`media`, `cart`, `wishlist`, `checkout`, `orders`, `coupons`, `referrals`, `enrollments`, `learn`
(player data, lesson access), `progress`, `notes`, `bookmarks`, `quizzes`, `exams`, `assignments`,
`grading`, `certificates`, `cohorts`, `community`, `live`, `reviews`, `notifications`, `earnings`,
`refunds`, `analytics`, `admin.*`.

Each phase file lists the exact procedures it adds.

## 6. Web client usage

```ts
// apps/web/lib/orpc.ts
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import { createTanstackQueryUtils } from '@orpc/tanstack-query'
import type { ContractRouterClient } from '@orpc/contract'
import type { contract } from '@tokslearn/contract'

const link = new RPCLink({ url: `${origin}/api/rpc`, fetch: (r, i) => fetch(r, { ...i, credentials: 'include' }) })
export const api: ContractRouterClient<typeof contract> = createORPCClient(link)
export const orpc = createTanstackQueryUtils(api)
```

- Server Components **do not** call `/api/rpc` over HTTP. They call core directly.
  (Optional: an in-process server-side oRPC client for code reuse — see oRPC "optimizing SSR" docs.)
- Client components use `useQuery(orpc.courses.list.queryOptions({ input }))`, mutations with
  `useMutation(orpc.cart.addItem.mutationOptions())`, then invalidate the right keys.
- Prefetch in Server Components + `HydrationBoundary` only where the client needs to refetch/mutate
  the same data (player sidebar, cart). Otherwise render server-side HTML and skip client caching.

## 7. Webhooks (inbound)

`/api/webhooks/{provider}`:
1. Read raw body. Verify signature (Paystack: HMAC SHA-512 with secret key in `x-paystack-signature`; Bunny: webhook signature/secret per docs; Daily: HMAC; Dojah: per docs). Reject otherwise with 401.
2. Insert into `payment_events`/`webhook_events` with unique provider event id. If duplicate, return 200 immediately.
3. Send an Inngest event and return 200 fast. Heavy work runs in the job (re-verifies with the provider API, e.g. Paystack `transaction/verify`, before acting).

## 8. Public API (later)

The OpenAPI surface can be opened to partners (B2B, integrations) with API keys (Better Auth `apiKey`
plugin) and per-key rate limits. Keep `/developers` behind staff auth until then.
