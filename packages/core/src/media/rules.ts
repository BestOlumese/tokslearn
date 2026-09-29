import type { Bucket } from '@tokslearn/integrations/r2'

export type UploadPurpose = 'avatar' | 'cover' | 'resource' | 'assignment_submission'

interface PurposeRule {
  bucket: Bucket
  maxBytes: number
  mimes: Readonly<Record<string, string>> // mime → extension
}

const MB = 1024 * 1024
const images = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as const

/**
 * Allowlist per purpose (docs/09 §5, docs/14 §2 uploads). No executables, scripts or HTML: a
 * resource is something a learner opens, never something a browser runs.
 */
export const uploadRules: Readonly<Record<UploadPurpose, PurposeRule>> = {
  avatar: { bucket: 'public', maxBytes: 2 * MB, mimes: images },
  cover: { bucket: 'public', maxBytes: 5 * MB, mimes: images },
  resource: {
    bucket: 'private',
    maxBytes: 100 * MB,
    mimes: {
      'application/pdf': 'pdf',
      'application/zip': 'zip',
      'application/x-zip-compressed': 'zip',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
      'text/csv': 'csv',
      'text/plain': 'txt',
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'audio/mpeg': 'mp3',
    },
  },
  // Learners' work. Each assignment sets its own lower limit, checked at submit.
  assignment_submission: {
    bucket: 'private',
    maxBytes: 100 * MB,
    mimes: {
      'application/pdf': 'pdf',
      'application/zip': 'zip',
      'application/x-zip-compressed': 'zip',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
      'text/csv': 'csv',
      'text/plain': 'txt',
      'image/jpeg': 'jpg',
      'image/png': 'png',
    },
  },
}

/** Videos go to Bunny Stream, not R2 (docs/09 §2). */
export const VIDEO_MAX_BYTES = 4 * 1024 * MB
/** How long the browser may keep uploading with one signature (large files on slow links). */
export const VIDEO_UPLOAD_TTL_SEC = 24 * 60 * 60
/** Signed playback for staff and instructor previews (docs/09 §3). */
export const PLAYBACK_TTL_SEC = 2 * 60 * 60

export const formatBytes = (bytes: number): string =>
  bytes >= 1024 * MB
    ? `${Math.round(bytes / (1024 * MB))} GB`
    : bytes >= MB
      ? `${Math.round(bytes / MB)} MB`
      : `${Math.round(bytes / 1024)} KB`
