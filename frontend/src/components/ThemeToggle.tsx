import { useEffect, useState } from 'react'
import { applyTheme, getStoredTheme, storeTheme, type ThemeChoice } from '../lib/theme'

const OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeChoice>(() => getStoredTheme())

  useEffect(() => {
    applyTheme(theme)
    storeTheme(theme)
  }, [theme])

  return (
    <div
      className="inline-flex shrink-0 items-center gap-0.5 rounded-pill border border-border bg-surface-raised p-1 shadow-sm"
      role="group"
      aria-label="Colour theme"
    >
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          aria-pressed={theme === opt.value}
          onClick={() => setTheme(opt.value)}
          className={`rounded-pill px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
            theme === opt.value ? 'bg-accent text-on-accent' : 'text-text-muted hover:bg-surface-alt hover:text-text'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
