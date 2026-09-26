// Local end-to-end check of Phase 1 auth flows over HTTP. Needs: the app on :3000 against a
// throwaway database seeded with demo users (SEED_PASSWORD=demo-password-2026), the Inngest Dev
// Server, and no RESEND_API_KEY so emails print to the app log. Usage:
//   node scripts/e2e-auth-local.mjs path/to/app.log
// End-to-end check of Phase 1 flows against a running app (local test DB, console emails).
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'

const BASE = 'http://localhost:3000'
const LOG = process.argv[2]
let failures = 0
const ok = (cond, msg) => {
  console.log(`${cond ? '✓' : '✗'} ${msg}`)
  if (!cond) failures++
}

class Client {
  constructor(name) {
    this.name = name
    this.jar = new Map()
  }
  cookie() {
    return [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ')
  }
  store(res) {
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';')
      const i = pair.indexOf('=')
      const k = pair.slice(0, i),
        v = pair.slice(i + 1)
      if (v === '' || /max-age=0/i.test(c)) this.jar.delete(k)
      else this.jar.set(k, v)
    }
  }
  async auth(path, body) {
    const res = await fetch(`${BASE}/api/auth${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'content-type': 'application/json', origin: BASE, cookie: this.cookie() },
      body: body ? JSON.stringify(body) : undefined,
      redirect: 'manual',
    })
    this.store(res)
    const json = await res.json().catch(() => null)
    return { status: res.status, json, headers: res.headers }
  }
  async rpc(path, input = {}) {
    const res = await fetch(`${BASE}/api/rpc/${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: BASE,
        cookie: this.cookie(),
        'x-tokslearn-client': 'web',
      },
      body: JSON.stringify({ json: input }),
    })
    const body = await res.json().catch(() => null)
    return { status: res.status, json: body?.json }
  }
}

const emailsSince = (marker) => readFileSync(LOG, 'utf8').slice(marker)
const logSize = () => readFileSync(LOG, 'utf8').length
async function waitForEmail(marker, to, pattern, ms = 20000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const text = emailsSince(marker)
    const block = text.split('[email → ').find((b) => b.startsWith(to) && pattern.test(b))
    if (block) return block
    await new Promise((r) => setTimeout(r, 500))
  }
  return null
}
function totp(secretB32) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const ch of secretB32.replace(/=+$/, '').toUpperCase())
    bits += alphabet.indexOf(ch).toString(2).padStart(5, '0')
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)))
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)))
  const h = createHmac('sha1', key).update(counter).digest()
  const o = h[h.length - 1] & 0xf
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1000000).padStart(6, '0')
}

const stamp = Date.now()
const emailA = `alice+${stamp}@example.com`
const A = new Client('alice')

// 1. Sign up → session, learner role, verification email
let mark = logSize()
let r = await A.auth('/sign-up/email', {
  name: 'Alice Test',
  email: emailA,
  password: 'correct-horse-battery-9',
  callbackURL: '/verify-email?verified=1',
})
ok(r.status === 200, `sign-up returns 200 (${r.status} ${r.json?.code ?? ''})`)
const bearer = r.headers.get('set-auth-token')
ok(Boolean(bearer), 'sign-up returns a bearer token for mobile (set-auth-token)')
ok(A.jar.get('tl_signed_in') === '1', 'signed-in hint cookie set')
let me = await A.rpc('me/get')
ok(
  me.status === 200 && me.json?.roles?.includes('learner'),
  `me.get via cookie has learner role (${me.status})`,
)
ok(
  me.json?.emailVerified === false && me.json?.hasPassword === true,
  'new account: email not verified, has password',
)

// 2. Mobile path: /api/v1/me with bearer
let res = await fetch(`${BASE}/api/v1/me`, { headers: { authorization: `Bearer ${bearer}` } })
let body = await res.json()
ok(res.status === 200 && body.email === emailA, `GET /api/v1/me with bearer works (${res.status})`)
res = await fetch(`${BASE}/api/v1/me`, {
  method: 'PATCH',
  headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' },
  body: JSON.stringify({ username: `alice_${stamp}`, headline: 'Accountant in Lagos' }),
})
body = await res.json()
ok(
  res.status === 200 && body.username === `alice_${stamp}`,
  `PATCH /api/v1/me with bearer updates profile (${res.status})`,
)

// 3. Verify email via the link in the email
let mail = await waitForEmail(mark, emailA, /Confirm your email/)
ok(Boolean(mail), 'verify-email email sent through the job')
const verifyLink = mail?.match(/https?:\/\/\S*verify-email\?token=\S+/)?.[0]
if (verifyLink) {
  const v = await fetch(verifyLink.replace(/^https?:\/\/[^/]+/, BASE), {
    redirect: 'manual',
    headers: { cookie: A.cookie() },
  })
  ok(
    v.status === 302 && (v.headers.get('location') ?? '').includes('verified=1'),
    `verification link redirects to success (${v.status})`,
  )
  me = await A.rpc('me/get')
  ok(me.json?.emailVerified === true, 'email now verified')
}

