# File-to-feature and architecture map

## Application entry and configuration
| File | Responsibility / imports / state effects / coverage |
|---|---|
| `src/main.tsx` | React root, global CSS, production service-worker registration; no business mutations. |
| `src/App.tsx` | Provider, BrowserRouter routes, lazy page imports, scroll restoration/hash, theme/motion, fallback and redirects. Route loading and 404. |
| `src/index.css` | Design tokens, dark mode, typography/components, focus and motion CSS. `tests/contrast.mjs` token check. |
| `package.json`, lock | Version 7.2.4, scripts/dependencies. |
| `vite.config.ts`, `tailwind.config.js`, `postcss.config.js`, `tsconfig.json`, `eslint.config.js`, `playwright.config.ts`, `vercel.json` | Build, CSS, type/lint, test, deployment rewrite/config. |
| `public/manifest.webmanifest`, `public/sw.js`, `public/icon.svg` | PWA metadata, worker cache, app icon. |

## State and business libraries
| Path | Core responsibility / state/backend relation |
|---|---|
| `hooks/useStore.tsx` | Central AppState context/actions; local-first mutation, storage, cloud sync/auth, demo lifecycle, expenses, settlement, import, recurring/rules, loans, toast/undo. Largest logic surface; smoke/E2E tests cover selected flows. |
| `hooks/usePersistentDraft.ts` | Persist UI form drafts by key. |
| `hooks/useTheme.ts` | Apply theme/profile and system preference. |
| `hooks/useReducedMotion.ts` | Read reduced-motion preference. |
| `lib/types.ts` | Canonical TypeScript entities. |
| `lib/storage.ts` | Load/save/migrate/clear/import localStorage state and demo slot. |
| `lib/authPersistence.ts` | Supabase auth storage choice, metadata/login hints. |
| `lib/supabase.ts` | Config validation/client/error translation/auth helpers. |
| `lib/cloud.ts` | Supabase row ↔ state mapping, queries, RPCs, auth, invite, migration, snapshot and sync. |
| `lib/balances.ts`, `money.ts`, `borrowLend.ts` | Integer paise arithmetic, exact splits/net balances/min transfers, separate loan state rules. Smoke-tested. |
| `lib/upi.ts`, `instantPay.ts` | VPA/QR/deep links and pending purchase return intent; payment not verified. |
| `lib/recovery.ts` | Recovery-key hash/derivation helper. |
| `lib/seed.ts` | Deterministic demo data generation and demo isolation identifiers. |
| `lib/share.ts` | Offline room packet serialization/import/merge; strips selected raw/photo content. |
| `lib/csv.ts`, `statement.ts`, `smsParser.ts`, `voice.ts` | CSV, statement, SMS parsing, voice amount/category helpers. Smoke coverage exists; bank source is user-provided content. |
| `lib/comparison.ts` | Date range comparison logic. |
| `lib/constants.ts`, `id.ts`, `members.ts` | Categories/style constants, IDs/room codes, member/expense stable sorting. |
| `lib/image.ts` | Resize/compress image via canvas. |
| `lib/trash.ts` | Deleted-expense undo storage/TTL. |
| `lib/guide.ts` | Tour content/state helpers. |

## Page modules (`src/pages`)
| Page source | Main responsibility / data writes / backend |
|---|---|
| `Landing.tsx` | Public CTA, demo launch, anchor nav, Three.js hero component. |
| `Onboarding.tsx` | Room/member/cycle/local-vs-cloud setup; creates via Store. |
| `Login.tsx`, `Recover.tsx` | Cloud sign-in/recovery state and routes. |
| `JoinRoom.tsx`, `CloudJoin.tsx` | Local join and cloud invite preview/claim. |
| `Dashboard.tsx` | Home, balances/room summary, expense modal and navigation. |
| `MyDashboard.tsx` | Personal dashboard module with own UI; not imported/routed in current `App.tsx` (orphan candidate). |
| `QuickBuy.tsx` | Quick expense/QR scan/UPI handoff/explicit confirmation. |
| `Payments.tsx` | Suggested settlement, QR, payment and confirmation. |
| `BorrowLend.tsx` | Borrow request/loan/repayment workflow. |
| `History.tsx` | Search/filter/export/restore/edit list. |
| `Insights.tsx` | Reports, charts, comparisons, budget summaries. |
| `Members.tsx` | Local/cloud membership, profile, invites, UPI/contact. |
| `Inbox.tsx` | Parse/import/review user transaction inputs. |
| `Rules.tsx` | Rule CRUD. |
| `Settings.tsx` | Preferences, data tools, cloud/session, help/about. |
| `Guide.tsx`, `About.tsx` | Help and product info. |

