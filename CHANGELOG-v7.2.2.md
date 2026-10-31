# RoomHisaab v7.2.2 — Candidate changelog

**Package version:** `7.2.2-rc.0`  
**Status:** Release candidate; not production-approved  
**Date:** 31 October 2026

## Landing experience

- Reorganized the public landing page into a clear journey: hero, start choices, sample preview, How It Works, features, demo selector, audience, About/developer/contact, payment safety, FAQs, and final action.
- Added sticky section navigation with active-section indication and mobile-menu close behavior.
- Added real hash anchors, sticky-header offsets, reduced-motion support, keyboard focus targets, and browser scroll restoration on Back.
- Kept Create Room and Join Room as direct routes; Get Started scrolls to the choice cards; Sign In stays a separate route.
- Updated the sample preview to show the specified one-member and three-member example totals.

## Member-count demo

- Replaced the old custom demo setup with a member-count-only selector: default 3; minimum 1; maximum 10; quick selections 1, 2, 3, and 5.
- Demo generation now uses a seed so names, expenses, categories, dates, payment methods, splits, pending examples, and reports are reproducible for a reset and testable.
- The one-member demo uses personal expenses without settlement balances; 2–10 member demos use shared splits and balances.
- Kept demo data in its isolated sample storage. The welcome card is non-blocking and dismisses persistently. Reset, Generate New Demo, Switch Member, and Exit Demo controls are available.
- Legacy `/demo` links redirect to the landing page's demo section. No demo setup asks for names, credentials, passwords, or a room name; sample payments do not launch a real UPI app.

## Preserved behavior and safeguards

- Preserved the one-member/shared-room behavior, Add Expense versus Quick Pay distinction, optional tour, shared About/developer/contact component, and the user-supplied portrait unchanged.
- Payment completion remains user-confirmed. A camera scan, app launch, or return from a payment app is not proof of payment.

## Verification summary

- `npm run check`: passed — typecheck, 70 smoke checks, contrast checks, and production build.
- `npm run test:e2e`: passed — 15 Chromium tests, including selector boundaries, seeded reset, real-room restoration, anchor navigation, responsive layouts, and existing Quick Pay fallback checks.
- `npm run test:a11y`: passed — 1 landing-page axe scan.
- `npm audit`: 0 reported vulnerabilities.
- `npm run lint`: 0 errors; 34 warnings remain and need review.

See `docs/TEST-REPORT-v7.2.2.md` and `RELEASE_STATUS.md` for the full candidate status and release blockers.
