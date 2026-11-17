# RoomHisaab v7.2.3 release candidate

**Package version:** `7.2.3-rc.0`  
**Status:** Release candidate; physical-device and production verification are still required.

## Changes

- Rebuilt the landing page as one scrolling experience with a sticky header and eight same-page destinations: Create Room, Join Room, Sign In, Try Demo, Features, How It Works, About Us, and Contact Us.
- Added route-specific action panels that keep room creation, room joining, sign-in, and password recovery on `/onboarding`, `/join`, `/login`, and `/recover`.
- Removed the duplicate start-choice cards, repeated action CTAs, and redundant promotional sections. Kept the sample preview, safety information, FAQs, developer profile, and contact details in the specified section order.
- Preserved the seeded demo member selector: 1–10 members, default 3, quick choices 1/2/3/5, no names or account setup, isolated sample data, and no real payment launch.
- Changed Quick Pay to an expense-first form. The user fills in the purchase, amount, payer, split, and preferred payment app before choosing **Scan Seller QR**. Scanner access is user-initiated; draft fields survive scanner close and payment-app return. Existing amount parsing/mismatch handling, manual fallback, and explicit user confirmation remain in place.
- Changed the guided-tour invitation to a globally persisted, one-time prompt for non-demo rooms. Skip, close, and Escape dismissal persist across rooms, routes, and refresh. Manual replay remains available through More → Help.
- Added About Us to More for personal and shared rooms at `/room/about`, reusing the Settings About component and the unchanged supplied developer portrait.
- Updated regression coverage for landing anchors, navigation, Quick Pay, global tour state, About routing, demo isolation, one-/multi-member behavior, responsive widths, and automated accessibility.

## Verification performed

- `npm run check` — passed: TypeScript, 70 smoke checks, contrast checks, and production build.
- `npm run test:e2e` — 18 Playwright tests passed, including an axe WCAG 2.2 AA scan.
- `npm run lint` — zero errors; 32 existing-project warnings remain.
- The automated browser tests cover desktop/mobile navigation, anchor and Back behaviour, the Quick Pay form-first flow, global tour persistence, About Us in personal/shared room menus, demo isolation, and portrait/contact rendering.

## Verification not performed

This candidate is not declared production-ready. Physical Android/iOS camera and QR scanning, real UPI app launch/return, amount mismatch behaviour on live devices, live cloud permissions and sync, backup/restore recovery, manual screen-reader/keyboard review, and production configuration still need dedicated verification. Automated tests do not establish successful bank payment. RoomHisaab continues to require explicit user confirmation and cannot verify payment success from QR scanning or app return.
