export type ThemeChoice = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'airindex-theme'

export function getStoredTheme(): ThemeChoice {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    if (value === 'light' || value === 'dark' || value === 'system') return value
  } catch {
    // localStorage unavailable; fall back silently
  }
  return 'system'
}

export function storeTheme(theme: ThemeChoice): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // ignore write failures (private browsing, quota, etc.)
  }
}

export function applyTheme(theme: ThemeChoice): void {
  const root = document.documentElement
  if (theme === 'system') {
    root.removeAttribute('data-theme')
  } else {
    root.setAttribute('data-theme', theme)
  }
}
