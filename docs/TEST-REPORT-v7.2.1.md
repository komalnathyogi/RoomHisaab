# RoomHisaab v7.2.1 — Test report

**Run date:** 31 October 2026  
**Package:** `7.2.1-rc.0`  
**Environment:** Local Linux sandbox, Node.js 20, Vite 8.3.5, Playwright Chromium 156  
**Overall result:** Automated local candidate checks passed; release approval remains blocked on physical-device and live-service verification.

| Check | Status | Result / boundary |
| --- | --- | --- |
| TypeScript typecheck | **Passed** | Included in `npm run check` |
| Logic smoke suite | **Passed** | 64 passed, 0 failed |
| Contrast-token suite | **Passed** | Tested light/dark pairs all 4.5:1 or higher |
| Production build | **Passed** | Local Vite build completed |
| Product E2E | **Passed** | 12 Chromium tests, 0 failed |
| Member split preservation | **Passed** | Adding a member left the historical split unchanged |
| Mobile Quick Pay flow | **Passed** | Add sheet closed; scanner opened directly; mocked permission denial showed retry, image-upload, and manual-entry options; closing returned to the room |
| Desktop Quick Pay flow | **Passed** | Sidebar action opened scanner directly; mocked missing camera showed a recovery state |
| Tour behavior | **Passed** | Demo and reset do not force the welcome tour |
| About / Contact / Settings | **Passed** | About sections, mailto link, portrait load, version and placement before Danger Zone checked in browser |
| Portrait file integrity | **Passed** | Uploaded JPEG copied unchanged; SHA-256 `bfcd354b2fe85dd0b7881d7ba21d895873ce73ebeb766ff62f5c70f9380839a6` |
| Responsive coverage | **Passed** | Landing overflow checked at 12 widths, 320–1920px; demo and dashboard targeted layouts/orientations checked |
| Automated axe scan | **Passed** | One landing-page WCAG 2.2 AA tag scan, after animation settled |
| ESLint | **Passed with warnings** | 0 errors, 35 warnings; review warnings before official release |
| Dependency audit | **Passed** | `npm audit` reported 0 vulnerabilities at test time |
| Original reported scanner crash reproduction | **Blocked** | No device/browser trace supplied; not reproduced in this sandbox |
| Physical Android/iOS camera and QR tests | **Blocked** | No handset, camera, torch, zoom, focus, gallery, or browser matrix tested |
| Real UPI hand-off/payment | **Blocked** | No payment attempted; app return is not bank confirmation |
| Supabase live cloud/RLS/migrations | **Blocked** | No project credentials or multi-account cloud test used |
| Vercel production deployment | **Blocked** | No deployment performed |
| Legacy backup restore | **Blocked** | No historical user backup/database restored |
| Full manual keyboard/screen-reader/200% zoom | **Blocked** | Automated tests are not a complete manual accessibility audit |
| Real-device performance/network | **Blocked** | No production or physical-device measurements |

## Important interpretation

The permission-denied and missing-camera browser tests demonstrate safe UI recovery under mocked failures. They do **not** prove that the original reported QR scanner crash is fixed on physical devices. Camera APIs and UPI app hand-off differ across browsers, OS versions, and devices.

Payment success remains explicitly user-confirmed. This app does not verify payments with a bank. A successful local build is not proof of cloud or production readiness.

## Release decision

**Not approved for production release yet.** Reproduce or close the reported physical scanner crash, complete the blocked device/live-service checks, review lint warnings, and rerun the full suite on the exact release commit. The accompanying source ZIP is a WIP snapshot, not the official release ZIP.
