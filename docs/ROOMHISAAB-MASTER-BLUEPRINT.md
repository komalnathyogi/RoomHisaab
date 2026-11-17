# RoomHisaab — complete A-to-Z master blueprint

**Evidence snapshot:** source tree `/home/user/roomhisaab`, package version **7.2.4**, inspected 2026-11-02 (Asia/Kolkata). This is an implementation audit, not a redesign or production certification. No source behavior was changed. The evidence is static source inspection plus commands actually run during this audit; live Supabase, live payments, physical devices, and deployed production were not available.

## Executive summary

RoomHisaab is a React single-page web app for recording personal/shared household expenses, splitting costs, tracking balances, and handing payment details to UPI apps. It can operate with browser-local storage and optionally connect to Supabase for authenticated shared rooms. Quick Buy combines a purchase form, QR scanning/QR generation and UPI handoff, but it does not verify that money moved. Expense settlements require member confirmation. Borrow & Lend is a distinct ledger and is kept out of expense balances. CSV/statement/SMS/voice assistance, recurring expenses, rules, reports, backups, offline share packets, demo data, and PWA installation affordances are also present in source.

**Top-level navigation (authenticated room shell):** Home (`/room`), Expenses (`/room/history`), central Add Expense action (dashboard query `?add=1` / `/room/buy`), Settle Up (`/room/payments`, for shared rooms) or Reports (`/room/insights`, personal-room variant), and More drawer/menu for secondary tools. The shell also includes search/command palette, theme, Help, Add Expense, and leave/sign-out actions. Actual control visibility depends on room mode, cloud role and state.

## Scope and counting method

- `src/App.tsx` declares **24 Route elements**: 19 primary app paths, four compatibility redirects (`/guide`, `/help`, `/home`, `/history`) plus the wildcard route. `/demo` and `/room/my` are redirect paths among those primary declarations. `/join` conditionally shows `JoinRoom` or `CloudJoin`.
- There are **20 page source modules** under `src/pages`; `MyDashboard.tsx` has no route/import from `App.tsx` and appears disconnected. Dashboard supplies the routed `/room` experience. Distinct rendered page experiences include the 17 routed page experiences (counting conditional join as two), the not-found view, and the orphaned MyDashboard module; do not count redirects as distinct pages.
- Source pattern scan found **421 `onClick=`, `onSubmit=`, or `onChange=` occurrences** across page/component TSX and **407 candidate clickable/tag patterns**. These are raw static occurrences, not deduplicated user-facing actions. Conditional UI, map-generated controls, native controls, keyboard behavior and action combinations make an exact unique-control count unreliable without instrumented DOM enumeration across every state. See action inventory for audited families and caveats; no unsupported exact total is claimed.
- “Major features” have no canonical source taxonomy; the inventory uses named feature families, not a fabricated numeric total.

## Product and technology

- React 18 + TypeScript; Vite 8 build/dev; React Router 7; Tailwind CSS 3/PostCSS.
- Supabase JS 2 client is optional/configured with `VITE_SUPABASE_URL` plus browser-safe publishable/anon key. No service-role credential is expected in the browser.
- Framer Motion for UI transitions; Three.js in an isolated Hero3D scene; Recharts for charts; ZXing browser/library for QR fallback; native `BarcodeDetector` when available; `qrcode.react` for QR rendering; `clsx` for class composition.
- Playwright + axe for browser E2E/a11y, esbuild for smoke test bundling, ESLint/TypeScript for static checks.
- Browser persistence is primarily localStorage (state, demo slot, drafts, deleted-expense undo); auth storage can use local/session storage preference. PWA service worker is registered only in production and its implementation is a small cache layer. It is not an IndexedDB-backed offline database.
- No GSAP and no React Three Fiber found. Three.js is used directly, on the landing hero only (not a site-wide 3D interface). Other visual scenes/effects use CSS/SVG/canvas.

## Route and page map

