# Phase 6 — Assessments (quizzes, exams, assignments)

**Prompt:** Read CLAUDE.md, `docs/10 §5–7`, `docs/05` (assessments, assignments). Execute Phase 6.

**Screens, errors, emails, events:** build every row marked Ph 6 in `docs/20-screen-inventory.md`, and wire the matching error codes (`21`), emails (`23`) and analytics events (`24`).

## Tasks
- [x] Tables: question_banks, questions, quizzes, quiz_sources, quiz_attempts, attempt_answers, assignments, submissions, grades.
- [x] Studio: question bank editor (all types), quiz builder (fixed or draw-from-bank), exam settings, assignment builder with rubric editor.
- [x] Learner quiz UI: autosave, resume, results per `show_answers`.
- [x] Exam UI: pre-exam rules screen (what's recorded, non-refundable warning, time limit), timer (display only), one-question or full-paper mode, integrity signal capture, submit + auto-submit job.
- [x] Grading engine (pure, heavily tested) incl. partial credit for ordering/matching.
- [x] Instructor attempts review: flagged attempts, void with reason.
- [x] Assignments: submit (text/files/link), late policy, resubmission; grading queue for instructor/TAs with rubric UI; learner feedback view.
- [x] Procedures: `studio.questionBanks.*`, `studio.questions.*`, `studio.quizzes.*`, `studio.assignments.*`, `quizzes.start`, `quizzes.saveAnswer`, `quizzes.submit`, `quizzes.getAttempt`, `exams.start`, `exams.saveAnswer`, `exams.submit`, `exams.logIntegrityEvent`, `assignments.get`, `assignments.saveDraft`, `assignments.submit`, `grading.queue`, `grading.grade`, `grading.voidAttempt`.

## Acceptance
- [x] DTO snapshot tests prove answers never leave the server before allowed.
- [x] Submission after deadline + grace rejected; expired attempts auto-submitted within 1 min.
- [x] One in-progress attempt per user/quiz enforced under concurrency.
- [ ] k6 mini-test: 500 concurrent exam starts + autosaves, p95 < 500 ms. Script: `load/exam-spike.js` (learners from `pnpm --filter @tokslearn/core seed:load-exam`). Run against a preview, not locally: one local Node process can't stand in for Vercel.
- [x] Assignment graded by TA notifies learner.
