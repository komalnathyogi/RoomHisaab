# RoomHisaab v7.2.0 — Candidate changelog

**Status:** Work in progress; not a production release. Package version: `7.2.0-rc.0`.

## Included in this candidate snapshot

- Added one-person versus shared-room navigation behavior based on active participants.
- Preserved historical expense splits when adding a participant; new expenses use the current member list.
- Added responsive landing preview and personal, shared, and custom sample demo setup with member switching, reset, and exit protections.
- Improved QR scanner capability handling, recovery paths, and UPI return messaging; physical device behavior remains unverified.
- Kept preferred payment app default at Ask Every Time and Quick Open opt-in; payment success remains user-confirmed.
- Added guards against rapid duplicate member, expense, and payment actions.
- Added responsive Playwright checks, member-split regression test, reduced-motion accessibility test setup, ESLint, and test scripts.
- Upgraded Vite, the React Vite plugin, and React Router; changed Vite chunk configuration to the Vite 8/Rolldown function form.
- Added an explicit `esbuild` development dependency for the smoke-test script and a `minimatch` override to resolve the audit finding.
- Updated README with current scripts, smoke-test count, and candidate-status disclosure.

## Verification summary

The current snapshot passed `npm run check`, 8 Chromium E2E tests, the landing-page axe scan, and `npm audit` (0 reported vulnerabilities). ESLint completed with 0 errors and 34 warnings. See the separate v7.2.0 test report and complete blueprint for exact scope and limitations.

## Not verified / release blockers

No physical Android/iOS, camera/torch/zoom/autofocus, real UPI payment, production Supabase, Vercel deployment, historical backup recovery, or full manual assistive-technology testing has been completed. Do not represent these capabilities as verified.
