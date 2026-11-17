# Version history from available repository records

## Current actual version
`package.json` and package script banners identify **7.2.4** as the current source version. This is the v7.2.4 ZIP-restored source currently under audit. Current package/version source is primary evidence.

## Available project records
Root includes `CHANGELOG-v7.2.0.md` through `CHANGELOG-v7.2.4.md`, plus release statuses for v7.2.3/v7.2.4 and corresponding test reports for v7.2.0–v7.2.4. These records are evidence of documented changes, not proof each older source tree is present or that every claim was tested now.

## v7.2.4 (current)
Release candidate; marked not production-ready in release status. Changelog states: landing navigation/anchors, no automatic welcome/tour popup, manual tour in Settings → Help & Guide, separated cloud login and invite-claim flow, optional non-expiring admin invite links with rotation/revocation, Borrow & Lend requests/transfers/partial repayment history, scanner pinch zoom and adaptive QR polling, Realtime additions for loan tables, extended local backup/offline packets and local-to-cloud migration. Latest SQL migration `202611020005_borrow_lend_permanent_invites.sql` must be reviewed/applied for corresponding cloud features. This audit did not apply it.

## v7.2.3
The changelog documents a single scrolling landing flow with eight same-page destinations, seeded 1–10 member demo, expense-first Quick Pay, persistent draft, explicitly user-confirmed payment return, manual-only tour invitation/replay, and About Us in More. Its historical report claims 18 E2E pass and an axe scan, while physical camera, UPI, cloud, backup restore and manual accessibility remained unverified.

## v7.2.2
The changelog records a reorganized public landing journey, hash anchors/focus/scroll restoration, member-count-only deterministic demo (default 3, range 1–10, sample-only), reset/switch/exit, preserved personal/shared behavior and explicit payment confirmation. Historical tests say 70 smoke checks, 15 Chromium E2E and 1 landing axe scan passed; these are not current-run results.

## v7.2.1
The changelog describes distinct Add Expense and Quick Pay entry points, guarded scanner startup/cleanup and fallbacks, removal of automatic tours, optional manual tour, About/developer/contact content and supplied portrait. Historical report says 64 smoke checks and Chromium E2E passed; real handset, payment, cloud and production remain unverified.

## v7.2.0
The candidate changelog identifies personal/shared navigation, historical split preservation, responsive demo, QR recovery/UPI return messaging, app preference defaults, duplicate-action guards, responsive Playwright/a11y setup, Vite/Router upgrades and minimatch override. It says work-in-progress, not production release; physical devices, live Supabase, deployment and manual accessibility were not verified.

These bullets are transcribed from the repository changelogs. They do not establish that every change was independently tested in the current source.

## Test-report discrepancy
`docs/TEST-REPORT-v7.2.4.md` records a historical run with 19 Playwright tests passed. In this audit environment, 19 tests are discovered but none execute because Playwright Chromium binary is missing; the axe test is similarly blocked. Both records can be true for their respective environments. Current execution results are in `COMPLETE-TEST-REPORT.md`.

## Prior source/version artifacts
The workspace previously had v7.2.5 materials and v7.2.6 working tree, but active source was deliberately restored to v7.2.4 at the user's request. This audit package only includes current project plus generated docs, excluding unrelated root archives and private files. Do not infer that v7.2.5+ was deployed or that any release is production-ready.

## v7.2.5 — current working source (2026-11-02)
The earlier “current actual version” paragraph records the pre-redesign v7.2.4 snapshot; it is superseded by this entry. The current working tree is v7.2.5 (`package.json` and `src/lib/constants.ts`). See `CHANGELOG-v7.2.5.md` and `COMPLETE-QA-REPORT.md`. Source build, typecheck, lint, smoke, contrast and production audit pass; 21 Playwright cases are blocked before assertions because Chromium cannot load `libnspr4.so`. No production deployment is asserted.
