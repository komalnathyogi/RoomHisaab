# QR scanner and UPI handoff report

## Entry and state
Scanner lives inside `src/pages/QuickBuy.tsx` at `/room/buy`; `?mode=scan` switches the initial entry mode but does not automatically launch payment or prove a purchase. Form state is persisted via `usePersistentState`; scan overlay is opened by explicit “Scan Seller QR”. Refs track video, `MediaStream`, decoder controls, timer, purchase lock, scan lock, touch points/pinch, camera switch and miss counters.

## Camera initialization and decode
The component requests `navigator.mediaDevices.getUserMedia` using a selected device ID or ideal environment-facing camera. It enumerates video inputs for camera switching. On compatible browser it constructs native `BarcodeDetector` (`qr_code`) and polls the video; fallback dynamically loads `BrowserQRCodeReader` from `@zxing/browser` and calls `decodeFromVideoDevice`. Gallery fallback uses `BrowserQRCodeReader.decodeFromImageUrl` with an object URL. Successful scan locks further callbacks, parses QR using `parseUpiQr`, stops camera, then shows parsed merchant/payee and amount for user review.

## Controls/capabilities
- Camera switch: rotates enumerated video input list and restarts stream.
- Zoom: reads track capabilities and uses `applyConstraints({advanced:[{zoom}]})`; pinch controls update zoom; device support is optional, constrained and throttled.
- Torch: offered only when track reports support; constraint failures are best effort.
- Gallery: hidden `image/*` input triggered by Upload QR Image.
- Manual fallback: direct UPI ID/payee entry and generated universal UPI QR/link; invalid VPA is rejected.
- Focus: browser camera focus is not custom-controlled in source; autofocus is device/browser behavior. No additional manual focus control identified.

## Errors and cleanup
Camera failures map permission denied, missing camera/constraints, busy track, insecure context and generic failure to English messages with upload/manual fallback. `stopCamera` stops tracks, clears refs; `stopScanner` resets state and closes scanner. Effect cleanup clears timers and stops stream; Escape closes scanner. Duplicate scanner startup and scan results are guarded with refs; Quick Buy purchase uses `purchaseLockRef`. Audit shows potential maintenance risk: ESLint warns cleanup effect omits `stopCamera` dependency and scanner effect omits `stopScanner`; review stale closures and unmount/reopen behavior with browser/device tests. This warning alone does not prove a leak.

## Payment handoff and return safety
`lib/upi.ts` validates VPA and creates universal/app-specific UPI link and QR payload. Scan mode may build link from seller data. `lib/instantPay.ts` stores pending purchase intent and determines when a return prompt can appear. App return is not a transaction receipt; user must confirm manually, check seller name and amount in bank/UPI app, and never enter UPI PIN on RoomHisaab. Payment amounts are never inferred as successful merely because the app launched or browser resumed. Manual already-paid and unpaid states are distinct; unpaid can be saved pending.

## Failure risks / crash scenarios to investigate
1. Camera API unavailable or page not secure; permission denial or hardware busy.
2. BarcodeDetector constructor/detect exceptions; ZXing decoder exception or import failure.
3. Camera switching while old decoder callback is pending; stream restart ordering.
4. Track ends unexpectedly/visibility changes; unsupported zoom/torch advanced constraints.
5. Object URL cleanup on decode error, very large gallery image, malformed QR or unsupported QR format.
6. Browser background/resume and payment app lifecycle can lose state; pending intent expiry/storage quota.
7. Rapid repeat scan/submit races; refs prevent common cases but no current E2E execution proves them.
8. Devices exposing no camera list until permission; permissions behavior differs by browser.

## Performance and physical tests
Adaptive polling starts roughly 180ms per miss, then lengthens to 300ms and 500ms as misses accrue. Camera constraint updates are throttled. This is source-level behavior, not measured FPS, latency, battery, memory or decode-success rate. No physical Android/iOS testing, camera permission test, QR gallery test, torch/zoom compatibility test, or UPI app launch/return test was performed in this audit. Source release notes also explicitly leave device testing open.
