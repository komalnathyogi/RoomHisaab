# Test report — RoomHisaab v7.2.3-rc.0

**Run date:** 31 October 2026  
**Candidate:** `7.2.3-rc.0`

## Results

| Command/check | Result |
|---|---|
| `npm run typecheck` | Passed |
| `npm run smoke` | 70 passed, 0 failed |
| `npm run contrast` | Passed in light and dark themes; all tested pairs meet WCAG AA contrast |
| `npm run build` | Passed |
| `npm run test:e2e` | 18 passed, 0 failed |
| `npm run test:a11y` | 1 axe WCAG 2.2 AA test passed |
| `npm run lint` | 0 errors; 32 warnings |
| `npm audit --audit-level=moderate` | 0 reported vulnerabilities |

## E2E areas exercised

- Eight desktop landing destinations; eight-item mobile menu, anchor navigation, heading offsets, reduced motion, active indication, and browser Back.
- Create, join, sign-in, and password recovery links use the established routes.
- One-member/shared sample demo, member count range and choices, sample isolation, seeded data, and saved-room restoration.
- Quick Pay opens the form first; required details are validated before scanning; scanner opens only through its button; form fields remain after scanner close.
- Global tour invitation dismissal survives navigation and refresh; manual tour starts from Help; demo does not auto-open the tour.
- About Us menu route in personal and shared demo rooms; developer portrait path, dimensions, developer details and contact email; Settings About remains present.
- One-member/shared navigation, old split preservation, narrow and landscape layouts, landing overflow and axe scan.

## Not covered by this automated run

Browser automation cannot certify camera access, physical QR decoding, real payment-app handoff, bank results, cloud permission policies, backup restore, or device-level performance. Those remain release gates. In particular, QR scanning or returning from a payment app is never treated as proof of payment; users must confirm explicitly.
