# Data compatibility and migration plan — v7.2.5

## Current handling
The redesign uses existing room/local storage, loan/request/event records and cloud schema. It does not change the Supabase schema, destructively migrate financial records, alter backup envelope/version, or write borrowing principal/repayments into shared expenses or settlements. Existing expense category IDs remain the canonical IDs; suggestions only emit supported categories (`rent`, `groceries`, `electricity`, `wifi`, `food`, `transport`, `maid`, `gas`, `water`, `subscription`, `medicine`, `shopping`, `other`).

## Safe release checks
1. Preserve an existing backup before upgrading.
2. Validate local room and demo state separately; do not merge demo into a real room.
3. Re-test import/export round trips and older backup versions in browser before deployment.
4. Validate cloud sync/RLS and concurrent edits against a staging Supabase project before production.
5. Confirm loan totals remain separate from expense/settlement totals after an upgrade.

No schema migration is required for this UI-source change. Import/export, cloud, and restore behavior were not re-run in a browser because Chromium is unavailable; compatibility is therefore based on unchanged storage/schema code and smoke-level financial invariants, not a release migration certification.
