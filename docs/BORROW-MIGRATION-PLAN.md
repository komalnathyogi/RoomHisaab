# Borrowing integration and migration plan — v7.2.5

## Integration decision
Borrowing remains a first-class but independent ledger. Add Expense offers an Expense/Borrow mode; Expenses/History exposes All, Expenses and Borrowing tabs. Dashboard provides a shortcut when open loans exist. `/room/borrow-lend` redirects to `/room/history?tab=borrowing` for old bookmarks.

## Preserved semantics
Store operations remain `requestBorrow`, `recordLoan`, `acknowledgeLoanFunds`, `reportLoanRepayment` and `reviewLoanRepayment`. Borrower receipt confirmation and lender repayment review remain explicit. Principal and confirmed repayments never enter `expenses`, `settlements`, shared balances or room spending totals. No destructive schema/data migration or new loan interest/fee behavior was introduced.

## Verification / limitation
Smoke tests validate outstanding principal, pending repayment behavior, partial/full repayment and separation from shared expenses. A Playwright integration test covers member requests/approvals and the integrated form, but browser launch is blocked by missing `libnspr4.so`; that E2E behavior is unverified. Cloud RLS and cross-device reconciliation remain staging tasks.
