# RoomHisaab v7.2.2 — Test report

**Package:** `7.2.2-rc.0`  
**Run date:** 31 October 2026  
**Result:** Automated candidate checks passed; device/live release gates remain open.

## Automated results

| Command | Result |
|---|---|
| `npm run typecheck` | Passed |
| `npm run smoke` | 70 passed, 0 failed |
| `npm run contrast` | Passed in light and dark themes; all tested pairs meet WCAG AA contrast |
| `npm run build` | Passed |
| `npm run test:e2e` | 15 Chromium tests passed |
| `npm run test:a11y` | 1 landing-page axe scan passed |
| `npm audit` | 0 reported vulnerabilities |
| `npm run lint` | 0 errors, 34 warnings |

### E2E coverage added or retained

- Landing hero and sample preview switching.
- `Get Started`, How It Works, Features, Demo, About, and Contact anchors; hash updates, reduced motion, and Back/scroll restoration.
- Simplified demo flow; 1–10 member selector limits, quick selections, 5-member sample, and 2-member sample.
- Deterministic sample content after reset; Generate New Demo uses a different seed.
- Demo member switching, welcome card, exit, sample-only storage, and restoration of a saved real room.
- One-member/shared-room behavior, exact split persistence, Add Expense and Quick Pay distinction, scanner permission/missing-camera fallback.
- Layout overflow at target widths from 320 to 1920 pixels and in portrait/landscape samples.
- Supplied developer portrait path and dimensions, About/contact, and Settings consistency.

## Build note

The production build succeeds and splits route assets. The landing route chunk was approximately 37.7 kB raw / 10.5 kB gzip in this build; the deferred 3D hero remains a separate approximately 599.5 kB raw / 153.2 kB gzip chunk. These are bundle sizes, not Core Web Vitals measurements. LCP, INP, CLS, scroll frame rate, and on-device demo-generation timing were not measured.

## Warnings and known limits

ESLint reported 34 warnings and no errors. They include unused imports/variables and React hook dependency warnings across existing application files; review before production.

Automated Chromium and axe checks do not verify physical camera hardware, actual UPI applications, cloud operations, production configuration, or historical backup recovery. The QR scanner crash remains unverified; do not declare it fixed. No real payment was made or launched in these tests.

See `RELEASE_STATUS.md` for the mandatory release gates.