## Shared components (`src/components`)
- `Layout.tsx`: primary navigation/search/More/theme/help/leave shell, page head and shared layout exports.
- `ExpenseModal.tsx`, `ExpenseCard.tsx`: form and expense rendering/action surface.
- `PaySheet.tsx`, `SettleSheet.tsx`, `DebtRow.tsx`: payment/settlement UI.
- `Hero3D.tsx`, `RoomPulse3D.tsx`: direct Three.js decorative scene and secondary pulse scene (unused warning in Dashboard).
- `Charts.tsx`, `ChartsLazy.ts`: report charts/lazy boundary.
- `Toasts.tsx`, `Confetti.tsx`, `CountUp.tsx`, `FAB.tsx`: interaction feedback/decorative motion.
- `WelcomeTour.tsx`, `PageHelp.tsx`: user guide/tour.
- `Icon.tsx`, `Avatar.tsx`, `MemberProfileFields.tsx`, `SectionCard.tsx`, `EmptyState.tsx`, `Skeleton.tsx`, `AboutRoomHisaab.tsx`: shared presentation/forms.

## Tests and SQL
- `tests/smoke.ts`: pure logic and state-flow assertions; current 76 pass.
- `tests/contrast.mjs`: CSS token pair checks; pass.
- `tests/e2e/product.spec.ts`: 19 browser test cases authored. Current run blocked before execution by absent browser.
- `supabase/migrations/*.sql`: schema, RLS, RPC, migration/recovery, latest borrow/invite SQL. Live application status unknown.

## Dependencies and purpose

### Runtime (`package.json`)
| Package | Purpose / evidence |
|---|---|
| `react`, `react-dom` | UI components and DOM renderer. |
| `react-router-dom` | Browser routing, links, navigation and route redirects. |
| `@supabase/supabase-js` | Optional Auth, database, RPC and Realtime client. |
| `@zxing/browser` | QR decode from video stream and gallery image. |
| `@zxing/library` | Declared direct dependency; no source import found in `src`. Likely redundant/transitive relative to browser package, but check package dependency tree before removal. |
| `clsx` | Conditional class composition. |
| `framer-motion` | UI/page/dialog transitions, gestures. |
| `qrcode.react` | UPI/settlement QR canvas generation. |
| `recharts` | Reports/charts. |
| `three` | Direct WebGL/CanvasTexture landing hero scene. |

### Development (`package.json`)
| Package(s) | Purpose |
|---|---|
| `vite`, `@vitejs/plugin-react` | Dev/build server and React transform. |
| `typescript`, `@types/react`, `@types/react-dom`, `@types/three` | Typechecking and declarations. |
| `tailwindcss`, `postcss`, `autoprefixer` | CSS utility generation and transforms. |
| `eslint`, `@eslint/js`, `eslint-plugin-react-hooks`, `typescript-eslint`, `globals` | Static lint rules and environment/type-aware parsing. |
| `@playwright/test`, `@axe-core/playwright` | Browser E2E and axe accessibility checks. |
| `esbuild` | Bundles Node smoke-test entry to executable ESM. |

`minimatch` is pinned through npm `overrides`; not imported directly by app source. React Three Fiber, GSAP, icon package and OCR package are not declared in package.json. Candidate dead code also includes `MyDashboard.tsx`, unused Dashboard imports/values, and possibly `RoomPulse3D`; ESLint reported multiple unused values. These should be confirmed with dependency/import tooling before removal.
