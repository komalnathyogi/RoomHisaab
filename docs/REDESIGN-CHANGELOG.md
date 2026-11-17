# v7.2.5 — luxury design refresh

## Design system
- Replaced the prior indigo-forward theme with **Obsidian & Champagne** dark mode and **Pearl & Champagne** light mode using semantic CSS variables shared with Tailwind.
- Fresh profiles default to dark; existing saved theme choices are preserved. Gold CTAs use dark ink for strong contrast; semantic positive/due colors adapt by mode.
- Bundled local variable Inter, Plus Jakarta Sans and JetBrains Mono fonts. Financial numbers use tabular mono numerals.
- Retinted landing 3D textures and shared dark panels toward obsidian/gold while retaining the lazy load, pause/reduced-motion behavior and static fallback.

## Landing and routes
- Updated hero copy and added Create a Room, Join via Invite and Explore Features actions.
- Added an interactive, local sample split calculator using exact paise arithmetic. It does not persist room data or assert a payment.
- Added compatibility redirects `/room/analytics` → `/room/insights` and `/room/settings` → `/settings`.
- No unsupported WhatsApp automation, multi-currency, audit-trail, or fabricated social-proof claims were added.

## Previously implemented v7.2.5 features retained
Local English/Hinglish expense suggestions, Expense/Borrow integration, separate loan records, borrowing history tab, dashboard shortcut, responsive shell, theme controls, auth/cloud/backup behavior, sample-only demo isolation and manual payment confirmation are preserved.

## Validation
Typecheck, lint (0 warnings), 82 smoke checks, contrast and production build passed. Production dependency audit reported 0 vulnerabilities during dependency installation. Playwright browser test is blocked because no Chromium executable is available in this workspace. No Vercel deployment, live cloud, device payment/scanner, or production readiness is claimed.

## Responsive QA follow-up
Added a Playwright overflow matrix for the public and workspace routes at 360px, 768px and 1280px, including both new aliases. The test is authored but not executed here because the Chromium binary is absent. The currently observed Vite preview on 5173 responds HTTP 200; one earlier managed dev-server process exited with code 137 and the preview has since been relaunched.

## Error and clarity follow-up
- Fixed the supplied dynamic Hero3D import failure path with one retry and a safe static fallback.
- Replaced the eight-tile quick-link block and oversized duplicated landing cards with a concise “Start where you need” message and four compact entry cards.
- Removed the WelcomeTour popup and all of its launchers; kept the non-modal Guide page.
- Moved toasts to one global host below the top header on public/auth/workspace routes. Login now distinguishes missing room ID, username and password and provides a safe mismatch message.
- Added an unexecuted responsive route-overflow matrix for mobile/tablet/desktop. See `COMPLETE-QA-REPORT.md` for limitations.

## Monthly history and demo data
- Room owners can select any safe monthly cycle start day from 1–31 during room setup or in Room Settings. Expenses History now defaults to the active room cycle; the next period starts on the selected day while old records remain available under All dates. Calendar-month filtering is separately bounded to the current calendar month.
- Sample demos now generate seeded, varied expenses for 24 monthly periods (minimum two full years), with recent records first and a sample pending item. Data remains demo-only and exact-paise split logic is unchanged.

## Landing and history follow-up
- Landing navigation card restored to its previous full size. Order is navigation → Start cards → How It Works → Features → 3D preview. Shortened hero copy and removed repeated action buttons; the Create Room card now explains room type and monthly setup.
- History has a month picker that lists months with expenses; users can select a month and review only that month's records, alongside cycle, current calendar month, and all-history filters.
- Generic Supabase invalid-credential responses now explain that security does not disclose whether room ID, username, or password was wrong; field-level blank validation remains specific. Do not infer or reveal a credential based on a combined authentication failure.

## Landing, navigation, and live sync polish
- Hero description now has a larger, tinted panel that fills the formerly empty right column. The demo size presets remove 3 members, include 5 members, and default to five. Four start cards share a consistent minimum height.
- Added a top-right Back control to room pages and the landing, onboarding, login, join, cloud-join, and recovery headers. It returns to browser history when available, otherwise to that section's safe fallback.
- Existing Supabase Realtime room subscriptions coalesce expense/member/payment events and refresh all active room clients without page reload; event refresh debounce is now 120 ms. This depends on cloud connectivity and the Supabase Realtime table/policy configuration.
