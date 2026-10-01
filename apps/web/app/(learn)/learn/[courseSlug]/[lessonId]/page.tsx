import { isFeatureEnabled } from '@tokslearn/core/admin'
import * as certificates from '@tokslearn/core/certificates'
import { isDomainError } from '@tokslearn/core/kernel'
import * as learning from '@tokslearn/core/learning'
import * as live from '@tokslearn/core/live'
import { buttonClasses } from '@tokslearn/ui/button'
import { EmptyState } from '@tokslearn/ui/empty-state'
import { Progress } from '@tokslearn/ui/progress'
import { ArrowLeft, ArrowRight, Lock } from 'lucide-react'
import type { Metadata, Route } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Suspense } from 'react'
import { AssignmentLesson } from '@/components/learn/assignment-lesson'
import { CertificateNotice } from '@/components/learn/certificate-notice'
import { CourseOutline } from '@/components/learn/course-outline'
import { LessonTabs } from '@/components/learn/lesson-tabs'
import { MarkComplete } from '@/components/learn/mark-complete'
import { OutlineSheet } from '@/components/learn/outline-sheet'
import { PlayerKeys } from '@/components/learn/player-keys'
import { PlayerSkeleton } from '@/components/learn/player-skeleton'
import { QuizLesson } from '@/components/learn/quiz-lesson'
import { ResourceList } from '@/components/learn/resource-list'
import { VideoLesson } from '@/components/learn/video-lesson'
import { SessionCard, upcomingFirst } from '@/components/live/session-card'
import { RichHtml } from '@/components/rich-html'
import { formatDayMonth, formatDuration } from '@/lib/format'
import { sessionTime } from '@/lib/live-time'
import { requireSignedInCtx } from '@/lib/require-user'

export const metadata: Metadata = { title: 'Lesson', robots: { index: false } }

type Params = Promise<{ courseSlug: string; lessonId: string }>
type Search = Promise<{ t?: string }>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// docs/20 `/learn/[courseSlug]/[lessonId]`, docs/10 §3. Server-rendered: outline, lesson, article
// HTML. Client islands: the video, notes, downloads, shortcuts.
export default function LessonPage({
  params,
  searchParams,
}: {
  params: Params
  searchParams: Search
}) {
  return (
    <Suspense fallback={<PlayerSkeleton />}>
      <Player params={params} searchParams={searchParams} />
    </Suspense>
  )
}

type Attempt<T> = { ok: true; value: T } | { ok: false; error: unknown }
const attempt = <T,>(p: Promise<T>): Promise<Attempt<T>> =>
  p.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  )
const codeOf = (e: unknown) => (isDomainError(e) ? e.code : null)

