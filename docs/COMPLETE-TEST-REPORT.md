# Complete test report — execution-specific snapshot

**Project:** package version 7.2.4. **Run date:** 2026-11-02 local. **Environment:** sandboxed Linux workspace, `npm ci` dependencies installed, no Playwright browser executable at expected cache path. Results below reflect commands executed now, not historical release-report claims.

| Command | Result | Evidence/notes |
|---|---|---|
| `npm run typecheck` (via `npm run check`) | PASS | `tsc --noEmit` exited successfully. |
| `npm run smoke` (via check) | PASS, 76 assertions | Demo isolation, parser, exact paise, balances/transfers, CSV, UPI link, voice, QR parse, comparisons, loan rules, sync packet. 76 pass, 0 fail. |
| `npm run contrast` | PASS | All listed light/dark foreground-background pairs ≥4.5:1; script reports WCAG AA pass. Static token pairs only. |
| `npm run build` (via check) | PASS | Vite 8.3.5; 1,297 modules transformed; emitted production chunks; 1.67s observed in this run. |
| `npm run test:e2e` | BLOCKED, 19 discovered, 0 executed | Browser launch failed before tests: missing `/home/user/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell`; Playwright recommends `npx playwright install`. All listed failures share setup failure; no product assertions ran. |
| `npm run test:a11y` | BLOCKED, 1 discovered, 0 executed | Same missing Chromium executable. Axe WCAG result unavailable. |
| `npm run lint` | PASS exit 0; 0 errors, 30 warnings | Warnings include unused imports/variables and missing Hook dependencies. See console output/source file locations summarized below. |
| `npm audit --json` | PASS command, 0 reported vulnerabilities | npm reported 0 info/low/moderate/high/critical advisories across 345 dependency graph entries. Advisory results depend on registry metadata and do not constitute application security review. |
| Live integration / device | NOT RUN | No live Supabase project, migration, payment app, physical Android/iOS device, camera test or deployed site. |

## E2E and axe setup failure detail
All 19 tests failed at `browserType.launch`, not from assertions. Test list in `tests/e2e/product.spec.ts` includes landing preview/anchors, demo isolation/reset/member count, Quick Buy form/scanner, desktop Quick Buy action, personal/shared navigation, second-member history preservation, rapid expense double-click, Borrow & Lend repayment separation, manual-only tour, responsive member/dashboard layout, About/contact, navigation route shortcuts, mobile landing menu, horizontal overflow, and landing axe scan. Treat these as authored test coverage, not passing current verification.

## Lint warning inventory
`npm run lint`: 30 warnings and no errors. Key source locations: `ExpenseCard.tsx` unused Avatar; `ExpenseModal.tsx` unused ease and missing `edit` dependency; `useStore.tsx` missing `cloud.status`, `cloudActiveMeta`, `pushToast` dependencies; `CloudJoin.tsx` missing dependencies; `Dashboard.tsx` several unused imports/derived analytics values plus missing `room`; `History.tsx`, `Insights.tsx`, `Members.tsx`, `Onboarding.tsx`, `QuickBuy.tsx` unused declarations or missing hook deps. Warnings need review; not individually proven to cause runtime defect.

## Reproducibility
`npm ci` installed dependencies before this run. `npm run check` returned exit code 0 and package banner `roomhisaab@7.2.4`. Playwright browsers are not part of npm dependencies and must be installed separately in a test environment. Previous `docs/TEST-REPORT-v7.2.4.md` claims 19 passing E2E in an earlier environment; current evidence supersedes only for this run, and the discrepancy is explained by missing browser binary.
