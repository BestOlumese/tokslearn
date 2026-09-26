# Phase 2 — Instructors and Course Authoring

**Prompt:** Read CLAUDE.md, `docs/07 §5`, `docs/05` (instructors, courses, media), `docs/09`,
`docs/10 §1`. Execute Phase 2.

**Screens, errors, emails, events:** build every row marked Ph 2 in `docs/20-screen-inventory.md`, and wire the matching error codes (`21`), emails (`23`) and analytics events (`24`).

## Tasks

### 2.1 Instructor onboarding
- [x] Tables: `instructor_applications`, `kyc_checks`, `payout_accounts`, `instructor_profiles`.
  - _Migration `0002_phase2_authoring`: one open application per user (partial unique index), one active payout account per user, last 4 digits only._
- [x] "Teach on Tokslearn" landing (plain, specific: fees, refund rules, payout schedule) + application form.
  - _`/teach` now opens `/teach/apply`: five steps saved per step (about you, expertise and sample, identity, bank account, review); submitted and rejected states; approved instructors go to the studio._
- [x] Dojah integration (sandbox): BVN/NIN lookup + selfie liveness/face match; webhook handler; manual-review path. Never persist the ID number.
  - _Synchronous `kyc/{bvn|nin}/verify` with a camera selfie, so no webhook is needed (ADR-031). Response reduced to names and score in the client. Weak selfie match or a name that differs from the account → manual review, settled by the reviewer._
- [x] Paystack: list banks, resolve account, name-match vs KYC name, create transfer recipient; store last 4 + recipient code.
  - _Token-set name match ≥ 0.85 (typo-tolerant); mismatch → pending review. Replacing an account needs 2FA in 12 h, starts a 72-hour hold and emails `payout-account-changed`._
- [x] Admin review queue `/admin/instructors/applications` (approve/reject with reason, view KYC result).
  - _Queue (waiting/approved/rejected) and detail: answers, sample, KYC result (method, score, name on record — never numbers), bank name match; approve grants the role, creates the profile, accepts manual-review KYC and bank; reject reason emailed, reapply after 30 days. Staff 2FA required; audited._
- [x] Procedures: `instructors.submitApplication`, `instructors.getMyApplication`, `kyc.start`, `kyc.status`, `payoutAccounts.listBanks`, `payoutAccounts.resolve`, `payoutAccounts.add`, `payoutAccounts.list`, `admin.instructors.*`.
  - _All listed, plus `instructors.saveApplication` for per-step progress. `kyc.start` limited to 5 an hour._

### 2.2 Course builder (studio)
- [x] Tables: `categories`, `tags`, `courses`, `course_revisions`, `sections`, `lessons`, `lesson_resources`, `bundles`, `bundle_courses`, `course_staff`, `video_assets`, `files`.
  - _Plus `course_tags` and `webhook_events`. Course settings live on revisions; the course row keeps the live copy (ADR-030). 9 categories / 33 subcategories seeded in every environment._
- [x] Studio `/teach/courses`: list, create (title → slug), edit tabs: Details, Curriculum, Pricing, Certificate, Drip, Settings, Publish.
  - _Tabs built: Details, Curriculum, Pricing, Teaching assistants, Publish. Certificate (Phase 7) and Drip (Phase 5) arrive with their features per docs/20; the URL slug is set from the title at creation._
- [x] Curriculum: sections + lessons tree, drag-and-drop with keyboard alternative, lesson editors per type (video upload, article with Tiptap, resource files with `is_important`, quiz/assignment/live placeholders linking to later phases).
  - _dnd-kit (pointer + keyboard) and Move up/Move down buttons; lessons move between sections from their panel. Video, article and files lessons; quiz, assignment and live types exist in the schema and arrive with Phases 6 and 8._
- [x] Video upload via Bunny TUS with presigned signature; status via webhook + polling UI.
  - _Signed TUS headers (API key stays on the server); `/api/webhooks/bunny` checks the HMAC, records the event once and hands off to the `video-status` job, which re-reads the video from Bunny. The studio also polls every 15 s._
- [x] Autosave with version conflict detection.
  - _Details autosave after 1 s; every write carries the course `version` (integer, ADR-030) and a stale tab gets a reload banner._
- [x] Reviewer checklist from `docs/25-content-policy.md §B` built into the review UI; content policy page draft.
  - _All seven items must be ticked to approve. Draft rules page at `/content-policy`, linked from the footer and the publish tab._
- [x] Publish checklist + submit for review; review rules (`10 §1`); reviewer UI `/admin/reviews/courses` with side-by-side revision diff.
  - _11-item checklist (incl. the paid-course quality minimum). Small updates to live courses auto-approve; price rises over 50%, new sections, category/cover/language changes and removals go to a reviewer. Review page shows field and outline changes against the live version and opens every lesson._
- [x] Bundles CRUD. Course staff (invite TA by email/username).
  - _Active bundles need two published courses. TAs are added by email or @username; they can view but not change the course._
- [x] Procedures: `studio.courses.*`, `studio.sections.*`, `studio.lessons.*`, `studio.resources.*`, `studio.bundles.*`, `media.createUpload`, `media.createFileUpload`, `media.completeFileUpload`, `admin.courseReviews.*`.
  - _Video uploads are `media.createVideoUpload`; also `studio.staff.*` and `catalog.categories`._
- [x] Events: `course.submitted`, `course.published`, `course.updated`.
  - _Plus `course.changes_requested`, `instructor.application_*`, `kyc.completed`, `payout_account.added`. Publishing invalidates `course:{id}`, `catalog` and `instructor:{id}`._

## Acceptance
- [x] Seeded learner applies → KYC (sandbox) → reviewer approves → user has instructor role.
  - _Integration test `instructors/service.int.test.ts` and a browser run on 2026-09-26 (Emeka Nwosu → approved → sent to the studio)._
- [x] Instructor builds a course with 2 sections, video + article + resource lessons, submits; reviewer approves; course status `published`.
  - _Integration test `courses/courses.int.test.ts` and a browser run on 2026-09-26: Excel for Accountants published at ₦15,000, 3 lessons, 33 min._
- [x] Upload survives a simulated network drop (resume).
  - _`apps/web/lib/video-upload.test.ts`: a local TUS server cuts the connection mid-chunk; the client retries, resumes from the server offset and delivers an identical file._
- [x] Rules tests: only owner/admin can edit; TA cannot change pricing.
  - _`courses/rules.test.ts` and the integration test: TA → NOT_COURSE_OWNER, other instructors → COURSE_NOT_FOUND, admin allowed, stale version → VERSION_CONFLICT._
- [x] No raw BVN/NIN or full account numbers anywhere in DB (test scans seeded DB).
  - _The onboarding integration test scans every text/JSON column of every table after the full flow for the BVN and the 10-digit account number (and proves the scan finds values that are stored)._

**Status (2026-09-26): Phase 2 complete on branch `phase-2/authoring`, waiting for the owner to push and merge.** Deferred with reasons in ADR-031: instructor dashboard and `/admin/instructors` (Phase 10), promo video (Phase 3), reject-for-policy (Phases 8–9). Before testing uploads for real, set the Bunny and Dojah variables in Vercel.
