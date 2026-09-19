import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['selector', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: 'var(--color-surface)',
        'surface-alt': 'var(--color-surface-alt)',
        'surface-raised': 'var(--color-surface-raised)',
        border: 'rgb(var(--color-border-rgb) / <alpha-value>)',
        text: 'var(--color-text)',
        'text-muted': 'var(--color-text-muted)',
        accent: 'rgb(var(--color-accent-rgb) / <alpha-value>)',
        'accent-muted': 'var(--color-accent-muted)',
        'on-accent': 'var(--color-on-accent)',
        rise: 'rgb(var(--color-rise-rgb) / <alpha-value>)',
        fall: 'rgb(var(--color-fall-rgb) / <alpha-value>)',
        warn: 'rgb(var(--color-warn-rgb) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        pill: 'var(--radius-pill)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },
      maxWidth: {
        content: 'var(--content-max)',
      },
    },
  },
  plugins: [],
}

export default config
