import { type DbOrTx, schema } from '@tokslearn/db'
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  max,
  ne,
  or,
  sql,
} from 'drizzle-orm'

// Owns courses, course_revisions, sections, lessons, lesson_resources, bundles, bundle_courses,
// course_staff. Foreign reads (docs/03 §3): video_assets (status, duration) and files (name) for
// the studio outline; user (names) for staff lists and the review queue.

const {
  courses,
  courseRevisions: revisions,
  sections,
  lessons,
  lessonResources: resources,
  courseStaff,
  bundles,
  bundleCourses,
  videoAssets,
  files,
  user,
} = schema

export type CourseRow = typeof courses.$inferSelect
export type RevisionRow = typeof revisions.$inferSelect
export type SectionRow = typeof sections.$inferSelect
export type LessonRow = typeof lessons.$inferSelect
export type BundleRow = typeof bundles.$inferSelect

// ─── Courses and revisions ─────────────────────────────────────────────────────────────────────

export async function getCourse(db: DbOrTx, id: string) {
  const [row] = await db
    .select()
    .from(courses)
    .where(and(eq(courses.id, id), isNull(courses.deletedAt)))
  return row
}

/** Serializes studio writes per course (autosave, reorder, submit). */
export async function lockCourse(db: DbOrTx, id: string) {
  const [row] = await db
    .select()
    .from(courses)
    .where(and(eq(courses.id, id), isNull(courses.deletedAt)))
    .for('update')
  return row
}

export async function insertCourse(db: DbOrTx, values: typeof courses.$inferInsert) {
  const [row] = await db.insert(courses).values(values).returning()
  if (!row) throw new Error('course insert returned nothing')
  return row
}

export async function updateCourse(
  db: DbOrTx,
  id: string,
  values: Partial<typeof courses.$inferInsert>,
) {
  const [row] = await db.update(courses).set(values).where(eq(courses.id, id)).returning()
  if (!row) throw new Error('course update returned nothing')
  return row
}

export async function isSlugTaken(db: DbOrTx, slug: string): Promise<boolean> {
  const [row] = await db.select({ id: courses.id }).from(courses).where(eq(courses.slug, slug))
  return Boolean(row)
}

export async function getRevision(db: DbOrTx, id: string) {
  const [row] = await db.select().from(revisions).where(eq(revisions.id, id))
  return row
}

export async function lockRevision(db: DbOrTx, id: string) {
  const [row] = await db.select().from(revisions).where(eq(revisions.id, id)).for('update')
  return row
}

export async function insertRevision(db: DbOrTx, values: typeof revisions.$inferInsert) {
  const [row] = await db.insert(revisions).values(values).returning()
  if (!row) throw new Error('revision insert returned nothing')
  return row
}

export async function updateRevision(
  db: DbOrTx,
  id: string,
  values: Partial<typeof revisions.$inferInsert>,
) {
  const [row] = await db.update(revisions).set(values).where(eq(revisions.id, id)).returning()
  if (!row) throw new Error('revision update returned nothing')
  return row
}

export async function nextRevisionNumber(db: DbOrTx, courseId: string): Promise<number> {
  const [row] = await db
    .select({ n: max(revisions.number) })
    .from(revisions)
    .where(eq(revisions.courseId, courseId))
  return (row?.n ?? 0) + 1
}

export async function revisionHistory(db: DbOrTx, courseId: string) {
  return db
    .select({
      id: revisions.id,
      number: revisions.number,
      status: revisions.status,
      reviewNotes: revisions.reviewNotes,
      submittedAt: revisions.submittedAt,
      reviewedAt: revisions.reviewedAt,
    })
    .from(revisions)
    .where(and(eq(revisions.courseId, courseId), isNotNull(revisions.submittedAt)))
    .orderBy(desc(revisions.number))
}