async function Player({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { courseSlug, lessonId } = await params
  const ctx = await requireSignedInCtx(`/learn/${courseSlug}/${lessonId}`)
  if (!UUID.test(lessonId)) notFound()
  const [o, l] = await Promise.all([
    attempt(learning.getCourseOutline(ctx, courseSlug)),
    attempt(learning.getLesson(ctx, lessonId)),
  ])
  const courseHref = `/courses/${courseSlug}` as Route

  if (!o.ok) {
    const code = codeOf(o.error)
    if (code === 'COURSE_NOT_FOUND') notFound()
    if (code === 'NOT_ENROLLED') redirect(courseHref)
    if (code === 'ENROLLMENT_REVOKED') return <Revoked courseHref={courseHref} />
    throw o.error
  }
  const outline = o.value
  const communityOn = await isFeatureEnabled(ctx, 'community')
  // Learners only: teachers and staff never earn one here.
  const certificate =
    outline.role === 'learner'
      ? await certificates.myCourseCertificate(ctx, outline.course.id)
      : null
  const flat = outline.sections.flatMap((s) => s.lessons)
  const index = flat.findIndex((x) => x.id === lessonId)
  const meta = flat[index]
  if (!meta) notFound()

  let lesson: learning.LearnLesson | null = null
  let unlocksAt: Date | null = null
  if (l.ok) {
    lesson = l.value
  } else {
    const code = codeOf(l.error)
    if (code === 'LESSON_LOCKED' && isDomainError(l.error)) {
      unlocksAt = new Date(String(l.error.details.unlocksAt))
    } else if (code === 'NOT_ENROLLED') {
      redirect(courseHref)
    } else if (code === 'ENROLLMENT_REVOKED') {
      return <Revoked courseHref={courseHref} />
    } else if (code === 'LESSON_NOT_FOUND') {
      notFound()
    } else {
      throw l.error
    }
  }

  // The viewer's live classes (their run's and the course-wide ones): a Live class lesson lists
  // its own, and the Overview tab points to the next one wherever it's shown.
  const liveOn = await isFeatureEnabled(ctx, 'live_classes')
  const courseSessions = liveOn
    ? await live.listCourseSessions(ctx, { courseId: outline.course.id })
    : []
  const liveSessions =
    lesson?.type === 'live' && liveOn
      ? courseSessions.filter((x) => x.lessonId === lesson?.id)
      : null
  const nextLive = courseSessions.find((x) => x.phase === 'upcoming' || x.phase === 'open') ?? null

  const base = `/learn/${courseSlug}`
  const previous = flat[index - 1] ?? null
  const next = flat[index + 1] ?? null
  const previousHref = previous ? `${base}/${previous.id}` : null
  const nextHref = next ? `${base}/${next.id}` : null
  const t = Number.parseInt((await searchParams).t ?? '', 10)
  const outlineView = { courseSlug, sections: outline.sections }
  const outlineNode = <CourseOutline outline={outlineView} current={lessonId} />

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-border bg-surface">
        <div className="mx-auto flex h-14 w-full max-w-page items-center gap-3 px-4 sm:px-6">
          <Link
            href="/account"
            aria-label="Leave the lesson and go to My learning"
            className="-ml-2 inline-flex h-10 shrink-0 items-center gap-1.5 rounded-control px-2 text-body-sm text-ink-2 hover:bg-canvas hover:text-ink"
          >
            <ArrowLeft aria-hidden className="size-4" />
            <span className="hidden sm:inline">My learning</span>
          </Link>
          <p className="min-w-0 flex-1 truncate text-body-sm font-medium text-ink">
            {outline.course.title}
          </p>
          {outline.role === 'learner' ? (
            <span className="shrink-0 text-body-sm text-ink-2 sm:hidden">
              {outline.progressPct}%
            </span>
          ) : null}
          {outline.role === 'learner' ? (
            <Progress
              value={outline.progressPct}
              label="Course progress"
              className="hidden w-44 text-body-sm text-ink-2 sm:flex"
            />
          ) : null}
          {nextHref ? (
            <Link
              href={nextHref as Route}
              className={buttonClasses({ size: 'sm', variant: 'secondary', className: 'shrink-0' })}
            >
              Next
              <ArrowRight aria-hidden />
            </Link>
          ) : null}
        </div>
      </header>

      {outline.role === 'teaching' ? (
        <p className="bg-info-soft px-4 py-2 text-center text-body-sm text-ink">
          You’re seeing this course as its teacher. Progress isn’t saved for you.
        </p>
      ) : null}

      <div className="mx-auto grid w-full max-w-page gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:py-8">
        <div className="flex min-w-0 flex-col gap-6">
          {certificate ? (
            <CertificateNotice
              // A refresh after a pass or the last lesson brings new state: start from it.
              key={`${certificate.preparing}:${certificate.certificate?.id ?? ''}`}
              courseId={outline.course.id}
              initial={certificate}
            />
          ) : null}
          {lesson ? (
            <LessonBody
              lesson={lesson}
              startAt={Number.isFinite(t) && t >= 0 ? t : null}
              next={next && nextHref ? { href: nextHref, title: next.title } : null}
              liveSessions={liveSessions}
            />
          ) : (
            <Locked
              title={meta.title}
              unlocksAt={unlocksAt}
              nextHref={
                outline.nextLessonId && outline.nextLessonId !== lessonId
                  ? `${base}/${outline.nextLessonId}`
                  : null
              }
            />
          )}

          <div className="flex flex-wrap items-center gap-3">
            {previousHref ? (
              <Link
                href={previousHref as Route}
                className={buttonClasses({ variant: 'secondary' })}
                aria-label={`Previous lesson: ${previous?.title ?? ''}`}
              >
                <ArrowLeft aria-hidden />
                Previous
              </Link>
            ) : null}
            <OutlineSheet label="Outline">{outlineNode}</OutlineSheet>
            <div className="ml-auto flex items-center gap-3">
              {lesson && selfCompleted(lesson.type) && outline.role === 'learner' ? (
                <MarkComplete lessonId={lesson.id} done={lesson.progress.status === 'completed'} />
              ) : null}
              {nextHref ? (
                <Link
                  href={nextHref as Route}
                  className={buttonClasses()}
                  aria-label={`Next lesson: ${next?.title ?? ''}`}
                >
                  Next
                  <ArrowRight aria-hidden />
                </Link>
              ) : null}
            </div>
          </div>

          {lesson ? (
            <LessonTabs
              lessonId={lesson.id}
              courseId={lesson.courseId}
              community={communityOn ? { courseSlug } : null}
              overview={
                <Overview
                  position={index + 1}
                  total={flat.length}
                  courseTitle={outline.course.title}
                  courseHref={courseHref}
                  instructorName={outline.course.instructorName}
                  progressPct={outline.role === 'learner' ? outline.progressPct : null}
                  discussionsHref={communityOn ? (`${base}/community` as Route) : null}
                  nextLive={
                    nextLive
                      ? {
                          title: nextLive.title,
                          when: sessionTime(nextLive.startsAt, nextLive.endsAt),
                          open: nextLive.phase === 'open',
                          href: `${base}/live/${nextLive.id}` as Route,
                        }
                      : null
                  }
                  cohort={
                    outline.cohort
                      ? { name: outline.cohort.name, href: `${base}/cohort` as Route }
                      : null
                  }
                />
              }
            />
          ) : null}
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-card border border-border bg-surface p-3">
            {outlineNode}
          </div>
        </aside>
      </div>

      <PlayerKeys
        lessonId={lessonId}
        courseId={outline.course.id}
        previousHref={previousHref}
        nextHref={nextHref}
      />
    </>
  )
}

