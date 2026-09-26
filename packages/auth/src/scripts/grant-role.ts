// Bootstrap: grants a role to an existing account by email, e.g. the founder's super_admin on a
// fresh database where no admin exists yet to use /admin/users. Audited as a system action.
//   DATABASE_URL=… pnpm --filter @tokslearn/auth grant-role you@example.com super_admin

import { mirroredRole } from '@tokslearn/core/identity'
import { roles } from '@tokslearn/core/kernel'
import { createDb, schema } from '@tokslearn/db'
import { eq } from 'drizzle-orm'

const [email, role] = process.argv.slice(2)
const url = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL
if (!url) throw new Error('Set DATABASE_URL')
const valid = roles.find((r) => r === role)
if (!email || !valid) throw new Error(`Usage: grant-role <email> <${roles.join('|')}>`)

const { db, close } = createDb(url, { max: 1, tcp: true })
try {
  const [u] = await db.select().from(schema.user).where(eq(schema.user.email, email.toLowerCase()))
  if (!u) throw new Error(`No account for ${email}. Sign up first, then run this again.`)
  await db.transaction(async (tx) => {
    await tx.insert(schema.userRoles).values({ userId: u.id, role: valid }).onConflictDoNothing()
    const current = await tx
      .select({ role: schema.userRoles.role })
      .from(schema.userRoles)
      .where(eq(schema.userRoles.userId, u.id))
    await tx
      .update(schema.user)
      .set({ role: mirroredRole(current.map((r) => r.role)) })
      .where(eq(schema.user.id, u.id))
    await tx.insert(schema.auditLog).values({
      actorKind: 'system',
      action: 'user.role_grant',
      targetType: 'user',
      targetId: u.id,
      after: { role: valid, via: 'grant-role script' },
      requestId: 'cli',
    })
  })
  console.info(`${email} now has ${valid}. Turn on two-factor before opening /admin.`)
} finally {
  await close()
}