/** Studio list: own courses with the draft (else live) revision's title. */
export async function coursesOf(db: DbOrTx, instructorId: string) {
  return db
    .select({
      id: courses.id,
      slug: courses.slug,
      status: courses.status,
      title: revisions.title,
      revisionStatus: revisions.status,
      hasLive: sql<boolean>`${courses.liveRevisionId} is not null`,
      priceKobo: courses.priceKobo,
      updatedAt: courses.updatedAt,
    })
    .from(courses)
    .innerJoin(
      revisions,
      eq(revisions.id, sql`coalesce(${courses.draftRevisionId}, ${courses.liveRevisionId})`),
    )
    .where(and(eq(courses.instructorId, instructorId), isNull(courses.deletedAt)))
    .orderBy(desc(courses.updatedAt))
}

export async function approvedCourseCount(db: DbOrTx, instructorId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(courses)
    .where(and(eq(courses.instructorId, instructorId), isNotNull(courses.liveRevisionId)))
  return row?.n ?? 0
}

// ─── Outline ───────────────────────────────────────────────────────────────────────────────────

export async function sectionsOf(db: DbOrTx, courseId: string) {
  return db
    .select()
    .from(sections)
    .where(eq(sections.courseId, courseId))
    .orderBy(asc(sections.position), asc(sections.id))
}

export async function lessonsOf(db: DbOrTx, courseId: string) {
  return db
    .select({
      lesson: lessons,
      videoStatus: videoAssets.status,
      videoFilename: videoAssets.filename,
      videoDurationSec: videoAssets.durationSec,
      videoError: videoAssets.error,
    })
    .from(lessons)
    .leftJoin(videoAssets, eq(videoAssets.id, lessons.videoAssetId))
    .where(and(eq(lessons.courseId, courseId), isNull(lessons.deletedAt)))
    .orderBy(asc(lessons.position), asc(lessons.id))
}

export async function resourcesOf(db: DbOrTx, lessonIds: ReadonlyArray<string>) {
  if (lessonIds.length === 0) return []
  return db
    .select({
      id: resources.id,
      lessonId: resources.lessonId,
      fileId: resources.fileId,
      title: resources.title,
      isImportant: resources.isImportant,
      position: resources.position,
      mime: files.mime,
      sizeBytes: files.sizeBytes,
      bucket: files.bucket,
      key: files.key,
    })
    .from(resources)
    .innerJoin(files, eq(files.id, resources.fileId))
    .where(inArray(resources.lessonId, [...lessonIds]))
    .orderBy(asc(resources.position), asc(resources.id))
}

export async function getSection(db: DbOrTx, id: string) {
  const [row] = await db.select().from(sections).where(eq(sections.id, id))
  return row
}

export async function getLesson(db: DbOrTx, id: string) {
  const [row] = await db
    .select()
    .from(lessons)
    .where(and(eq(lessons.id, id), isNull(lessons.deletedAt)))
  return row
}

export async function getResource(db: DbOrTx, id: string) {
  const [row] = await db.select().from(resources).where(eq(resources.id, id))
  return row
}

export async function insertSection(db: DbOrTx, values: typeof sections.$inferInsert) {
  const [row] = await db.insert(sections).values(values).returning()
  if (!row) throw new Error('section insert returned nothing')
  return row
}

export async function updateSection(
  db: DbOrTx,
  id: string,
  values: Partial<typeof sections.$inferInsert>,
) {
  await db.update(sections).set(values).where(eq(sections.id, id))
}

export async function deleteSection(db: DbOrTx, id: string) {
  await db.delete(sections).where(eq(sections.id, id))
}

export async function insertLesson(db: DbOrTx, values: typeof lessons.$inferInsert) {
  const [row] = await db.insert(lessons).values(values).returning()
  if (!row) throw new Error('lesson insert returned nothing')
  return row
}

export async function updateLesson(
  db: DbOrTx,
  id: string,
  values: Partial<typeof lessons.$inferInsert>,
) {
  await db.update(lessons).set(values).where(eq(lessons.id, id))
}

/** Hard delete, only for lessons that were never live (with their resources). */
export async function deleteLessons(db: DbOrTx, ids: ReadonlyArray<string>) {
  if (ids.length === 0) return
  await db.delete(resources).where(inArray(resources.lessonId, [...ids]))
  await db.delete(lessons).where(inArray(lessons.id, [...ids]))
}

