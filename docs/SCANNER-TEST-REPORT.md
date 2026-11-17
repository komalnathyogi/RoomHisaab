# Scanner and Quick Pay safety report — v7.2.5

## Source and smoke coverage
The QR parser smoke tests validate a seller VPA/name/amount and reject unreadable garbage. Quick Pay retains explicit payee/amount review, manual UPI entry fallback, and explicit user confirmation before recording paid status. QR scanning, opening a payment app, or returning to the browser is not treated as proof of payment. A pending instant-pay return is only a prompt to review; it does not self-confirm.

## Not verified
No physical device, Android/iOS camera, app deep-link, payment app, network interruption, low-light scan, pinch/zoom, torch, permissions-denied or stream cleanup session was performed for this release. Playwright browser E2E cannot launch because Chromium's host library `libnspr4.so` is missing. Never use this source report as proof that a payment was sent or that a production scanner is device-certified.
