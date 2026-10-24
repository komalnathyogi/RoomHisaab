/** @type {import('tailwindcss').Config} */
/*
 * Design System v2 — TOKEN BASED.
 * Saare semantic colors CSS variables se aate hain (src/index.css).
 * Isse light/dark DONO me text hamesha readable rehta hai — v1 ka dark-mode
 * bug (fixed dark text on dark bg) isi se permanently khatam hota hai.
 */
const v = (name) => `rgb(var(${name}) / <alpha-value>)`

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: v('--c-primary'),        // text/icons ke liye (two themes me AA checked)
          dark: v('--c-primary-dark'),
          hover: v('--c-primary-hover'),
          soft: v('--c-primary-soft'),
          solid: v('--c-primary-solid'),    // buttons/FAB ka background
          solidhover: v('--c-primary-solid-hover'),
          on: v('--c-on-primary'),          // solid ke upar ka text
        },
        surface: {
          page: v('--c-page'),
          card: v('--c-card'),
          card2: v('--c-card2'),
          dark: v('--c-page'),
          darkcard: v('--c-card'),
          alt: v('--c-card2'),
        },
        accent: { DEFAULT: v('--c-accent'), solid: v('--c-accent-solid'), on: v('--c-on-accent') },
        moneyin: v('--c-moneyin'),
        pending: v('--c-pending'),
        overdue: v('--c-overdue'),
        ink: {
          DEFAULT: v('--c-ink'),
          soft: v('--c-ink-soft'),
          faint: v('--c-ink-faint'),
        },
        line: { light: v('--c-line'), dark: v('--c-line') },
      },
      fontFamily: {
        display: ['Bricolage Grotesque', 'Public Sans', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
        sans: ['Public Sans', 'Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgb(var(--c-ink) / 0.05), 0 10px 30px rgb(var(--c-ink) / 0.06)',
        cardHover: '0 2px 6px rgb(var(--c-ink) / 0.07), 0 18px 44px rgb(var(--c-ink) / 0.10)',
        fab: '0 10px 28px rgb(var(--c-primary-solid) / 0.42)',
        lift3d: '0 24px 60px rgb(var(--c-ink) / 0.16), 0 4px 14px rgb(var(--c-ink) / 0.08)',
      },
      maxWidth: { content: '1180px', card: '720px' },
      minHeight: { touch: '44px' },
      borderRadius: { xl2: '20px' },
      keyframes: {
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        glow: { '0%,100%': { opacity: '0.55' }, '50%': { opacity: '0.95' } },
        floatUp: { '0%': { transform: 'translateY(0) rotate(0deg)', opacity: '0' },
                   '10%': { opacity: '0.8' },
                   '100%': { transform: 'translateY(-140px) rotate(20deg)', opacity: '0' } },
        floaty: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-10px)' } },
        spinSlow: { to: { transform: 'rotate(360deg)' } },
        marquee: { from: { transform: 'translateX(0)' }, to: { transform: 'translateX(-50%)' } },
      },
      animation: {
        shimmer: 'shimmer 1.6s infinite',
        glow: 'glow 6s ease-in-out infinite',
        floatUp: 'floatUp 9s linear infinite',
        floaty: 'floaty 5s ease-in-out infinite',
        spinSlow: 'spinSlow 16s linear infinite',
        marquee: 'marquee 26s linear infinite',
      },
    },
  },
  plugins: [],
}
