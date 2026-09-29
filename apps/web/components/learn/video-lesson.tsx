'use client'
// Client component: the video facade, then Bunny's player in an iframe (docs/09 §3). No player
// code loads until the learner presses play. Progress goes up as heartbeats (docs/09 §4) that the
// server clamps; this component only reports what the player said.

import { cn } from '@tokslearn/ui/cn'
import { Play } from 'lucide-react'
import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import {
  type Beat,
  clock,
  heartbeat,
  heartbeatOnLeave,
  LearnError,
  type Playback,
  playback,
  publishTime,
  SEEK_EVENT,
} from '@/lib/learn-api'

const BEAT_EVERY_MS = 20_000
/** Beats closer than this wait for the next one (the server allows 6 a minute). */
const MIN_GAP_MS = 10_000
const AUTOPLAY_KEY = 'tl:autoplay'
const PLAYERJS = 'player.js'

type PlayerMessage = { context?: string; event?: string; value?: unknown }

function parseMessage(data: unknown): PlayerMessage | null {
  try {
    const m = (typeof data === 'string' ? JSON.parse(data) : data) as PlayerMessage | null
    return m && m.context === PLAYERJS ? m : null
  } catch {
    return null
  }
}

const saveData = () =>
  typeof navigator !== 'undefined' &&
  Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData)

/** Set before moving to the next lesson so its video starts on its own (docs/09 §3). */
export function autoplayNext(): void {
  try {
    sessionStorage.setItem(AUTOPLAY_KEY, '1')
  } catch {
    // Storage blocked: the next video waits for a tap.
  }
}

const spots = ['top-3 left-3', 'top-3 right-3', 'bottom-14 right-3', 'bottom-14 left-3'] as const