// 4. Wrong password is rejected with a generic error
const X = new Client('attacker')
r = await X.auth('/sign-in/email', { email: emailA, password: 'wrong-password-123' })
ok(
  r.status === 401 && r.json?.code === 'INVALID_EMAIL_OR_PASSWORD',
  `wrong password → 401 INVALID_EMAIL_OR_PASSWORD (${r.status})`,
)

// 5. Email code sign-in on a second "device"
const A2 = new Client('alice-phone')
mark = logSize()
r = await A2.auth('/email-otp/send-verification-otp', { email: emailA, type: 'sign-in' })
ok(r.status === 200, `send sign-in code (${r.status})`)
mail = await waitForEmail(mark, emailA, /sign-in code: \d{6}/)
const code = mail?.match(/sign-in code: (\d{6})/)?.[1]
ok(Boolean(code), 'sign-in code email arrived')
r = await A2.auth('/sign-in/email-otp', { email: emailA, otp: code })
ok(r.status === 200, `sign in with the code (${r.status})`)

// 6. Sessions: list, IDOR, revoke
const sessions = await A.rpc('me/sessions/list')
ok(
  sessions.json?.items?.length >= 2,
  `sessions list shows ${sessions.json?.items?.length} sessions`,
)
const phoneSession = sessions.json.items.find((s) => !s.current)
const B = new Client('bob')
await B.auth('/sign-up/email', {
  name: 'Bob Test',
  email: `bob+${stamp}@example.com`,
  password: 'another-long-pass-42',
})
const idor = await B.rpc('me/sessions/revoke', { sessionId: phoneSession.id })
ok(
  idor.status === 404 && idor.json?.data?.code === 'SESSION_NOT_FOUND',
  `IDOR: Bob can't revoke Alice's session (${idor.status} ${idor.json?.data?.code})`,
)
const bSessions = await B.rpc('me/sessions/list')
ok(
  !bSessions.json.items.some((s) => s.id === phoneSession.id),
  "IDOR: Bob's session list doesn't include Alice's",
)
r = await A.rpc('me/sessions/revoke', { sessionId: phoneSession.id })
ok(r.status === 200, 'Alice revokes her phone session')
me = await A2.rpc('me/get')
ok(me.status === 401, `revoked phone session is signed out (${me.status})`)

// 7. Staff: needs 2FA, then works; ban signs the user out; audit records it
const S = new Client('superadmin')
r = await S.auth('/sign-in/email', {
  email: 'superadmin@tokslearn.test',
  password: 'demo-password-2026',
})
ok(r.status === 200, `seeded super admin signs in (${r.status})`)
let search = await S.rpc('admin/users/search', { q: 'alice' })
ok(
  search.status === 403 && search.json?.data?.code === 'TWO_FACTOR_REQUIRED',
  `admin tools need 2FA first (${search.json?.data?.code})`,
)
r = await S.auth('/two-factor/enable', { password: 'demo-password-2026' })
const secret = r.json?.totpURI ? new URL(r.json.totpURI).searchParams.get('secret') : null
ok(
  Boolean(secret) && r.json.backupCodes?.length > 0,
  '2FA enable returns a TOTP URI and backup codes',
)
r = await S.auth('/two-factor/verify-totp', { code: totp(secret) })
ok(r.status === 200, `TOTP code confirms 2FA (${r.status} ${r.json?.code ?? ''})`)
search = await S.rpc('admin/users/search', { q: 'alice' })
ok(
  search.status === 200 && search.json.items.some((u) => u.email === emailA),
  `admin search works after 2FA (${search.status})`,
)
const aliceId = search.json.items.find((u) => u.email === emailA).id
const L = new Client('learner')
r = await L.rpc('admin/users/search', {})
ok(r.status === 401, `signed-out caller gets 401 on admin (${r.status})`)
r = await A.rpc('admin/users/search', {})
ok(
  r.status === 403 && r.json?.data?.code === 'STAFF_ONLY',
  `learner gets STAFF_ONLY on admin (${r.json?.data?.code})`,
)
r = await S.rpc('admin/users/setBanned', {
  userId: aliceId,
  banned: true,
  reason: 'E2E test suspension',
})
ok(r.status === 200, `super admin suspends Alice (${r.status})`)
me = await A.rpc('me/get')
ok(me.status === 401, `suspended user is signed out (${me.status})`)
r = await new Client('alice-again').auth('/sign-in/email', {
  email: emailA,
  password: 'correct-horse-battery-9',
})
ok(r.status === 403, `suspended user can't sign in (${r.status} ${r.json?.code ?? ''})`)
const audit = await S.rpc('admin/audit/list', { targetId: aliceId })
ok(
  audit.json?.items?.some((e) => e.action === 'user.ban'),
  'audit log records the suspension',
)
r = await S.rpc('admin/users/setBanned', {
  userId: aliceId,
  banned: false,
  reason: 'E2E test restore',
})
ok(r.status === 200, 'super admin restores Alice')

