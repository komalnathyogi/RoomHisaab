# Route-by-route redesign record — v7.2.5

Design source changed; these routes have not all had browser screenshot/manual QA.

| Route | Existing live feature / treatment | Limits |
|---|---|---|
| `/` | Luxury landing hero, local variable fonts, interactive sample split calculator, Create/Join/Explore actions, demo and feature sections | Sample-only; no fabricated usage stats or unsupported feature promises |
| `/onboarding`, `/login`, `/recover`, `/join` | Existing local/cloud room creation, sign-in, recovery, room-code and invite flows using updated global tokens | Auth/provider and cloud not live-tested |
| `/room` | Existing current-room dashboard, balances, feed and quick actions under shared Obsidian/Pearl theme | No browser walkthrough |
| `/room/buy` | Existing Add Expense / Quick Pay / QR safety flows; gold action styling via semantic tokens | Camera/payment app/device unverified |
| `/room/history` | Expense and independent Borrowing tabs | Browser assertions not run |
| `/room/payments` | Settlement calculations and explicit payment confirmation | No real payment confirmation or live sync tested |
| `/room/insights` | Existing analytics/reporting; semantic colors adapt via theme variables | No visual chart review |
| `/room/analytics` | Redirects to `/room/insights` for compatibility | Alias, not a duplicate analytics implementation |
| `/room/members`, `/room/rules`, `/inbox` | Existing member, recurring bill and import tools; shared theme tokens | Cloud/RLS and browser interactions unverified |
| `/settings` | Existing account, appearance, backup and safety controls | Theme toggle retains saved preference |
| `/room/settings` | Redirects to `/settings` | Alias, not a duplicate settings implementation |
| `/room/guide`, `/room/about` | Existing guide and About screens | Visual QA unrun |
| Legacy aliases and unknown routes | Existing redirects and safe not-found screen remain | No route matrix walkthrough |

Desktop sidebar/topbar and mobile dock remain the app's real navigation. No speculative WhatsApp automation, currencies, social-proof counts or fake room balances were introduced. The browser suite cannot start: Playwright Chromium is missing from the available cache.

## Stability / UX follow-up
- Landing's optional 3D import retries once; on repeated chunk failure it renders the local static sample fallback instead of taking down the page.
- Start section is condensed into four responsive action cards: Try RoomHisaab, Create Your Room, Join an Existing Room, and Already Have a Room?
- Tour modal and launchers are removed across routes. Help links lead to the Guide page.
- Toast notifications are mounted globally beneath the header; login reports missing Room Login ID, username and personal password separately and posts a safe credential-mismatch notice.
- A multi-route mobile/tablet/desktop overflow test is authored but awaiting browser execution.

## Billing cycle / demo history
Onboarding and Members → Room settings expose a day 1–31 monthly cycle selector. History defaults to the active room cycle; calendar month and All dates are explicit alternatives. Selecting a cycle changes filtering only and never deletes older expenses. Demo seed data now spans 24 months with seeded variation and sample-only isolation.
