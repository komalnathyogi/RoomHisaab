# RoomHisaab v7.2.0 — Test report

**Run date:** 31 October 2026  
**Target:** v7.2.0 candidate source snapshot (`7.2.0-rc.0`)  
**Environment:** Local Linux sandbox, Node.js 20, Vite 8.3.5, Playwright Chromium 156  
**Overall result:** Automated local checks pass; release gate remains blocked on physical-device, live-service, and manual verification.

| Test / check | Status | Result |
| --- | --- | --- |
| TypeScript | Passed | `npm run check` typecheck step passed |
| Logic smoke tests | Passed | 64 pass, 0 fail |
| Colour contrast tokens | Passed | Light/dark token pairs passed at 4.5:1 or higher |
| Production build | Passed | Local Vite build completed |
| Product E2E | Passed | 8 Chromium tests, 0 failures |
| Expense split preservation | Passed | Adding the second member preserved the old expense's split |
| Demo behavior | Passed | Sample demo switching, reset, exit and personal/shared flows exercised in browser |
| Responsive checks | Passed | Target viewport widths and orientations checked by browser tests; landing overflow covered at 12 widths from 320 to 1920px |
| Automated accessibility | Passed | One landing-page axe scan passed WCAG 2.2 AA tags after entrance transitions settled |
| ESLint | Passed with warnings | 0 errors, 34 warnings; review before production release |
| Dependency audit | Passed | `npm audit` reported 0 vulnerabilities at test time |
| Android/iOS physical-device tests | Blocked | No handsets tested |
| Physical QR/camera controls | Blocked | Camera, torch, zoom, autofocus, tap focus and gallery import not validated on hardware |
| Real UPI app/payment | Blocked | No real payment attempted; no bank confirmation is claimed |
| Supabase cloud and RLS | Blocked | No live project credentials or multi-account cloud test used |
| Vercel deployment | Blocked | No deployment was performed |
| Legacy backup/migration recovery | Blocked | No representative historical user backup/database restored |
| Manual screen reader, keyboard, zoom audit | Blocked | Automated checks do not establish full assistive-technology support |
| Production performance | Blocked | No real-user/device or production network measurements |

## Notes

- The automated E2E suite ran against Chromium only; it is not a broad browser/device compatibility matrix.
- UPI launch, returning from a payment app, and recording a payment are distinct actions. Payment status must be explicitly confirmed by the user in the product's supported flow.
- A local production build does not prove production environment configuration, cloud permissions, migration safety, monitoring, or deployment.
- No zero-bug, zero-latency, or universal device compatibility guarantee is made.

## Release decision

**Not approved for production release yet.** Complete all blocked tests, review/fix or justify lint warnings, and repeat the full suite on the exact release commit. See the separate `ROOMHISAAB-v7.2.0-COMPLETE-BLUEPRINT.pdf` for the product plan and acceptance gates.
