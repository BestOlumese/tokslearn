# Phase 7 — Certificates

**Prompt:** Read CLAUDE.md, `docs/10 §8`, `docs/12 §5`. Execute Phase 7.

**Screens, errors, emails, events:** build every row marked Ph 7 in `docs/20-screen-inventory.md`, and wire the matching error codes (`21`), emails (`23`) and analytics events (`24`).

## Tasks
- [ ] Tables: certificate_templates, certificates, external_exam_results.
- [ ] Criteria checker per mode; `certificate-issue` Inngest function listening to events; exactly-once issuance.
- [ ] PDF template (`@react-pdf/renderer`): A4 landscape, clean typographic layout (no fake seals, no ornamental borders), QR code, public code, basis line.
- [ ] `/verify/[code]` page (cached, JSON-LD, OG image, revoked state) + `/verify` lookup form.
- [ ] External exam results: instructor records pass/fail with provider name, URL, evidence file; certificate shows "Externally assessed via {provider}".
- [ ] Revocation (instructor with reason / admin); name correction flow (once).
- [ ] Learner "My certificates" page, download, share to LinkedIn.
- [ ] Procedures: `certificates.listMine`, `certificates.download`, `certificates.verify`, `certificates.requestNameCorrection`, `studio.certificates.recordExternalResult`, `studio.certificates.revoke`, `admin.certificates.*`.

## Acceptance
- [ ] Completion, exam, and external paths each issue one certificate (E2E).
- [ ] Verify page Lighthouse ≥ 95 and shows revoked state after revocation within seconds.
- [ ] Issuing a certificate makes the order item non-refundable (integration test).
