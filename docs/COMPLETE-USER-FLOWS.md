# Major user journeys — implementation trace

These flows describe source paths, not a claim that live cloud/device steps were executed. Entry/exit and errors vary by local/cloud configuration.

## A. First-time visitor
`/` landing → Create Room `/onboarding`, Join `/join`, Sign In `/login`, Recover `/recover`, or Try Demo (`loadDemo` → `/room`). Landing contains explanatory features/how-it-works/about/contact anchors. Failure: invalid/unavailable cloud env blocks cloud option; local create is the alternative. Demo is sample-only; reset/exit path is separate from real room storage.

## B. Create room
`/onboarding` steps collect room and creator name/profile; optional initial members; monthly/custom cycle; choose local/cloud. Local path calls `createRoom` and stores AppState locally. Cloud path calls `cloudCreateRoom`, requiring configured Supabase and cloud credentials/room password/personal account values. Then dashboard. Validation: required names, cycle bounds and cloud credentials; max room/member caps are validated in client and RPC. Failure: toast/form error; preserve input as designed. Browser/remote cloud not tested in this audit.

## C. Join room
Local route `/join` accepts room/invite code and name/member selection; can merge local sync packet where applicable. Cloud invite token parsed from URL routes to `CloudJoin`; preview → choose reserved/existing member or create identity → room password/personal account claim → cloud snapshot. Failure branches include invalid/expired/revoked invite, already claimed member, room full, wrong password, network/RLS errors. Permanent invite is bearer access to join, not login.

## D. Existing member login; E. logout and login again
`/login`: Room Login ID + username + personal password → Supabase Auth identity synthesized by `memberAuthEmail` → load memberships/snapshot → select/open room. Remember-device preference chooses session/local auth storage; password is not retained in login hint. Logout uses shell/settings cloud sign-out path, clears cloud metadata/session per auth persistence. Remote session refresh/reconnect and multi-room cases require live tests.

## F. Password/account recovery
`/recover`: select/submit relevant recovery flow; may accept invitation/recovery key or admin-driven reset depending page branch and cloud APIs. Recovery hashes key before RPC (`recovery.ts`, `cloud.ts`); successful flow returns to room/login. Failure: translated error for invalid key/session/permissions. No live endpoint was exercised. Database/admin support must match included migrations.

## G. One-member room
Create/local demo with one actual member → dashboard personal variant. Shared-settlement navigation is replaced by Reports; direct `/room/payments` redirects to `/room/insights`. Add expense remains personal; personal expenses have own split. Adding a second real member switches shared view but historical `Expense.splits` remain stored values.

## H. Add more members / I. shared room
Members → add name and optionally details/virtual tracking-only → profile; local remove available when allowed. Cloud invite creation and claim are separate authenticated paths. Add second non-virtual member → shared UX; member roles and access differ cloud/local. Member limits in code/RPC; names and profiles must validate. Cloud role, invite, and permissions need staging verification.

## J. Add Expense
Dashboard Add Expense or Quick Buy; full modal accepts description, amount, category, payer, method, split mode and split values, notes/photo/date fields as exposed. Parse rupees into paise; validate positive amount, required description/member, exact split sum. Save → local optimistic state/localStorage, optional cloud push; success toast. Edit updates stored expense and preserves original splits unless edited. Delete soft/undo path; errors handled by toast. Duplicate-save browser test exists but current browser unavailable.

## K. Quick Pay / L. QR scan / M. UPI handoff / N. return
Quick Buy `/room/buy` starts with expense form; scan entry `/room/buy?mode=scan` still requires purchase details and user action. Camera permission → `BarcodeDetector` if present or ZXing/native fallback → parsed seller VPA/name/amount confirmation; gallery image and manual VPA fallback. Build UPI deep link/QR for selected app; user opens external app and reviews payee/amount independently. On return, UI asks user to confirm; only confirmation records paid expense. If user does not confirm, no false success is recorded. Errors: blocked/absent/busy/insecure camera, invalid VPA, malformed QR, amount mismatch, unsupported app, app handoff failure. Physical device testing not performed.

