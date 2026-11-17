# Test report — RoomHisaab v7.2.4

**Candidate:** `7.2.4`  
**Date:** 2026-11-02 (workspace local date)  
**Scope:** Local source/build/UI tests only. Supabase staging, physical devices and production deployment were not tested.

## Results

| Check | Result |
|---|---|
| `npm run typecheck` | Pass |
| `npm run build` | Pass |
| `npm run smoke` | 76 pass, 0 fail |
| `npm run contrast` | Pass; all tested foreground/background pairs are at least 4.5:1 |
| Playwright E2E | 19 pass, 0 fail |
| `npm run lint` | 0 errors; 30 warnings in existing/legacy files |

The new Borrow & Lend E2E scenario covers a request, approval, transfer acknowledgement, partial repayment report and lender confirmation; it verifies the principal/repayment stay out of expense and settlement collections. This is a local-browser test, not a Supabase integration test.

## Remaining warnings

ESLint reports 30 warnings, including unused imports/variables and missing hook dependencies in existing components/pages and some existing store/scanner effects. They are non-fatal and were not all introduced by v7.2.4. No ESLint errors were reported.

## Not verified

- The new migration `supabase/migrations/202611020005_borrow_lend_permanent_invites.sql` was not applied or executed against Supabase.
- Invite security, SQL RLS/RPC authorization, concurrency/idempotency, cloud snapshot migration and multi-device Realtime require a staging Supabase review.
- Pinch zoom, QR speed/cleanup and UPI app hand-off require supported physical Android/iOS devices.
- Manual accessibility, security, restore-from-backup, secrets/configuration and production deployment gates remain open.
