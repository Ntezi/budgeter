const { hairlineWidth } = require('nativewind/theme');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './providers/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#F6F7FB',
        foreground: '#0F172A',
        card: '#FFFFFF',
        muted: '#EEF2F7',
        'muted-foreground': '#64748B',
        border: '#E2E8F0',
        input: '#F8FAFC',
        primary: '#030213',
        'primary-foreground': '#FFFFFF',
        secondary: '#E4E9F2',
        'secondary-foreground': '#0F172A',
        destructive: '#D4183D',
        success: '#16A34A',
        needs: '#3B82F6',
        wants: '#EC4899',
        savings: '#22C55E',
        sidebar: '#FFFFFF',
        'sidebar-foreground': '#0F172A',
        'sidebar-accent': '#F1F5F9',
      },
      borderColor: {
        DEFAULT: '#E2E8F0',
      },
      borderRadius: {
        sm: 8,
        md: 10,
        lg: 14,
        xl: 18,
        '2xl': 24,
      },
      boxShadow: {
        card: '0px 1px 2px rgba(15, 23, 42, 0.08), 0px 8px 24px rgba(15, 23, 42, 0.06)',
        soft: '0px 1px 2px rgba(15, 23, 42, 0.05), 0px 3px 12px rgba(15, 23, 42, 0.04)',
      },
      spacing: {
        18: 72,
        22: 88,
      },
      fontSize: {
        xxs: 11,
      },
      fontFamily: {
        sans: ['System'],
      },
      borderWidth: {
        hairline: hairlineWidth(),
      },
    },
  },
  plugins: [],
};
