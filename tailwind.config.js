/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Theme-aware tokens: values come from CSS variables defined in
        // src/styles/index.css (:root for light, :root.dark for dark), so
        // most of the app adapts to dark mode without per-component dark:
        // classes. The rgb(var(...) / <alpha-value>) form keeps Tailwind's
        // opacity modifiers (e.g. bg-ink-100/50) working.
        primary: {
          50: 'rgb(var(--primary-50) / <alpha-value>)',
          100: 'rgb(var(--primary-100) / <alpha-value>)',
          200: 'rgb(var(--primary-200) / <alpha-value>)',
          300: 'rgb(var(--primary-300) / <alpha-value>)',
          400: 'rgb(var(--primary-400) / <alpha-value>)',
          500: 'rgb(var(--primary-500) / <alpha-value>)',
          600: 'rgb(var(--primary-600) / <alpha-value>)',
          700: 'rgb(var(--primary-700) / <alpha-value>)',
          DEFAULT: 'rgb(var(--primary-500) / <alpha-value>)',
        },
        ink: {
          50: 'rgb(var(--ink-50) / <alpha-value>)',
          100: 'rgb(var(--ink-100) / <alpha-value>)',
          200: 'rgb(var(--ink-200) / <alpha-value>)',
          300: 'rgb(var(--ink-300) / <alpha-value>)',
          400: 'rgb(var(--ink-400) / <alpha-value>)',
          500: 'rgb(var(--ink-500) / <alpha-value>)',
          600: 'rgb(var(--ink-600) / <alpha-value>)',
          700: 'rgb(var(--ink-700) / <alpha-value>)',
          800: 'rgb(var(--ink-800) / <alpha-value>)',
          // 900 is intentionally fixed (not theme-aware): it's only used for
          // always-dark chrome (modal backdrops, code blocks, the admin
          // sidebar, which stays dark in both themes), never for body text.
          900: '#0B1120',
          DEFAULT: 'rgb(var(--ink-800) / <alpha-value>)',
        },
        accent: {
          DEFAULT: '#38BDF8',
          light: '#F0F9FF',
        },
        canvas: 'rgb(var(--canvas) / <alpha-value>)',
        // New surface tokens for things that were hardcoded bg-white: cards,
        // panels, dropdowns, modals, inputs.
        surface: {
          DEFAULT: 'rgb(var(--surface) / <alpha-value>)',
          raised: 'rgb(var(--surface-raised) / <alpha-value>)',
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      borderRadius: {
        xl2: '1.25rem',
      },
      boxShadow: {
        soft: '0 1px 2px rgba(15,23,42,.04), 0 1px 3px rgba(15,23,42,.06)',
        card: '0 4px 6px -2px rgba(15,23,42,.05), 0 10px 15px -3px rgba(15,23,42,.06)',
        lift: '0 12px 24px -8px rgba(37,99,235,.18)',
        glow: '0 0 0 1px rgba(37,99,235,.08), 0 8px 30px -8px rgba(37,99,235,.25)',
      },
      keyframes: {
        orb: {
          '0%, 100%': { transform: 'scale(1) rotate(0deg)' },
          '50%': { transform: 'scale(1.08) rotate(8deg)' },
        },
        floatSlow: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        fadeUp: {
          from: { opacity: 0, transform: 'translateY(8px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
        },
      },
      animation: {
        orb: 'orb 6s ease-in-out infinite',
        floatSlow: 'floatSlow 4s ease-in-out infinite',
        fadeUp: 'fadeUp .4s ease both',
      },
    },
  },
  plugins: [],
}
