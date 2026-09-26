'use client'
// Client component: course cover image, 16:9 (docs/20 details). Uploads to the public bucket.

import { Button } from '@tokslearn/ui/button'
import { ImagePlus } from 'lucide-react'
import { useRef, useState } from 'react'
import { apiErrorMessage } from '@/lib/api-error'
import { uploadFile } from '@/lib/upload-file'

const MAX = 5 * 1024 * 1024

export function CoverUpload({
  url,
  disabled,
  onUploaded,
}: {
  url: string | null
  disabled?: boolean
  onUploaded: (fileId: string, url: string | null) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const shown = preview ?? url

  const pick = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Use a JPG, PNG or WebP image.')
      return
    }
    if (file.size > MAX) {
      setError('Images must be under 5 MB.')
      return
    }
    setBusy(true)
    try {
      const done = await uploadFile(file, 'cover')
      setPreview(URL.createObjectURL(file))
      onUploaded(done.fileId, done.url)
    } catch (e) {
      setError(
        e instanceof Error && e.message === 'upload_failed'
          ? 'The upload failed. Try again.'
          : apiErrorMessage(e),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <div className="aspect-video w-full max-w-72 shrink-0 overflow-hidden rounded-card border border-border bg-surface-sunken">
        {shown ? (
          // biome-ignore lint/performance/noImgElement: CDN or local preview in the studio only
          <img src={shown} alt="Course cover" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-ink-3">
            <ImagePlus aria-hidden className="size-8" strokeWidth={1.5} />
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-body-sm text-ink-2">
          1280 × 720 or larger, 16:9. No text over faces; keep the title readable on a phone.
        </p>
        <Button
          type="button"
          variant="secondary"
          loading={busy}
          disabled={disabled}
          onClick={() => input.current?.click()}
          className="w-fit"
        >
          {shown ? 'Change image' : 'Upload image'}
        </Button>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            void pick(e.target.files?.[0])
            e.target.value = ''
          }}
        />
        {error ? (
          <p role="alert" className="text-body-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  )
}