| URL | Actual behavior | Source |
|---|---|---|
| `/` | Public landing, feature/CTA sections, demo entry | `src/pages/Landing.tsx` |
| `/onboarding` | Create personal/local or cloud room flow | `src/pages/Onboarding.tsx` |
| `/demo` | Redirect to `/#demo` | `src/App.tsx` |
| `/login` | Cloud member sign-in and room selection/open | `src/pages/Login.tsx` |
| `/recover` | Account/member recovery | `src/pages/Recover.tsx` |
| `/join` | Local join flow or `CloudJoin` if invite token in URL | `src/pages/JoinRoom.tsx`, `CloudJoin.tsx`, `src/lib/cloud.ts` |
| `/room` | Main personal/shared dashboard; expense modal query supported | `src/pages/Dashboard.tsx` |
| `/room/guide` | In-app guide, flows, shortcuts | `src/pages/Guide.tsx` |
| `/room/about` | About and developer contact | `src/pages/About.tsx`, `AboutRoomHisaab.tsx` |
| `/room/my` | Redirect to `/room` | `src/App.tsx` |
| `/room/buy` | Quick Buy / Add Expense; `?mode=scan` starts in scan entry mode, not automatic payment | `src/pages/QuickBuy.tsx` |
| `/room/payments` | Settlement/payment center; one-member mode redirects to reports | `src/pages/Payments.tsx` |
| `/room/borrow-lend` | Requests, loans, repayments and history | `src/pages/BorrowLend.tsx` |
| `/room/history` | Expense history/search/filter/export/restore | `src/pages/History.tsx` |
| `/room/insights` | Charts, budgets, comparisons, reports/export | `src/pages/Insights.tsx` |
| `/room/members` | Member profiles, invites, UPI and admin actions | `src/pages/Members.tsx` |
| `/room/rules` | Auto-categorization/split rules | `src/pages/Rules.tsx` |
| `/inbox` | Import/review transaction inputs | `src/pages/Inbox.tsx` |
| `/settings` | Preferences, data, cloud/auth, Help & Guide and About sections | `src/pages/Settings.tsx` |
| `/guide`, `/help` | Redirect to `/room/guide` | `src/App.tsx` |
| `/home` | Redirect to `/room` | `src/App.tsx` |
| `/history` | Redirect to `/room/history` | `src/App.tsx` |
| any other path | “Page not found” with Home/Help links | `src/App.tsx` |

Room routes are wrapped in lazy-loaded `Layout`; route modules use `React.lazy`/`Suspense`, and `ChartsLazy.ts` delays report charts. Direct visit behavior when no room exists is handled individually (usually useful empty state or redirect, not one universal auth guard).

## Information architecture

```text
Public landing
  ├─ Create room → onboarding → room dashboard
  ├─ Join room → local room code OR cloud invite claim
  ├─ Sign in → room login ID + username + personal password
  ├─ Recover → recovery flow
  └─ Demo → isolated sample state → dashboard → safe exit/reset

Room shell
  ├─ Home / dashboard
  ├─ Expenses / history → detail/edit/delete/restore/export
  ├─ Add Expense → expense modal OR Quick Buy
  ├─ Settle Up (shared) / Reports (personal)
  └─ More → Members, Payments, Borrow & Lend, Inbox/import, Rules,
            Reports, Guide, About, Settings
```

## Core application behavior

### Local-first state

`StoreProvider` initializes from `emptyState`, loads/migrates browser state, tracks `ready`, saves to localStorage, and exposes actions for room/members/expenses/settlements/imports/rules/recurring/profile/demo/backup. Local edits are optimistic. A five-second toast undo path exists for deleted expenses. Cloud operations are routed through `src/lib/cloud.ts` and state synchronization in `useStore.tsx`; cloud status is represented as local/checking/connected/syncing/error. This does not establish successful live cloud operation.

### Finance rules

Amounts are integer paise. ₹1,234.56 is `123456`. Split routines preserve exact total by assigning residual paise deterministically. Balances derive from confirmed expenses and settlements; pending/ignored expenses are excluded from shared balance effects. Expense splits are stored with each expense, so changing present-day membership/default share does not recalculate historical splits. Loans and loan events are separate collections and are intentionally excluded from room expense totals and settlement debt reduction. Settlement confirmation records member IDs; code and cloud RPCs define finalization behavior. This is not a payment processor.

### Quick Buy / payment safety

Purchase form can be marked already paid or initiate an external UPI app handoff. Scanner parses seller UPI QR data; generated UPI URI/QR uses entered payee details and amount. A return prompt asks the user to confirm; browser return or app launch is not proof. The application explicitly tells users never to enter UPI PIN on this website. Manual VPA entry and QR image upload are fallback paths. Expense save validation and duplicate-submit lock are in the source. Physical device/app behavior is unverified here.

## Data entities

The canonical TypeScript models live in `src/lib/types.ts`: `AppState`, `Room`, `Member`, `Expense`, `SplitEntry`, `Settlement`, `BorrowRequest`, `RoomLoan`, `LoanEvent`, `Recurring`, `Rule`, `MerchantMemory`, `InboxItem`, `ParsedTransaction`, `Profile`. The `Profile` is local app preferences/active member, not the Supabase profile row. Cloud row models are normalized separately in `cloud.ts` and SQL migrations. Full field explanations and persistence rules are in `DATABASE-AND-DATA-MODEL.md`.

## Cloud/security summary

SQL migrations define Supabase tables, constraints, RLS policies, RPCs, triggers and Realtime publication membership. The client config validates URL/key format, persists Auth sessions, translates errors, hashes recovery keys client-side before RPC use, and uses invite preview/claim endpoints. RLS/RPC is the intended authority boundary; front-end role checks are UX only. Included migrations are not evidence that they were applied to any live project. Permanent invite URLs are bearer secrets. No secret/service-role key should be placed in Vite-exposed env variables. No live cloud security audit or multi-user test was run during this audit.

## UI, accessibility, 3D and PWA

