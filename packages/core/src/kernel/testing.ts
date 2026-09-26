// Test helpers shared by unit and integration tests. Not exported from the package entry points.
import { type Db, newId, schema } from '@tokslearn/db'
import type { Role, UserActor } from './actor'

/** A signed-in actor. Staff helpers default to 2FA enabled and verified in this session. */
export function testUser(roles: Role[], overrides: Partial<UserActor> = {}): UserActor {
  return {
    kind: 'user',
    userId: overrides.userId ?? newId(),
    sessionId: 'session-test',
    roles,
    emailVerified: true,
    twoFactorEnabled: true,
    twoFactorVerifiedAt: new Date(),
    ...overrides,
  }
}

/** Inserts a `user` row (plus roles) so foreign keys from audit_log, files, etc. resolve. */
export async function insertUser(
  db: Db,
  input: { id?: string; roles?: Role[]; email?: string; name?: string; username?: string } = {},
): Promise<string> {
  const id = input.id ?? newId()
  await db.insert(schema.user).values({
    id,
    name: input.name ?? 'Test User',
    email: input.email ?? `${id}@example.test`,
    emailVerified: true,
    ...(input.username ? { username: input.username } : {}),
  })
  const roles = input.roles ?? ['learner']
  if (roles.length > 0) {
    await db.insert(schema.userRoles).values(roles.map((role) => ({ userId: id, role })))
  }
  return id
}
