const { hairlineWidth } = require('nativewind/theme');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './providers/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#FFFFFF',
        foreground: '#09090B',
        card: '#FFFFFF',
        'card-foreground': '#09090B',
        muted: '#ECECF0',
        'muted-foreground': '#717182',
        accent: '#E9EBEF',
        'accent-foreground': '#030213',
        border: 'rgba(0, 0, 0, 0.1)',
        input: '#F3F3F5',
        'input-background': '#F3F3F5',
        primary: '#030213',
        'primary-foreground': '#FFFFFF',
        secondary: '#EEF0F4',
        'secondary-foreground': '#030213',
        destructive: '#D4183D',
        success: '#16A34A',
        needs: '#3B82F6',
        wants: '#EC4899',
        savings: '#22C55E',
        sidebar: '#FAFAFA',
        'sidebar-foreground': '#09090B',
        'sidebar-accent': '#F4F4F5',
      },
      borderColor: {
        DEFAULT: 'rgba(0, 0, 0, 0.1)',
      },
      borderRadius: {
        sm: 6,
        md: 8,
        lg: 10,
        xl: 14,
        '2xl': 18,
      },
      boxShadow: {
        card: '0px 1px 2px rgba(0, 0, 0, 0.04)',
        soft: '0px 1px 1px rgba(0, 0, 0, 0.03)',
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