// 8. Admin plugin endpoints are disabled
r = await S.auth('/admin/list-users')
ok(r.status === 404, `Better Auth admin endpoints are off (${r.status})`)

// 9. Forgot password → reset link → sessions revoked
const C = new Client('bob-reset')
mark = logSize()
r = await C.auth('/request-password-reset', {
  email: `bob+${stamp}@example.com`,
  redirectTo: '/reset-password',
})
ok(r.status === 200, `request password reset (${r.status})`)
r = await C.auth('/request-password-reset', {
  email: `nobody+${stamp}@example.com`,
  redirectTo: '/reset-password',
})
ok(r.status === 200, 'same reply for an unknown email (no account enumeration)')
mail = await waitForEmail(mark, `bob+${stamp}@example.com`, /Reset your Tokslearn password/)
const resetLink = mail?.match(/https?:\/\/\S*reset-password\/\S+/)?.[0]
ok(Boolean(resetLink), 'reset email arrived')
if (resetLink) {
  const rr = await fetch(resetLink.replace(/^https?:\/\/[^/]+/, BASE), { redirect: 'manual' })
  const loc = rr.headers.get('location') ?? ''
  const token = new URL(loc, BASE).searchParams.get('token')
  ok(
    rr.status === 302 && Boolean(token),
    `reset link redirects to /reset-password?token=… (${rr.status})`,
  )
  r = await C.auth('/reset-password', { newPassword: 'brand-new-password-77', token })
  ok(r.status === 200, `reset password (${r.status})`)
  me = await B.rpc('me/get')
  ok(me.status === 401, 'reset signed out Bob’s other sessions')
  r = await new Client('bob-new').auth('/sign-in/email', {
    email: `bob+${stamp}@example.com`,
    password: 'brand-new-password-77',
  })
  ok(r.status === 200, 'Bob signs in with the new password')
}

// 10. Staff step-up paths (2FA enabled on the super admin in step 7)
await new Promise((r) => setTimeout(r, 31000)) // next TOTP window, codes are single-use
const S2 = new Client('superadmin-laptop')
r = await S2.auth('/sign-in/email', {
  email: 'superadmin@tokslearn.test',
  password: 'demo-password-2026',
})
ok(
  r.status === 200 && r.json?.twoFactorRedirect === true,
  'password sign-in with 2FA asks for the second factor',
)
r = await S2.auth('/two-factor/verify-totp', { code: totp(secret) })
ok(r.status === 200, 'TOTP completes the sign-in')
search = await S2.rpc('admin/users/search', {})
ok(search.status === 200, 'staff session verified by TOTP can use admin tools')
const S3 = new Client('superadmin-otp')
mark = logSize()
await S3.auth('/email-otp/send-verification-otp', {
  email: 'superadmin@tokslearn.test',
  type: 'sign-in',
})
mail = await waitForEmail(mark, 'superadmin@tokslearn.test', /sign-in code: \d{6}/)
r = await S3.auth('/sign-in/email-otp', {
  email: 'superadmin@tokslearn.test',
  otp: mail?.match(/sign-in code: (\d{6})/)?.[1],
})
if (r.json?.twoFactorRedirect) {
  ok(true, 'email-code sign-in also asks staff for the second factor')
} else {
  search = await S3.rpc('admin/users/search', {})
  ok(
    search.status === 403 && search.json?.data?.code === 'STEP_UP_REQUIRED',
    `email-code staff session must step up (${search.json?.data?.code})`,
  )
  await new Promise((r) => setTimeout(r, 31000))
  r = await S3.auth('/two-factor/verify-totp', { code: totp(secret) })
  search = await S3.rpc('admin/users/search', {})
  ok(
    search.status === 200,
    `after entering a TOTP code, admin tools open (${r.status}/${search.status})`,
  )
}
ok(
  readFileSync(LOG, 'utf8').includes(
    '[email → superadmin@tokslearn.test] Two-factor authentication was turned on',
  ),
  'two-factor-changed email sent',
)

console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`)
process.exit(failures ? 1 : 0)
