# Release status — RoomHisaab v7.2.3

**Package version:** `7.2.3-rc.0`  
**Status:** Release candidate; not production-approved  
**Date:** 31 October 2026

## Automated checks completed

| Check | Result |
|---|---:|
| TypeScript typecheck | Passed |
| Smoke suite | 70 passed, 0 failed |
| Light/dark contrast suite | Passed; all checked pairs meet WCAG AA contrast |
| Production build | Passed |
| Chromium E2E | 18 passed, 0 failed |
| Landing-page axe scan | 1 passed |
| `npm audit --audit-level=moderate` | 0 reported vulnerabilities |
| ESLint | 0 errors; 32 warnings remain |

E2E coverage includes desktop/mobile landing navigation and section hashes, browser Back and reduced motion, action routes, seeded sample demo and restoration, Quick Pay form-first validation and scanner draft preservation, tour global dismissal/manual replay, About Us from personal/shared More menus, portrait/contact details, one-member/shared-room behaviour, prior split preservation, responsive layouts, and an axe scan. Browser tests do not verify physical camera/UPI operation.

## Not verified — release blockers

Do not treat v7.2.3 as production-ready until these checks are completed and documented:

- Physical Android/iOS camera and QR tests, including repeated open/close, torch, camera switching, gallery QR and recovery paths.
- Real UPI app handoff/return and amount-mismatch behaviour on supported devices. Payment success still requires explicit user confirmation.
- Live cloud/Supabase sync and permission-rule verification.
- Historical backup recovery and restore testing.
- Full manual keyboard and screen-reader accessibility review beyond automated tests.
- Representative real-device performance measurements and production configuration/deployment checks.
- Review and resolution (or documented acceptance) of the 32 ESLint warnings.

No GitHub push, deployment, live-service verification, physical scanner fix, payment verification, or production approval is claimed.

## Candidate files

- Implementation notes: `CHANGELOG-v7.2.3.md`
- Test report: `docs/TEST-REPORT-v7.2.3.md`
- Standalone blueprint: `/home/user/ROOMHISAAB-v7.2.3-COMPLETE-BLUEPRINT.md`
- Source archive: `/home/user/roomhisaab-latest-vscode-v7.2.3-rc.0.zip`
