export type ThemeMode = 'auto' | 'light' | 'dark'

export type ResolvedTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'clairvoyant.theme'

export const THEME_MODES: readonly ThemeMode[] = ['auto', 'light', 'dark']

export const THEME_MODE_LABEL: Record<ThemeMode, string> = {
  auto: 'Auto',
  light: 'Light',
  dark: 'Dark',
}

export const parseThemeMode = (value: unknown): ThemeMode =>
  value === 'light' || value === 'dark' || value === 'auto' ? value : 'auto'

export const resolveTheme = (mode: ThemeMode, prefersLight: boolean): ResolvedTheme =>
  mode === 'auto' ? (prefersLight ? 'light' : 'dark') : mode

export const nextThemeMode = (mode: ThemeMode): ThemeMode => {
  const index = THEME_MODES.indexOf(mode)
  return THEME_MODES[(index + 1) % THEME_MODES.length] ?? 'auto'
}

export const readStoredThemeMode = (): ThemeMode => {
  try {
    return parseThemeMode(globalThis.localStorage?.getItem(THEME_STORAGE_KEY))
  } catch {
    return 'auto'
  }
}

export const writeStoredThemeMode = (mode: ThemeMode): void => {
  try {
    globalThis.localStorage?.setItem(THEME_STORAGE_KEY, mode)
  } catch {}
}

export const prefersLightTheme = (): boolean =>
  globalThis.matchMedia?.('(prefers-color-scheme: light)').matches ?? false

export const initTheme = (root: HTMLElement = document.documentElement): ResolvedTheme => {
  const resolved = resolveTheme(readStoredThemeMode(), prefersLightTheme())
  root.dataset.theme = resolved
  return resolved
}
