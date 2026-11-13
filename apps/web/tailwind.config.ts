import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // ── VELTO Brand Color System ──────────────────────────────
      colors: {
        // Override Tailwind's default `orange` scale with Velto Blue
        // so any existing `orange-*` class instantly reflects the new brand.
        orange: {
          50:  '#EFF6FF',
          100: '#DBEAFE',
          200: '#BFDBFE',
          300: '#93C5FD',
          400: '#60A5FA',
          500: '#3B82F6',
          600: '#2563EB',
          700: '#1D4ED8',
          800: '#1E40AF',
          900: '#1E3A8A',
          950: '#172554',
        },
        // Keep `drop-*` token names (too many references) — just update values to Velto palette.
        drop: {
          // Primary – Velto Blue (replaces the old orange)
          orange: {
            DEFAULT: '#0E7BC4',
            50:  '#EFF6FF',
            100: '#DBEAFE',
            200: '#BFDBFE',
            300: '#93C5FD',
            400: '#60A5FA',
            500: '#0E7BC4', // Velto Blue primary
            600: '#0369A1',
            700: '#075985',
            800: '#0C4A6E',
            900: '#082F49',
          },
          // Neutral – cool deep navy for text & surfaces
          ink: {
            DEFAULT: '#0A1628',
            light:   '#1E3A5F',
            muted:   '#4A7FA0',
          },
          // Surface tones — cool blue-tinted
          cream:   '#F0F8FF',
          sand:    '#DBEAFE',
          // Status
          success: '#16A34A',
          warning: '#D97706',
          error:   '#DC2626',
          info:    '#0E7BC4',
        },
        // Also expose the Velto teal accent directly
        velto: {
          blue:  '#0E7BC4',
          teal:  '#06C4A8',
          navy:  '#0A1628',
          light: '#F0F8FF',
        },
      },

      // ── Typography ───────────────────────────────────────────
      fontFamily: {
        sans:    ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono:    ['ui-monospace', 'monospace'],
        display: ['var(--font-syne)', 'sans-serif'],
      },

      // ── Spacing / Layout ─────────────────────────────────────
      borderRadius: {
        '4xl': '2rem',
        '5xl': '2.5rem',
      },

      // ── Shadows ──────────────────────────────────────────────
      boxShadow: {
        'card':    '0 2px 8px 0 rgba(10,22,40,0.08)',
        'card-lg': '0 8px 32px 0 rgba(10,22,40,0.12)',
        'blue':    '0 4px 20px 0 rgba(14,123,196,0.35)',
      },

      // ── Animation ────────────────────────────────────────────
      keyframes: {
        'pulse-ring': {
          '0%, 100%': { transform: 'scale(1)', opacity: '1' },
          '50%':       { transform: 'scale(1.15)', opacity: '0.7' },
        },
        'slide-up': {
          '0%':   { transform: 'translateY(16px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',    opacity: '1' },
        },
        'fade-in': {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      animation: {
        'pulse-ring': 'pulse-ring 1.5s ease-in-out infinite',
        'slide-up':   'slide-up 0.3s ease-out',
        'fade-in':    'fade-in 0.2s ease-out',
      },
    },
  },
  plugins: [],
};

export default config;
