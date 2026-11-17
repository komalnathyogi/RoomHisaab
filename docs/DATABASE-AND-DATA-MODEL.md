# Database and data model — v7.2.4

## Local state types (`src/lib/types.ts`)

| Type | Fields and purpose | Constraints/relations/persistence |
|---|---|---|
| `AppState` | `version`, nullable `room`, `members`, `expenses`, `settlements`, `borrowRequests`, `loans`, `loanEvents`, `recurring`, `rules`, `merchants`, `inbox`, `profile` | Root localStorage JSON state; sanitized/migrated by storage; app state schema version. |
| `Room` | `id,name,code,loginId?,cloud?,demo?,mode?,demoMembers?,demoSampleExpenses?,demoSeed?,rentCycleDay,cycleMode?,cycleStart?,cycleEnd?,createdAt,updatedAt?` | Owns logically associated data by `roomId`; cycle day 1–28; custom timestamps; local/demo/cloud flags. |
| `Member` | identity/name/color; optional full name, UPI, phone/email, preferred UPI app/quick open, share %, monthly budget paise, city/notes, virtual flag, role, joinedVia/activity; cloud identity/login/claimed/status | Room member referenced by expense payer/splits, settlements, requests and loans. Virtual parties are tracking recipients, not login-capable. |
| `Expense` | id/roomId/description/category/amountPaise/payerId; optional cloud creator; method/splitMode/splits; photo/note/vendor/UPI/instantPay; source/confidence/status/rawText/reactions; created/updated/version/deleted | `amountPaise` integer; `splits[]` references member IDs and exact paise; method cash/upi/card; status confirmed/pending/ignored; source manual/sms/ocr/voice/rule/recurring/quickbuy. |
| `SplitEntry` | `memberId,paise` | Historical allocation embedded per expense. Never inferred from current member defaults for old entries. |
| `Settlement` | id/roomId/fromId/toId/amountPaise/method/confirmedBy/note/createdAt | Confirmation list; impacts balance only under confirmed policy in `balances.ts`/store. |
| `BorrowRequest` | id/roomId/requesterId/counterpartyId/amountPaise/reason/status/reviewedById/reviewedAt/createdAt/updatedAt | Status requested/approved/declined/cancelled; becomes separate loan workflow. |
| `RoomLoan` | id/roomId/lenderId/borrowerId/principalPaise/repaidPaise/pendingRepaymentPaise/pendingRepaymentBy/requestId/status/note/timestamps | Active/outstanding and acknowledgement states; not an expense. |
| `LoanEvent` | id/roomId/loanId/actorId/kind/amountPaise?/createdAt | Append-like user action history; event kinds cover request, funds, receipt, repayment and cancellation. |
| `Recurring` | id/roomId/description/category/amountPaise/payerId/splitMode/dayOfMonth/method/active/lastRunKey? | Day 1–28; lastRunKey such as YYYY-MM helps prevent duplicate generation. |
| `Rule` | id/roomId/label; `when` merchant/amount/category; `then` category/split/payer/personalOf; active | Local automation used by parser confirmation; not a scheduler or bank rule. |
| `MerchantMemory` | normalized key/displayName/default category/split/payer/hits | Learned defaults used by transaction resolution. |
| `InboxItem` | id/rawText/parsed/confidence/source/createdAt/status/expenseId? | New/confirmed/ignored; local review queue, no direct bank feed. |
| `ParsedTransaction` | amountPaise/direction/merchant/key/bank/date/txnRef/methodGuess/confidence/category?/payer? | Parser suggestion only; must review. |
| `Profile` | id/memberId?/name/theme/language/reduceMotion/onboarded | Local app profile/preferences and active member pointer; distinct from cloud `profiles`. |

## Money and balance rules

`money.ts` converts human rupee input to integer paise, formats INR and splits totals. Equal split distributes integer remainder without losing a paise (e.g., 100000 / 3 → 33334, 33333, 33333). Percent/exact/subset modes validate against total. `balances.ts` computes net balances from eligible expenses and settlements and minimizes transfers. Pending/ignored expenses do not alter confirmed balances. Expense split arrays preserve historical allocation when room members are added/removed or default preferences change. Tests in `tests/smoke.ts` cover exact sum, parser, net zero and transfer bounds.

Loans use `borrowLend.ts`/store operations. Pending repayment does not reduce principal; confirmed partial repayment reduces outstanding and a full repayment closes. Borrowing is intentionally excluded from expense totals and settlements. This separation is source-confirmed and smoke-tested locally.

## Persistence and data privacy

`lib/storage.ts` stores the primary state and separate demo state/active marker in localStorage; `trash.ts` stores recently deleted expenses; persistent drafts use browser storage. `authPersistence.ts` manages Supabase session storage preference and login hints/cloud metadata. No IndexedDB persistence is found. Browser local data is not encrypted by this app layer. Exports/sync packets can contain personal expense/member data; sharing needs user care. `share.ts` strips photos/raw SMS from sync packet as tested, but full app backup may retain more data.

## Supabase schema

Migrations define normalized tables (full SQL is source of truth): `profiles`, `rooms`, `room_members`, `room_secrets`, `room_invites`, `expenses`, `expense_splits`, `expense_reactions`, `settlements`, `settlement_confirmations`, `recurring_expenses`, `room_activity_log`, plus Borrow & Lend tables including `borrow_requests`, `room_loans`, `loan_events` (v7.2.4 migration). Foreign keys connect room/member/expense/loan records; constraints and RLS are in migration files. Full table columns are intentionally not copied as a substitute for SQL; inspect migrations for authoritative DDL.

## Cloud mapping/conflicts

`cloud.ts` maps normalized rows to local `AppState`, serializes member details JSON and dates, loads snapshot, pushes expense/settlement/recurring/reaction changes, runs invite/auth/recovery/loan RPCs and fetches membership. Local `Expense.version`/timestamps support merge conflict decisions. Exact transaction atomicity and concurrency behavior must be confirmed in SQL and live staging. No live database was queried during this audit.

## Data model gaps/risks

- Local storage is origin/device scoped and vulnerable to browser data clearing/device access.
- Full exports may carry member contact and raw/import content; handle as private financial data.
- Cloud JSON details and local/cloud mapping can drift; migration parity needs schema validation.
- Distinguish local `Profile` from Supabase `profiles`, and browser auth session from membership.
