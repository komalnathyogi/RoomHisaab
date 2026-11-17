# Cloud, authentication and realtime audit

## Configuration and client
`src/lib/supabase.ts` reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (legacy `VITE_SUPABASE_ANON_KEY` accepted). It validates URL and publishable/anon format, detects swapped values, builds Supabase JS client with persistent/refreshing Auth session and custom storage. Vite variables are public bundle values; never put service-role/secret keys here. `.env.example` is safe placeholder documentation. Actual `.env.local` is excluded from this report/package.

## Auth and membership model
Member authentication synthesizes a stable email from normalized room login ID and username (`memberAuthEmail`) so end-users can log in with Room Login ID + username + personal password. Account is Supabase Auth; room membership is `room_members`. Login fetches active memberships; a member can open a room. Invites are separate claim flows, not a substitute for login. Recovery keys are hashed (`hashRecoveryKey`) before server request. Remember-device choice selects persistent/local vs session storage. Password is not stored in last-login hint.

## Tables and relationships
Migration `202610210001_cloud_schema_rls.sql` establishes profiles, rooms, memberships, room secrets/invites, expenses/splits/reactions, settlements/confirmations, recurring expenses and activity log, with RLS/policies/triggers and Realtime publication. `202610210002_cloud_rpcs.sql` adds transactional functions. `202610210003_cloud_local_migration.sql` supports local-to-cloud migration. `202610220004_personal_recovery_keys.sql` adds recovery keys. `202611020005_borrow_lend_permanent_invites.sql` adds Borrow & Lend records/RPCs and permanent invite operations plus realtime publication additions. Inspect SQL for exact policy predicates; this report does not assert live migration application.

## RLS and permissions
Policies are enabled for public tables. Intended policy shape includes room-membership scoped reads; own-payer expense creation/update/delete; split ownership tied to expense; involved-member settlement actions and confirmations; own recurring items; member profile restrictions; owner/admin management actions and constrained RPCs. Frontend `canEditExpense`, `canEditMember` and hidden controls are UX checks, not a security boundary. RLS + SECURITY DEFINER RPC grants/predicates must enforce every mutation. Staging tests for cross-room ID substitution, role escalation, invite claims, blocked members, virtual members, removed users and race conditions remain required.

## Invites
Invite tokens in SQL are hashed; permanent invites are still bearer URLs and can be revoked/rotated. Specific-member and general invite behavior differs. Claim flow previews room/member metadata then authenticates/claims membership. Sharing a permanent URL exposes join capability to anyone holding it; use private channel and revoke if leaked. No live token entropy, rotation or revocation test was run.

## Sync/realtime
Store tracks cloud status, fetches cloud snapshots, subscribes to table changes and coalesces refreshes; migrations add realtime tables. `cloud.ts` maps server records to local state. Reconnect, token expiry and network errors are translated into English and status. Local version/timestamps aid merging; exact last-writer-wins/conflict behavior should be traced in full store logic and RPC transaction SQL. There is no external cloud service instrumentation evidence here. Do not describe zero latency or offline writes as guaranteed cloud sync.

## Failure recovery and risks
Network/auth/RLS/expired-session/duplicate/foreign-key errors have user-facing mapping in `cloudErrorMessage`. Local-first state can remain available, but cloud changes can fail or diverge; verify rollback/refresh behavior. Security risks to test: bearer invite URL leakage, weak/admin reset paths, room-login ID enumeration, rate limiting, synthetic email uniqueness, details JSON integrity, RPC authorization, session storage on shared devices, personal data in exports, and migration/realtime policy correctness.

## Verification status
Included SQL files were inspected by source. No Supabase connector/database was used; no credentials exposed; no migrations applied; no live Auth, RLS, RPC, Realtime, reconnect, conflict or cloud backup test. Cloud is **implemented but not fully tested** in this environment, not certified secure or production-ready.
