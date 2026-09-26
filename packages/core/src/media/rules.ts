import type { Bucket } from '@tokslearn/integrations/r2'

export type UploadPurpose = 'avatar'

interface PurposeRule {
  bucket: Bucket
  maxBytes: number
  mimes: Readonly<Record<string, string>> // mime → extension
}

/** Allowlist per purpose (docs/09 §5, docs/14 §2 uploads). */
export const uploadRules: Readonly<Record<UploadPurpose, PurposeRule>> = {
  avatar: {
    bucket: 'public',
    maxBytes: 2 * 1024 * 1024,
    mimes: { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' },
  },
}

export const formatBytes = (bytes: number): string =>
  bytes >= 1024 * 1024
    ? `${Math.round(bytes / (1024 * 1024))} MB`
    : `${Math.round(bytes / 1024)} KB`
