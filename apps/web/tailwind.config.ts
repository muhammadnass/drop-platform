import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // ── DROP Brand Color System ──────────────────────────────
      colors: {
        drop: {
          // Primary – Vibrant orange from the logo
          orange: {
            DEFAULT: '#E8420A',
            50:  '#FFF3EE',
            100: '#FFE4D6',
            200: '#FFC4A8',
            300: '#FF9B6E',
            400: '#FF6B33',
            500: '#E8420A', // brand primary
            600: '#C93600',
            700: '#A32B00',
            800: '#7D2200',
            900: '#571800',
          },
          // Neutral – warm charcoal for text & surfaces
          ink: {
            DEFAULT: '#1A1208',
            light:   '#3D2E1E',
            muted:   '#7A6652',
          },
          // Surface tones
          cream:   '#FAF7F4',
          sand:    '#F0EBE3',
          // Status
          success: '#16A34A',
          warning: '#D97706',
          error:   '#DC2626',
          info:    '#2563EB',
        },
      },

      // ── Typography ───────────────────────────────────────────
      fontFamily: {
        sans:    ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono:    ['ui-monospace', 'monospace'],
        display: ['var(--font-syne)', 'sans-serif'], // bold display headlines
      },

      // ── Spacing / Layout ─────────────────────────────────────
      borderRadius: {
        '4xl': '2rem',
        '5xl': '2.5rem',
      },

      // ── Shadows ──────────────────────────────────────────────
      boxShadow: {
        'card':   '0 2px 8px 0 rgba(26,18,8,0.08)',
        'card-lg':'0 8px 32px 0 rgba(26,18,8,0.12)',
        'orange': '0 4px 20px 0 rgba(232,66,10,0.35)',
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