## O. Settlement confirmation
Payments identifies suggested debts from balance engine → PaySheet/QR or app link → user separately pays externally → record settlement and confirmations by participants. Only confirmed settlement affects future balance. UPI open/return does not prove settlement. Missing payee UPI ID directs to Members. Exact cross-device confirmation depends on cloud state/realtime; not live tested.

## P. Borrow & Lend
Borrow & Lend page needs at least two real room members. Requester submits amount/reason/counterparty → counterparty approves/declines/cancels → separate loan record may be created and lender/borrower acknowledge funds → borrower reports repayment amount → lender confirms/declines. Outstanding decreases only on confirmation; partial repayment allowed up to outstanding; events form history. Loans are not shared expenses. Local smoke assertions cover key math/state; cloud RPC workflow not live tested.

## Q. Recurring bills
Settings/secondary tools expose recurring records; add amount/category/payer/split/day 1–28/method; toggle/delete/run due. `lastRunKey` prevents duplicate month record. Repository has no server cron; recurrence depends on client invocation/store lifecycle. Offline/closed-browser due generation and cloud scheduler are not established.

## R. Import expenses
Inbox supports pasted SMS/parsed transactions, statement/CSV parsing, voice assistance and review. Parser creates inbox candidate (dedupe/confidence/source); user may edit/accept/ignore or high-confidence batch. Accepted item becomes Expense; no automatic bank connection shown. CSV malformed input returns error; salary credits skipped in statement parser. Do not treat parser output as authoritative; personal SMS and raw text may be stored locally.

## S. Reports
Insights uses date/cycle comparisons, spending/categorization, budgets and member summaries. User may print to PDF or create/share statement; charts lazy-load. History independently filters and CSV exports. Reports are analytics, not accountant/tax certification.

## T. Demo creation / U. switching / V. reset and exit
Landing demo chooser `loadDemo({memberCount, seed})` → sample room with no cloud identity → dashboard. Member selector switches active sample member. `resetDemo` regenerates matching sample state; `exitDemo` clears demo slot and restores previous real/local state. Code and E2E tests assert isolation/reproducibility, though E2E did not run this audit. Avoid copying sample records into real state unless deliberate export/import path.

## W. Backup and restore / X. cloud sync
Settings export serializes app state; import parses/validates and replaces local state. Offline sync packet helpers remove photo/raw SMS and merge selected room data; join link encodes packet. Cloud local-room migration maps entities to normalized tables, then cloud snapshot is loaded and subscriptions refresh state. Cloud conflicts/merge/version `updatedAt` behavior are in `cloud.ts`/store; server authority is required. Backups include sensitive household data; protect files. Live restore/cloud synchronization not tested.

## Y. Offline behavior
Local-first room state and local calculations continue without network while browser storage exists. Browser localStorage quota/private mode can fail; service worker caches production assets but is not a durable offline data store. Cloud room writes and auth need network; reconnection/snapshot retry is coded but not network fault-injection tested. Offline local sync packet is a user-mediated transfer path, distinct from realtime.

## Z. Settings and Help
Settings owns theme/language/reduced-motion/profile, demo/data operations, cloud session/room tools, manual Help & Guide launch, About/contact. Help route also exists. Automatic tour popup is not expected. Destructive data clearing/import require confirmation; preserve backups before destructive operations.

## Related source map
`App.tsx`, `hooks/useStore.tsx`, `lib/storage.ts`, `lib/cloud.ts`, `lib/share.ts`, `lib/seed.ts`, `lib/money.ts`, `lib/balances.ts`, `lib/upi.ts`, `lib/instantPay.ts`, `lib/borrowLend.ts`, `lib/statement.ts`, `lib/smsParser.ts`, plus the corresponding page components.
