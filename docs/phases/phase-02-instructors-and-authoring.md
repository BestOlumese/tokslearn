# Phase 2 — Instructors and Course Authoring

**Prompt:** Read CLAUDE.md, `docs/07 §5`, `docs/05` (instructors, courses, media), `docs/09`,
`docs/10 §1`. Execute Phase 2.

**Screens, errors, emails, events:** build every row marked Ph 2 in `docs/20-screen-inventory.md`, and wire the matching error codes (`21`), emails (`23`) and analytics events (`24`).

## Tasks

### 2.1 Instructor onboarding
- [ ] Tables: `instructor_applications`, `kyc_checks`, `payout_accounts`, `instructor_profiles`.
- [ ] "Teach on Tokslearn" landing (plain, specific: fees, refund rules, payout schedule) + application form.
- [ ] Dojah integration (sandbox): BVN/NIN lookup + selfie liveness/face match; webhook handler; manual-review path. Never persist the ID number.
- [ ] Paystack: list banks, resolve account, name-match vs KYC name, create transfer recipient; store last 4 + recipient code.
- [ ] Admin review queue `/admin/instructors/applications` (approve/reject with reason, view KYC result).
- [ ] Procedures: `instructors.submitApplication`, `instructors.getMyApplication`, `kyc.start`, `kyc.status`, `payoutAccounts.listBanks`, `payoutAccounts.resolve`, `payoutAccounts.add`, `payoutAccounts.list`, `admin.instructors.*`.

### 2.2 Course builder (studio)
- [ ] Tables: `categories`, `tags`, `courses`, `course_revisions`, `sections`, `lessons`, `lesson_resources`, `bundles`, `bundle_courses`, `course_staff`, `video_assets`, `files`.
- [ ] Studio `/teach/courses`: list, create (title → slug), edit tabs: Details, Curriculum, Pricing, Certificate, Drip, Settings, Publish.
- [ ] Curriculum: sections + lessons tree, drag-and-drop with keyboard alternative, lesson editors per type (video upload, article with Tiptap, resource files with `is_important`, quiz/assignment/live placeholders linking to later phases).
- [ ] Video upload via Bunny TUS with presigned signature; status via webhook + polling UI.
- [ ] Autosave with version conflict detection.
- [ ] Reviewer checklist from `docs/25-content-policy.md §B` built into the review UI; content policy page draft.
- [ ] Publish checklist + submit for review; review rules (`10 §1`); reviewer UI `/admin/reviews/courses` with side-by-side revision diff.
- [ ] Bundles CRUD. Course staff (invite TA by email/username).
- [ ] Procedures: `studio.courses.*`, `studio.sections.*`, `studio.lessons.*`, `studio.resources.*`, `studio.bundles.*`, `media.createUpload`, `media.createFileUpload`, `media.completeFileUpload`, `admin.courseReviews.*`.
- [ ] Events: `course.submitted`, `course.published`, `course.updated`.

## Acceptance
- [ ] Seeded learner applies → KYC (sandbox) → reviewer approves → user has instructor role.
- [ ] Instructor builds a course with 2 sections, video + article + resource lessons, submits; reviewer approves; course status `published`.
- [ ] Upload survives a simulated network drop (resume).
- [ ] Rules tests: only owner/admin can edit; TA cannot change pricing.
- [ ] No raw BVN/NIN or full account numbers anywhere in DB (test scans seeded DB).
