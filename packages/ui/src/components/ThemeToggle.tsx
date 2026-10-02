import { useEffect, useState } from 'react'
import { cx } from '../lib/cx.js'
import {
  nextThemeMode,
  prefersLightTheme,
  type ResolvedTheme,
  readStoredThemeMode,
  resolveTheme,
  THEME_MODE_LABEL,
  type ThemeMode,
  writeStoredThemeMode,
} from '../lib/theme.js'
import { Button } from './Button.js'

export interface ThemeToggleProps {
  className?: string
}

export const ThemeToggle = ({ className }: ThemeToggleProps) => {
  const [mode, setMode] = useState<ThemeMode>(readStoredThemeMode)
  const [resolved, setResolved] = useState<ResolvedTheme>(() =>
    resolveTheme(readStoredThemeMode(), prefersLightTheme()),
  )

  useEffect(() => {
    const query = globalThis.matchMedia?.('(prefers-color-scheme: light)')

    const apply = () => {
      const next = resolveTheme(mode, query?.matches ?? false)
      setResolved(next)
      document.documentElement.dataset.theme = next
    }

    apply()
    writeStoredThemeMode(mode)

    if (mode !== 'auto' || query === undefined) return
    query.addEventListener('change', apply)
    return () => query.removeEventListener('change', apply)
  }, [mode])

  const label = THEME_MODE_LABEL[mode]

  return (
    <Button
      variant="ghost"
      icon={resolved === 'dark' ? 'moon' : 'sun'}
      className={cx('theme-toggle', className)}
      onClick={() => setMode(nextThemeMode)}
      title={`Theme: ${label}. Activate to change.`}
    >
      {`Theme: ${label}`}
    </Button>
  )
}
