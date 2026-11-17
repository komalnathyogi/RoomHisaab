# Visual QA — Obsidian & Champagne refresh

## Source-level checks
- Dark defaults for fresh profiles (`#09090B` canvas, `#121216` card); previously saved light/system preferences are preserved.
- Light theme uses warm pearl (`#F8F8F6`) and white cards. Secondary text remains visible; gold is deepened for light-mode text and CTAs use dark foreground ink.
- Inter, Plus Jakarta Sans and JetBrains Mono variable fonts are local build assets; currency `.num` uses tabular mono numerals.
- Dark panels and landing 3D texture now use obsidian/champagne treatment. The interactive split calculator is sample-only and uses exact paise logic.
- `npm run contrast` passes all defined text/status/CTA token pairs. `npm run typecheck`, lint, smoke and build pass.

## Not visually verified
Playwright Chromium is missing from this workspace's browser cache, so desktop/tablet/mobile screenshots, overflow, rendered focus, axe, dark/light route walkthroughs, charts, WebGL fallback and contrast on hard-coded panels were not examined in a browser. Manual QA remains necessary.