export function VideoLesson({
  lessonId,
  title,
  durationSec,
  posterUrl,
  status,
  watermark,
  startAt,
  next,
}: {
  lessonId: string
  title: string
  durationSec: number
  posterUrl: string | null
  status: 'uploading' | 'processing' | 'ready' | 'failed'
  watermark: string | null
  /** From a note link (`?t=`): start here instead of the saved position. */
  startAt: number | null
  next: { href: string; title: string } | null
}) {
  const router = useRouter()
  const frame = useRef<HTMLIFrameElement>(null)
  const [play, setPlay] = useState<Playback | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resumeNote, setResumeNote] = useState<string | null>(null)
  const [ended, setEnded] = useState(false)
  const [spot, setSpot] = useState(0)
  const track = useRef({ pos: 0, last: null as number | null, acc: 0, sentAt: 0, started: false })

  const start = async () => {
    if (loading || play) return
    setLoading(true)
    setError(null)
    try {
      const p = await playback(lessonId)
      const at = startAt ?? p.resumeAt
      track.current.pos = at
      setPlay({ ...p, resumeAt: at })
      if (at > 0) setResumeNote(`Resuming at ${clock(at)}`)
    } catch (e) {
      setError(e instanceof LearnError ? e.message : 'The video could not start. Try again.')
    } finally {
      setLoading(false)
    }
  }

  // Lesson-to-lesson autoplay, unless the learner is saving data. Runs once per lesson page.
  // biome-ignore lint/correctness/useExhaustiveDependencies: start is read once, on mount.
  useEffect(() => {
    let wanted = false
    try {
      wanted = sessionStorage.getItem(AUTOPLAY_KEY) === '1'
      sessionStorage.removeItem(AUTOPLAY_KEY)
    } catch {}
    if (wanted && status === 'ready' && !saveData()) void start()
  }, [])

  useEffect(() => {
    if (!resumeNote) return
    const t = setTimeout(() => setResumeNote(null), 4000)
    return () => clearTimeout(t)
  }, [resumeNote])

  // The watermark moves now and then so it can't be cropped out of a screen recording.
  useEffect(() => {
    if (!play || !watermark) return
    const t = setInterval(() => setSpot((s) => (s + 1) % spots.length), 40_000)
    return () => clearInterval(t)
  }, [play, watermark])

  useEffect(() => {
    if (!play) return
    const t = track.current
    const take = (): Beat | null => {
      const watched = Math.round(t.acc)
      if (watched <= 0 && t.started) return null
      t.acc -= watched
      t.started = true
      return { lessonId, positionSec: Math.floor(t.pos), watchedDeltaSec: watched }
    }
    const send = (force = false) => {
      if (!force && Date.now() - t.sentAt < MIN_GAP_MS) return
      const beat = take()
      if (!beat) return
      t.sentAt = Date.now()
      heartbeat(beat)
        .then((r) => {
          if (r.completedNow) router.refresh()
        })
        .catch(() => {
          // Offline or rate-limited: keep the time for the next beat.
          t.acc += beat.watchedDeltaSec
        })
    }
    const leave = () => {
      const beat = take()
      if (beat) heartbeatOnLeave(beat)
    }

    let timer: ReturnType<typeof setInterval> | null = null
    const post = (method: string, value?: unknown) =>
      frame.current?.contentWindow?.postMessage(
        JSON.stringify({ context: PLAYERJS, version: '0.0.11', method, value }),
        '*',
      )
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return
      const m = parseMessage(e.data)
      if (!m) return
      if (m.event === 'ready') {
        for (const ev of ['timeupdate', 'play', 'pause', 'ended']) post('addEventListener', ev)
        if (play.resumeAt > 0) post('setCurrentTime', play.resumeAt)
      } else if (m.event === 'timeupdate') {
        const sec = Number((m.value as { seconds?: number } | undefined)?.seconds)
        if (!Number.isFinite(sec)) return
        const delta = t.last === null ? 0 : sec - t.last
        // Normal playback moves a fraction of a second per update; bigger jumps are seeks.
        if (delta > 0 && delta < 3) t.acc += delta
        t.last = sec
        t.pos = sec
        publishTime(sec)
      } else if (m.event === 'play') {
        setEnded(false)
        if (!t.started) send(true)
        timer ??= setInterval(() => send(), BEAT_EVERY_MS)
      } else if (m.event === 'pause') {
        if (timer) clearInterval(timer)
        timer = null
        send()
      } else if (m.event === 'ended') {
        if (timer) clearInterval(timer)
        timer = null
        t.pos = durationSec || t.pos
        send(true)
        setEnded(true)
      }
    }
    const onSeek = (e: Event) => {
      const sec = (e as CustomEvent<{ positionSec: number }>).detail.positionSec
      post('setCurrentTime', sec)
      post('play')
    }
    const onHidden = () => {
      if (document.visibilityState === 'hidden') leave()
    }
    window.addEventListener('message', onMessage)
    window.addEventListener(SEEK_EVENT, onSeek)
    document.addEventListener('visibilitychange', onHidden)
    window.addEventListener('pagehide', leave)
    return () => {
      window.removeEventListener('message', onMessage)
      window.removeEventListener(SEEK_EVENT, onSeek)
      document.removeEventListener('visibilitychange', onHidden)
      window.removeEventListener('pagehide', leave)
      if (timer) clearInterval(timer)
      leave()
      publishTime(null)
    }
  }, [play, lessonId, durationSec, router])

  if (status !== 'ready') {
    return (
      <div className="flex aspect-video flex-col items-center justify-center gap-2 rounded-card bg-surface-sunken p-6 text-center">
        <p className="text-body font-medium text-ink">
          {status === 'failed' ? 'This video isn’t available' : 'This video is still processing'}
        </p>
        <p className="max-w-sm text-body-sm text-ink-2">
          {status === 'failed'
            ? 'The upload didn’t work. Your instructor can see this and will upload it again.'
            : 'It usually takes a few minutes after the instructor uploads it. Check back soon.'}
        </p>
      </div>
    )
  }

  if (!play) {
    return (
      <div className="relative aspect-video overflow-hidden rounded-card bg-ink">
        {posterUrl ? (
          // Poster from Bunny's CDN: a plain img, decoded off the main thread.
          // biome-ignore lint/performance/noImgElement: Bunny's thumbnail host isn't an image-optimizer origin.
          <img
            src={posterUrl}
            alt=""
            fetchPriority="high"
            decoding="async"
            className="absolute inset-0 size-full object-cover opacity-80"
          />
        ) : null}
        <button
          type="button"
          onClick={() => void start()}
          aria-label={`Play ${title}${durationSec ? `, ${clock(durationSec)}` : ''}`}
          className="group absolute inset-0 flex flex-col items-center justify-center gap-3 text-ink-inverse focus-visible:outline-none"
        >
          <span
            className={cn(
              'flex size-16 items-center justify-center rounded-full bg-brand shadow-pop transition-transform duration-150',
              'group-hover:scale-105 group-focus-visible:ring-4 group-focus-visible:ring-focus',
            )}
          >
            <Play aria-hidden className="size-7 translate-x-0.5 fill-current" />
          </span>
          <span className="rounded-control bg-ink/60 px-2 py-0.5 text-body-sm">
            {loading ? 'Loading…' : durationSec ? clock(durationSec) : 'Play'}
          </span>
        </button>
        {error ? (
          <p
            role="alert"
            className="absolute inset-x-3 bottom-3 rounded-control bg-surface px-3 py-2 text-body-sm text-danger"
          >
            {error}
          </p>
        ) : null}
      </div>
    )
  }

  const src = `${play.embedUrl}${play.embedUrl.includes('?') ? '&' : '?'}autoplay=true&preload=true&responsive=true`
  return (
    <div className="relative aspect-video overflow-hidden rounded-card bg-ink">
      <iframe
        ref={frame}
        src={src}
        title={title}
        allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
        allowFullScreen
        sandbox="allow-scripts allow-same-origin allow-presentation"
        className="size-full border-0"
      />
      {watermark ? (
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute select-none text-caption text-ink-inverse/40 transition-all duration-1000',
            spots[spot],
          )}
        >
          {watermark}
        </span>
      ) : null}
      {resumeNote ? (
        <p
          role="status"
          className="absolute top-3 left-3 animate-fade-in rounded-control bg-ink/80 px-3 py-1.5 text-body-sm text-ink-inverse"
        >
          {resumeNote}
        </p>
      ) : null}
      {ended && next ? (
        <div className="absolute right-3 bottom-14 flex animate-fade-in items-center gap-3 rounded-card bg-surface p-3 shadow-pop">
          <div className="min-w-0">
            <p className="text-caption text-ink-3">Up next</p>
            <p className="max-w-[220px] truncate text-body-sm font-medium text-ink">{next.title}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              autoplayNext()
              router.push(next.href as Route)
            }}
            className="h-9 shrink-0 rounded-control bg-brand px-3 text-body-sm font-medium text-ink-inverse hover:bg-brand-hover"
          >
            Play next
          </button>
        </div>
      ) : null}
    </div>
  )
}
