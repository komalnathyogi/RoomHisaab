# RoomHisaab design system — Obsidian & Champagne

## Theme tokens
The implementation uses CSS custom properties consumed by Tailwind semantic classes, with the existing persisted light/dark/system setting. Fresh profiles now start in Dark Obsidian; a returning user's saved choice is preserved.

| Token role | Light: Pearl & Champagne | Dark: Obsidian & Champagne |
|---|---|---|
| Canvas | `#F8F8F6` | `#09090B` |
| Card | `#FFFFFF` | `#121216` |
| Primary text | `#18181B` | `#FAFAFA` |
| Secondary text | `#52525B` | `#A1A1AA` |
| Primary accent text | accessible muted gold `#785A10` | champagne `#E5C158` |
| Primary CTA surface | `#B8860B` | `#D4AF37` |
| Positive semantic | `#047857` | `#10B981` |
| Pending / due | `#92400E` / `#BE123C` | `#FBBF24` / `#F43F5E` |

CTA foregrounds use deep ink on gold, not white; contrast checks now include primary and accent button foregrounds. Card edges and depth are neutral hairlines/shadows rather than colored gradients. Existing dark hero panels were shifted from blue-black to obsidian; retained member/avatar palette values are user data, not theme tokens.

## Typography
Variable Inter and Plus Jakarta Sans are bundled locally (no runtime CDN dependency); Plus Jakarta Sans is used for display headings and Inter for body copy. JetBrains Mono Variable is used for `.num` values with tabular numerals. Body line-height remains 1.6. Bundled font files use `font-display: swap`.

## Components, responsive layout and interaction
Tailwind reads semantic CSS tokens for page, card, ink, line, primary, accent and financial states. Existing shared `PageHead`, `SectionCard`, `EmptyState`, `Skeleton`, buttons, chips, `Icon`, `Avatar`, desktop sidebar/topbar and mobile bottom dock remain in use. The established theme toggle and profile/room controls are preserved. Existing reduced-motion support, minimum touch targets and keyboard focus styles remain.

## Routes and data integrity
`/room/analytics` redirects to the working `/room/insights` reports route; `/room/settings` redirects to the actual `/settings` screen. No duplicate page or financial calculation is fabricated. The landing split calculator uses the app's integer-paise `parseRupeesToPaise` and largest-remainder `splitEqual` helpers, operates only on component-local sample input and never saves data or confirms a payment.

## Accessibility verification
`npm run contrast` checks ink, secondary/muted text, semantic states, gold text, and text on primary/accent CTA surfaces in both themes. Current run: all listed pairs meet WCAG AA (4.5:1+). This token check is not a substitute for browser axe, manual focus/screen-reader testing, or checking every hard-coded decorative panel. Chromium was unavailable for browser QA in this environment.

## Feedback and onboarding
A single global toast host is mounted at app level and positioned below the top header. It works on standalone sign-in/join pages as well as workspace routes; error toasts use an alert role and success/info statuses remain polite. The guided/demo popup and launcher were removed; Help links open the regular Guide page.
