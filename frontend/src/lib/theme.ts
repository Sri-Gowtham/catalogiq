import { useEffect, useState } from 'react'

export type Theme = 'system' | 'light' | 'dark'
const KEY = 'catalogiq.theme'

export function getTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

/** Puts the `dark` class on <html> for an explicit dark choice, or for "system" when the OS prefers dark. */
export function applyTheme(theme: Theme) {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
}

export function setTheme(theme: Theme) {
  try {
    if (theme === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, theme)
  } catch {
    // storage blocked: the choice lasts until the tab closes
  }
  applyTheme(theme)
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, set] = useState<Theme>(getTheme)
  useEffect(() => {
    // follow the OS while the choice is "system"
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const on = () => applyTheme('system')
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [theme])
  return [
    theme,
    (t) => {
      setTheme(t)
      set(t)
    },
  ]
}
