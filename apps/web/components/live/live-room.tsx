'use client'
// Client component: the live class room (docs/20 `/learn/[courseSlug]/live/[sessionId]`). Daily
// Prebuilt is loaded only when the person presses Join (docs/12 §3: Daily only on this page),
// with a token from `live.join`. Leaving goes back to where they came from.

import type { DailyCall } from '@daily-co/daily-js'
import { Button } from '@tokslearn/ui/button'
import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { joinLive } from '@/lib/live-api'
import { clockTime, untilText } from '@/lib/live-time'

export function LiveRoom({
  sessionId,
  opensAt,
  open,
  host,
  backHref,
}: {
  sessionId: string
  opensAt: string
  open: boolean
  host: boolean
  backHref: string
}) {
  const router = useRouter()
  const container = useRef<HTMLDivElement>(null)
  const call = useRef<DailyCall | null>(null)
  const [state, setState] = useState<'idle' | 'joining' | 'in' | 'left'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => {
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 15_000)
    // Leaving the page (or Next hiding it in an Activity) ends the call; coming back starts over.
    return () => {
      clearInterval(timer)
      call.current?.destroy()
      call.current = null
      setState('idle')
    }
  }, [])

  const opens = new Date(opensAt).getTime()
  const isOpen = open || (now !== null && now >= opens)

  const join = async () => {
    if (!container.current || call.current) return
    setState('joining')
    setError(null)
    try {
      const [{ roomUrl, token }, { default: Daily }] = await Promise.all([
        joinLive(sessionId),
        import('@daily-co/daily-js'),
      ])
      const frame = Daily.createFrame(container.current, {
        showLeaveButton: true,
        showFullscreenButton: true,
        iframeStyle: { width: '100%', height: '100%', border: '0', borderRadius: '12px' },
      })
      call.current = frame
      frame.on('left-meeting', () => {
        frame.destroy()
        call.current = null
        setState('left')
        router.push(backHref as Route)
      })
      setState('in')
      await frame.join({ url: roomUrl, token })
    } catch (e) {
      call.current?.destroy()
      call.current = null
      setState('idle')
      setError(e instanceof Error ? e.message : 'We can’t connect to the live class right now.')
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        ref={container}
        className={
          state === 'in' || state === 'joining'
            ? 'h-[min(78vh,760px)] min-h-[420px] w-full overflow-hidden rounded-card bg-ink'
            : 'hidden'
        }
      />
      {state === 'idle' ? (
        <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5 sm:p-6">
          {isOpen ? (
            <>
              <p className="text-body text-ink">
                {host
                  ? 'You join as the host: you can mute people, share your screen and record.'
                  : 'Your camera and microphone start off. Turn them on when you want to speak.'}
              </p>
              <Button className="w-fit" onClick={join}>
                {host ? 'Start the class' : 'Join the class'}
              </Button>
            </>
          ) : (
            <p className="text-body text-ink">
              The room opens at {clockTime(opensAt)}
              {now !== null ? ` (${untilText(opens - now)})` : ''}. Keep this page open; the button
              appears when it opens.
            </p>
          )}
          {error ? (
            <p role="alert" className="text-body-sm text-danger">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
      {state === 'joining' ? <p className="text-body-sm text-ink-2">Connecting…</p> : null}
    </div>
  )
}
