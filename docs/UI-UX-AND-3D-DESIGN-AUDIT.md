# UI/UX and 3D implementation audit

## Visual system
`src/index.css` defines RGB CSS variables and utility component styles. Light palette: porcelain page `#F6F6FB`, white card, pale indigo card, ink `#18172B`, soft ink `#514E6B`, line `#DADAF0`, indigo `#5046C8`, marigold accent `#B45309`, green income, amber pending, red overdue. Dark palette: navy `#090B16`, card `#141627`, ink `#F4F4FF`, indigo `#A8A0FF`, warm orange `#F2A65A`, brighter semantic colors. Shared typography uses CSS font stacks / display tokens; inspect CSS and Tailwind config for exact declarations. Layout utilities include rounded cards, line borders, shadows, compact form/button classes, badges and meters.

## Light/dark/accessibility
`useTheme` applies profile theme (light/dark/system). `MotionConfig` is set in App based on profile reduceMotion and system user preference; CSS `.no-motion` and reduced-motion media logic reduce movement. `:focus-visible` ring is globally set; inputs have placeholders; numerous interactive elements use labels/ARIA, but a full page-level manual keyboard/screen-reader audit was not performed. `tests/contrast.mjs` passed all checked token pairs in this run. Axe E2E is blocked due to missing Chromium.

## Responsive navigation and components
`Layout.tsx` provides desktop sidebar/topbar and mobile bottom navigation/drawer/More; main actions prioritize Home, Expenses, Add, settle/report depending personal/shared mode, and More tools. Shared reusable modules: `SectionCard`, `EmptyState`, `Skeleton`, `PageHelp`, `Avatar`, `Icon`, expense cards/modal, settlement/pay sheets, Toasts, FAB, CountUp, charts. Dialogs/sheets use Framer Motion and overlay semantics. Responsive rules are utility classes and CSS/Tailwind breakpoints; no single per-route device visual matrix was performed.

## 3D and animation
- **Three.js direct:** `components/Hero3D.tsx` is a decorative landing hero with custom canvas textures/WebGL renderer and RAF loop; it is not used throughout all pages. Renderer lifecycle/cleanup and reduced-motion behavior are in component, but runtime GPU/performance was not measured.
- **React Three Fiber:** not found in package/source.
- **GSAP:** not found in package/source.
- `RoomPulse3D.tsx` exists, but ESLint says imported declaration in Dashboard is unused; do not count as visible dashboard 3D without call-site evidence.
- Framer Motion powers page dialogs, transitions, toasts, cards, navigation and landing; CountUp and Confetti use RAF/canvas. Reduced motion support exists but not every individual effect was manually inspected on every route.
- No site-wide 3D diagram/financial information is placed in a WebGL scene; financial forms and data remain DOM UI.

## Page coverage confidence
No route was fully visually checked in browser at both themes and all target breakpoints in this task. Source coverage: Landing has Hero3D; all application pages use shared tokenized design/layout, but actual visual coverage is **source-inspected only**. `MyDashboard.tsx` is unreferenced. Do not state “every page redesigned” or “3D coverage complete.” `docs/visual-qa/` referenced in previous workspace history belonged to v7.2.6; this is a v7.2.4 restored source tree, and those captures are not v7.2.4 evidence.

## Known UX review items
- Confirm conditional navigation with keyboard and screen reader for local/cloud, one/shared member, admin/member, mobile/desktop.
- Inspect repeated “Add Expense” wording in Guide options for clarity.
- Determine whether RoomPulse3D, MyDashboard, and unused Dashboard analytics imports are stale code.
- Re-run axe, keyboard, focus trap, dialog escape/return-focus, contrast in rendered state, and reduced motion on representative routes once browser available.
