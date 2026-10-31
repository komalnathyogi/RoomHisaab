# RoomHisaab v7.2.1 — Candidate changelog

**Package version:** `7.2.1-rc.0`  
**Status:** Work in progress; not a production release.

## Added and improved

- Added distinct Add Expense and Quick Pay actions to the mobile Add sheet and desktop sidebar. Quick Pay opens the scanner directly and the Add sheet closes first.
- Added a scanner-start lock, guarded camera/decoder initialization and cleanup, classified camera errors, and retry, image upload, and manual UPI fallbacks.
- Added explicit permission-denied and missing-camera browser tests. The reported original physical-device crash was not reproducible in this sandbox, so device verification remains required.
- Removed automatic welcome tours on dashboard entry and from demo opening. Added a dismissible first-time real-member welcome card and retained manual tour access in Help.
- Made the tour omit Settle Up for personal one-member rooms.
- Added About RoomHisaab, Meet the Developer, and Contact Us sections to the public landing page, responsive navigation and company footer links.
- Reused About/developer/contact content in Settings before Danger Zone.
- Added the developer photo as a static public asset using the uploaded JPEG byte-for-byte; no image editing or conversion was applied.
- Updated browser tests for Quick Pay error recovery, no demo auto-tour, About/Contact content, portrait load, Settings placement, and mobile navigation.
- Preserved existing expense, payment, demo, member-count, backup, and cloud code paths.

## Verification

The current run passed typecheck/build, 64 smoke checks, contrast checks, Chromium E2E, the landing-page automated axe scan, and `npm audit` with 0 reported vulnerabilities. ESLint has 0 errors but existing warnings remain. See the separate v7.2.1 test report for exact counts and blocked checks.

## Still blocked

The original crash has not been reproduced with a real handset; physical Android/iOS camera and QR behavior, real UPI app/payment handoff, live Supabase, Vercel production deployment, legacy backup recovery, and full manual accessibility testing remain unverified. Do not describe this candidate as production-ready or claim payment verification.
