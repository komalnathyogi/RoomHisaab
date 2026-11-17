# Release status — RoomHisaab v7.2.4

**Package version:** `7.2.4`  
**Status:** Release candidate. Not production-ready.

The direct version request was v7.2.4; the attached PDF title says v7.3.0. The application/package metadata follows the direct request. The PDF requirements were used for the implementation scope.

## Implemented in the source tree

- Landing page: centered brand, one animated corner menu, eight responsive shortcuts with unique anchor IDs, active state and reduced-motion support.
- Dashboard: personal and shared rooms remain distinct; redundant dashboard balance and settlement actions were removed; one-member expense summaries remain separate from shared balances.
- Guided tour: no automatic tour or welcome popups. Manual launch is in Settings → Help & Guide only.
- Cloud access: returning members use the existing Room Login ID + username + personal password flow. Invite claiming remains a separate, room-password-protected process.
- Invite management: optional non-expiring invitations, rotation and revocation are implemented in the client and migration. The token is a secret; treat links as private.
- Borrow & Lend: separate local/cloud request, transfer acknowledgement, repayment and history model; no integration into expense/split/settlement calculations.
- Quick Pay: remains expense-first and manually confirmed. Scanner pinch zoom is best-effort on cameras that expose zoom; scan polling and constraint calls are throttled.
- Cloud sync: existing subscriptions remain; Borrow & Lend tables are added to the Realtime publication/subscriptions by the migration.
- Data safety: backups and offline sync packets include Borrow & Lend records; local-to-cloud migration maps them after the new SQL migration is applied.

## Verification completed in this workspace

- TypeScript check: passed.
- Production build: passed.
- Smoke suite: 76 checks passed.
- Contrast suite: all tested color pairs pass WCAG AA.
- Playwright E2E: 19 tests passed, including landing navigation, no automatic tour, responsive overflow, Quick Pay form flow, dashboard modes, and Borrow & Lend partial repayment staying outside expense totals.
- ESLint: no errors; existing warnings remain in older files (listed in `docs/TEST-REPORT-v7.2.4.md`).

## Release gates still open

- Review and apply the new Supabase migration in staging; exercise RLS, invite token rotation/revocation, request/loan RPCs, race conditions, multi-member authorization and Realtime reconnect/conflict behaviour against real Supabase.
- Verify cloud snapshot loading after migration and test with multiple signed-in members/devices; this workspace did not use a connected production Supabase project.
- Test camera pinch zoom and decoder/stream cleanup on supported physical Android/iOS devices and browsers. Browser automation does not verify physical camera capabilities or performance.
- Test actual UPI app hand-off and manual confirmation behaviour on target devices. Do not infer payment success from a QR scan or app return.
- Complete manual keyboard/screen-reader, reduced-motion, responsive, backup/restore and security review.
- Confirm production configuration, secrets handling, backups, monitoring and deployment. No deployment was made or verified.

## Preserved history

Earlier v7.2.3 documentation and versioned archives remain separate and unchanged. The previous changelog and release status are not replaced by this candidate document.