export async function insertResource(db: DbOrTx, values: typeof resources.$inferInsert) {
  const [row] = await db.insert(resources).values(values).returning()
  if (!row) throw new Error('resource insert returned nothing')
  return row
}

export async function updateResource(
  db: DbOrTx,
  id: string,
  values: Partial<typeof resources.$inferInsert>,
) {
  await db.update(resources).set(values).where(eq(resources.id, id))
}

export async function deleteResource(db: DbOrTx, id: string) {
  await db.delete(resources).where(eq(resources.id, id))
}

export async function maxSectionPosition(db: DbOrTx, courseId: string): Promise<number> {
  const [row] = await db
    .select({ n: max(sections.position) })
    .from(sections)
    .where(eq(sections.courseId, courseId))
  return row?.n ?? -1
}

export async function maxLessonPosition(db: DbOrTx, sectionId: string): Promise<number> {
  const [row] = await db
    .select({ n: max(lessons.position) })
    .from(lessons)
    .where(and(eq(lessons.sectionId, sectionId), isNull(lessons.deletedAt)))
  return row?.n ?? -1
}

export async function lessonsWithVideo(db: DbOrTx, videoAssetId: string) {
  return db
    .select({ id: lessons.id, courseId: lessons.courseId, liveSince: lessons.liveSince })
    .from(lessons)
    .where(and(eq(lessons.videoAssetId, videoAssetId), isNull(lessons.deletedAt)))
}

/** On approval: new items go live; items marked for removal leave. */
export async function applyStructure(db: DbOrTx, courseId: string, at: Date) {
  const removedSections = db
    .select({ id: sections.id })
    .from(sections)
    .where(and(eq(sections.courseId, courseId), isNotNull(sections.removalRequestedAt)))
  await db
    .update(lessons)
    .set({ deletedAt: at })
    .where(
      and(
        eq(lessons.courseId, courseId),
        isNull(lessons.deletedAt),
        or(isNotNull(lessons.removalRequestedAt), inArray(lessons.sectionId, removedSections)),
      ),
    )
  await db
    .update(sections)
    .set({ liveSince: at })
    .where(
      and(
        eq(sections.courseId, courseId),
        isNull(sections.liveSince),
        isNull(sections.removalRequestedAt),
      ),
    )
  await db
    .update(lessons)
    .set({ liveSince: at })
    .where(
      and(eq(lessons.courseId, courseId), isNull(lessons.liveSince), isNull(lessons.deletedAt)),
    )
}

/** Live totals shown on course cards: live, not removed lessons only. */
export async function recomputeTotals(db: DbOrTx, courseId: string) {
  const [row] = await db
    .select({
      n: count(),
      sec: sql<number>`coalesce(sum(${lessons.durationSec}), 0)::int`,
    })
    .from(lessons)
    .innerJoin(sections, eq(sections.id, lessons.sectionId))
    .where(
      and(
        eq(lessons.courseId, courseId),
        isNull(lessons.deletedAt),
        isNotNull(lessons.liveSince),
        isNull(sections.removalRequestedAt),
      ),
    )
  await db
    .update(courses)
    .set({ lessonCount: row?.n ?? 0, totalDurationSec: row?.sec ?? 0 })
    .where(eq(courses.id, courseId))
}

// ─── Staff ─────────────────────────────────────────────────────────────────────────────────────

export async function isCourseStaff(db: DbOrTx, courseId: string, userId: string) {
  const [row] = await db
    .select({ id: courseStaff.id })
    .from(courseStaff)
    .where(and(eq(courseStaff.courseId, courseId), eq(courseStaff.userId, userId)))
  return Boolean(row)
}

export async function staffOf(db: DbOrTx, courseId: string) {
  return db
    .select({
      id: courseStaff.id,
      userId: courseStaff.userId,
      role: courseStaff.role,
      name: user.name,
      username: user.username,
      createdAt: courseStaff.createdAt,
    })
    .from(courseStaff)
    .innerJoin(user, eq(user.id, courseStaff.userId))
    .where(eq(courseStaff.courseId, courseId))
    .orderBy(asc(courseStaff.createdAt))
}

