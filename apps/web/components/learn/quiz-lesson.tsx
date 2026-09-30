'use client'
// Client component: quiz and exam lessons (docs/20 quiz and exam lessons, docs/10 §5–6).
// Intro (or the exam's rules screen) → the attempt → results. The server keeps the clock and the
// answers; this component shows them, autosaves, and keeps unsent answers on the device until
// the connection is back.

import type { AttemptDto, QuizIntroDto } from '@tokslearn/contract'
import { Button } from '@tokslearn/ui/button'
import { Checkbox } from '@tokslearn/ui/checkbox'
import { cn } from '@tokslearn/ui/cn'
import { Dialog, DialogContent, DialogFooter } from '@tokslearn/ui/dialog'
import { Label } from '@tokslearn/ui/label'
import { Check, Flag, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { RichHtml } from '@/components/rich-html'
import { formatDateTime } from '@/lib/format'
import {
  getAttempt,
  LearnError,
  logIntegrity,
  quizIntro,
  saveAttemptAnswer,
  startAttempt,
  submitAttempt,
} from '@/lib/learn-api'
import { correctAnswerText, isAnswered, QuestionInput } from './question-input'

const kindLabel = { practice: 'Practice quiz', graded: 'Quiz', exam: 'Certification exam' } as const
const failed = (e: unknown) =>
  e instanceof LearnError ? e.message : 'Something went wrong. Try again.'
const clockText = (sec: number) => {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return `${h ? `${h}:` : ''}${h ? String(m).padStart(2, '0') : m}:${String(s % 60).padStart(2, '0')}`
}
const minutesText = (sec: number) => {
  const m = Math.round(sec / 60)
  return m >= 60 && m % 60 === 0 ? `${m / 60} ${m === 60 ? 'hour' : 'hours'}` : `${m} minutes`
}

export function QuizLesson({ lessonId }: { lessonId: string }) {
  const router = useRouter()
  const [intro, setIntro] = useState<QuizIntroDto | null>(null)
  const [attempt, setAttempt] = useState<AttemptDto | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadIntro = useCallback(async () => {
    try {
      setIntro(await quizIntro(lessonId))
    } catch (e) {
      setError(failed(e))
    }
  }, [lessonId])

  useEffect(() => {
    void loadIntro()
  }, [loadIntro])

  const finish = (done: AttemptDto, message: string | null) => {
    setAttempt(done)
    setNotice(message)
    void loadIntro()
    // A pass may have completed the lesson: redraw the outline and progress.
    router.refresh()
  }

  if (error)
    return (
      <p
        role="alert"
        className="rounded-card border border-border bg-surface p-6 text-body text-danger"
      >
        {error}
      </p>
    )
  if (!intro) return <div className="h-64 animate-pulse rounded-card bg-surface-sunken" />
  if (attempt?.status === 'in_progress') {
    return <AttemptRunner attempt={attempt} exam={intro.kind === 'exam'} onDone={finish} />
  }
  if (attempt) {
    return (
      <AttemptResult
        attempt={attempt}
        intro={intro}
        notice={notice}
        onAgain={() => {
          setAttempt(null)
          setNotice(null)
        }}
      />
    )
  }
  return (
    <Intro
      intro={intro}
      onStarted={setAttempt}
      onOpenAttempt={async (id) => {
        try {
          setAttempt(await getAttempt(id))
        } catch (e) {
          setError(failed(e))
        }
      }}
      lessonId={lessonId}
    />
  )
}

// ─── Intro and exam rules ────────────────────────────────────────────────────────────────────

function Intro({
  intro,
  lessonId,
  onStarted,
  onOpenAttempt,
}: {
  intro: QuizIntroDto
  lessonId: string
  onStarted: (a: AttemptDto) => void
  onOpenAttempt: (attemptId: string) => void
}) {
  const exam = intro.kind === 'exam'
  const [agreed, setAgreed] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const left = intro.attemptsAllowed === null ? null : intro.attemptsAllowed - intro.attemptsUsed
  const blocked =
    left === 0
      ? 'You’ve used all your attempts.'
      : intro.availableAt
        ? `You can try again from ${formatDateTime(intro.availableAt)}.`
        : exam && intro.lessonsRemaining > 0
          ? `Finish the other ${intro.lessonsRemaining === 1 ? 'lesson' : `${intro.lessonsRemaining} lessons`} first, then come back for the exam.`
          : intro.questionCount === 0
            ? `This ${exam ? 'exam' : 'quiz'} has no questions yet. Check back later.`
            : null

  const start = async () => {
    setStarting(true)
    setError(null)
    try {
      if (exam && document.documentElement.requestFullscreen && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen().catch(() => undefined)
      }
      onStarted(await startAttempt(lessonId, exam))
    } catch (e) {
      if (e instanceof LearnError && e.code === 'ATTEMPT_IN_PROGRESS' && intro.inProgress) {
        onOpenAttempt(intro.inProgress.attemptId)
        return
      }
      setError(failed(e))
    } finally {
      setStarting(false)
    }
  }

  const facts = [
    `${intro.questionCount} ${intro.questionCount === 1 ? 'question' : 'questions'}`,
    intro.timeLimitSec ? `${minutesText(intro.timeLimitSec)}, timed` : 'No time limit',
    intro.passPct > 0 ? `Pass mark ${intro.passPct}%` : null,
    left === null ? 'Unlimited attempts' : `${left} ${left === 1 ? 'attempt' : 'attempts'} left`,
  ].filter(Boolean)

  return (
    <div className="flex flex-col gap-5 rounded-card border border-border bg-surface p-5 sm:p-8">
      <div>
        <p className="text-caption font-semibold text-ink-3 uppercase">{kindLabel[intro.kind]}</p>
        <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-body text-ink">
          {facts.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </div>

      {intro.lastAttempt && intro.lastAttempt.status !== 'in_progress' ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-control bg-canvas p-4">
          <p className="text-body text-ink">
            {intro.lastAttempt.status === 'void'
              ? 'Your last attempt was cancelled by the instructor.'
              : `Last attempt: ${Math.floor(intro.lastAttempt.pct ?? 0)}%${intro.lastAttempt.passed ? ', passed' : intro.passPct > 0 ? ', not passed yet' : ''}.`}
          </p>
          {intro.lastAttempt.status !== 'void' ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onOpenAttempt(intro.lastAttempt?.attemptId ?? '')}
            >
              See the result
            </Button>
          ) : null}
        </div>
      ) : null}

      {exam && !intro.inProgress ? (
        <div className="flex flex-col gap-3">
          <h2 className="text-h4 text-ink">Before you start</h2>
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-body text-ink-2">
            {intro.timeLimitSec ? (
              <li>
                You have {minutesText(intro.timeLimitSec)} from the moment you start. The clock
                keeps running if you close the page, and your answers are submitted when time is up.
              </li>
            ) : null}
            <li>
              We record, and your instructor can see: when you leave the exam tab and for how long,
              when you leave fullscreen, attempts to paste into an answer, and if your network
              changes. Nothing stops you; your instructor decides what it means.
            </li>
            {intro.oneQuestionPerScreen ? (
              <li>You’ll see one question at a time and can move back and forth.</li>
            ) : null}
            {intro.showAnswers === 'never' ? (
              <li>You’ll see your score, not the answers.</li>
            ) : null}
          </ul>
          {intro.endsRefund ? (
            <p className="rounded-control border border-warning/40 bg-warning-soft p-3 text-body text-ink">
              Starting the exam ends your right to a refund for this course.
            </p>
          ) : null}
          {!blocked ? (
            <div className="flex items-start gap-2">
              <Checkbox
                id="exam-agree"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5"
              />
              <Label htmlFor="exam-agree" kind="option">
                I understand what’s recorded
                {intro.endsRefund ? ' and that I can’t get a refund after starting' : ''}.
              </Label>
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-body-sm text-danger">
          {error}
        </p>
      ) : null}
      {intro.inProgress ? (
        <Button className="w-fit" onClick={() => onOpenAttempt(intro.inProgress?.attemptId ?? '')}>
          Continue your attempt
        </Button>
      ) : blocked ? (
        <p className="text-body text-ink-2">{blocked}</p>
      ) : (
        <Button
          className="w-fit"
          loading={starting}
          disabled={exam && !agreed}
          onClick={() => void start()}
        >
          {exam ? 'Start the exam' : intro.attemptsUsed > 0 ? 'Try again' : 'Start'}
        </Button>
      )}
    </div>
  )
}

// ─── Taking it ───────────────────────────────────────────────────────────────────────────────

type SaveState = 'saved' | 'saving' | 'offline'

function AttemptRunner({
  attempt,
  exam,
  onDone,
}: {
  attempt: AttemptDto
  exam: boolean
  onDone: (a: AttemptDto, notice: string | null) => void
}) {
  const storeKey = `tl:attempt:${attempt.id}`
  const [answers, setAnswers] = useState<Record<string, unknown>>(() => {
    // Answers that didn't reach the server last time are still on this device.
    try {
      const local = JSON.parse(localStorage.getItem(storeKey) ?? '{}') as Record<string, unknown>
      return { ...attempt.answers, ...local }
    } catch {
      return attempt.answers
    }
  })
  const [state, setState] = useState<SaveState>('saved')
  const [flagged, setFlagged] = useState<Set<string>>(new Set())
  const [index, setIndex] = useState(0)
  const [confirming, setConfirming] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pending = useRef(new Map<string, unknown>())
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null)
  const offset = useRef(Date.parse(attempt.serverNow) - Date.now())
  const [now, setNow] = useState(() => Date.now())
  const closed = useRef(false)
  const questions = attempt.questions
  const deadline = attempt.deadlineAt ? Date.parse(attempt.deadlineAt) : null
  const remaining = deadline === null ? null : (deadline - (now + offset.current)) / 1000

  const remember = useCallback(() => {
    try {
      if (pending.current.size === 0) localStorage.removeItem(storeKey)
      else localStorage.setItem(storeKey, JSON.stringify(Object.fromEntries(pending.current)))
    } catch {}
  }, [storeKey])

  const closeWith = useCallback(
    async (message: string | null) => {
      if (closed.current) return
      closed.current = true
      try {
        const done = await submitAttempt(exam, attempt.id)
        try {
          localStorage.removeItem(storeKey)
        } catch {}
        if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined)
        onDone(done, message)
      } catch (e) {
        closed.current = false
        setError(failed(e))
      }
    },
    [attempt.id, exam, onDone, storeKey],
  )

  const flush = useCallback(async () => {
    if (retry.current) clearTimeout(retry.current)
    const batch = [...pending.current]
    if (batch.length === 0) return true
    setState('saving')
    for (const [questionId, answer] of batch) {
      try {
        await saveAttemptAnswer(exam, attempt.id, questionId, answer)
        if (pending.current.get(questionId) === answer) pending.current.delete(questionId)
      } catch (e) {
        if (
          e instanceof LearnError &&
          (e.code === 'ATTEMPT_EXPIRED' || e.code === 'ATTEMPT_ALREADY_SUBMITTED')
        ) {
          pending.current.clear()
          remember()
          closed.current = true
          onDone(
            await getAttempt(attempt.id),
            'Time is up. Your answers were submitted automatically.',
          )
          return false
        }
        if (e instanceof LearnError && e.code === 'NETWORK') {
          remember()
          setState('offline')
          retry.current = setTimeout(() => void flush(), 4000)
          return false
        }
        pending.current.delete(questionId)
        setError(failed(e))
      }
    }
    remember()
    setState(pending.current.size === 0 ? 'saved' : 'saving')
    return pending.current.size === 0
  }, [attempt.id, exam, onDone, remember])

  const answer = (questionId: string, value: unknown, debounceMs: number) => {
    setAnswers((a) => ({ ...a, [questionId]: value }))
    pending.current.set(questionId, value)
    remember()
    const t = timers.current.get(questionId)
    if (t) clearTimeout(t)
    timers.current.set(
      questionId,
      setTimeout(() => void flush(), debounceMs),
    )
  }

  // Resend what was left on this device last time.
  useEffect(() => {
    try {
      const local = JSON.parse(localStorage.getItem(storeKey) ?? '{}') as Record<string, unknown>
      for (const [k, v] of Object.entries(local)) pending.current.set(k, v)
    } catch {}
    if (pending.current.size > 0) void flush()
  }, [flush, storeKey])

  // The display clock; the server decides.
  useEffect(() => {
    if (deadline === null) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [deadline])
  useEffect(() => {
    if (remaining !== null && remaining <= 0 && !closed.current) {
      void flush().then(() => closeWith('Time is up. Your answers were submitted automatically.'))
    }
  }, [remaining, flush, closeWith])

  // Exam signals: recorded, never blocking (docs/10 §6).
  useEffect(() => {
    if (!exam) return
    let hiddenAt: number | null = null
    let wasFull = Boolean(document.fullscreenElement)
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now()
      else if (hiddenAt !== null) {
        logIntegrity(attempt.id, 'focus_loss', Date.now() - hiddenAt)
        hiddenAt = null
      }
    }
    const onFullscreen = () => {
      if (wasFull && !document.fullscreenElement) logIntegrity(attempt.id, 'fullscreen_exit')
      wasFull = Boolean(document.fullscreenElement)
    }
    document.addEventListener('visibilitychange', onVisibility)
    document.addEventListener('fullscreenchange', onFullscreen)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      document.removeEventListener('fullscreenchange', onFullscreen)
    }
  }, [exam, attempt.id])

  // Unsent answers: warn before leaving.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (pending.current.size > 0) e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])

  const answered = questions.filter((q) => isAnswered(q, answers[q.id])).length
  const oneAtATime = attempt.oneQuestionPerScreen
  const shown = oneAtATime ? questions.slice(index, index + 1) : questions
  const urgent = remaining !== null && remaining <= 60

  return (
    <div className="flex flex-col gap-5">
      <div className="sticky top-14 z-20 -mx-4 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface/95 px-4 py-2 backdrop-blur sm:mx-0 sm:rounded-card sm:border">
        <p className="text-body-sm text-ink-2">
          {answered} of {questions.length} answered ·{' '}
          <span role="status" className={cn(state === 'offline' && 'font-medium text-warning')}>
            {state === 'saved'
              ? 'All saved'
              : state === 'saving'
                ? 'Saving…'
                : 'Answers saved on this device, reconnecting…'}
          </span>
        </p>
        {remaining !== null ? (
          <p
            className={cn(
              'font-mono text-body font-semibold tabular-nums',
              urgent ? 'text-danger' : 'text-ink',
            )}
          >
            <span className="sr-only">Time left </span>
            {clockText(remaining)}
          </p>
        ) : null}
      </div>

      {exam && (oneAtATime || questions.length > 5) ? (
        <nav aria-label="Questions" className="flex flex-wrap gap-1.5">
          {questions.map((q, i) => (
            <button
              key={q.id}
              type="button"
              onClick={() =>
                oneAtATime
                  ? setIndex(i)
                  : document.getElementById(`question-${q.id}`)?.scrollIntoView({ block: 'start' })
              }
              aria-current={oneAtATime && i === index ? 'step' : undefined}
              aria-label={`Question ${i + 1}${isAnswered(q, answers[q.id]) ? ', answered' : ''}${flagged.has(q.id) ? ', flagged' : ''}`}
              className={cn(
                'relative flex size-10 items-center justify-center rounded-control border text-body-sm',
                isAnswered(q, answers[q.id])
                  ? 'border-brand bg-brand-soft text-brand-ink'
                  : 'border-border text-ink-2',
                oneAtATime && i === index && 'ring-2 ring-focus',
              )}
            >
              {i + 1}
              {flagged.has(q.id) ? (
                <Flag
                  aria-hidden
                  className="absolute -top-1 -right-1 size-3.5 fill-warning text-warning"
                />
              ) : null}
            </button>
          ))}
        </nav>
      ) : null}

      <ol className="flex flex-col gap-5">
        {shown.map((q) => {
          const i = questions.indexOf(q)
          return (
            <li
              key={q.id}
              id={`question-${q.id}`}
              className="flex scroll-mt-32 flex-col gap-3 rounded-card border border-border bg-surface p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-caption text-ink-3">
                  Question {i + 1} of {questions.length} · {q.points}{' '}
                  {q.points === 1 ? 'point' : 'points'}
                </p>
                {exam ? (
                  <button
                    type="button"
                    aria-pressed={flagged.has(q.id)}
                    onClick={() =>
                      setFlagged((f) => {
                        const next = new Set(f)
                        if (next.has(q.id)) next.delete(q.id)
                        else next.add(q.id)
                        return next
                      })
                    }
                    className="inline-flex h-8 items-center gap-1 rounded-control px-2 text-body-sm text-ink-2 hover:bg-canvas aria-pressed:text-warning"
                  >
                    <Flag aria-hidden className="size-4" />
                    {flagged.has(q.id) ? 'Flagged' : 'Flag for review'}
                  </button>
                ) : null}
              </div>
              <RichHtml html={q.promptHtml} className="text-body text-ink" />
              <QuestionInput
                q={q}
                value={answers[q.id]}
                disabled={submitting}
                onChange={(v) => answer(q.id, v, q.type === 'short_text' ? 800 : 0)}
                onPaste={exam ? () => logIntegrity(attempt.id, 'paste') : undefined}
              />
            </li>
          )
        })}
      </ol>

      {error ? (
        <p role="alert" className="text-body-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        {oneAtATime ? (
          <>
            <Button
              variant="secondary"
              disabled={index === 0}
              onClick={() => setIndex((i) => i - 1)}
            >
              Previous question
            </Button>
            {/* "question" in the label: the lesson's own Next sits just below. */}
            {index < questions.length - 1 ? (
              <Button variant="secondary" onClick={() => setIndex((i) => i + 1)}>
                Next question
              </Button>
            ) : null}
          </>
        ) : null}
        <Button className="ml-auto" onClick={() => setConfirming(true)}>
          Submit
        </Button>
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent
          title="Submit your answers?"
          description={
            answered < questions.length
              ? `You’ve answered ${answered} of ${questions.length}. Unanswered questions score nothing.`
              : 'You’ve answered every question. You can’t change them after submitting.'
          }
        >
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Keep going
            </Button>
            <Button
              loading={submitting}
              onClick={async () => {
                setSubmitting(true)
                const saved = await flush()
                if (saved) await closeWith(null)
                setSubmitting(false)
                setConfirming(false)
              }}
            >
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Results ─────────────────────────────────────────────────────────────────────────────────

function AttemptResult({
  attempt,
  intro,
  notice,
  onAgain,
}: {
  attempt: AttemptDto
  intro: QuizIntroDto
  notice: string | null
  onAgain: () => void
}) {
  const r = attempt.result
  const left = intro.attemptsAllowed === null ? null : intro.attemptsAllowed - intro.attemptsUsed
  const canAgain = !intro.inProgress && left !== 0 && !intro.availableAt
  const noun = intro.kind === 'exam' ? 'exam' : 'quiz'
  // The dialog that submitted is gone; put focus on the result so keyboards don't start over.
  const card = useRef<HTMLDivElement>(null)
  useEffect(() => card.current?.focus(), [])
  return (
    <div className="flex flex-col gap-5">
      {notice ? (
        <p
          role="status"
          className="rounded-control border border-info/40 bg-info-soft p-3 text-body text-ink"
        >
          {notice}
        </p>
      ) : null}
      <div
        ref={card}
        tabIndex={-1}
        className="flex flex-col gap-2 rounded-card border border-border bg-surface p-5 outline-none sm:p-8"
      >
        {attempt.status === 'void' ? (
          <p className="text-body text-ink">
            This attempt was cancelled by the instructor and doesn’t count.
          </p>
        ) : r ? (
          <>
            <p className="text-h1-sm text-ink">{Math.floor(r.pct)}%</p>
            <p className="text-body text-ink-2">
              {r.score} of {r.maxScore} points.{' '}
              {intro.passPct > 0
                ? r.passed
                  ? 'You passed.'
                  : `The pass mark is ${intro.passPct}%.`
                : ''}
            </p>
            {r.feedback === null && intro.showAnswers !== 'after_submit' ? (
              <p className="text-body-sm text-ink-3">
                {intro.showAnswers === 'never'
                  ? `This ${noun} doesn’t show the answers.`
                  : intro.showAnswers === 'after_pass'
                    ? 'The answers show once you pass.'
                    : `The answers show when the ${noun} closes.`}
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-body text-ink-2">Submitted. Your result will appear here.</p>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          {canAgain ? (
            <Button onClick={onAgain}>
              {left === null ? 'Try again' : `Try again (${left} left)`}
            </Button>
          ) : null}
          {intro.availableAt ? (
            <p className="text-body-sm text-ink-2">
              Next attempt from {formatDateTime(intro.availableAt)}.
            </p>
          ) : null}
        </div>
      </div>

      {r?.feedback ? (
        <ol className="flex flex-col gap-4">
          {attempt.questions.map((q, i) => {
            const f = r.feedback?.[q.id]
            if (!f) return null
            return (
              <li
                key={q.id}
                className="flex flex-col gap-2 rounded-card border border-border bg-surface p-5"
              >
                <p
                  className={cn(
                    'inline-flex items-center gap-1.5 text-body-sm font-medium',
                    f.correct ? 'text-success' : 'text-danger',
                  )}
                >
                  {f.correct ? (
                    <Check aria-hidden className="size-4" />
                  ) : (
                    <X aria-hidden className="size-4" />
                  )}
                  Question {i + 1}:{' '}
                  {f.correct
                    ? 'right'
                    : f.points > 0
                      ? `partly right (${f.points} of ${q.points})`
                      : 'not right'}
                </p>
                <RichHtml html={q.promptHtml} className="text-body text-ink" />
                {!f.correct ? (
                  <p className="text-body-sm text-ink-2">
                    Answer: {correctAnswerText(q, f.correctAnswer)}
                  </p>
                ) : null}
                {f.explanationHtml ? (
                  <RichHtml html={f.explanationHtml} className="text-body-sm text-ink-2" />
                ) : null}
              </li>
            )
          })}
        </ol>
      ) : null}
    </div>
  )
}
