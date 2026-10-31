// Light + Dark dono themes ke text/background pairs ko WCAG AA (4.5:1) se check karo.
// Chalao: npm run contrast
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
function block(selector) {
  const i = css.indexOf(selector)
  if (i < 0) throw new Error(`${selector} block missing`)
  const start = css.indexOf('{', i)
  const end = css.indexOf('}', start)
  return css.slice(start, end)
}
function vars(selector) {
  const out = {}
  for (const m of block(selector).matchAll(/--(c-[a-z-]+):\s*(\d+)\s+(\d+)\s+(\d+)/g)) {
    out[m[1]] = [+m[2], +m[3], +m[4]]
  }
  return out
}
const lum = (rgb) => rgb.map((c) => {
  const x = c / 255
  return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
}).reduce((sum, x, i) => sum + x * [0.2126, 0.7152, 0.0722][i], 0)
const ratio = (a, b) => {
  const la = lum(a), lb = lum(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

let fail = 0
for (const [name, tokens] of [['LIGHT', vars(':root')], ['DARK', vars('.dark')]]) {
  const pairs = [
    ['ink / page', tokens['c-ink'], tokens['c-page']],
    ['ink / card', tokens['c-ink'], tokens['c-card']],
    ['ink-soft / page', tokens['c-ink-soft'], tokens['c-page']],
    ['ink-soft / card', tokens['c-ink-soft'], tokens['c-card']],
    ['ink-faint / card', tokens['c-ink-faint'], tokens['c-card']],
    ['primary / card', tokens['c-primary'], tokens['c-card']],
    ['primary / page', tokens['c-primary'], tokens['c-page']],
    ['on-primary / primary-solid', tokens['c-on-primary'], tokens['c-primary-solid']],
    ['moneyin / card', tokens['c-moneyin'], tokens['c-card']],
    ['pending / card', tokens['c-pending'], tokens['c-card']],
    ['overdue / card', tokens['c-overdue'], tokens['c-card']],
    ['coral / page', tokens['c-coral'], tokens['c-page']],
    ['blue / page', tokens['c-blue'], tokens['c-page']],
    ['violet / page', tokens['c-violet'], tokens['c-page']],
    ['accent / page', tokens['c-accent'], tokens['c-page']],
  ]
  console.log(`\n${name}`)
  for (const [label, fg, bg] of pairs) {
    const r = ratio(fg, bg)
    const ok = r >= 4.5
    if (!ok) fail++
    console.log(`  ${ok ? '✅' : '❌'} ${label.padEnd(28)} ${r.toFixed(2)}:1`)
  }
}
console.log(fail ? `\n❌ ${fail} pair(s) WCAG AA fail` : '\n✅ All pairs WCAG AA pass (4.5:1+)')
process.exit(fail ? 1 : 0)
