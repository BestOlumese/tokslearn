# 09 — Video, Files and Media

## 1. Bunny Stream setup

- One **Video Library** per environment (dev, preview/staging, production). Primary storage region closest to Europe/Africa traffic; add geo-replication only after measuring (replication zones cannot be removed later without recreating the library).
- Enable: **token authentication** for embeds and HLS, **allowed referrers** (our domains), **MP4 fallback off** (prevents easy downloads), **block direct URL file access**.
- Encoding: default H.264 up to 1080p (free). Enable 360p/480p/720p/1080p renditions — 360p/480p matter for Nigerian mobile data.
- Webhook URL: `/api/webhooks/bunny` (video status changes).
- Watermark: dynamic overlay in our facade layer (learner name + partial email, low opacity, moves every 30–60 s) for leak tracing. Real DRM later (ADR-009).

## 2. Upload flow (instructor studio)

1. `media.createUpload({ lessonId, filename, sizeBytes })` → server creates the video in Bunny
   (`POST /library/{id}/videos`), stores `video_assets` (status `uploading`), returns TUS
   endpoint + a **presigned TUS signature** (SHA-256 of library id + API key + expiry + video id,
   per Bunny docs) with short expiry. The API key never reaches the browser.
2. Browser uploads with `tus-js-client` (resumable, chunked, survives network drops — important
   for large files on unstable connections). Show progress, allow pause/resume.
3. Bunny webhook → status `processing` → `ready` (store duration, thumbnail) or `failed`.
   Inngest job updates lesson `duration_sec`, course `total_duration_sec`, notifies instructor.
4. Limits: max 4 GB per file (setting), accepted MIME types video/*.

## 3. Playback (web)

- Lesson page renders a **facade**: poster image (`next/image`, priority on the player page only), title, duration, and a play button. No player JS on initial load.
- On click (or autoplay when navigating lesson-to-lesson within the player), request
  `learn.playback({ lessonId })` → server checks enrollment/preview access and drip lock, returns a
  signed embed URL (token + expiry ~ 2 h, bound to the video id) and resume position.
- Render the Bunny iframe (`loading="lazy"`, `allow="autoplay; fullscreen; picture-in-picture"`,
  `sandbox` as permissive as the player needs). Control it via player.js (postMessage) for:
  `timeupdate` → progress heartbeats, `ended` → complete, seek to resume position.
- Keyboard shortcuts and speed control come from Bunny's player. Captions via Bunny caption tracks (Phase later: auto-transcription).
- Preview lessons: public, still tokenized (short expiry), same facade.

## 4. Progress tracking

- Heartbeat every 20 s while playing, plus on pause, ended, visibilitychange (hidden), and `pagehide` (use `navigator.sendBeacon` to `/api/v1/progress/heartbeat`).
- Payload: `{ lessonId, positionSec, watchedDeltaSec, playbackRate }`. Server clamps `watchedDeltaSec` to wall-clock elapsed since last heartbeat × max rate (2×) to prevent fake watch time.
- Server: upsert `lesson_progress`, add to `activity_days`, write `consumption_events(video_progress)` at most once per 5 minutes per lesson (aggregate), recompute course progress lazily (on lesson completion) and emit `lesson.completed`.
- Completion rule: `max(watched_sec, max_position_sec) / duration ≥ course.completion_threshold_pct`.

## 5. Files (R2)

- Buckets: `tokslearn-public` (covers, avatars — served via custom domain `cdn.tokslearn.com` with caching), `tokslearn-private` (resources, submissions, certificates, statements).
- Uploads: `media.createFileUpload({ purpose, filename, mime, size })` → presigned PUT (5 min) with content-type + length constraints → client uploads → `media.completeFileUpload(fileId)` verifies object exists + size, enqueues virus scan (ClamAV via a small container later; v1: mime sniffing + extension allowlist + size limits, mark `skipped`).
- Downloads: `learn.resourceDownload({ resourceId })` → access check → if `is_important` and user has a refundable order item → require `confirmNonRefundable: true` → log `consumption_events(resource_download)` → return presigned GET (5 min) with `Content-Disposition: attachment`.
- Images: on upload of covers/avatars, Inngest job generates WebP/AVIF sizes (e.g. 320/640/1280) with `sharp` and stores variants; `next/image` uses a custom loader pointing to the variants (keeps Vercel image optimization costs near zero).

## 6. Live class recordings (see `10` for live)

Daily cloud recording → `recording.ready-to-download` webhook → Inngest job fetches the recording
link → Bunny "fetch video from URL" API → new `video_assets` row → attached to the live session and
optionally published as a lesson. Delete the Daily copy after import (storage costs).

## 7. DRM and offline (Phase 15 — design only now)

- `courses.drm_required` and `video_assets.drm_enabled` exist from day one.
- When enabled: switch library to MediaCage Enterprise DRM (Widevine + FairPlay, requires Apple FairPlay deployment package), budget ~$99/mo base + per-licence fees.
- Mobile offline: `react-native-video` with an offline SDK (commercial) or Bunny's native SDK. Downloads expire (e.g. 30 days) and require the app to check in online to renew licences; revoke on refund/enrollment revocation.
- Offline progress is queued on device and synced with `progress.syncBatch` (design this procedure now: it accepts an array of heartbeats with client timestamps, deduplicated by `(lessonId, clientEventId)`).