The CSS token system provides light/dark color variables, shared buttons/cards/forms, focus-visible styling and motion controls. `useTheme`/profile settings select themes. `MotionConfig` respects profile reduceMotion and operating-system preference; CSS also has reduced-motion support. Landing uses `Hero3D.tsx` direct Three.js WebGL; hero catches renderer initialization failure/fallback behavior in its component. It is not a React Three Fiber app. Charts are Recharts. The source supports responsive shell/navigation, keyboardable controls and labels, but automated axe run was blocked by missing Playwright browser in this execution. Contrast test did pass. Full screen-reader/manual keyboard coverage is not established.

PWA: `public/manifest.webmanifest`, icons, `public/sw.js`; registration is production-only. Bundle caching/update correctness and offline UX were not browser-tested in this run. No runtime Core Web Vitals, GPU, memory, network waterfall or physical mobile performance measurements were collected.

## Current verification (this audit run)

| Command | Observed result |
|---|---|
| `npm run check` | Passed TypeScript; 76/76 smoke assertions; contrast checks (all listed pairs AA); production Vite build. Exact sizes in performance report. |
| `npm run test:e2e` | **Blocked/fails to start tests:** 19 discovered; 0 executed; Chromium executable missing (`chromium_headless_shell-1248`). Not a product test failure. |
| `npm run test:a11y` | Blocked for same missing browser; 1 axe test not executed. |
| `npm run lint` | Exit 0; **0 errors, 30 warnings** (unused items and hook dependency warnings). |
| `npm audit --omit=dev --json` | Exit 0; 0 reported production dependency vulnerabilities; 66 prod deps / 345 total graph entries as npm reports. Does not assess app security or dev dependencies. |
| Physical device / live Supabase / payment | Not run. |

`docs/TEST-REPORT-v7.2.4.md` is historical project documentation and records a previous environment's successful Playwright run. It is not used to overwrite the results above; this report is execution-specific.

## Issues and priorities

1. **High / release gate:** E2E and automated axe could not execute due to missing browser binary. Install matching Playwright browser and rerun.
2. **High / release gate:** Supabase migrations (especially `202611020005_borrow_lend_permanent_invites.sql`) need staging application and RLS/RPC/invite/realtime tests.
3. **High / payment safety gate:** camera decode, UPI app handoff/return and manual confirmation need Android/iOS device test. Never infer success from return.
4. **Medium:** 30 lint warnings include missing React hook dependencies and unused declarations; inspect rather than assume harmless.
5. **Medium:** route source contains 20 page files but MyDashboard is not routed/imported from App; determine whether intentionally legacy/dead code.
6. **Medium:** scanner and 3D/device performance, memory cleanup and offline/service-worker behavior are not measured.
7. **Low/Medium:** app-wide unique button count and every conditional validation/error copy require DOM/state coverage; static source counts cannot be presented as exact unique-action counts.

No verified runtime crash or broken primary route was reproduced because browser E2E could not launch. “Not reproduced” is not “bug-free.” Security risks requiring review include bearer invite leakage, user-entered private data in browser storage/backups, environmental configuration, RPC authorization and local device access. No secrets are included in this document.

## Status vocabulary and feature count

Feature counts depend on granularity. This audit names feature families in `IMPLEMENTATION-STATUS.md` and classifies each as **implemented and verified**, **implemented but not fully tested**, **partially implemented**, **broken**, **planned only**, or **not found**. `Broken` is reserved for observed failure; missing test infrastructure is `implemented but not fully tested` or `blocked`, not a broken product feature. No source-confirmed feature was marked broken solely because it was not tested.

## Release/version facts

Package version is `7.2.4`; changelogs v7.2.0–v7.2.4 are in project root. v7.2.4 changelog calls it a release candidate and lists Borrow & Lend, permanent invites, scanner zoom, landing and tour changes. Prior features are summarized only where existing release notes explicitly say so. The release status says not production-ready. Version history audit: `VERSION-HISTORY.md`.

## Documentation index

- `COMPLETE-PAGE-MAP.md`
- `ALL-BUTTONS-AND-ACTIONS.md`
- `COMPLETE-USER-FLOWS.md`
- `DATABASE-AND-DATA-MODEL.md`
- `CLOUD-AUTH-AND-REALTIME.md`
- `QR-SCANNER-TECHNICAL-REPORT.md`
- `UI-UX-AND-3D-DESIGN-AUDIT.md`
- `PERFORMANCE-REPORT.md`
- `COMPLETE-TEST-REPORT.md`
- `BUG-AND-ISSUE-REGISTER.md`
- `FILE-TO-FEATURE-MAP.md`
- `IMPLEMENTATION-STATUS.md`
- `VERSION-HISTORY.md`

## Limits

Static analysis cannot reliably enumerate every rendered control in every branch, prove all validation messages, test every role/device/theme combination, establish cloud state in a remote Supabase project, validate real payments, or measure runtime performance. This blueprint distinguishes source evidence from test evidence; it intentionally does not label the entire application fully verified or production-ready.
