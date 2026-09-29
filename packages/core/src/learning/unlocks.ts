import { sql } from 'drizzle-orm'
import { type Ctx, provider } from '../kernel/ctx'
import { sendEmail } from '../notifications'

// Drip unlock email (docs/23 `lesson-unlocked`), sent by the daily `drip-unlocks` job. One email
// per learner per course per run, listing the lessons that opened in the window. Lessons the
// learner already started (ADR-034) and free previews never locked, so they are skipped.

interface UnlockRow {
  user_id: string
  course_id: string
  lesson_id: string
  lesson_title: string
  course_title: string
  course_slug: string
  email: string
  name: string
}

/** Emails learners whose drip lessons unlocked in `(from, to]`. Returns how many emails queued. */
export async function sendUnlockEmails(
  ctx: Ctx,
  window: { from: Date; to: Date },
): Promise<{ emails: number; lessons: number }> {
  const from = window.from.toISOString()
  const to = window.to.toISOString()
  const unlockAt = sql`case c.drip_mode
      when 'after_enrollment' then e.created_at + l.drip_offset_days * interval '1 day'
      when 'fixed_dates' then l.drip_date end`
  const result = (await ctx.db.execute(sql`
    select e.user_id, e.course_id, l.id as lesson_id, l.title as lesson_title,
           r.title as course_title, c.slug as course_slug, u.email, u.name
    from enrollments e
    join courses c on c.id = e.course_id
    join course_revisions r on r.id = c.live_revision_id
    join lessons l on l.course_id = c.id
    join sections s on s.id = l.section_id
    join "user" u on u.id = e.user_id
    where e.status = 'active'
      and (e.access_expires_at is null or e.access_expires_at > ${to}::timestamptz)
      and c.status in ('published', 'unlisted') and c.deleted_at is null
      and c.drip_mode in ('after_enrollment', 'fixed_dates')
      and l.live_since is not null and l.deleted_at is null and not l.is_preview
      and ${unlockAt} > ${from}::timestamptz and ${unlockAt} <= ${to}::timestamptz
      and ${unlockAt} > e.created_at
      and not exists (
        select 1 from lesson_progress lp where lp.user_id = e.user_id and lp.lesson_id = l.id
      )
    order by e.user_id, e.course_id, s.position, l.position
  `)) as unknown as { rows: UnlockRow[] }
  const groups = new Map<string, UnlockRow[]>()
  for (const row of result.rows) {
    const key = `${row.user_id}:${row.course_id}`
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  const app = provider(ctx, 'urls').app
  for (const rows of groups.values()) {
    const [first] = rows
    if (!first) continue
    await sendEmail(ctx, {
      id: 'lesson-unlocked',
      to: first.email,
      // The first lesson in the group names the unlock, so a re-run of the same window is a no-op.
      businessKey: `${first.user_id}:${first.lesson_id}`,
      data: {
        name: first.name.split(/\s+/)[0] ?? first.name,
        courseTitle: first.course_title,
        lessons: rows.map((r) => r.lesson_title),
        url: `${app}/learn/${first.course_slug}/${first.lesson_id}`,
      },
    })
  }
  return { emails: groups.size, lessons: result.rows.length }
}
