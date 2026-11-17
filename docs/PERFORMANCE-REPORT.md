# Performance and bundle report — v7.2.4

## Measurement method
A production build was run by `npm run check` on the local sandbox using Vite 8.3.5. Vite reports emitted chunk sizes and gzip estimates. These are build outputs, not runtime network transfer or Core Web Vitals. No Lighthouse, WebPageTest, browser trace, GPU profile, memory timeline, network waterfall, physical phone or camera benchmark was run.

## Build output
- CSS `83.34 kB` (gzip `16.03 kB`).
- Entry JS `303.56 kB` (gzip `83.73 kB`).
- Vendor `171.79 kB` (gzip `56.76 kB`).
- Charts chunk `402.14 kB` (gzip `105.51 kB`).
- Three-related shared `esm` chunk `435.53 kB` (gzip `115.09 kB`); separate entry/chunks shown by build. This indicates a sizable graphics/dependency chunk, not proof that all of it is downloaded on first route.
- Motion chunk `114.34 kB` (gzip `37.95 kB`).
- Build succeeded; Vite chunk warning limit is configured to 700 kB.

## Code-splitting and network
`App.tsx` lazy-loads route modules and Layout; `ChartsLazy.ts` defers chart modules. Vite manual chunks split Recharts, Framer Motion and React vendor. Supabase is only useful when configured but import/build tree behavior should be profiled. Static public assets include developer portrait and icon. No CDN font/runtime script is declared in inspected HTML; inspect emitted assets for exact font loading if release needs it. `Hero3D` source creates canvas textures/WebGL and an RAF loop, but in the v7.2.4 snapshot it was not imported by Landing. v7.2.5 now wires it through a lazy import after the hero approaches the viewport; the actual request timing is not browser-profiled.

## PWA/offline
Production-only service worker registration in `main.tsx`; `public/sw.js` has cache behavior. Manifest exists. No browser install/update test or stale-cache recovery test was run. App data is localStorage, not durable service-worker cache; offline data persistence has quota/device limitations. No network service-level worker caching is equivalent to cloud sync.

## Animation and device costs
Three.js hero, Framer Motion, CountUp, Confetti, charts and scanner polling can affect GPU/battery. Scanner throttles polling as misses increase and throttles camera zoom constraints in source. These are source optimizations, not measured performance. No GPU renderer profiling, battery drain, long-session memory, leak, scanner decode or mobile CPU benchmark was done.

## Required measurements
1. Install supported Playwright/Chromium and run production-route traces; then Lighthouse on landing/dashboard/QuickBuy and mobile emulation.
2. Measure LCP/CLS/INP (or current Core Web Vitals), network transferred bytes, route chunk requests and cache hit/update behavior.
3. Test WebGL disabled/low-memory fallback and renderer cleanup across route transitions.
4. Measure scan decode time, camera CPU/battery and stream cleanup on representative Android/iOS hardware.
5. Profile large localStorage state, quota/private mode, backups/import, repeated cloud snapshots and reconnect.

Do not promise zero latency or mobile smoothness from bundle sizes alone.

## v7.2.5 redesign build update

The v7.2.5 source build was run on 2026-11-02 with Vite 8.3.5 after the landing hero was wired to a lazy import of `Hero3D`. Build output (emitted asset size and Vite gzip estimate):
- CSS: 84.21 kB (16.23 kB gzip).
- Entry JS: 303.54 kB (83.75 kB gzip).
- `Hero3D`: 599.45 kB (153.16 kB gzip), now its own deferred chunk, requested only after the hero placeholder approaches the viewport; the static sample card remains the suspense/fallback UI.
- Charts: 402.14 kB (105.51 kB gzip); shared `esm` chunks: 16.20 kB (6.02 kB gzip) and 435.53 kB (115.09 kB gzip).
- `npm run build` passed. `npm audit --omit=dev --audit-level=moderate` reported 0 vulnerabilities.

This is bundle analysis only. No runtime network waterfall, Largest Contentful Paint, CLS, INP, Lighthouse, GPU/memory profile or physical-device benchmark was collected. Playwright Chromium cannot start in this sandbox because `libnspr4.so` is missing; browser-visible performance and route behavior remain unverified. Reduced-motion preference and intersection/visibility pausing are implemented in the hero source, but energy use has not been measured.

## Obsidian & Champagne refresh build (2026-10-21)
The latest production build after bundling the local variable fonts reports CSS `94.02 kB` (`21.45 kB` gzip), entry JS `303.72 kB` (`83.78 kB` gzip), lazy Hero3D `599.45 kB` (`153.16 kB` gzip), charts `402.14 kB` (`105.51 kB` gzip), and shared esm `435.53 kB` (`115.09 kB` gzip). Vite emits language-subset WOFF2 assets for Inter, Plus Jakarta Sans and JetBrains Mono. CSS unicode ranges allow the browser to choose relevant subsets; no actual runtime font-request waterfall or transfer measurement was recorded.

Do not infer production performance from emitted sizes alone. Browser launch is unavailable in this workspace, so the new theme, font swaps, calculator interaction, chart appearance, Core Web Vitals and GPU behavior remain unprofiled in an actual browser.