function LessonBody({
  lesson,
  startAt,
  next,
  liveSessions,
}: {
  lesson: learning.LearnLesson
  startAt: number | null
  next: { href: string; title: string } | null
  /** Live class lessons: the viewer's sessions, or null when live classes are off. */
  liveSessions: live.LiveSessionView[] | null
}) {
  const meta = lessonMeta(lesson)
  const heading = (
    <div>
      <h1 className="text-h2 text-ink">{lesson.title}</h1>
      {meta ? <p className="mt-1 text-body-sm text-ink-2">{meta}</p> : null}
    </div>
  )
  const list = (
    <ResourceList lessonId={lesson.id} resources={lesson.resources} refund={lesson.refund} />
  )
  // Files an instructor attached to a video or article sit right under it (docs/20 player).
  const files =
    lesson.resources.length > 0 ? (
      <section aria-labelledby="lesson-files" className="flex flex-col gap-3">
        <h2 id="lesson-files" className="text-h4 text-ink">
          Files for this lesson
        </h2>
        {list}
      </section>
    ) : null
  if (lesson.type === 'video') {
    return (
      <>
        <VideoLesson
          lessonId={lesson.id}
          title={lesson.title}
          durationSec={lesson.durationSec}
          posterUrl={lesson.video?.posterUrl ?? null}
          status={lesson.video?.status ?? 'processing'}
          watermark={lesson.watermark}
          startAt={startAt}
          next={next}
          initialStatus={lesson.progress.status}
        />
        {heading}
        {files}
      </>
    )
  }
  if (lesson.type === 'article') {
    return (
      <>
        {heading}
        <article className="rounded-card border border-border bg-surface p-5 sm:p-8">
          {lesson.articleHtml ? (
            <RichHtml html={lesson.articleHtml} className="text-body text-ink" />
          ) : (
            <p className="text-body text-ink-2">This article is empty.</p>
          )}
        </article>
        {files}
      </>
    )
  }
  // Quizzes, exams and assignments complete themselves on a pass or a grade (docs/10 §5, §7).
  if (lesson.type === 'quiz') {
    return (
      <>
        {heading}
        <QuizLesson lessonId={lesson.id} />
        {files}
      </>
    )
  }
  if (lesson.type === 'assignment') {
    return (
      <>
        {heading}
        <AssignmentLesson lessonId={lesson.id} />
        {files}
      </>
    )
  }
  if (lesson.type === 'resource') {
    return (
      <>
        {heading}
        {lesson.resources.length > 0 ? (
          list
        ) : (
          <p className="text-body text-ink-2">No files in this lesson yet.</p>
        )}
      </>
    )
  }
  if (lesson.type === 'live' && liveSessions) {
    return (
      <>
        {heading}
        {liveSessions.length > 0 ? (
          <div className="flex flex-col gap-4">
            {upcomingFirst(liveSessions).map((s) => (
              <SessionCard key={s.id} session={s} />
            ))}
          </div>
        ) : (
          <p className="rounded-card border border-border bg-surface p-6 text-body text-ink-2">
            No class is scheduled for this lesson yet. Once there is one, you’ll get an email the
            day before it starts.
          </p>
        )}
        {files}
      </>
    )
  }
  return (
    <>
      {heading}
      <p className="rounded-card border border-border bg-surface p-6 text-body text-ink-2">
        This kind of lesson can’t be opened on Tokslearn yet. Mark it complete to carry on.
      </p>
      {files}
    </>
  )
}

/** Lessons the learner marks complete by hand; the rest complete from what the learner does. */
const selfCompleted = (type: learning.LearnLesson['type']) =>
  type === 'article' || type === 'resource' || type === 'live'

