# RoomHisaab v7.2.4 release candidate

**Package version:** `7.2.4`  
**Status:** Release candidate; production gates remain open.

## User-facing changes

- Rebuilt the landing header around a centered RoomHisaab brand and a single animated corner menu. The menu supports keyboard focus, Escape, outside-click dismissal and reduced-motion settings.
- Added eight responsive, hash-linked quick shortcuts: Create Room, Join Room, Sign In, Try Demo, Features, How It Works, About Us and Contact Us.
- Removed automatic welcome and tour popups. The guided tour can be started only from Settings → Help & Guide.
- Kept returning-member sign-in separate from invites. Cloud sign-in continues to require the Room Login ID, username and personal password. Invite links do not bypass personal authentication.
- Added optional non-expiring admin-created cloud join invitations. Invite tokens remain hashed in Supabase; newly generated links rotate the prior invite of the same type/target, and admins can revoke general and targeted invites. A permanent invite is still a join link, not a sign-in link; a separate Room Password and personal login are required.
- Added Borrow & Lend requests, approve/decline, manual transfer records, counterparty transfer acknowledgement, partial repayment reporting, lender confirmation/decline, outstanding balance and per-loan history. These records are excluded from shared expense totals, splits and settlements.
- Added supported-camera two-finger zoom, linked zoom slider controls, throttled camera constraints and adaptive QR polling. Devices that do not report zoom retain manual positioning guidance.
- Kept the existing Supabase change subscriptions and shortened the coalesced refresh window. Added Realtime subscriptions for Borrow & Lend tables in the included migration.
- Extended local backup/restore and offline room sync packets to include Borrow & Lend records. Extended local-to-cloud migration to map those records when the migration is applied.

## Database migration

Apply `supabase/migrations/202611020005_borrow_lend_permanent_invites.sql` to the target Supabase project before using cloud Borrow & Lend or non-expiring invites. This agent workspace has not applied it to a live project. Review the SQL against a staging database, test RLS/RPC behaviour, and take a backup before production application.

## Safety and scope

- Scanning a seller QR or returning from a payment app is not payment proof. The user still confirms a payment manually.
- Permanent invite URLs are bearer secrets: share privately, keep the Room Password separate, revoke or rotate leaked links, and do not treat them as login credentials.
- Local rooms remain browser-local; they do not provide multi-device Realtime.
- No claim is made that latency is zero or that device/browser zoom support is universal.
