# Implementation status by feature family

Status terms: **Implemented and verified** means source present and this run had relevant automated verification; it does not imply all UX/device/live service configurations. **Implemented but not fully tested** means code exists but important environments/paths remain untested. **Partially implemented** means only part of described capability is supported or depends on external steps. **Broken** requires reproduced product failure. **Planned only / Not found** require source evidence.

| Feature family | Status | Evidence / limits |
|---|---|---|
| Local state, serialization, core schema | Implemented and verified (logic) | storage and types; TypeScript/build pass; no quota/private-mode stress. |
| Exact integer money/splits/balance math | Implemented and verified | 76 smoke assertions include exact paise and balances. |
| Personal/shared room creation and dashboard branching | Implemented but not fully tested | Source and authored E2E; E2E not executed this audit. |
| Demo isolation/member switching/reset/exit | Implemented and verified (logic) | smoke assertions verify sample-only and deterministic; current UI E2E blocked. |
| Expense create/edit/delete/undo | Implemented but not fully tested | Store/modal, smoke; duplicate-click authored E2E blocked. |
| Quick Buy manual purchase form | Implemented but not fully tested | Source and smoke related; browser interaction not rerun. |
| QR scanner/decode/gallery/camera controls | Implemented but not fully tested | Native/ZXing source; physical camera tests not done. |
| UPI QR/deep link and explicit return confirmation | Implemented but not fully tested | pure UPI smoke tests; no real device/app. Payment success is never inferred. |
| Settlement suggestion/confirmation | Implemented but not fully tested | balance/store/page source; no multi-account live sync or actual payment test. |
| Borrow & Lend local ledger | Implemented and verified (core rules) | smoke tests include pending/partial/full repayment; browser UI E2E blocked. |
| Borrow & Lend cloud RPC | Implemented but not fully tested | latest SQL/client exist; migration not applied/tested against live Supabase. |
| Recurring records and due generation | Partially implemented / environment-dependent | model/store/CRUD/dedupe key; no server scheduler in repository, automatic timing not proven. |
| SMS and statement parser/import | Implemented and verified (parser cases) | smoke suite; user must review; no bank connection. |
| Voice expense assistance | Implemented and verified (parser examples) | smoke assertions; microphone/device UX not tested. |
| Rules and merchant memory | Implemented but not fully tested | types/store/Rules/auto resolver; UI and rule precedence not exhaustively tested. |
| Reports/charts/export | Implemented but not fully tested | page, lazy charts, print/share; visual/PDF output untested. |
| Local backup/restore/offline packet | Implemented but not fully tested | storage/share code, sync packet smoke; full user restore and large data not tested. |
| Supabase Auth/RLS/snapshot/realtime/invites | Implemented but not fully tested | client+SQL present; no migrations applied or live service tests. |
| PWA/service worker | Partially implemented | manifest/worker/production registration exist; install, update and offline behavior untested. |
| Responsive layout, dark/light, reduced motion | Implemented but not fully tested | shared CSS/settings/source and contrast check; no full route/viewport matrix. |
| Automated accessibility | Partially implemented | axe test exists but couldn't launch; token contrast passes; manual review absent. |
| Three.js landing hero | Implemented but not fully tested | direct Three.js component, build; no GPU/device runtime test. |
| React Three Fiber / GSAP | Not found | no dependency/import/source usage. |
| MyDashboard route | Not found as a routed page | file exists but App routes `/room` to Dashboard and `/room/my` redirects. |
| Broken features | None reproduced | E2E setup blocker is not product defect; lack of evidence is not proof of no bugs. |
| Planned work | Not classified from aspirational docs alone | Release gates listed in source docs remain unverified; no unimplemented feature is called implemented. |

## v7.2.5 source update (2026-11-02)
The table above is the earlier v7.2.4 feature snapshot; current release changes and verification are recorded in `CHANGELOG-v7.2.5.md` and `COMPLETE-QA-REPORT.md`. In this source, item suggestions and expense/borrowing integration are implemented; financial invariants have smoke coverage. The landing Three.js scene is now wired through a lazy import and static fallback. Theme token contrast passes. Lint is clean. Chromium E2E, visual route review, live Supabase, physical camera/payment app, and Lighthouse are still unverified. See the route inventory and scanner/performance reports for boundaries.