export async function insertStaff(db: DbOrTx, values: typeof courseStaff.$inferInsert) {
  await db.insert(courseStaff).values(values)
}

export async function deleteStaff(db: DbOrTx, courseId: string, staffId: string) {
  const rows = await db
    .delete(courseStaff)
    .where(and(eq(courseStaff.id, staffId), eq(courseStaff.courseId, courseId)))
    .returning({ id: courseStaff.id })
  return rows.length > 0
}

export async function findUserByEmailOrUsername(db: DbOrTx, value: string) {
  const v = value.trim().toLowerCase().replace(/^@/, '')
  const [row] = await db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(and(or(eq(user.email, v), eq(user.username, v)), isNull(user.deletedAt)))
  return row
}

// ─── Review queue ──────────────────────────────────────────────────────────────────────────────

export async function submittedRevisions(db: DbOrTx) {
  return db
    .select({
      revisionId: revisions.id,
      courseId: courses.id,
      title: revisions.title,
      number: revisions.number,
      submittedAt: revisions.submittedAt,
      isUpdate: sql<boolean>`${courses.liveRevisionId} is not null`,
      instructorName: user.name,
    })
    .from(revisions)
    .innerJoin(courses, eq(courses.id, revisions.courseId))
    .innerJoin(user, eq(user.id, courses.instructorId))
    .where(and(eq(revisions.status, 'submitted'), isNull(courses.deletedAt)))
    .orderBy(asc(revisions.submittedAt), asc(revisions.id))
    .limit(200)
}

export async function userName(db: DbOrTx, id: string) {
  const [row] = await db
    .select({ name: user.name, email: user.email })
    .from(user)
    .where(eq(user.id, id))
  return row
}

// ─── Bundles ───────────────────────────────────────────────────────────────────────────────────

export async function bundlesOf(db: DbOrTx, instructorId: string) {
  return db
    .select()
    .from(bundles)
    .where(and(eq(bundles.instructorId, instructorId), ne(bundles.status, 'archived')))
    .orderBy(desc(bundles.updatedAt))
}

export async function getBundle(db: DbOrTx, id: string) {
  const [row] = await db.select().from(bundles).where(eq(bundles.id, id))
  return row
}

export async function isBundleSlugTaken(db: DbOrTx, slug: string, exceptId?: string) {
  const [row] = await db
    .select({ id: bundles.id })
    .from(bundles)
    .where(
      exceptId ? and(eq(bundles.slug, slug), ne(bundles.id, exceptId)) : eq(bundles.slug, slug),
    )
  return Boolean(row)
}

export async function insertBundle(db: DbOrTx, values: typeof bundles.$inferInsert) {
  const [row] = await db.insert(bundles).values(values).returning()
  if (!row) throw new Error('bundle insert returned nothing')
  return row
}

export async function updateBundle(
  db: DbOrTx,
  id: string,
  values: Partial<typeof bundles.$inferInsert>,
) {
  const [row] = await db.update(bundles).set(values).where(eq(bundles.id, id)).returning()
  if (!row) throw new Error('bundle update returned nothing')
  return row
}

export async function bundleCourseIds(db: DbOrTx, bundleIds: ReadonlyArray<string>) {
  if (bundleIds.length === 0) return []
  return db
    .select({ bundleId: bundleCourses.bundleId, courseId: bundleCourses.courseId })
    .from(bundleCourses)
    .where(inArray(bundleCourses.bundleId, [...bundleIds]))
    .orderBy(asc(bundleCourses.position))
}

export async function setBundleCourses(
  db: DbOrTx,
  bundleId: string,
  courseIds: ReadonlyArray<string>,
) {
  await db.delete(bundleCourses).where(eq(bundleCourses.bundleId, bundleId))
  if (courseIds.length > 0) {
    await db
      .insert(bundleCourses)
      .values(courseIds.map((courseId, position) => ({ bundleId, courseId, position })))
  }
}

export async function coursesByIds(db: DbOrTx, ids: ReadonlyArray<string>) {
  if (ids.length === 0) return []
  return db
    .select()
    .from(courses)
    .where(and(inArray(courses.id, [...ids]), isNull(courses.deletedAt)))
}
