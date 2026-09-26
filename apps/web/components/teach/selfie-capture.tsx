'use client'
// Client component: takes the selfie for the identity check. Live camera where the browser allows
// it; otherwise the phone's camera through a file input. The photo is resized to at most 720 px
// and sent once to the server, which forwards it to Dojah; we don't store it.

import { Button } from '@tokslearn/ui/button'
import { Camera, RotateCcw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

const MAX_SIDE = 720

function toBase64Jpeg(source: CanvasImageSource, width: number, height: number): string {
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  canvas.getContext('2d')?.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.85).replace(/^data:image\/jpeg;base64,/, '')
}

export function SelfieCapture({
  value,
  onChange,
}: {
  value: string | null
  onChange: (base64: string | null) => void
}) {
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [live, setLive] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const stop = () => {
    for (const track of stream.current?.getTracks() ?? []) track.stop()
    stream.current = null
    setLive(false)
  }
  // Turn the camera off when the step unmounts.
  useEffect(
    () => () => {
      for (const track of stream.current?.getTracks() ?? []) track.stop()
    },
    [],
  )

  const openCamera = async () => {
    setError(null)
    if (!navigator.mediaDevices?.getUserMedia) {
      fileInput.current?.click()
      return
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 } },
        audio: false,
      })
      setLive(true)
      requestAnimationFrame(() => {
        if (video.current && stream.current) {
          video.current.srcObject = stream.current
          void video.current.play()
        }
      })
    } catch {
      setError('We couldn’t open your camera. Allow camera access, or upload a photo instead.')
    }
  }

  const takePhoto = () => {
    const v = video.current
    if (!v?.videoWidth) return
    onChange(toBase64Jpeg(v, v.videoWidth, v.videoHeight))
    stop()
  }

  const fromFile = (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Choose a photo (JPG or PNG).')
      return
    }
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      onChange(toBase64Jpeg(img, img.naturalWidth, img.naturalHeight))
      URL.revokeObjectURL(url)
    }
    img.onerror = () => {
      setError('We couldn’t read that photo. Try another one.')
      URL.revokeObjectURL(url)
    }
    img.src = url
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-[4/3] w-full max-w-sm overflow-hidden rounded-card border border-border bg-surface-sunken">
        {value ? (
          // biome-ignore lint/performance/noImgElement: a local data URL preview, not a remote image
          <img
            src={`data:image/jpeg;base64,${value}`}
            alt="Your selfie"
            className="size-full object-cover"
          />
        ) : live ? (
          <video
            ref={video}
            muted
            playsInline
            aria-label="Camera preview"
            className="size-full -scale-x-100 object-cover"
          />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-2 p-6 text-center text-body-sm text-ink-2">
            <Camera aria-hidden className="size-8 text-ink-3" strokeWidth={1.5} />
            <p>Face the camera in good light. Remove glasses and hats.</p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {value ? (
          <Button type="button" variant="secondary" onClick={() => onChange(null)}>
            <RotateCcw aria-hidden className="size-4" />
            Retake
          </Button>
        ) : live ? (
          <>
            <Button type="button" onClick={takePhoto}>
              Take photo
            </Button>
            <Button type="button" variant="tertiary" onClick={stop}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button type="button" variant="secondary" onClick={openCamera}>
              <Camera aria-hidden className="size-4" />
              Open camera
            </Button>
            <Button type="button" variant="tertiary" onClick={() => fileInput.current?.click()}>
              Upload a photo
            </Button>
          </>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          capture="user"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            fromFile(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </div>
      {error ? (
        <p role="alert" className="text-body-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}