/** The line under the title. Quizzes and assignments describe themselves in their own card. */
function lessonMeta(lesson: learning.LearnLesson): string | null {
  if (lesson.type === 'video')
    return lesson.durationSec ? formatDuration(lesson.durationSec) : 'Video'
  if (lesson.type === 'article') {
    const words = (lesson.articleHtml ?? '')
      .replace(/<[^>]+>/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
    return `${Math.max(1, Math.round(words.length / 200))} min read`
  }
  if (lesson.type === 'resource') {
    const n = lesson.resources.length
    return `${n} ${n === 1 ? 'file' : 'files'}`
  }
  if (lesson.type === 'quiz' || lesson.type === 'assignment') return null
  if (lesson.type === 'live') return 'Live class'
  return 'Lesson'
}

function Overview({
  position,
  total,
  courseTitle,
  courseHref,
  instructorName,
  progressPct,
  cohort,
  discussionsHref,
  nextLive,
}: {
  position: number
  total: number
  courseTitle: string
  courseHref: Route
  instructorName: string
  progressPct: number | null
  cohort: { name: string; href: Route } | null
  /** The course's discussions, when the `community` flag is on. */
  discussionsHref: Route | null
  /** The viewer's next live class in this course, when the `live_classes` flag is on. */
  nextLive: { title: string; when: string; open: boolean; href: Route } | null
}) {
  return (
    <div className="flex flex-col gap-3 text-body-sm text-ink-2">
      <p>
        Lesson {position} of {total} in{' '}
        <Link href={courseHref} className="font-medium text-brand-ink hover:underline">
          {courseTitle}
        </Link>{' '}
        by {instructorName}.
        {progressPct !== null ? ` You’ve finished ${progressPct}% of the course.` : ''}
      </p>
      {discussionsHref ? (
        <p>
          Questions and conversations about the whole course are in{' '}
          <Link href={discussionsHref} className="font-medium text-brand-ink hover:underline">
            Discussions
          </Link>
          .
        </p>
      ) : null}
      {nextLive ? (
        <p>
          {nextLive.open ? 'Live now: ' : 'Next live class: '}
          <Link href={nextLive.href} className="font-medium text-brand-ink hover:underline">
            {nextLive.title}
          </Link>
          , {nextLive.when} (Lagos).
        </p>
      ) : null}
      {cohort ? (
        <p>
          You’re in the {cohort.name} cohort.{' '}
          <Link href={cohort.href} className="font-medium text-brand-ink hover:underline">
            Dates, schedule and classmates
          </Link>
        </p>
      ) : null}
      <p className="hidden sm:block">
        Shortcuts: <Kbd>N</Kbd> next, <Kbd>P</Kbd> previous, <Kbd>B</Kbd> bookmark, <Kbd>M</Kbd>{' '}
        note at the current moment.
      </p>
    </div>
  )
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="rounded-sm border border-border-strong bg-canvas px-1.5 font-mono text-caption text-ink">
      {children}
    </kbd>
  )
}

function Locked({
  title,
  unlocksAt,
  nextHref,
}: {
  title: string
  unlocksAt: Date | null
  nextHref: string | null
}) {
  return (
    <div className="flex flex-col items-start gap-4 rounded-card border border-border bg-surface p-6 sm:p-8">
      <span className="flex size-10 items-center justify-center rounded-full bg-surface-sunken">
        <Lock aria-hidden className="size-5 text-ink-2" />
      </span>
      <div>
        <h1 className="text-h2 text-ink">{title}</h1>
        <p className="mt-2 max-w-prose text-body text-ink-2">
          {unlocksAt ? `This lesson opens on ${formatDayMonth(unlocksAt)}. ` : ''}
          Your instructor releases lessons on a schedule, and we’ll email you when this one opens.
        </p>
      </div>
      {nextHref ? (
        <Link href={nextHref as Route} className={buttonClasses()}>
          Go to your next lesson
        </Link>
      ) : null}
    </div>
  )
}

function Revoked({ courseHref }: { courseHref: Route }) {
  return (
    <div className="mx-auto w-full max-w-page px-4 py-16 sm:px-6">
      <EmptyState
        title="Your access to this course has ended"
        description="This happens after a refund, or when access was for a limited time. If that sounds wrong, contact us from the Help page and we’ll look into it."
        action={
          <div className="flex flex-wrap gap-3">
            <Link href={courseHref} className={buttonClasses()}>
              View the course
            </Link>
            <Link href="/help" className={buttonClasses({ variant: 'secondary' })}>
              Help
            </Link>
          </div>
        }
      />
    </div>
  )
}
