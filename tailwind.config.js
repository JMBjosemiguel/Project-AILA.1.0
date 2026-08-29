/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#EFF6FF',
          100: '#DBEAFE',
          200: '#BFDBFE',
          300: '#93C5FD',
          400: '#60A5FA',
          500: '#2563EB',
          600: '#1D4ED8',
          700: '#1E40AF',
          DEFAULT: '#2563EB',
        },
        ink: {
          50: '#F1F5F9',
          100: '#E2E8F0',
          400: '#64748B',
          600: '#334155',
          800: '#0F172A',
          900: '#0B1120',
          DEFAULT: '#0F172A',
        },
        accent: {
          DEFAULT: '#38BDF8',
          light: '#F0F9FF',
        },
        canvas: '#F8FAFC',
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
