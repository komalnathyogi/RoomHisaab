# QA report — RoomHisaab v7.2.5 stability and responsive follow-up

Results refer to the current workspace source.

| Check | Result | Scope / caveat |
|---|---|---|
| TypeScript / `npm run build` | PASS | Build includes TypeScript check and production Vite bundle |
| `npm run lint` | PASS | 0 errors, 0 warnings |
| `npm run smoke` | PASS | 84 pass, 0 fail; includes exact monthly-cycle boundaries, 24-month demo history and financial invariants |
| `npm run contrast` | PASS | All defined light/dark pairs and gold CTA foregrounds meet 4.5:1 |
| Production dependency audit | PASS | 0 vulnerabilities reported during install |
| Playwright browser suite | BLOCKED | Chromium executable missing; E2E assertions did not run |
| Responsive route matrix | ADDED, UNVERIFIED | Tests 19 routes at 360, 768 and 1280 CSS px; requires Chromium |
| Visual/axe/manual screen-reader QA | NOT RUN | Browser unavailable |
| Supabase / payment-app / physical scanner | NOT RUN | No live or device verification |
| Vercel deployment | NOT RUN | Source changes only; no deployment made |

## Error report and recovery
The provided error was `Failed to fetch dynamically imported module: …/src/components/Hero3D.tsx`. Landing now retries the optional hero import once and resolves to its static sample visual on failure, rather than letting a decorative module error blank the application. A managed development process was also observed exiting with code 137; port 5173 has since been relaunched and returned HTTP 200 on the latest health check.

## Interaction changes
A global toast host is now rendered once at app level, below the top header, so notifications from both standalone auth screens and workspace routes appear consistently. Login reports missing Room ID, username or password separately; invalid combinations produce a clear safe message without confirming which account identifiers exist. The welcome/demo tour component and launcher were removed; the regular Guide page remains.

## Limits
Contrast is a token-pair check, not a full rendered-page audit. The responsive route matrix is authored but cannot be claimed passing without a browser run. No production readiness, cloud, deployment or device validation is asserted. Please provide any new exact browser/console error and route if it persists.
