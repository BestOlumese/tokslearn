# Phase 7 — Certificates

**Prompt:** Read CLAUDE.md, `docs/10 §8`, `docs/12 §5`. Execute Phase 7.

**Screens, errors, emails, events:** build every row marked Ph 7 in `docs/20-screen-inventory.md`, and wire the matching error codes (`21`), emails (`23`) and analytics events (`24`).

## Tasks
- [x] Tables: certificate_templates, certificates, external_exam_results.
- [x] Criteria checker per mode; `certificate-issue` Inngest function listening to events; exactly-once issuance.
- [x] PDF template (`@react-pdf/renderer`): A4 landscape, clean typographic layout (no fake seals, no ornamental borders), QR code, public code, basis line.
- [x] `/verify/[code]` page (cached, JSON-LD, OG image, revoked state) + `/verify` lookup form.
- [x] External exam results: instructor records pass/fail with provider name, URL, evidence file; certificate shows "Externally assessed via {provider}".
- [x] Revocation (instructor with reason / admin); name correction flow (once).
- [x] Learner "My certificates" page, download, share to LinkedIn.
- [x] Procedures: `certificates.listMine`, `certificates.download`, `certificates.verify`, `certificates.requestNameCorrection`, `studio.certificates.recordExternalResult`, `studio.certificates.revoke`, `admin.certificates.*`.

## Acceptance
- [x] Completion, exam, and external paths each issue one certificate (E2E). Covered end to end through the services in `certificates.int.test.ts` (purchase → finish, pass or record → issue once, even with 5 racing runs → PDF → email → verify), plus a browser walk of the exam path on a production build. Not a Playwright spec: issuing runs in Inngest jobs, which the E2E environment doesn't run.
- [x] Verify page Lighthouse ≥ 95 and shows revoked state after revocation within seconds. Local mobile run: performance, accessibility and best practices 100. Revoked shown about 2 s after the revoke call. `/verify/TL-C-0000-0000` is in Lighthouse CI.
- [x] Issuing a certificate makes the order item non-refundable (integration test).
